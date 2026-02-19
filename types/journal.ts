// ============ JOURNAL TYPES ============

// Core trade entry (matches Prisma model + API response)
export interface JournalEntry {
  id: string;
  userId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  entryTime: string;
  exitTime: string | null;
  timeframe: string | null;
  setup: string | null;
  tags: string | null; // JSON array stored as string
  notes: string | null;
  rating: number | null;
  emotions: string | null;
  screenshotUrl: string | null;
  screenshotUrls: string[];
  playbookSetupId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Form data for create/edit
export interface TradeFormData {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryTime: string;
  exitTime: string;
  timeframe: string;
  setup: string;
  notes: string;
  rating: number;
  emotions: string;
  tags: string[];
  screenshotUrls: string[];
  playbookSetupId: string;
}

// API response for GET /api/journal
export interface JournalListResponse {
  entries: JournalEntry[];
  stats: JournalStats;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface JournalStats {
  totalPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

// Analytics response
export interface JournalAnalytics {
  equityCurve: { date: string; cumulativePnl: number }[];
  drawdown: { date: string; drawdown: number; drawdownPct: number }[];
  byHour: { hour: number; pnl: number; count: number; winRate: number }[];
  byDayOfWeek: { day: number; pnl: number; count: number }[];
  bySymbol: { symbol: string; key: string; pnl: number; count: number; winRate: number; profitFactor: number }[];
  bySetup: { setup: string; key: string; pnl: number; count: number; winRate: number; profitFactor: number }[];
  byEmotion: { emotion: string; key: string; pnl: number; count: number; winRate: number; profitFactor: number }[];
  streaks: { currentWin: number; currentLoss: number; maxWin: number; maxLoss: number };
  metrics: JournalMetrics;
}

export interface JournalMetrics {
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  expectancy: number;
  avgRR: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
}

// Calendar
export interface CalendarCell {
  date: string | null;
  pnl: number;
  tradeCount: number;
}

export interface CalendarMonthData {
  cells: CalendarCell[];
  monthStats: {
    totalPnl: number;
    tradingDays: number;
    winningDays: number;
    losingDays: number;
    bestDay: number;
    worstDay: number;
  };
}

// Playbook
export interface PlaybookSetup {
  id: string;
  name: string;
  description: string | null;
  rules: string[];
  exampleUrls: string[];
  isActive: boolean;
  stats: {
    tradeCount: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
    profitFactor: number;
  };
  createdAt: string;
  updatedAt: string;
}

// Daily Notes
export interface DailyNote {
  id: string;
  date: string;
  premarketPlan: string | null;
  endOfDayReview: string | null;
  lessons: string | null;
  mood: number | null;
  marketConditions: string | null;
  linkedTrades: JournalEntry[];
  createdAt: string;
  updatedAt: string;
}

// Filter types
export interface TradeFilters {
  dateFrom: string | null;
  dateTo: string | null;
  symbols: string[];
  setups: string[];
  emotions: string[];
  side: 'ALL' | 'LONG' | 'SHORT';
  pnlMin: number | null;
  pnlMax: number | null;
  tags: string[];
}

// Tab type
export type JournalTab = 'dashboard' | 'trades' | 'calendar' | 'playbook' | 'notes';

// Constants
export const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Scalp', 'Trend Follow', 'Range', 'News'] as const;
export const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Revenge', 'Greedy', 'Disciplined'] as const;
export const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'] as const;
export const MARKET_CONDITIONS = ['Trending', 'Ranging', 'Choppy', 'Volatile', 'Low Volume'] as const;

export const DEFAULT_TRADE_FILTERS: TradeFilters = {
  dateFrom: null,
  dateTo: null,
  symbols: [],
  setups: [],
  emotions: [],
  side: 'ALL',
  pnlMin: null,
  pnlMax: null,
  tags: [],
};
