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

export type AbsorptionEvent = {
  barTsNs: number;
  price: number;
  /** Which aggressive side got absorbed. `ask` = aggressive buying
   *  (lifting offers) soaked up by passive sellers — price failed to
   *  rise. `bid` = aggressive selling soaked up by passive buyers —
   *  price failed to fall. Matches the renderer's bid/ask colouring. */
  side: "bid" | "ask";
  /** Aggressive volume on the absorbed side at this level. */
  volume: number;
};

/** Price / CVD divergence — last two pivot highs (bearish) or lows (bullish).
 *  Bearish: price makes higher high while CVD makes lower high → sellers
 *  absorbing hidden supply. Bullish: price makes lower low while CVD makes
 *  higher low → buyers absorbing hidden demand. */
export type CvdDivergence = {
  type: "bullish" | "bearish";
  /** Timestamp of the first (older) pivot, nanoseconds. */
  bar1TsNs: number;
  /** Price at the first pivot (high for bearish, low for bullish). */
  bar1Price: number;
  /** Timestamp of the second (newer) pivot, nanoseconds. */
  bar2TsNs: number;
  /** Price at the second pivot. */
  bar2Price: number;
};

export type IndicatorsResult = {
  stackedImbalances: StackedImbalance[];
  nakedPOCs: NakedPOC[];
  unfinishedAuctions: UnfinishedAuction[];
  absorptionEvents: AbsorptionEvent[];
  cvdDivergences: CvdDivergence[];
};

export type IndicatorsConfig = {
  imbalanceRatio: number;
  minConsecutive: number;
  enableStackedImbalances: boolean;
  enableNakedPOCs: boolean;
  enableUnfinishedAuctions: boolean;
  enableAbsorption: boolean;
  /** Fraction of the bar's aggressive side volume a single level must
   *  hold to qualify (default 0.6 = 60 %). */
  absorptionRatio: number;
  /** Absolute floor on the absorbed volume (filters tiny illiquid bars). */
  absorptionMinVolume: number;
  /** How far (in ticks) the bar extreme may sit beyond the absorbing
   *  level and still count as "price didn't push through". Default 1. */
  absorptionToleranceTicks: number;
  enableCvdDivergence: boolean;
  /** Number of bars to each side of a candidate pivot for it to qualify. */
  cvdDivergencePivotBars: number;
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

/** Absorption — chosen rule (volume-at-extreme, see orderflow-calc skill):
 *  a single price level holds ≥ `ratio` of the bar's aggressive volume on
 *  one side, AND the bar's extreme on that side failed to push beyond the
 *  level (high ≤ P + tol for buy absorption, low ≥ P − tol for sell). That
 *  is: heavy aggression met a passive wall and price stalled.
 *
 *    buy absorption  → side "ask" (aggressive buying soaked up; bearish-leaning)
 *    sell absorption → side "bid" (aggressive selling soaked up; bullish-leaning)
 *
 *  ATAS ships several absorption variants (delta-divergence, finished-
 *  auction…); this is the volume-at-extreme one — documented here and in
 *  CLAUDE.md. Guards: bar needs ≥ 2 distinct levels (else high == low ==
 *  the only price makes it trivially true) and a non-zero side total. The
 *  newest bar is still forming, so absorption on it is a candidate until
 *  close; we flag it anyway and the renderer redraws each tick. Note:
 *  unlike calculateNakedPOCs (which excludes the live bar to avoid a
 *  flickering marker), absorption on the forming bar can flip on/off
 *  tick-to-tick as high/low move — intentional, debounce at the renderer
 *  if it reads noisy. */
export function calculateAbsorption(
  bar: FootprintBar,
  ratio: number,
  minVolume: number,
  toleranceTicks: number,
): AbsorptionEvent[] {
  const results: AbsorptionEvent[] = [];
  if (bar.levels.length < 2) return results;

  const sorted = [...bar.levels].sort((a, b) => a.price - b.price);
  // Tick size inferred from the tightest level spacing.
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i].price - sorted[i - 1].price;
    if (d > 0 && d < step) step = d;
  }
  if (!Number.isFinite(step) || step <= 0) return results;
  const tol = step * toleranceTicks + step * 0.1; // small epsilon for fp

  let totalBuy = 0;
  let totalSell = 0;
  for (const l of sorted) {
    totalBuy += l.buyVolume;
    totalSell += l.sellVolume;
  }

  for (const l of sorted) {
    // Buy absorption: bar must have REACHED this level (l.price <= bar.high)
    // AND not broken far above it (bar.high - l.price <= tol).
    // Math.abs would allow levels slightly above the high (bar never touched
    // them) to be flagged — that's a false positive. Directional check only.
    if (
      totalBuy > 0 &&
      l.buyVolume >= minVolume &&
      l.buyVolume >= ratio * totalBuy &&
      l.price <= bar.high &&
      bar.high - l.price <= tol
    ) {
      results.push({ barTsNs: bar.bucketTsNs, price: l.price, side: "ask", volume: l.buyVolume });
    }
    // Sell absorption: bar must have REACHED this level (l.price >= bar.low)
    // AND not broken far below it (l.price - bar.low <= tol).
    if (
      totalSell > 0 &&
      l.sellVolume >= minVolume &&
      l.sellVolume >= ratio * totalSell &&
      l.price >= bar.low &&
      l.price - bar.low <= tol
    ) {
      results.push({ barTsNs: bar.bucketTsNs, price: l.price, side: "bid", volume: l.sellVolume });
    }
  }
  return results;
}

/** CVD divergence — pivot-based detection on the last N bars.
 *  Computes a running CVD from `totalDelta` then looks for the last
 *  two confirmed pivot highs / lows. A pivot at index i is confirmed
 *  when it beats all bars within `pivotLookback` bars on each side.
 *  The live bar (last in the sorted array) is excluded from pivot
 *  detection to prevent flickering as its high/low is still forming. */
export function calculateCvdDivergence(
  barsAsc: FootprintBar[],
  pivotLookback: number,
): CvdDivergence[] {
  const N = Math.max(1, pivotLookback);
  // Need at least 2 × N + 2 bars (N each side + 2 pivots minimum).
  if (barsAsc.length < N * 2 + 2) return [];

  // Running CVD — cumulative sum of totalDelta across all bars.
  const cvd = new Float64Array(barsAsc.length);
  let running = 0;
  for (let i = 0; i < barsAsc.length; i++) {
    running += barsAsc[i].totalDelta;
    cvd[i] = running;
  }

  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  // Exclude the newest bar (index n-1) — it's still forming.
  const end = barsAsc.length - N - 1;
  for (let i = N; i <= end; i++) {
    const hi = barsAsc[i].high;
    let isHigh = true;
    for (let j = 1; j <= N; j++) {
      if (barsAsc[i - j].high >= hi || barsAsc[i + j].high >= hi) { isHigh = false; break; }
    }
    if (isHigh) pivotHighs.push(i);

    const lo = barsAsc[i].low;
    let isLow = true;
    for (let j = 1; j <= N; j++) {
      if (barsAsc[i - j].low <= lo || barsAsc[i + j].low <= lo) { isLow = false; break; }
    }
    if (isLow) pivotLows.push(i);
  }

  const results: CvdDivergence[] = [];

  // Bearish: price higher high, CVD lower high.
  if (pivotHighs.length >= 2) {
    const i1 = pivotHighs[pivotHighs.length - 2];
    const i2 = pivotHighs[pivotHighs.length - 1];
    if (barsAsc[i2].high > barsAsc[i1].high && cvd[i2] < cvd[i1]) {
      results.push({
        type: "bearish",
        bar1TsNs: barsAsc[i1].bucketTsNs,
        bar1Price: barsAsc[i1].high,
        bar2TsNs: barsAsc[i2].bucketTsNs,
        bar2Price: barsAsc[i2].high,
      });
    }
  }

  // Bullish: price lower low, CVD higher low.
  if (pivotLows.length >= 2) {
    const i1 = pivotLows[pivotLows.length - 2];
    const i2 = pivotLows[pivotLows.length - 1];
    if (barsAsc[i2].low < barsAsc[i1].low && cvd[i2] > cvd[i1]) {
      results.push({
        type: "bullish",
        bar1TsNs: barsAsc[i1].bucketTsNs,
        bar1Price: barsAsc[i1].low,
        bar2TsNs: barsAsc[i2].bucketTsNs,
        bar2Price: barsAsc[i2].low,
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
    absorptionEvents: config.enableAbsorption
      ? sortedAsc.flatMap((b) =>
          calculateAbsorption(
            b,
            config.absorptionRatio,
            config.absorptionMinVolume,
            config.absorptionToleranceTicks,
          ),
        )
      : [],
    cvdDivergences: config.enableCvdDivergence
      ? calculateCvdDivergence(sortedAsc, config.cvdDivergencePivotBars)
      : [],
  };
}

export const EMPTY_INDICATORS: IndicatorsResult = {
  stackedImbalances: [],
  nakedPOCs: [],
  unfinishedAuctions: [],
  absorptionEvents: [],
  cvdDivergences: [],
};
