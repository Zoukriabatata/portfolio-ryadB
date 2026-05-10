import type { BucketDurationMs, BucketIndex, PriceIndex } from "./types";

export interface GridSystemSpec {
  bucketDurationMs: BucketDurationMs;
  historyDurationMs: number;
  nowExchangeMs: number;
  tickSize: number;
  priceMin: number;
  priceMax: number;
}

export interface GridSystem {
  readonly bucketDurationMs: number;
  readonly historyDurationMs: number;
  readonly historyLength: number;
  readonly nowExchangeMs: number;
  readonly oldestExchangeMs: number;
  readonly tickSize: number;
  readonly priceMin: number;
  readonly priceMax: number;
  readonly priceLevels: number;

  bucketIndex(timeMs: number): BucketIndex;
  priceIndex(price: number): PriceIndex;
  cellKey(t: BucketIndex, p: PriceIndex): string;
}

export function createGridSystem(spec: GridSystemSpec): GridSystem {
  const {
    bucketDurationMs,
    historyDurationMs,
    nowExchangeMs,
    tickSize,
    priceMin,
    priceMax,
  } = spec;

  if (bucketDurationMs <= 0) {
    throw new Error(
      `GridSystem: bucketDurationMs must be > 0, got ${bucketDurationMs}`,
    );
  }
  if (historyDurationMs <= bucketDurationMs) {
    throw new Error(
      `GridSystem: historyDurationMs must be > bucketDurationMs, got ${historyDurationMs} <= ${bucketDurationMs}`,
    );
  }
  if (tickSize <= 0) {
    throw new Error(`GridSystem: tickSize must be > 0, got ${tickSize}`);
  }
  if (priceMin >= priceMax) {
    throw new Error(
      `GridSystem: priceMin (${priceMin}) must be < priceMax (${priceMax})`,
    );
  }
  if (nowExchangeMs < 0) {
    throw new Error(
      `GridSystem: nowExchangeMs must be >= 0, got ${nowExchangeMs}`,
    );
  }

  const historyLength = Math.floor(historyDurationMs / bucketDurationMs);
  const oldestExchangeMs = nowExchangeMs - historyDurationMs;
  const priceLevels = Math.floor((priceMax - priceMin) / tickSize);

  const grid: GridSystem = {
    bucketDurationMs,
    historyDurationMs,
    historyLength,
    nowExchangeMs,
    oldestExchangeMs,
    tickSize,
    priceMin,
    priceMax,
    priceLevels,

    bucketIndex(timeMs: number): BucketIndex {
      if (timeMs < oldestExchangeMs || timeMs > nowExchangeMs) return -1;
      const idx = Math.floor((timeMs - oldestExchangeMs) / bucketDurationMs);
      return idx >= historyLength ? historyLength - 1 : idx;
    },

    priceIndex(price: number): PriceIndex {
      if (price < priceMin || price >= priceMax) return -1;
      return Math.floor((price - priceMin) / tickSize);
    },

    cellKey(t: BucketIndex, p: PriceIndex): string {
      return `${t}:${p}`;
    },
  };

  return Object.freeze(grid);
}
