// Phase B / M6a-1 — heatmap renderer internal types.
//
// Slim subset of what the web `lib/heatmap-webgl/types.ts` exports:
// only the shapes the M6a-1 pipeline (orderbook → ring buffer →
// regl quad) consumes. Trade bubbles / passive lines / volume
// profile come in M6b/M6c with their own types.

import type { OrderbookUpdate } from "../../types/orderbook";

/** One sampled orderbook snapshot stored in the ring buffer. The
 *  Maps are dense per side — keys are exchange tick prices, values
 *  are quantities. Mid-price is precomputed once on ingest so the
 *  renderer doesn't recompute every frame. */
export type OrderbookSnapshot = {
  timestampMs: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  midPrice: number;
};

/** Live heatmap state owned by the adapter; consumed by the
 *  renderer per frame. `history` is sorted oldest → newest so
 *  index 0 is the leftmost column on screen. */
export type HeatmapMarketState = {
  symbol: string | null;
  history: OrderbookSnapshot[];
  latest: OrderbookSnapshot | null;
};

export type HeatmapMarketEvent = {
  symbol: string;
  raw: OrderbookUpdate;
};
