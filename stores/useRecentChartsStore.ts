/**
 * Tracks the user's most recently visited chart sessions so the
 * dashboard can offer one-click "resume where you left off."
 *
 * Persistence : zustand `persist` middleware → localStorage. Keyed
 * on `(route, symbol)` so opening the same symbol twice doesn't
 * stack two entries — the existing one just bubbles to the top.
 *
 * Cap : `MAX_ENTRIES`. Older entries fall off the bottom silently.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Routes that drive a chart-style experience worth resuming. New
 *  routes get added here as they ship. */
export type RecentChartRoute =
  | "/live"
  | "/footprint"
  | "/gex"
  | "/volatility"
  | "/flow";

export interface RecentChartVisit {
  /** Symbol the user was watching. Stored uppercase for stable
   *  matching (lowercase / uppercase mix from various data sources
   *  would otherwise double-count BTC/btc). */
  symbol: string;
  route: RecentChartRoute;
  /** Unix ms — when the visit landed in the store. */
  visitedAt: number;
}

interface RecentChartsState {
  visits: RecentChartVisit[];
  /** Push a visit to the top. Existing matching (route, symbol)
   *  pair is hoisted, not duplicated. Cap at MAX_ENTRIES. */
  trackVisit: (visit: Omit<RecentChartVisit, "visitedAt">) => void;
  clear: () => void;
}

const MAX_ENTRIES = 10;

export const useRecentChartsStore = create<RecentChartsState>()(
  persist(
    (set) => ({
      visits: [],
      trackVisit: (visit) =>
        set((state) => {
          const symbol = visit.symbol.toUpperCase();
          const next = state.visits.filter(
            (v) => !(v.route === visit.route && v.symbol === symbol),
          );
          next.unshift({
            symbol,
            route: visit.route,
            visitedAt: Date.now(),
          });
          if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
          return { visits: next };
        }),
      clear: () => set({ visits: [] }),
    }),
    {
      name: "orderflow.recent-charts.v1",
      version: 1,
    },
  ),
);
