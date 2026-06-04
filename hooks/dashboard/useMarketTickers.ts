"use client";

import { useCallback, useEffect, useState } from "react";

import { ALL_SYMBOLS } from "./constants";
import type { TickerData } from "./types";

/**
 * Fetches Binance USDT-margined futures 24h tickers for the curated
 * 24-symbol universe every 5 seconds. The hook stays silent on network
 * errors so the dashboard never flashes "no data" on transient blips —
 * the previous tick stays visible until the next successful poll.
 */
export function useMarketTickers() {
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [lastFetch, setLastFetch] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const symbolsParam =
        "[" + ALL_SYMBOLS.map((s) => `"${s}"`).join(",") + "]";
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`,
      );
      if (!res.ok) return;
      const raw = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;

      const mapped: TickerData[] = raw.map((t) => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        changePercent: parseFloat(t.priceChangePercent),
        quoteVolume24h: parseFloat(t.quoteVolume),
      }));

      setTickers(mapped);
      setLastFetch(Date.now());
    } catch {
      // network error — keep previous data, don't flash empty UI
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const id = setInterval(() => void fetchData(), 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  return { tickers, lastFetch };
}
