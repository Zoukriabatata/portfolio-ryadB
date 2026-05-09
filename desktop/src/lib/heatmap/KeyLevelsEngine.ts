// Phase B / M6b-1 — POC / VAH / VAL / VWAP from a trade window.
//
// Bulk recompute (`recomputeFromTrades`) — O(n) on the visible
// window. Cheap enough at the M6b-1 5-minute / 30K-trade scale
// that we don't need an incremental algorithm yet; if Bybit BTC
// pit moments push the cost above 5 ms we'll move to incremental
// in M6c.
//
// Conventions:
//   • POC      — price level with the highest cumulative volume
//   • VAH/VAL  — value-area high/low containing 70% of volume
//                expanded outward from the POC
//   • VWAP     — Σ(price × qty) / Σ(qty) across the window

import type { Trade } from "./TradeStateAdapter";

export type KeyLevels = {
  poc: number | null;
  vah: number | null;
  val: number | null;
  vwap: number | null;
};

export const EMPTY_KEY_LEVELS: KeyLevels = {
  poc: null,
  vah: null,
  val: null,
  vwap: null,
};

export class KeyLevelsEngine {
  private priceTickHint: number;

  constructor(priceTickHint = 0.1) {
    this.priceTickHint = priceTickHint;
  }

  setPriceTickHint(tick: number) {
    if (tick > 0 && isFinite(tick)) {
      this.priceTickHint = tick;
    }
  }

  computeFromTrades(trades: Trade[]): KeyLevels {
    if (trades.length === 0) return EMPTY_KEY_LEVELS;

    // Volume-by-price map keyed by tick-quantised price.
    const tick = this.priceTickHint;
    const volByPrice = new Map<number, number>();
    let vwapNum = 0;
    let vwapDen = 0;
    for (const t of trades) {
      const bucket = roundToTick(t.price, tick);
      volByPrice.set(bucket, (volByPrice.get(bucket) ?? 0) + t.quantity);
      vwapNum += t.price * t.quantity;
      vwapDen += t.quantity;
    }

    if (volByPrice.size === 0) return EMPTY_KEY_LEVELS;

    // POC + total volume in one pass.
    let poc = 0;
    let pocVol = -1;
    let totalVol = 0;
    for (const [p, v] of volByPrice) {
      if (v > pocVol) {
        pocVol = v;
        poc = p;
      }
      totalVol += v;
    }

    // Sort levels ascending by price for the value-area expansion.
    const sorted = [...volByPrice.entries()].sort((a, b) => a[0] - b[0]);
    const pocIdx = sorted.findIndex(([p]) => p === poc);
    let acc = sorted[pocIdx][1];
    let lo = pocIdx;
    let hi = pocIdx;
    const target = totalVol * 0.7;

    // Walk outward from the POC, taking whichever neighbour has
    // more volume. Stop when 70% is covered or both ends are hit.
    while (acc < target && (lo > 0 || hi < sorted.length - 1)) {
      const above = hi < sorted.length - 1 ? sorted[hi + 1][1] : -1;
      const below = lo > 0 ? sorted[lo - 1][1] : -1;
      if (above >= below && hi < sorted.length - 1) {
        hi += 1;
        acc += above;
      } else if (lo > 0) {
        lo -= 1;
        acc += below;
      } else {
        break;
      }
    }

    const vwap = vwapDen > 0 ? vwapNum / vwapDen : null;

    return {
      poc,
      vah: sorted[hi][0],
      val: sorted[lo][0],
      vwap,
    };
  }
}

function roundToTick(price: number, tick: number): number {
  // 1e8 epsilon avoids accumulated FP drift when bucket prices
  // become Map keys (1.0 vs 1.0000000001 would split the level).
  return Math.round(price / tick) * tick;
}
