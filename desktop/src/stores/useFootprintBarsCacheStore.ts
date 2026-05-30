// Persisted cache of footprint history bars (with full bid×ask per
// price level) so navigating away from the chart route and coming
// back doesn't trigger a fresh 5-10s HISTORY_PLANT round-trip on
// Apex. Each entry is keyed by `${symbol}|${exchange}|${timeframe}`
// and carries a `fetchedAt` epoch ms used by the TTL guard.
//
// Mirrors the persist + merge pattern from useFootprintSettingsStore
// — forward-compatible so adding a field later doesn't wipe entries.
// Backed by localStorage; Tauri's WebView2 / WebKit both support it.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FootprintBar } from "../components/FootprintBarView";

/** How long a cached entry stays usable before we re-fetch from
 *  Apex. Long enough to cover normal page-nav workflows in a
 *  single session, short enough that resuming the app the next
 *  trading day forces a refresh. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/** Hard upper bound on entry age regardless of session. Past this,
 *  the entry is purged on startup. */
export const CACHE_HARD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

/** Per-entry JSON size cap. localStorage caps the whole origin to
 *  ~5-10 MB on WebView2; we keep each entry well under 2 MB so the
 *  cache as a whole can comfortably hold the 7 preloaded TFs. */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

export type CacheEntry = {
  /** Bars in ascending bucketTsNs order. Sorted at write-time so
   *  consumers can rely on the ordering without re-sorting. */
  bars: FootprintBar[];
  /** Wall-clock epoch ms of the fetch completion. Used for TTL. */
  fetchedAt: number;
  /** Upper bound (epoch seconds UTC) of the lookback window that
   *  produced these bars — purely diagnostic, helps spot the
   *  oldest bar's age at a glance in DevTools. */
  finishSec: number;
  /** Lookback window the fetch was issued with. Lets a consumer
   *  detect "I want 24h but cache only has the previous 6h" and
   *  decide whether to re-fetch. */
  hoursBack: number;
};

type State = {
  cache: Record<string, CacheEntry>;
};

type Actions = {
  /** Compose the canonical cache key. Always go through this so a
   *  callsite typo can't silently shadow another entry. */
  keyFor: (symbol: string, exchange: string, timeframe: string) => string;
  /** Read an entry if present and not past the TTL. Returns null
   *  for misses AND for entries the TTL has expired. */
  getFresh: (key: string) => CacheEntry | null;
  /** Write an entry. Rejects payloads larger than MAX_ENTRY_BYTES
   *  with a console.warn (the renderer will just refetch next time). */
  setEntry: (key: string, entry: CacheEntry) => void;
  /** Drop every entry whose `fetchedAt` is older than `maxAgeMs`.
   *  Called once on app boot to keep localStorage from growing
   *  unboundedly across sessions. */
  clearStaleEntries: (maxAgeMs: number) => void;
  /** Drop every entry for a given symbol (any exchange/TF). Used
   *  when the user picks a new symbol so we don't waste cache
   *  space on the previous one. */
  clearSymbol: (symbol: string) => void;
  /** Nuke everything — debug helper, exposed via window for manual
   *  invalidation when iterating on the fix. */
  clearAll: () => void;
};

const STORE_KEY = "senzoukria.footprint.bars-cache.v1";

export const useFootprintBarsCacheStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      cache: {},
      keyFor: (symbol, exchange, timeframe) =>
        `${symbol}|${exchange}|${timeframe}`,
      getFresh: (key) => {
        const entry = get().cache[key];
        if (!entry) return null;
        if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
        return entry;
      },
      setEntry: (key, entry) => {
        // Cheap size guard: stringify once, refuse if too big. Worst
        // case the renderer just re-fetches next time the user lands
        // on this TF — same as not having a cache at all.
        const size = JSON.stringify(entry).length;
        if (size > MAX_ENTRY_BYTES) {
          console.warn(
            `bars-cache: entry ${key} too large (${(size / 1024).toFixed(1)} kB > ${MAX_ENTRY_BYTES / 1024} kB), skipping write`,
          );
          return;
        }
        set((s) => ({ cache: { ...s.cache, [key]: entry } }));
      },
      clearStaleEntries: (maxAgeMs) => {
        const cutoff = Date.now() - maxAgeMs;
        const cur = get().cache;
        const next: Record<string, CacheEntry> = {};
        let removed = 0;
        for (const [k, v] of Object.entries(cur)) {
          if (v.fetchedAt >= cutoff) next[k] = v;
          else removed++;
        }
        if (removed > 0) {
          console.info(`bars-cache: purged ${removed} stale entries`);
          set({ cache: next });
        }
      },
      clearSymbol: (symbol) => {
        const cur = get().cache;
        const next: Record<string, CacheEntry> = {};
        const prefix = `${symbol}|`;
        for (const [k, v] of Object.entries(cur)) {
          if (!k.startsWith(prefix)) next[k] = v;
        }
        set({ cache: next });
      },
      clearAll: () => set({ cache: {} }),
    }),
    {
      name: STORE_KEY,
      // Forward-compatible merge — same shape as the settings store.
      // Missing/garbage fields fall back to the current defaults
      // instead of poisoning the live state.
      merge: (persisted, current) => {
        const p = (persisted as Partial<State>) ?? {};
        const rawCache = (p.cache ?? {}) as Record<string, unknown>;
        const cache: Record<string, CacheEntry> = {};
        for (const [k, raw] of Object.entries(rawCache)) {
          if (!raw || typeof raw !== "object") continue;
          const e = raw as Partial<CacheEntry>;
          if (
            !Array.isArray(e.bars) ||
            typeof e.fetchedAt !== "number" ||
            typeof e.finishSec !== "number" ||
            typeof e.hoursBack !== "number"
          )
            continue;
          // Discard entries older than the hard expiry — these come
          // from a previous day's session.
          if (Date.now() - e.fetchedAt > CACHE_HARD_EXPIRY_MS) continue;
          cache[k] = {
            bars: e.bars as FootprintBar[],
            fetchedAt: e.fetchedAt,
            finishSec: e.finishSec,
            hoursBack: e.hoursBack,
          };
        }
        return { ...current, cache };
      },
    },
  ),
);
