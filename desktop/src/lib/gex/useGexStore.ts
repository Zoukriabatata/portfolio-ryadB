import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  fetchGexSnapshot, tickGexSpot,
  type GexSnapshot, type GexSymbol,
} from "./api";

type GexStoreState = {
  snapshot: GexSnapshot | null;
  symbol: GexSymbol;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  autoRefresh: boolean;
  selectedExpiration: string | null;

  setSymbol: (s: GexSymbol) => Promise<void>;
  fetchSnapshot: () => Promise<void>;
  tickSpot: () => Promise<void>;
  setSnapshotFromEvent: (snap: GexSnapshot) => void;
  toggleAutoRefresh: () => void;
  setSelectedExpiration: (iso: string) => void;
};

export const useGexStore = create<GexStoreState>()(
  persist(
    (set, get) => ({
      snapshot: null,
      symbol: "SPY",
      loading: false,
      error: null,
      lastFetchedAt: null,
      autoRefresh: true,
      selectedExpiration: null,

      setSymbol: async (s) => {
        if (s === get().symbol) return;
        set({ symbol: s, snapshot: null, selectedExpiration: null });
        await get().fetchSnapshot();
      },

      fetchSnapshot: async () => {
        set({ loading: true, error: null });
        try {
          const snap = await fetchGexSnapshot(get().symbol);
          const cur = get().selectedExpiration;
          const stillValid = cur && snap.ivSmiles.some((s) => s.expiration === cur);
          const nextExp = stillValid ? cur : (snap.ivSmiles[0]?.expiration ?? null);
          set({
            snapshot: snap,
            loading: false,
            lastFetchedAt: Date.now(),
            selectedExpiration: nextExp,
          });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      tickSpot: async () => {
        // No loading flag — silent live update so the UI doesn't flicker.
        try {
          const snap = await tickGexSpot(get().symbol);
          const cur = get().selectedExpiration;
          const stillValid = cur && snap.ivSmiles.some((s) => s.expiration === cur);
          const nextExp = stillValid ? cur : (snap.ivSmiles[0]?.expiration ?? null);
          set({
            snapshot: snap,
            lastFetchedAt: Date.now(),
            selectedExpiration: nextExp,
          });
        } catch (e) {
          // Don't clobber a working snapshot on a transient tick failure.
          console.warn("gex tick failed:", e);
        }
      },

      setSnapshotFromEvent: (snap) => {
        const cur = get().selectedExpiration;
        const stillValid = cur && snap.ivSmiles.some((s) => s.expiration === cur);
        const nextExp = stillValid ? cur : (snap.ivSmiles[0]?.expiration ?? null);
        set({ snapshot: snap, lastFetchedAt: Date.now(), selectedExpiration: nextExp });
      },

      toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),
      setSelectedExpiration: (iso) => set({ selectedExpiration: iso }),
    }),
    {
      name: "orderflow:gex:prefs",
      partialize: (s) => ({ symbol: s.symbol, autoRefresh: s.autoRefresh }),
      merge: (persisted, current) => {
        const p = (persisted as Partial<GexStoreState>) ?? {};
        return { ...current, ...p };
      },
    },
  ),
);
