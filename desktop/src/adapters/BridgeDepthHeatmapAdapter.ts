// Bridges (NinjaTrader / Quantower) push L2 depth as a batch of DepthSnapshot
// on "bridge-depth-update" / "quantower-depth-update". This adapter converts
// the active symbol's snapshot into the heatmap engine's OrderbookSnapshot.
//
// Shape diff handled here:
//   DepthLevel { price, volume }  ->  OrderbookLevel { price, size }
//   lastUpdateNs (u64 ns)         ->  exchangeMs = floor(ns / 1e6)
//
// The bridge connects to ONE chart, so the batch is usually a single symbol;
// `symbol === null` (current active symbol unknown) picks the first entry.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { OrderbookSnapshot } from "../core";

export type BridgeDepthEvent = "bridge-depth-update" | "quantower-depth-update";

interface DepthLevel { price: number; volume: number }
interface DepthSnapshot {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastUpdateNs: number;
}

function convertOne(d: DepthSnapshot): OrderbookSnapshot {
  const exchangeMs = Math.floor(d.lastUpdateNs / 1_000_000);
  const bids = new Array(d.bids.length);
  for (let i = 0; i < d.bids.length; i++) {
    bids[i] = { price: d.bids[i].price, size: d.bids[i].volume };
  }
  const asks = new Array(d.asks.length);
  for (let i = 0; i < d.asks.length; i++) {
    asks[i] = { price: d.asks[i].price, size: d.asks[i].volume };
  }
  return { exchangeMs, bids, asks };
}

/** Pure, testable: pick the target symbol from a batch and convert it. When
 *  `symbol` is null, fall back to the first snapshot. Returns null if the batch
 *  is empty/invalid or the named symbol is absent. */
export function pickAndConvertDepthBatch(
  batch: DepthSnapshot[],
  symbol: string | null,
): OrderbookSnapshot | null {
  if (!Array.isArray(batch) || batch.length === 0) return null;
  const chosen = symbol == null
    ? batch[0]
    : batch.find((d) => d.symbol === symbol) ?? null;
  if (!chosen || !Array.isArray(chosen.bids) || !Array.isArray(chosen.asks)) {
    return null;
  }
  return convertOne(chosen);
}

export class BridgeDepthHeatmapAdapter {
  private unlisten: UnlistenFn | null = null;

  constructor(private readonly event: BridgeDepthEvent) {}

  /** `getSymbol` is read on every batch so the active contract can change
   *  without re-subscribing; return null to always take the first entry. */
  async start(
    callback: (snap: OrderbookSnapshot) => void,
    getSymbol: () => string | null = () => null,
  ): Promise<void> {
    this.unlisten = await listen<DepthSnapshot[]>(this.event, (e) => {
      const snap = pickAndConvertDepthBatch(e.payload, getSymbol());
      if (snap) callback(snap);
    });
  }

  dispose(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}
