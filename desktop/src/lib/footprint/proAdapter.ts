/**
 * Pro renderer adapter — converts the desktop-side `RendererBar`
 * (array-of-levels shape, Tauri origin) into the web-style
 * `FootprintCandle` (Map-of-levels shape) consumed by FootprintProRenderer.
 *
 * Side mapping convention (mirrors the web `OrderflowEngine`):
 *   - bidVolume = aggressive sell market orders (hit the bid)   ← desktop sellVolume
 *   - askVolume = aggressive buy  market orders (hit the ask)   ← desktop buyVolume
 *
 * Imbalance flags use a 3× ratio (web default) and require both sides
 * to have meaningful volume to avoid 0/x degenerate cases.
 */

import type { FootprintCandle, PriceLevel } from '../orderflow/types';
import type { RendererBar } from './types';

const IMBALANCE_RATIO = 3.0;
const MIN_VOLUME_FOR_IMBALANCE = 0; // permissive — let UI threshold filter further

export function rendererBarToFootprintCandle(bar: RendererBar): FootprintCandle {
  const levels = new Map<number, PriceLevel>();

  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let totalTrades = 0;
  let pocPrice = bar.close;
  let pocVolume = 0;
  const volumeByPrice: { price: number; vol: number }[] = [];

  for (const lvl of bar.levels) {
    // desktop convention: buyVolume = aggressive buys = web's askVolume
    const askVolume = lvl.buyVolume;
    const bidVolume = lvl.sellVolume;
    const askTrades = lvl.buyTrades;
    const bidTrades = lvl.sellTrades;
    const total = askVolume + bidVolume;
    const delta = askVolume - bidVolume;

    let imbalanceBuy = false;
    let imbalanceSell = false;
    if (total > MIN_VOLUME_FOR_IMBALANCE) {
      if (bidVolume > 0 && askVolume / Math.max(bidVolume, 1e-9) >= IMBALANCE_RATIO) {
        imbalanceBuy = true;
      }
      if (askVolume > 0 && bidVolume / Math.max(askVolume, 1e-9) >= IMBALANCE_RATIO) {
        imbalanceSell = true;
      }
    }

    levels.set(lvl.price, {
      price: lvl.price,
      bidVolume,
      askVolume,
      bidTrades,
      askTrades,
      delta,
      totalVolume: total,
      imbalanceBuy,
      imbalanceSell,
    });

    totalBuyVolume += askVolume;
    totalSellVolume += bidVolume;
    totalTrades += askTrades + bidTrades;

    if (total > pocVolume) {
      pocVolume = total;
      pocPrice = lvl.price;
    }
    volumeByPrice.push({ price: lvl.price, vol: total });
  }

  // Per-candle VAH/VAL: 70% Value Area calculation (mirrors OrderflowEngine).
  // The renderer doesn't strictly read candle.vah/val (it recomputes session
  // stats internally) but we provide them for completeness and future tools.
  const { vah, val } = computeValueArea(volumeByPrice, pocPrice, bar.totalVolume);

  return {
    time: Math.floor(bar.timeMs / 1000),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    levels,
    totalVolume: bar.totalVolume,
    totalBuyVolume,
    totalSellVolume,
    totalDelta: bar.totalDelta,
    totalTrades,
    poc: pocPrice,
    vah,
    val,
    isClosed: true, // desktop bars are persisted closed bars; live tail handled in P5+
  };
}

function computeValueArea(
  byPrice: { price: number; vol: number }[],
  poc: number,
  totalVol: number,
): { vah: number; val: number } {
  if (byPrice.length === 0 || totalVol <= 0) return { vah: poc, val: poc };

  const sorted = [...byPrice].sort((a, b) => a.price - b.price);
  const target = totalVol * 0.7;

  let pocIdx = sorted.findIndex(x => x.price === poc);
  if (pocIdx === -1) pocIdx = Math.floor(sorted.length / 2);

  let acc = sorted[pocIdx].vol;
  let lo = pocIdx;
  let hi = pocIdx;

  while (acc < target && (lo > 0 || hi < sorted.length - 1)) {
    const upVol = hi < sorted.length - 1 ? sorted[hi + 1].vol : -1;
    const dnVol = lo > 0 ? sorted[lo - 1].vol : -1;
    if (upVol >= dnVol) {
      hi += 1;
      acc += sorted[hi].vol;
    } else {
      lo -= 1;
      acc += sorted[lo].vol;
    }
  }

  return { vah: sorted[hi].price, val: sorted[lo].price };
}

export function rendererBarsToFootprintCandles(bars: RendererBar[]): FootprintCandle[] {
  return bars.map(rendererBarToFootprintCandle);
}
