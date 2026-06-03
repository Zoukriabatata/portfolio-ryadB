"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live prices + 24-hourly sparkline closes for the dashboard
 * watchlist.
 *
 * Two independent cadences:
 *   • 24hr ticker → 5s poll. Binance free-tier endpoint has no rate
 *     limit at this cadence for the ~15 symbol set we care about.
 *   • 1h klines (24 closes) → 5min poll. Sparkline data moves slowly
 *     by definition — re-fetching every tick would be wasteful and
 *     trigger redundant SVG draw-on animations.
 *
 * Both run independently so a slow kline fetch doesn't delay price
 * updates and vice versa. State is keyed by lowercase symbol
 * (matching the WatchlistStore convention).
 *
 * `direction` flips with each price change so widgets can flash the
 * row green / red without comparing prices themselves. Reset on
 * symbol-list changes so stale flashes don't leak to a freshly
 * added ticker.
 */

export interface WatchlistTick {
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  /** Direction of the most recent intra-poll change. Used by widgets
   *  to trigger flash animations without re-deriving from prevPrice. */
  direction: "up" | "down" | null;
  lastUpdated: number;
}

export interface WatchlistPricesResult {
  ticks: Map<string, WatchlistTick>;
  sparklines: Map<string, number[]>;
  ready: boolean;
}

const TICKER_INTERVAL_MS = 5_000;
const SPARKLINE_INTERVAL_MS = 5 * 60_000;
const SPARKLINE_BARS = 24;

export function useWatchlistPrices(symbols: string[]): WatchlistPricesResult {
  const [ticks, setTicks] = useState<Map<string, WatchlistTick>>(new Map());
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(
    new Map(),
  );
  const [ready, setReady] = useState(false);

  // String key so the deps don't tear when callers spread a new
  // array on every render.
  const symbolsKey = symbols.join(",");

  const fetchTickers = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const upper = symbols.map((s) => s.toUpperCase());
      const symbolsParam = "[" + upper.map((s) => `"${s}"`).join(",") + "]";
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`,
      );
      if (!res.ok) return;
      const raw = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        priceChange: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;
      const now = Date.now();
      setTicks((prev) => {
        const next = new Map(prev);
        for (const t of raw) {
          const key = t.symbol.toLowerCase();
          const price = parseFloat(t.lastPrice);
          const previous = prev.get(key);
          let direction: WatchlistTick["direction"] = null;
          if (previous && Number.isFinite(previous.price)) {
            if (price > previous.price) direction = "up";
            else if (price < previous.price) direction = "down";
          }
          next.set(key, {
            price,
            change24h: parseFloat(t.priceChange),
            changePercent24h: parseFloat(t.priceChangePercent),
            volume24h: parseFloat(t.quoteVolume),
            direction,
            lastUpdated: now,
          });
        }
        return next;
      });
      setReady(true);
    } catch {
      // network — keep previous tick
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  const fetchSparklines = useCallback(async () => {
    if (symbols.length === 0) return;
    try {
      const upper = symbols.map((s) => s.toUpperCase());
      const results = await Promise.all(
        upper.map((sym) =>
          fetch(
            `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=${SPARKLINE_BARS}`,
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (!Array.isArray(data)) return null;
              // Each kline tuple: [openTime, open, high, low, close, ...]
              // We sparkline on the close (index 4).
              const closes = data
                .map((row: unknown) => {
                  const c = (row as unknown[])[4];
                  return typeof c === "string" ? parseFloat(c) : NaN;
                })
                .filter((n) => Number.isFinite(n));
              return { symbol: sym, closes };
            })
            .catch(() => null),
        ),
      );
      setSparklines((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (!r) continue;
          next.set(r.symbol.toLowerCase(), r.closes);
        }
        return next;
      });
    } catch {
      // network — keep previous sparkline
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  useEffect(() => {
    void fetchTickers();
    const id = setInterval(() => void fetchTickers(), TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTickers]);

  useEffect(() => {
    void fetchSparklines();
    const id = setInterval(
      () => void fetchSparklines(),
      SPARKLINE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [fetchSparklines]);

  return { ticks, sparklines, ready };
}
