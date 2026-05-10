// Source : desktop/src-tauri/src/commands/crypto_tick_events.rs:22
// Event "crypto-tick-update", payload TickWire (camelCase via
// `#[serde(rename_all = "camelCase")]` ligne 25) :
//   {
//     symbol: string,
//     price: number,
//     quantity: number,
//     side: "buy" | "sell",
//     timestampNs: number          // u64 ns since UNIX epoch
//   }
// Cadence : pass-through (1 tick venue = 1 emit Tauri ; drop sur lag du
// listener via tokio::sync::broadcast). Pas de EMIT_INTERVAL — flux direct.
//
// Side mapping (côté Rust déjà résolu, cf. crypto_tick_events.rs:49) :
//   "buy"  = agresseur acheteur (a frappé l'ask)  → Trade.side = "bid"  → couleur --bid (vert)
//   "sell" = agresseur vendeur  (a frappé le bid) → Trade.side = "ask"  → couleur --ask (rouge)
// Inverser uniquement si visuellement faux runtime (couleurs vs direction prix).
//
// Précision : timestampNs > Number.MAX_SAFE_INTEGER (cf. CLAUDE.md §5.D).
// floor(/1e6) → ms : sub-µs au niveau ms, OK pour bucket 100 ms.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Trade } from "../core";

const TICK_EVENT = "crypto-tick-update";

interface TickPayload {
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestampNs: number;
}

function isPayloadValid(p: unknown): p is TickPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Partial<TickPayload>;
  return (
    typeof o.timestampNs === "number" &&
    Number.isFinite(o.timestampNs) &&
    typeof o.price === "number" &&
    typeof o.quantity === "number" &&
    (o.side === "buy" || o.side === "sell")
  );
}

// Exporté pour test unitaire (le listener Tauri lui-même n'est pas testable
// hors runtime). parseTradePayload est pur, deterministe.
export function parseTradePayload(payload: unknown): Trade | null {
  if (!isPayloadValid(payload)) return null;
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
    this.unlisten = await listen<unknown>(TICK_EVENT, (event) => {
      const trade = parseTradePayload(event.payload);
      if (!trade) {
        console.warn("[TradesAdapter] payload malformé, skip", event.payload);
        return;
      }
      callback(trade);
    });
  }

  dispose(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}
