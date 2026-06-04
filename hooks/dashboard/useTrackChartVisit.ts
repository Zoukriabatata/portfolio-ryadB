"use client";

import { useEffect } from "react";

import {
  type RecentChartRoute,
  useRecentChartsStore,
} from "@/stores/useRecentChartsStore";

/**
 * Calls `trackVisit` once when the chart route mounts (and again
 * when the focused symbol changes). The store dedups internally, so
 * navigating away and coming back to the same chart just refreshes
 * the timestamp — it doesn't push a duplicate entry.
 *
 * Intended call sites :
 *   • `app/live/page.tsx`
 *   • `app/footprint/page.tsx`
 *   • `app/gex/page.tsx`
 *   • `app/volatility/page.tsx`
 *   • `app/flow/page.tsx`
 *
 * Each route already owns its current symbol via a route-local
 * hook — just plug the symbol + the route literal here.
 */
export function useTrackChartVisit(
  symbol: string | null | undefined,
  route: RecentChartRoute,
) {
  const trackVisit = useRecentChartsStore((s) => s.trackVisit);

  useEffect(() => {
    if (!symbol || !symbol.trim()) return;
    trackVisit({ symbol, route });
  }, [symbol, route, trackVisit]);
}
