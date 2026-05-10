// Source : desktop/src-tauri/src/connectors/bybit/orderbook.rs:35
// Event "orderbook-update", payload OrderbookUpdate (camelCase Tauri/serde,
// car la struct Rust a `#[serde(rename_all = "camelCase")]` ligne 23 de
// engine/orderbook.rs) :
//   {
//     symbol: string,                                 // "BTCUSDT.BYBIT"
//     timestampNs: number,                            // u64 ns since UNIX epoch (renommé)
//     bids: Array<{ price: number, quantity: number }>,
//     asks: Array<{ price: number, quantity: number }>,
//     sequence: number,
//     depth: number
//   }
// Cadence côté Rust ≈30 Hz (EMIT_INTERVAL = 33ms).
// Conversion : exchangeMs = floor(timestampNs / 1_000_000).
// quantity → size (rename pour matcher OrderbookSnapshot du core).
//
// Précision : timestampNs (u64 ns ~1.7e18) dépasse Number.MAX_SAFE_INTEGER
// (2^53 ≈ 9e15). serde_json sérialise en JSON number, JS perd ~7 bits
// (spacing 256 ns). Après floor(/1e6) → ms, l'erreur est sub-µs : aucun
// impact sur granularité bucket 100 ms.
//
// Reconstruction orderbook : SIDE RUST UNIQUEMENT. Le JS reçoit des snapshots
// complets (depth=200), n'applique JAMAIS de delta (cf. brief refonte §2).

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { OrderbookSnapshot } from "../core";

const ORDERBOOK_EVENT = "orderbook-update";

interface OrderbookUpdatePayload {
  symbol: string;
  timestampNs: number;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  sequence: number;
  depth: number;
}

function isPayloadValid(p: unknown): p is OrderbookUpdatePayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Partial<OrderbookUpdatePayload>;
  return (
    typeof o.timestampNs === "number" &&
    Number.isFinite(o.timestampNs) &&
    Array.isArray(o.bids) &&
    Array.isArray(o.asks)
  );
}

// Exporté pour test unitaire (le listener Tauri lui-même n'est pas testable
// hors runtime). parseOrderbookPayload est pur, deterministe.
export function parseOrderbookPayload(
  payload: unknown,
): OrderbookSnapshot | null {
  if (!isPayloadValid(payload)) return null;
  const exchangeMs = Math.floor(payload.timestampNs / 1_000_000);
  const bids = new Array(payload.bids.length);
  for (let i = 0; i < payload.bids.length; i++) {
    bids[i] = { price: payload.bids[i].price, size: payload.bids[i].quantity };
  }
  const asks = new Array(payload.asks.length);
  for (let i = 0; i < payload.asks.length; i++) {
    asks[i] = { price: payload.asks[i].price, size: payload.asks[i].quantity };
  }
  return { exchangeMs, bids, asks };
}

export class OrderbookAdapter {
  private unlisten: UnlistenFn | null = null;

  async start(callback: (snap: OrderbookSnapshot) => void): Promise<void> {
    this.unlisten = await listen<unknown>(ORDERBOOK_EVENT, (event) => {
      const snap = parseOrderbookPayload(event.payload);
      if (!snap) {
        console.warn(
          "[OrderbookAdapter] payload malformé, skip",
          event.payload,
        );
        return;
      }
      callback(snap);
    });
  }

  dispose(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}
