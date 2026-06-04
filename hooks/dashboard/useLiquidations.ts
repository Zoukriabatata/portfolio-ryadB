"use client";

import { useEffect, useRef, useState } from "react";

import type { LiquidationEvent } from "./types";

/** Below this dollar threshold we drop liquidations — the firehose is
 *  too noisy with $50-100 retail wicks. */
const MIN_VALUE_USD = 10_000;

/** Cap on the kept history so an idle tab doesn't grow the array
 *  indefinitely. The dashboard widget only renders the top N anyway. */
const MAX_BUFFER = 25;

/**
 * Binance forced-order WebSocket — fans out every futures liquidation
 * across the entire perpetual universe. We filter to ≥ $10K to keep
 * the stream actionable: the widget only cares about whales.
 */
export function useLiquidations() {
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const ws = new WebSocket(
      "wss://fstream.binance.com/ws/!forceOrder@arr",
    );
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          o: {
            s: string;
            S: string;
            ap: string;
            p: string;
            q: string;
            T: number;
          };
        };
        const o = msg.o;
        if (!o) return;
        const price = parseFloat(o.ap || o.p);
        const qty = parseFloat(o.q);
        const valueUSD = price * qty;
        if (valueUSD < MIN_VALUE_USD) return;
        const liq: LiquidationEvent = {
          id: String(++counterRef.current),
          symbol: o.s,
          // Binance reports the side that was liquidated — a SELL
          // force-order means a LONG got hit.
          side: o.S === "SELL" ? "LONG" : "SHORT",
          valueUSD,
          price,
          time: o.T || Date.now(),
        };
        setLiquidations((prev) => [liq, ...prev.slice(0, MAX_BUFFER - 1)]);
      } catch {
        // malformed frame
      }
    };
    return () => ws.close();
  }, []);

  return liquidations;
}
