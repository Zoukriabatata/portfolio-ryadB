// Journal types — mirror of the Rust SQLite backend (`journal/db.rs`).
// Field names use camelCase because serde rename is set on the Rust
// side, so the IPC layer hands us pre-camelCased payloads.

export type TradeSide = "LONG" | "SHORT";

export interface JournalEntry {
  id: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  entryTime: string;        // ISO 8601 UTC
  exitTime: string | null;
  timeframe: string | null;
  setup: string | null;
  tags: string | null;      // JSON-encoded array string, e.g. '["scalp","trend"]'
  notes: string | null;
  rating: number | null;    // 1..5
  emotions: string | null;  // "calm" | "fomo" | "revenge" | …
  screenshotUrl: string | null;
  screenshotUrls: string[];
  playbookSetupId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Auto-import provenance — null/undefined for hand-entered trades. */
  externalSource: string | null;   // "rithmic" | "manual" | …
  externalId: string | null;       // upstream stable id (Rithmic exchange_order_id)
  accountId: string | null;        // broker account this trade belongs to
  commission: number | null;       // total commission already applied to pnl
}

export interface TradeFilter {
  symbol?: string;
  side?: TradeSide;
  setup?: string;
  timeframe?: string;
  from?: string;            // ISO 8601 UTC
  to?: string;              // ISO 8601 UTC
  outcome?: "win" | "loss" | "open";
  query?: string;
  limit?: number;
  offset?: number;
}

export interface TradeStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  openCount: number;
  totalPnl: number;
  winRate: number;          // 0..100
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
}

export interface ListTradesResult {
  entries: JournalEntry[];
  total: number;
  stats: TradeStats;
}

// ── Day 2: Daily notes + Calendar ──────────────────────────────────────────

export interface PlaybookSetup {
  id: string;
  name: string;
  description: string | null;
  /** Free-text checklist (newline-separated). */
  criteria: string | null;
  imageUrl: string | null;
  /** Hex color for the tag pill (defaults to Senzoukria green). */
  color: string | null;
  /** 0..100 target win rate the user is aiming for. */
  targetWinRate: number | null;
  createdAt: string;
  updatedAt: string;
}

export function emptyPlaybookSetup(): PlaybookSetup {
  return {
    id: "",
    name: "",
    description: null,
    criteria: null,
    imageUrl: null,
    color: "#7ed321",
    targetWinRate: null,
    createdAt: "",
    updatedAt: "",
  };
}

export interface DailyNote {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  premarketPlan: string | null;
  endOfDayReview: string | null;
  lessons: string | null;
  /** 1..10 */
  mood: number | null;
  marketConditions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarDay {
  /** "YYYY-MM-DD" */
  date: string;
  pnl: number;
  tradeCount: number;
}

export interface CalendarMonthStats {
  totalPnl: number;
  tradingDays: number;
  winningDays: number;
  losingDays: number;
  bestDay: number;
  worstDay: number;
}

export interface CalendarMonthResult {
  days: CalendarDay[];
  stats: CalendarMonthStats;
}

export const MARKET_CONDITIONS = [
  "Trending up",
  "Trending down",
  "Range-bound",
  "Choppy",
  "High volatility",
  "Low volatility",
  "News-driven",
  "Pre-FOMC",
];

/** A blank Trade scaffold for the create form — mirrors the website's
 *  form defaults so the UX is identical. */
export function emptyTrade(): JournalEntry {
  return {
    id: "",
    symbol: "",
    side: "LONG",
    entryPrice: 0,
    exitPrice: null,
    quantity: 1,
    pnl: null,
    entryTime: new Date().toISOString(),
    exitTime: null,
    timeframe: null,
    setup: null,
    tags: null,
    notes: null,
    rating: null,
    emotions: null,
    screenshotUrl: null,
    screenshotUrls: [],
    playbookSetupId: null,
    createdAt: "",
    updatedAt: "",
    externalSource: null,
    externalId: null,
    accountId: null,
    commission: null,
  };
}

/** Sync status returned by `journal_sync_rithmic_status` — drives the
 *  TradesTab "Sync from Rithmic" pill (last sync timestamp, count of
 *  imported trades, current state). */
export interface RithmicSyncStatus {
  state: "idle" | "connecting" | "fetching" | "importing" | "error";
  lastSyncAt: string | null;       // ISO 8601 UTC of the last successful sync
  importedCount: number;           // # of trades currently flagged source="rithmic"
  accounts: string[];              // broker accounts discovered on the connection
  errorMessage: string | null;
}

/** Result of a one-shot `journal_sync_rithmic` call. */
export interface RithmicSyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  accounts: string[];
}
