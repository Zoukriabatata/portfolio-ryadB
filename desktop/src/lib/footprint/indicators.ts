// Phase B / M4.7c — pure indicator computations.
//
// Three classic order-flow signals, computed from the same
// FootprintBar shape the rest of the desktop receives over the
// `crypto-footprint-update` Tauri event:
//
//   • Stacked imbalances — N consecutive levels in the same
//     direction where the aggressive side dominates the opposite
//     side of the next level by `ratio`+ × volume. Signals
//     absorption / exhaustion.
//   • Naked POCs — the highest-volume price of a past bar that
//     hasn't been revisited by any later bar's price range. The
//     market often returns to these levels.
//   • Unfinished auctions — bar high with zero aggressive buyers
//     (or low with zero aggressive sellers). Signals a weak
//     extreme that's likely to be retested.
//
// All functions are pure: no DOM, no I/O, no observable
// side-effects. The async runner (`indicatorsAsync.ts`) calls them
// inside requestIdleCallback so the main thread stays free during
// high-tick-rate sessions.

import type { FootprintBar, PriceLevel } from "../../components/FootprintBarView";

export type StackedImbalance = {
  barTsNs: number;
  /** Lowest price of the streak (inclusive). */
  startPrice: number;
  /** Highest price of the streak (inclusive). */
  endPrice: number;
  direction: "bullish" | "bearish";
  count: number;
};

export type NakedPOC = {
  barTsNs: number;
  price: number;
  volume: number;
};

export type UnfinishedAuction = {
  barTsNs: number;
  price: number;
  side: "high" | "low";
  volume: number;
  tested: boolean;
};

export type IndicatorsResult = {
  stackedImbalances: StackedImbalance[];
  nakedPOCs: NakedPOC[];
  unfinishedAuctions: UnfinishedAuction[];
};

export type IndicatorsConfig = {
  imbalanceRatio: number;
  minConsecutive: number;
  enableStackedImbalances: boolean;
  enableNakedPOCs: boolean;
  enableUnfinishedAuctions: boolean;
};

type LevelWithImb = PriceLevel & {
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
};

/** Per-level imbalance flags. ATAS convention:
 *    buy imbalance @ L  : buyVolume[L]  ≥ ratio × sellVolume[L-1]
 *    sell imbalance @ L : sellVolume[L] ≥ ratio × buyVolume[L+1]
 *  Zero-divisor + non-zero numerator is a valid (infinite) imbalance. */
function computeImbalances(
  levels: PriceLevel[],
  ratio: number,
): LevelWithImb[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const out: LevelWithImb[] = sorted.map((l) => ({
    ...l,
    imbalanceBuy: false,
    imbalanceSell: false,
  }));

  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const below = i > 0 ? out[i - 1] : null;
    const above = i < out.length - 1 ? out[i + 1] : null;

    if (below) {
      if (below.sellVolume > 0) {
        if (cur.buyVolume / below.sellVolume >= ratio) cur.imbalanceBuy = true;
      } else if (cur.buyVolume > 0) {
        cur.imbalanceBuy = true;
      }
    }

    if (above) {
      if (above.buyVolume > 0) {
        if (cur.sellVolume / above.buyVolume >= ratio) cur.imbalanceSell = true;
      } else if (cur.sellVolume > 0) {
        cur.imbalanceSell = true;
      }
    }
  }

  return out;
}

export function calculateStackedImbalances(
  bar: FootprintBar,
  ratio: number,
  minConsecutive: number,
): StackedImbalance[] {
  const results: StackedImbalance[] = [];
  if (bar.levels.length < minConsecutive) return results;

  const withImb = computeImbalances(bar.levels, ratio);

  // Tick size inferred from level spacing. We only consider
  // streaks of *consecutive* prices because skipping a level with
  // no imbalance breaks the structural argument behind a stack.
  const priceStep =
    withImb.length >= 2
      ? Math.abs(withImb[1].price - withImb[0].price)
      : 0;
  if (priceStep <= 0) return results;
  const tol = priceStep * 0.1;

  let dir: "bullish" | "bearish" | null = null;
  let startPrice = 0;
  let endPrice = 0;
  let count = 0;
  let lastPrice = -Infinity;

  const flush = () => {
    if (dir && count >= minConsecutive) {
      results.push({
        barTsNs: bar.bucketTsNs,
        startPrice,
        endPrice,
        direction: dir,
        count,
      });
    }
  };

  for (const lvl of withImb) {
    const isConsecutive = Math.abs(lvl.price - lastPrice - priceStep) < tol;
    const curDir: "bullish" | "bearish" | null = lvl.imbalanceBuy
      ? "bullish"
      : lvl.imbalanceSell
        ? "bearish"
        : null;

    if (curDir && curDir === dir && isConsecutive) {
      endPrice = lvl.price;
      count += 1;
    } else {
      flush();
      if (curDir) {
        dir = curDir;
        startPrice = lvl.price;
        endPrice = lvl.price;
        count = 1;
      } else {
        dir = null;
        count = 0;
      }
    }
    lastPrice = lvl.price;
  }
  flush();

  return results;
}

/** A naked POC is the highest-volume price of a past bar that no
 *  subsequent bar's [low, high] range has touched. The current /
 *  newest bar is excluded — its POC could go naked-or-not in the
 *  next 200ms tick and we don't want a flickering marker. */
export function calculateNakedPOCs(
  barsAsc: FootprintBar[],
  currentPrice: number,
): NakedPOC[] {
  const results: NakedPOC[] = [];
  if (barsAsc.length < 2) return results;

  for (let i = 0; i < barsAsc.length - 1; i++) {
    const bar = barsAsc[i];

    let pocPrice = 0;
    let pocVol = -1;
    for (const lvl of bar.levels) {
      const total = lvl.buyVolume + lvl.sellVolume;
      if (total > pocVol) {
        pocVol = total;
        pocPrice = lvl.price;
      }
    }
    if (pocVol <= 0) continue;

    let tested = false;
    for (let j = i + 1; j < barsAsc.length; j++) {
      if (barsAsc[j].low <= pocPrice && barsAsc[j].high >= pocPrice) {
        tested = true;
        break;
      }
    }
    // The newest bar is excluded from the loop above so any
    // currentPrice excursion can still test the POC. We only need
    // a containment check against the live close — the live high/
    // low are already part of the newest bar's range.
    if (!tested && currentPrice > 0) {
      const last = barsAsc[barsAsc.length - 1];
      if (last.low <= pocPrice && last.high >= pocPrice) tested = true;
    }

    if (!tested) {
      results.push({ barTsNs: bar.bucketTsNs, price: pocPrice, volume: pocVol });
    }
  }
  return results;
}

export function calculateUnfinishedAuctions(
  barsAsc: FootprintBar[],
): UnfinishedAuction[] {
  const results: UnfinishedAuction[] = [];

  for (let i = 0; i < barsAsc.length; i++) {
    const bar = barsAsc[i];
    if (bar.levels.length === 0) continue;

    let highLvl: PriceLevel | null = null;
    let lowLvl: PriceLevel | null = null;
    let high = -Infinity;
    let low = Infinity;
    for (const lvl of bar.levels) {
      if (lvl.price > high) {
        high = lvl.price;
        highLvl = lvl;
      }
      if (lvl.price < low) {
        low = lvl.price;
        lowLvl = lvl;
      }
    }

    if (highLvl && highLvl.buyVolume === 0 && highLvl.sellVolume > 0) {
      let tested = false;
      for (let j = i + 1; j < barsAsc.length; j++) {
        if (barsAsc[j].high > bar.high) {
          tested = true;
          break;
        }
      }
      results.push({
        barTsNs: bar.bucketTsNs,
        price: bar.high,
        side: "high",
        volume: highLvl.sellVolume,
        tested,
      });
    }

    if (lowLvl && lowLvl.sellVolume === 0 && lowLvl.buyVolume > 0) {
      let tested = false;
      for (let j = i + 1; j < barsAsc.length; j++) {
        if (barsAsc[j].low < bar.low) {
          tested = true;
          break;
        }
      }
      results.push({
        barTsNs: bar.bucketTsNs,
        price: bar.low,
        side: "low",
        volume: lowLvl.buyVolume,
        tested,
      });
    }
  }
  return results;
}

export function computeAllIndicators(
  bars: FootprintBar[],
  config: IndicatorsConfig,
  currentPrice: number,
): IndicatorsResult {
  const sortedAsc = [...bars].sort((a, b) => a.bucketTsNs - b.bucketTsNs);

  return {
    stackedImbalances: config.enableStackedImbalances
      ? sortedAsc.flatMap((b) =>
          calculateStackedImbalances(b, config.imbalanceRatio, config.minConsecutive),
        )
      : [],
    nakedPOCs: config.enableNakedPOCs
      ? calculateNakedPOCs(sortedAsc, currentPrice)
      : [],
    unfinishedAuctions: config.enableUnfinishedAuctions
      ? calculateUnfinishedAuctions(sortedAsc)
      : [],
  };
}

export const EMPTY_INDICATORS: IndicatorsResult = {
  stackedImbalances: [],
  nakedPOCs: [],
  unfinishedAuctions: [],
};
