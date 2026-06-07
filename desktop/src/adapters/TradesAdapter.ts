// Source : desktop/src-tauri/src/commands/crypto_tick_events.rs
// Event "crypto-tick-batch", payload Vec<TickWire> (coalesced 16 ms window).
// Rust side serialises with rename_all = camelCase + lowercase "buy"/"sell".
// Each element :
//   {
//     symbol: string,
//     price: number,
//     quantity: number,
//     side: "buy" | "sell",
//     timestampNs: number          // u64 ns since UNIX epoch
//   }
// Cadence : up to 1 IPC event per 16 ms (≈ 60 FPS). Drops on lag via
// tokio::sync::broadcast. The array can be empty on quiet markets but
// the flush only fires when non-empty (no-op skipped in Rust).
//
// Side mapping (resolved Rust-side, cf. crypto_tick_events.rs) :
//   "buy"  = aggressor buyer  (hit the ask) → Trade.side = "bid"  → colour --bid (green)
//   "sell" = aggressor seller (hit the bid) → Trade.side = "ask"  → colour --ask (red)
// Flip only if visually wrong at runtime (colours vs price direction).
//
// Precision : timestampNs > Number.MAX_SAFE_INTEGER (cf. CLAUDE.md §5.D).
// floor(/1e6) → ms : sub-µs loss acceptable for 100 ms bucket.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Trade } from "../core";

const TICK_BATCH_EVENT = "crypto-tick-batch";

interface TickWire {
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestampNs: number;
}

function isTickWire(p: unknown): p is TickWire {
  if (!p || typeof p !== "object") return false;
  const o = p as Partial<TickWire>;
  return (
    typeof o.timestampNs === "number" &&
    Number.isFinite(o.timestampNs) &&
    typeof o.price === "number" &&
    typeof o.quantity === "number" &&
    (o.side === "buy" || o.side === "sell")
  );
}

// Exported for unit tests (the Tauri listener itself is not testable
// outside the runtime). parseTradePayload is pure and deterministic.
export function parseTradePayload(payload: unknown): Trade | null {
  if (!isTickWire(payload)) return null;
  const exchangeMs = Math.floor(payload.timestampNs / 1_000_000);
  return {
    exchangeMs,
    price: payload.price,
    size: payload.quantity,
    side: payload.side === "buy" ? "bid" : "ask",
  };
}

export class TradesAdapter {
  private unlisten: UnlistenFn | null = null;

  async start(callback: (trade: Trade) => void): Promise<void> {
    // The backend emits a Vec<TickWire> batch every 16 ms.
    // We iterate the array and invoke `callback` once per tick so
    // consumers see the same interface as before — no API change.
    this.unlisten = await listen<unknown>(TICK_BATCH_EVENT, (event) => {
      const batch = event.payload;
      if (!Array.isArray(batch)) {
        console.warn("[TradesAdapter] payload inattendu (non-tableau), skip", batch);
        return;
      }
      for (const item of batch) {
        const trade = parseTradePayload(item);
        if (!trade) {
          console.warn("[TradesAdapter] tick malformé dans le batch, skip", item);
          continue;
        }
        callback(trade);
      }
    });
  }

  dispose(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}
