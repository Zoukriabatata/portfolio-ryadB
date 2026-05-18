import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EconomicEvent, Impact, NewsArticle } from "./api";
import { fetchArticles, fetchCalendar } from "./api";

type CountryCode = "US" | "EU" | "GB" | "JP" | "CN";

export type Filters = {
  range: "today" | "7d";
  impact: Record<Impact, boolean>;
  countries: Record<CountryCode, boolean>;
};

const DEFAULT_FILTERS: Filters = {
  range: "7d",
  impact: { high: true, medium: false, low: false },
  countries: { US: true, EU: true, GB: false, JP: false, CN: false },
};

type NewsState = {
  articles: NewsArticle[];
  articlesFetchedAt: number | null;
  articlesLoading: boolean;
  articlesError: string | null;

  events: EconomicEvent[];
  eventsFetchedAt: number | null;
  eventsLoading: boolean;
  eventsError: string | null;

  filters: Filters;
  setRange: (range: Filters["range"]) => void;
  toggleImpact: (i: Impact) => void;
  toggleCountry: (c: CountryCode) => void;

  refreshArticles: () => Promise<void>;
  refreshEvents: () => Promise<void>;
};

function yyyymmddUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeWindow(range: Filters["range"]): { from: string; to: string } {
  const now = new Date();
  const from = yyyymmddUtc(now);
  const toDate = new Date(now);
  toDate.setUTCDate(toDate.getUTCDate() + (range === "today" ? 0 : 7));
  return { from, to: yyyymmddUtc(toDate) };
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set, get) => ({
      articles: [],
      articlesFetchedAt: null,
      articlesLoading: false,
      articlesError: null,

      events: [],
      eventsFetchedAt: null,
      eventsLoading: false,
      eventsError: null,

      filters: DEFAULT_FILTERS,
      setRange: (range) => {
        set((s) => ({ filters: { ...s.filters, range } }));
        void get().refreshEvents();
      },
      toggleImpact: (i) =>
        set((s) => ({
          filters: {
            ...s.filters,
            impact: { ...s.filters.impact, [i]: !s.filters.impact[i] },
          },
        })),
      toggleCountry: (c) =>
        set((s) => ({
          filters: {
            ...s.filters,
            countries: { ...s.filters.countries, [c]: !s.filters.countries[c] },
          },
        })),

      refreshArticles: async () => {
        set({ articlesLoading: true, articlesError: null });
        try {
          const list = await fetchArticles("general");
          set({
            articles: list,
            articlesFetchedAt: Date.now(),
            articlesLoading: false,
          });
        } catch (e) {
          set({
            articlesError: String(e),
            articlesLoading: false,
          });
        }
      },

      refreshEvents: async () => {
        set({ eventsLoading: true, eventsError: null });
        try {
          const { from, to } = computeWindow(get().filters.range);
          const list = await fetchCalendar(from, to);
          set({
            events: list,
            eventsFetchedAt: Date.now(),
            eventsLoading: false,
          });
        } catch (e) {
          set({
            eventsError: String(e),
            eventsLoading: false,
          });
        }
      },
    }),
    {
      name: "orderflow:news:filters",
      partialize: (s) => ({ filters: s.filters }),
    },
  ),
);
