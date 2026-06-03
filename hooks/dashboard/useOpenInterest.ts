"use client";

import { useCallback, useEffect, useState } from "react";

import { OI_SYMBOLS } from "./constants";

/**
 * Open Interest poller — Binance USDT-margined perpetuals only.
 * Returns a `{ symbol → { current, prev } }` map so widgets can show
 * a 30s delta on top of the absolute number.
 *
 * Parallel-fans-out per symbol (4 requests / 30s) because Binance has
 * no batch endpoint for `openInterest` — the per-symbol cost is
 * negligible at this cadence.
 */
export function useOpenInterest() {
  const [oi, setOi] = useState<
    Record<string, { current: number; prev: number }>
  >({});

  const fetchOI = useCallback(async () => {
    try {
      const results = await Promise.all(
        OI_SYMBOLS.map((sym) =>
          fetch(
            `https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`,
          )
            .then((r) => r.json())
            .then(
              (d: { symbol: string; openInterest: string }) => ({
                symbol: d.symbol,
                openInterest: parseFloat(d.openInterest),
              }),
            )
            .catch(() => null),
        ),
      );
      setOi((prev) => {
        const next = { ...prev };
        results.forEach((r) => {
          if (!r) return;
          next[r.symbol] = {
            current: r.openInterest,
            prev: prev[r.symbol]?.current ?? r.openInterest,
          };
        });
        return next;
      });
    } catch {
      // network
    }
  }, []);

  useEffect(() => {
    void fetchOI();
    const id = setInterval(() => void fetchOI(), 30_000);
    return () => clearInterval(id);
  }, [fetchOI]);

  return oi;
}
