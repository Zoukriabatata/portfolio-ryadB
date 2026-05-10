import type { GridSystem, OrderbookSnapshot } from "../core";
import type { LiquidityFrame } from "./LiquidityFrame";

// Ring buffer time-bucketed pour l'orderbook posé.
// Sémantique "remplacer le bucket courant" : si plusieurs snapshots tombent
// dans le même absolute bucket, le plus récent écrase. Buckets intermédiaires
// (gap) zero-out. Snapshots strictement antérieurs au headBucket → ignorés.
//
// Note : la sémantique exacte est dégradée vs intégrale temporelle (size×overlap).
// Upgrade prévu en REFONTE-3.5 si rendu visuel insuffisant.
export class OrderbookHistory {
  private readonly buffer: Float32Array;
  private readonly historyLength: number;
  private readonly priceLevels: number;
  private headBucket: number = -Infinity;

  constructor(historyLength: number, priceLevels: number) {
    if (historyLength <= 0 || priceLevels <= 0) {
      throw new Error(
        `OrderbookHistory: historyLength (${historyLength}) and priceLevels (${priceLevels}) must be > 0`,
      );
    }
    this.historyLength = historyLength;
    this.priceLevels = priceLevels;
    this.buffer = new Float32Array(historyLength * priceLevels);
  }

  ingest(snap: OrderbookSnapshot, grid: GridSystem): void {
    if (snap.exchangeMs <= 0) return;
    if (grid.priceLevels !== this.priceLevels) {
      throw new Error(
        `OrderbookHistory: grid.priceLevels (${grid.priceLevels}) !== history.priceLevels (${this.priceLevels})`,
      );
    }

    const absBucket = Math.floor(snap.exchangeMs / grid.bucketDurationMs);

    if (this.headBucket !== -Infinity && absBucket < this.headBucket) {
      return; // out-of-order
    }

    if (absBucket > this.headBucket) {
      const isFirst = this.headBucket === -Infinity;
      const delta = isFirst ? this.historyLength : absBucket - this.headBucket;
      if (delta >= this.historyLength) {
        this.buffer.fill(0);
      } else {
        for (let b = this.headBucket + 1; b < absBucket; b++) {
          this.zeroBucketSlot(b);
        }
      }
      this.zeroBucketSlot(absBucket);
      this.headBucket = absBucket;
    } else {
      // Same bucket : replace
      this.zeroBucketSlot(absBucket);
    }

    const slot = this.bucketToSlot(absBucket);
    const base = slot * this.priceLevels;

    for (let i = 0; i < snap.bids.length; i++) {
      const lvl = snap.bids[i];
      const p = grid.priceIndex(lvl.price);
      if (p !== -1) this.buffer[base + p] = lvl.size;
    }
    for (let i = 0; i < snap.asks.length; i++) {
      const lvl = snap.asks[i];
      const p = grid.priceIndex(lvl.price);
      if (p !== -1) this.buffer[base + p] = lvl.size;
    }
  }

  toFrame(grid: GridSystem, frame: LiquidityFrame): void {
    const expected = grid.historyLength * grid.priceLevels;
    if (frame.cells.length !== expected) {
      throw new Error(
        `OrderbookHistory.toFrame: frame.cells.length (${frame.cells.length}) !== expected (${expected})`,
      );
    }

    const cells = frame.cells;

    if (this.headBucket === -Infinity) {
      cells.fill(0);
      return;
    }

    const absHead = Math.floor(grid.nowExchangeMs / grid.bucketDurationMs);
    const absOldest = absHead - grid.historyLength + 1;
    const ringMin = this.headBucket - this.historyLength + 1;

    let max = 0;

    for (let t = 0; t < grid.historyLength; t++) {
      const absT = absOldest + t;
      const baseFrame = t * grid.priceLevels;

      if (absT > this.headBucket || absT < ringMin) {
        for (let p = 0; p < grid.priceLevels; p++) {
          cells[baseFrame + p] = 0;
        }
      } else {
        const slot = this.bucketToSlot(absT);
        const baseBuf = slot * this.priceLevels;
        for (let p = 0; p < grid.priceLevels; p++) {
          const v = this.buffer[baseBuf + p];
          cells[baseFrame + p] = v;
          if (v > max) max = v;
        }
      }
    }

    if (max > 0) {
      const logMax = Math.log(1 + max);
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] > 0) {
          cells[i] = Math.log(1 + cells[i]) / logMax;
        }
      }
    }
  }

  private bucketToSlot(absBucket: number): number {
    const r = absBucket % this.historyLength;
    return r < 0 ? r + this.historyLength : r;
  }

  private zeroBucketSlot(absBucket: number): void {
    const slot = this.bucketToSlot(absBucket);
    const base = slot * this.priceLevels;
    for (let p = 0; p < this.priceLevels; p++) {
      this.buffer[base + p] = 0;
    }
  }
}
