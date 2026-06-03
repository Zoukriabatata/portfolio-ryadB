"use client";

/**
 * Watchlist hero card — the "featured story + index" of the
 * dashboard's bento.
 *
 * Composition :
 *   • `<WatchlistFeatured>` — the focused ticker (big serif price,
 *     mid-size sparkline, change pill).
 *   • Divider hairline.
 *   • `<WatchlistRow>` × N — compact index list. Clicking a row
 *     promotes it to featured + the previous featured slides into
 *     the index (state swap, no animation lib needed).
 *
 * Persistence :
 *   • Featured symbol → localStorage `orderflow.watchlist.featured`
 *     (default `btcusdt`). Restored on mount so a refresh keeps the
 *     same focus.
 *   • Watchlist items → already persisted by `useWatchlistStore`
 *     via zustand's `persist` middleware (legacy store).
 */

import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useWatchlistPrices } from "@/hooks/dashboard/useWatchlistPrices";
import { useWatchlistStore } from "@/stores/useWatchlistStore";

import { DashboardCard } from "./DashboardCard";
import { WatchlistFeatured } from "./WatchlistFeatured";
import { WatchlistRow } from "./WatchlistRow";

const FEATURED_STORAGE_KEY = "orderflow.watchlist.featured";
const FEATURED_DEFAULT = "btcusdt";
/** How many index rows under the featured ticker. Keeps the hero
 *  card scannable; the full watchlist editor will land in a future
 *  modal post-launch. */
const INDEX_LIMIT = 5;

export function WatchlistCard() {
  const items = useWatchlistStore((s) => s.items);
  const [featuredSymbol, setFeaturedSymbolState] =
    useState<string>(FEATURED_DEFAULT);

  // Hydrate featured selection from localStorage on mount only —
  // SSR can't read localStorage and a server/client mismatch would
  // trigger a hydration warning. Keeping state at the default
  // during SSR and swapping post-mount is the standard Next 15
  // pattern.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FEATURED_STORAGE_KEY);
      if (stored && items.some((i) => i.symbol === stored)) {
        setFeaturedSymbolState(stored);
      }
    } catch {
      // localStorage unavailable — fall back to default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFeaturedSymbol = (symbol: string) => {
    setFeaturedSymbolState(symbol);
    try {
      window.localStorage.setItem(FEATURED_STORAGE_KEY, symbol);
    } catch {
      // ignore — non-fatal
    }
  };

  // Resolve the featured item from the store. If the saved symbol
  // disappeared from the watchlist (user removed it) fall back to
  // the first item.
  const featuredItem = useMemo(() => {
    if (items.length === 0) return null;
    return (
      items.find((i) => i.symbol === featuredSymbol) ?? items[0]
    );
  }, [items, featuredSymbol]);

  // Index = watchlist minus the featured, capped to INDEX_LIMIT.
  const indexItems = useMemo(() => {
    if (!featuredItem) return [];
    return items
      .filter((i) => i.symbol !== featuredItem.symbol)
      .slice(0, INDEX_LIMIT);
  }, [items, featuredItem]);

  // Single hook drives prices + sparklines for every symbol on the
  // card. One round-trip for the whole watchlist instead of N.
  const symbolsKey = useMemo(
    () => items.slice(0, INDEX_LIMIT + 1).map((i) => i.symbol),
    [items],
  );
  const { ticks, sparklines } = useWatchlistPrices(symbolsKey);

  if (items.length === 0) {
    return (
      <DashboardCard
        variant="hero"
        title="Watchlist"
        icon={<Star size={14} />}
        className="h-full"
      >
        <div
          className="flex flex-col items-center justify-center h-full py-8 gap-2"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="dash-text-base font-medium">
            Pick your tickers
          </span>
          <span
            className="dash-text-xs"
            style={{ color: "var(--text-dimmed)" }}
          >
            Add symbols from the watchlist editor to follow them here.
          </span>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      variant="hero"
      title="Watchlist"
      icon={<Star size={14} />}
      className="h-full"
    >
      <div className="flex flex-col gap-4 h-full">
        {featuredItem && (
          <WatchlistFeatured
            symbol={featuredItem.symbol}
            label={featuredItem.label}
            tick={ticks.get(featuredItem.symbol)}
            sparkline={sparklines.get(featuredItem.symbol)}
          />
        )}

        {indexItems.length > 0 && (
          <>
            <div
              aria-hidden
              className="h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, var(--border), transparent)",
              }}
            />

            <div className="flex flex-col">
              {indexItems.map((item) => (
                <WatchlistRow
                  key={item.symbol}
                  symbol={item.symbol}
                  label={item.label}
                  tick={ticks.get(item.symbol)}
                  sparkline={sparklines.get(item.symbol)}
                  onClick={() => setFeaturedSymbol(item.symbol)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardCard>
  );
}
