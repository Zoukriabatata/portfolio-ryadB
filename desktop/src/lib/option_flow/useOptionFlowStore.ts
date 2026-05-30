import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pollOptionFlow, type OptionTrade, type ContractType } from "./api";

const RING_BUFFER_LIMIT = 500;

export type SideFilter = "all" | "buy" | "sell";
export type ContractFilter = "all" | ContractType;

type OptionFlowState = {
  symbol: string;
  trades: OptionTrade[];
  loading: boolean;
  error: string | null;
  lastPolledAt: number | null;
  /** Largest timestampMs seen, fed back to the backend as `since_ms`. */
  cursorMs: number | null;
  autoRefresh: boolean;

  // Filters
  minPremium: number; // $
  minSize: number; // contracts
  contractFilter: ContractFilter;
  sideFilter: SideFilter;

  setSymbol: (s: string) => Promise<void>;
  poll: () => Promise<void>;
  clearTrades: () => void;
  toggleAutoRefresh: () => void;
  setMinPremium: (v: number) => void;
  setMinSize: (v: number) => void;
  setContractFilter: (v: ContractFilter) => void;
  setSideFilter: (v: SideFilter) => void;
  resetFilters: () => void;
};

export const useOptionFlowStore = create<OptionFlowState>()(
  persist(
    (set, get) => ({
      symbol: "SPY",
      trades: [],
      loading: false,
      error: null,
      lastPolledAt: null,
      cursorMs: null,
      autoRefresh: true,
      minPremium: 0,
      minSize: 0,
      contractFilter: "all",
      sideFilter: "all",

      setSymbol: async (s) => {
        const norm = s.trim().toUpperCase();
        if (!norm || norm === get().symbol) return;
        set({
          symbol: norm,
          trades: [],
          cursorMs: null,
          error: null,
        });
        await get().poll();
      },

      poll: async () => {
        if (get().loading) return;
        set({ loading: true, error: null });
        try {
          const fresh = await pollOptionFlow(get().symbol, get().cursorMs);
          if (fresh.length === 0) {
            set({ loading: false, lastPolledAt: Date.now() });
            return;
          }
          const existing = get().trades;
          // Trades come newest-first from backend. Prepend, dedupe by
          // (symbol, ts, price, size) to handle the 30s overlap window.
          const seen = new Set(
            existing.map(
              (t) => `${t.symbol}|${t.timestampMs}|${t.price}|${t.size}`,
            ),
          );
          const novel: OptionTrade[] = [];
          for (const t of fresh) {
            const k = `${t.symbol}|${t.timestampMs}|${t.price}|${t.size}`;
            if (seen.has(k)) continue;
            seen.add(k);
            novel.push(t);
          }
          const merged = [...novel, ...existing].slice(0, RING_BUFFER_LIMIT);
          const newCursor = Math.max(
            get().cursorMs ?? 0,
            ...fresh.map((t) => t.timestampMs),
          );
          set({
            trades: merged,
            cursorMs: newCursor,
            loading: false,
            lastPolledAt: Date.now(),
          });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      clearTrades: () =>
        set({ trades: [], cursorMs: null, error: null }),
      toggleAutoRefresh: () => set((s) => ({ autoRefresh: !s.autoRefresh })),
      setMinPremium: (v) => set({ minPremium: Math.max(0, v) }),
      setMinSize: (v) => set({ minSize: Math.max(0, v) }),
      setContractFilter: (v) => set({ contractFilter: v }),
      setSideFilter: (v) => set({ sideFilter: v }),
      resetFilters: () =>
        set({
          minPremium: 0,
          minSize: 0,
          contractFilter: "all",
          sideFilter: "all",
        }),
    }),
    {
      name: "orderflow:option_flow:prefs",
      partialize: (s) => ({
        symbol: s.symbol,
        autoRefresh: s.autoRefresh,
        minPremium: s.minPremium,
        minSize: s.minSize,
        contractFilter: s.contractFilter,
        sideFilter: s.sideFilter,
      }),
      merge: (persisted, current) => {
        const p = (persisted as Partial<OptionFlowState>) ?? {};
        return { ...current, ...p };
      },
    },
  ),
);
