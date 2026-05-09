// Phase B / M6b-1 — Tauri `crypto-tick-update` event listener
// + 5-minute ring buffer.
//
// Symmetric to MarketStateAdapter (orderbook events) but holds raw
// trade ticks instead of decimated snapshots. The heatmap consumes
// this for trade-bubble rendering AND the key-levels engine.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { TickUpdate, CryptoSide } from "../../types/trades";

const HISTORY_MS = 5 * 60 * 1000;

export type Trade = {
  price: number;
  quantity: number;
  side: CryptoSide;
  timestampMs: number;
};

export type TradeState = {
  symbol: string | null;
  trades: Trade[]; // chronological, oldest first
};

export class TradeStateAdapter {
  private state: TradeState = { symbol: null, trades: [] };
  private unlisten: UnlistenFn | null = null;
  private listeners = new Set<(state: TradeState) => void>();

  async start(symbolFilter: string): Promise<void> {
    if (this.unlisten) await this.stop();
    this.state = { symbol: symbolFilter, trades: [] };
    this.unlisten = await listen<TickUpdate>(
      "crypto-tick-update",
      (event) => {
        const t = event.payload;
        if (t.symbol !== symbolFilter) return;
        this.ingest(t);
      },
    );
  }

  async stop(): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }

  subscribe(fn: (state: TradeState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): TradeState {
    return this.state;
  }

  private ingest(t: TickUpdate) {
    const trade: Trade = {
      price: t.price,
      quantity: t.quantity,
      side: t.side,
      timestampMs: t.timestampNs / 1_000_000,
    };
    this.state.trades.push(trade);

    // Trim trades older than the rolling window. The buffer is
    // chronological so a single while-loop on the head is enough;
    // average eviction is one entry per ingest at steady state.
    const cutoffMs = Date.now() - HISTORY_MS;
    while (
      this.state.trades.length > 0 &&
      this.state.trades[0].timestampMs < cutoffMs
    ) {
      this.state.trades.shift();
    }

    for (const fn of this.listeners) fn(this.state);
  }
}
