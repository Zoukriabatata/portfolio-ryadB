// Phase B / M6a-1 — Tauri event → ring buffer adapter.
//
// Subscribes to the `orderbook-update` event emitted by the M3.5
// Bybit subscriber, filters by exchange-suffixed symbol, decimates
// the 30 Hz wire stream down to 1 Hz for the heatmap (>>1 column
// per second is invisible to the eye and pointless to upload to
// the GPU), and exposes the resulting state to listeners.
//
// History is bounded at 5 minutes (300 samples @ 1 Hz). The
// renderer reads `getState()` per frame; the adapter notifies on
// `latest` change for the live cursor / mid-price label, but the
// renderer's RAF loop will pull regardless.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { OrderbookUpdate } from "../../types/orderbook";
import type { HeatmapMarketState, OrderbookSnapshot } from "./types";

const HISTORY_SECONDS = 300;
const SAMPLE_HZ = 1;
const MAX_HISTORY = HISTORY_SECONDS * SAMPLE_HZ;

export class MarketStateAdapter {
  private state: HeatmapMarketState = {
    symbol: null,
    history: [],
    latest: null,
  };
  private lastSampleMs = 0;
  private unlisten: UnlistenFn | null = null;
  private listeners = new Set<(state: HeatmapMarketState) => void>();

  /** Begin listening. `symbolFilter` is exchange-suffixed
   *  ("BTCUSDT.BYBIT") to match the Rust event payload. */
  async start(symbolFilter: string): Promise<void> {
    if (this.unlisten) await this.stop();
    this.state = { symbol: symbolFilter, history: [], latest: null };
    this.lastSampleMs = 0;
    this.unlisten = await listen<OrderbookUpdate>(
      "orderbook-update",
      (event) => {
        const ob = event.payload;
        if (ob.symbol !== symbolFilter) return;
        this.ingest(ob);
      },
    );
  }

  async stop(): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }

  subscribe(fn: (state: HeatmapMarketState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): HeatmapMarketState {
    return this.state;
  }

  private ingest(ob: OrderbookUpdate) {
    const bids = new Map<number, number>(
      ob.bids.map((l) => [l.price, l.quantity]),
    );
    const asks = new Map<number, number>(
      ob.asks.map((l) => [l.price, l.quantity]),
    );
    const bestBid = ob.bids[0]?.price ?? 0;
    const bestAsk = ob.asks[0]?.price ?? 0;
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;

    const snap: OrderbookSnapshot = {
      timestampMs: ob.timestampNs / 1_000_000,
      bids,
      asks,
      midPrice,
    };

    this.state.latest = snap;

    const sampleEvery = 1000 / SAMPLE_HZ;
    if (snap.timestampMs - this.lastSampleMs >= sampleEvery) {
      this.state.history.push(snap);
      if (this.state.history.length > MAX_HISTORY) {
        this.state.history.shift();
      }
      this.lastSampleMs = snap.timestampMs;
    }

    for (const fn of this.listeners) fn(this.state);
  }
}
