import { create } from "zustand";
import type {
  Account, AccountStats, FeedStatus, Position, WorkingOrder,
} from "./api";

export type EquityPoint = { ts: number; balance: number };

export type DayStats = {
  tradesCount: number;
  winRate: number;        // 0..1
  bestTrade: number;
  worstTrade: number;
};

type AccountStoreState = {
  accounts: Account[];
  activeAccountId: string | null;

  stats: AccountStats | null;
  positions: Position[];
  workingOrders: WorkingOrder[];

  equityCurve: EquityPoint[];
  dayStats: DayStats;

  feedStatus: FeedStatus;
  error: string | null;

  setAccounts: (a: Account[]) => void;
  setActiveAccountId: (id: string | null) => void;
  setStats: (s: AccountStats) => void;
  upsertPosition: (p: Position) => void;
  setOrders: (o: WorkingOrder[]) => void;
  setFeedStatus: (s: FeedStatus) => void;
  setError: (e: string | null) => void;
  resetFeedData: () => void;
  /** Seed the realized-PnL history from a backend pull of today's
   *  closed trades. Replaces any in-memory history (called at mount,
   *  before live updates start tracking new closures). */
  seedDayStats: (pnls: number[]) => void;
  /** Periodic sampler — push current balance as an equity point.
   *  Called by the feed hook every 30s so the chart draws a flat
   *  line even when Rithmic isn't pushing new PnL updates (no
   *  positions open = no implicit ticks). */
  pushEquityPoint: () => void;
};

const EMPTY_DAY: DayStats = { tradesCount: 0, winRate: 0, bestTrade: 0, worstTrade: 0 };
const EQUITY_MIN_GAP_MS = 30_000;
const EQUITY_CAP = 1500;
const REALIZED_HISTORY_CAP = 500;

// Module-private — survives across store invocations but is wiped by
// resetFeedData(). Not exposed in the public state to avoid bloating
// re-renders downstream of every closed trade.
let realizedHistory: number[] = [];

function recomputeDayStats(): DayStats {
  if (realizedHistory.length === 0) return EMPTY_DAY;
  const wins = realizedHistory.filter((x) => x > 0).length;
  return {
    tradesCount: realizedHistory.length,
    winRate: wins / realizedHistory.length,
    bestTrade: Math.max(...realizedHistory),
    worstTrade: Math.min(...realizedHistory),
  };
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  stats: null,
  positions: [],
  workingOrders: [],
  equityCurve: [],
  dayStats: EMPTY_DAY,
  feedStatus: "disconnected",
  error: null,

  setAccounts: (a) => set({ accounts: a }),
  setActiveAccountId: (id) => set({ activeAccountId: id }),

  setStats: (s) => {
    const cur = get().equityCurve;
    const now = Date.now();
    const lastTs = cur.length ? cur[cur.length - 1].ts : 0;
    let nextCurve = cur;
    // Always seed the first point immediately so the chart has
    // something to anchor. After that, throttle to one sample per
    // EQUITY_MIN_GAP_MS (currently 30s) to keep memory bounded.
    if (cur.length === 0 || now - lastTs >= EQUITY_MIN_GAP_MS) {
      nextCurve = [...cur, { ts: now, balance: s.balance }];
      if (nextCurve.length > EQUITY_CAP) nextCurve = nextCurve.slice(-EQUITY_CAP);
    }
    set({ stats: s, equityCurve: nextCurve });
  },

  upsertPosition: (p) => {
    const cur = get().positions;
    const prev = cur.find((x) => x.symbol === p.symbol && x.exchange === p.exchange);

    // Track realized PnL on position close (open → flat transition).
    if (
      prev && prev.qty !== 0 && p.qty === 0 &&
      p.realizedPnlToday !== prev.realizedPnlToday
    ) {
      const delta = p.realizedPnlToday - prev.realizedPnlToday;
      realizedHistory = [...realizedHistory, delta].slice(-REALIZED_HISTORY_CAP);
      set({ dayStats: recomputeDayStats() });
    }

    const filtered = cur.filter((x) => !(x.symbol === p.symbol && x.exchange === p.exchange));
    const next = p.qty === 0 ? filtered : [...filtered, p];
    set({ positions: next });
  },

  setOrders: (o) => set({ workingOrders: o }),
  setFeedStatus: (s) => set({ feedStatus: s }),
  setError: (e) => set({ error: e }),

  resetFeedData: () => {
    realizedHistory = [];
    set({
      stats: null,
      positions: [],
      workingOrders: [],
      equityCurve: [],
      dayStats: EMPTY_DAY,
      error: null,
    });
  },

  seedDayStats: (pnls) => {
    // Replace the in-memory history with the backend pull — any
    // closures from earlier in the session are now reflected.
    realizedHistory = pnls.slice(-REALIZED_HISTORY_CAP);
    set({ dayStats: recomputeDayStats() });
  },

  pushEquityPoint: () => {
    const s = get().stats;
    if (!s) return;
    const cur = get().equityCurve;
    const now = Date.now();
    let next = [...cur, { ts: now, balance: s.balance }];
    if (next.length > EQUITY_CAP) next = next.slice(-EQUITY_CAP);
    set({ equityCurve: next });
  },
}));
