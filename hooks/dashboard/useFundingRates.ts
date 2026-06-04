"use client";

import { useCallback, useEffect, useState } from "react";

import { FUNDING_SYMBOLS_LIST } from "./constants";
import type { FundingData } from "./types";

/**
 * Polls Binance's premium index every 30s and filters to the curated
 * funding strip universe. Funding ticks are 8h-cadence on the
 * exchange so a 30s refresh is more than enough to show the next-
 * funding countdown without flickering.
 *
 * Returns ordered by FUNDING_SYMBOLS_LIST so widgets can render in a
 * stable left-to-right sequence.
 */
export function useFundingRates() {
  const [rates, setRates] = useState<FundingData[]>([]);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(
        "https://fapi.binance.com/fapi/v1/premiumIndex",
      );
      if (!res.ok) return;
      const raw = (await res.json()) as Array<{
        symbol: string;
        lastFundingRate: string;
        nextFundingTime: number;
      }>;
      const list = FUNDING_SYMBOLS_LIST as readonly string[];
      const filtered = raw
        .filter((r) => list.includes(r.symbol))
        .map<FundingData>((r) => ({
          symbol: r.symbol,
          fundingRate: parseFloat(r.lastFundingRate) * 100,
          nextFundingTime: r.nextFundingTime,
        }))
        .sort(
          (a, b) =>
            list.indexOf(a.symbol) - list.indexOf(b.symbol),
        );
      setRates(filtered);
    } catch {
      // network — keep previous
    }
  }, []);

  useEffect(() => {
    void fetchRates();
    const id = setInterval(() => void fetchRates(), 30_000);
    return () => clearInterval(id);
  }, [fetchRates]);

  return rates;
}
