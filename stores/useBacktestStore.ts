/**
 * BACKTEST STORE - Système de backtesting avec statistiques
 *
 * - Historique des trades simulés
 * - Statistiques de performance
 * - Journal de trading
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============ TYPES ============

export type TradeDirection = 'long' | 'short';
export type TradeStatus = 'open' | 'closed' | 'cancelled';
export type EmotionalState = 'confident' | 'neutral' | 'fearful' | 'greedy' | 'frustrated' | 'calm';
export type MarketCondition = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'calm';

export interface BacktestTrade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  entryTime: number;
  exitTime: number | null;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  status: TradeStatus;
  fees: number;
  // Journal fields
  notes: string;
  emotionalState: EmotionalState | null;
  marketCondition: MarketCondition | null;
  setup: string;
  mistakes: string[];
  lessonsLearned: string;
  rating: number; // 1-5 stars
  screenshots: string[]; // Base64 or URLs
  tags: string[];
}

export interface BacktestSession {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number | null;
  initialBalance: number;
  finalBalance: number | null;
  trades: BacktestTrade[];
  notes: string;
  isActive: boolean;
}

export interface BacktestStatistics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  averageHoldTime: number; // in minutes
  consecutiveWins: number;
  consecutiveLosses: number;
  expectancy: number;
  riskRewardRatio: number;
}

export interface JournalEntry {
  id: string;
  date: number;
  title: string;
  content: string;
  emotionalState: EmotionalState;
  marketCondition: MarketCondition;
  trades: string[]; // Trade IDs
  tags: string[];
  mood: number; // 1-10
}

interface BacktestState {
  // Sessions
  sessions: BacktestSession[];
  activeSessionId: string | null;

  // Journal
  journalEntries: JournalEntry[];

  // Quick stats (cached)
  allTimeStats: BacktestStatistics | null;

  // Actions - Sessions
  createSession: (name: string, symbol: string, timeframe: string, initialBalance: number) => string;
  endSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;

  // Actions - Trades
  openTrade: (sessionId: string, trade: Omit<BacktestTrade, 'id' | 'status' | 'exitPrice' | 'exitTime' | 'pnl' | 'pnlPercent'>) => string;
  closeTrade: (sessionId: string, tradeId: string, exitPrice: number, exitTime: number) => void;
  cancelTrade: (sessionId: string, tradeId: string) => void;
  updateTradeJournal: (sessionId: string, tradeId: string, journal: Partial<Pick<BacktestTrade, 'notes' | 'emotionalState' | 'marketCondition' | 'setup' | 'mistakes' | 'lessonsLearned' | 'rating' | 'tags'>>) => void;

  // Actions - Journal
  addJournalEntry: (entry: Omit<JournalEntry, 'id'>) => string;
  updateJournalEntry: (entryId: string, updates: Partial<JournalEntry>) => void;
  deleteJournalEntry: (entryId: string) => void;

  // Getters
  getSessionStats: (sessionId: string) => BacktestStatistics | null;
  getAllTimeStats: () => BacktestStatistics;
  getActiveSession: () => BacktestSession | null;
}

// ============ HELPERS ============

function calculateStatistics(trades: BacktestTrade[]): BacktestStatistics {
  const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl !== null);

  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      averageHoldTime: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      expectancy: 0,
      riskRewardRatio: 0,
    };
  }

  const wins = closedTrades.filter(t => (t.pnl || 0) > 0);
  const losses = closedTrades.filter(t => (t.pnl || 0) < 0);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  for (const trade of closedTrades) {
    runningPnl += trade.pnl || 0;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = peak - runningPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Calculate consecutive wins/losses
  let currentStreak = 0;
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let lastWasWin: boolean | null = null;

  for (const trade of closedTrades) {
    const isWin = (trade.pnl || 0) > 0;
    if (lastWasWin === null || lastWasWin === isWin) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    if (isWin && currentStreak > maxConsecWins) maxConsecWins = currentStreak;
    if (!isWin && currentStreak > maxConsecLosses) maxConsecLosses = currentStreak;
    lastWasWin = isWin;
  }

  // Calculate average hold time
  const holdTimes = closedTrades
    .filter(t => t.exitTime && t.entryTime)
    .map(t => ((t.exitTime || 0) - t.entryTime) / 60000); // Convert to minutes
  const avgHoldTime = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;

  // Calculate Sharpe Ratio (simplified)
  const returns = closedTrades.map(t => t.pnlPercent || 0);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
  const sharpe = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;

  return {
    totalTrades: closedTrades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: (wins.length / closedTrades.length) * 100,
    totalPnl,
    totalPnlPercent: closedTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0),
    averageWin: avgWin,
    averageLoss: avgLoss,
    largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl || 0)) : 0,
    largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl || 0)) : 0,
    profitFactor: totalLosses !== 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPercent: peak !== 0 ? (maxDrawdown / peak) * 100 : 0,
    sharpeRatio: sharpe,
    averageHoldTime: avgHoldTime,
    consecutiveWins: maxConsecWins,
    consecutiveLosses: maxConsecLosses,
    expectancy: avgWin * (wins.length / closedTrades.length) - avgLoss * (losses.length / closedTrades.length),
    riskRewardRatio: avgLoss !== 0 ? avgWin / avgLoss : 0,
  };
}

// ============ STORE ============

export const useBacktestStore = create<BacktestState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      journalEntries: [],
      allTimeStats: null,

      createSession: (name, symbol, timeframe, initialBalance) => {
        const id = `session_${Date.now()}`;
        const session: BacktestSession = {
          id,
          name,
          symbol,
          timeframe,
          startTime: Date.now(),
          endTime: null,
          initialBalance,
          finalBalance: null,
          trades: [],
          notes: '',
          isActive: true,
        };

        set(state => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));

        return id;
      },

      endSession: (sessionId) => {
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            const stats = calculateStatistics(s.trades);
            return {
              ...s,
              isActive: false,
              endTime: Date.now(),
              finalBalance: s.initialBalance + stats.totalPnl,
            };
          }),
          activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        }));
      },

      deleteSession: (sessionId) => {
        set(state => ({
          sessions: state.sessions.filter(s => s.id !== sessionId),
          activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        }));
      },

      setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId });
      },

      openTrade: (sessionId, tradeData) => {
        const id = `trade_${Date.now()}`;
        const trade: BacktestTrade = {
          ...tradeData,
          id,
          status: 'open',
          exitPrice: null,
          exitTime: null,
          pnl: null,
          pnlPercent: null,
        };

        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            return { ...s, trades: [...s.trades, trade] };
          }),
        }));

        return id;
      },

      closeTrade: (sessionId, tradeId, exitPrice, exitTime) => {
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              trades: s.trades.map(t => {
                if (t.id !== tradeId) return t;
                const pnl = t.direction === 'long'
                  ? (exitPrice - t.entryPrice) * t.quantity - t.fees
                  : (t.entryPrice - exitPrice) * t.quantity - t.fees;
                const pnlPercent = (pnl / (t.entryPrice * t.quantity)) * 100;
                return {
                  ...t,
                  status: 'closed' as const,
                  exitPrice,
                  exitTime,
                  pnl,
                  pnlPercent,
                };
              }),
            };
          }),
        }));
      },

      cancelTrade: (sessionId, tradeId) => {
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              trades: s.trades.map(t => {
                if (t.id !== tradeId) return t;
                return { ...t, status: 'cancelled' as const };
              }),
            };
          }),
        }));
      },

      updateTradeJournal: (sessionId, tradeId, journal) => {
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              trades: s.trades.map(t => {
                if (t.id !== tradeId) return t;
                return { ...t, ...journal };
              }),
            };
          }),
        }));
      },

      addJournalEntry: (entry) => {
        const id = `journal_${Date.now()}`;
        set(state => ({
          journalEntries: [{ ...entry, id }, ...state.journalEntries],
        }));
        return id;
      },

      updateJournalEntry: (entryId, updates) => {
        set(state => ({
          journalEntries: state.journalEntries.map(e => {
            if (e.id !== entryId) return e;
            return { ...e, ...updates };
          }),
        }));
      },

      deleteJournalEntry: (entryId) => {
        set(state => ({
          journalEntries: state.journalEntries.filter(e => e.id !== entryId),
        }));
      },

      getSessionStats: (sessionId) => {
        const session = get().sessions.find(s => s.id === sessionId);
        if (!session) return null;
        return calculateStatistics(session.trades);
      },

      getAllTimeStats: () => {
        const allTrades = get().sessions.flatMap(s => s.trades);
        return calculateStatistics(allTrades);
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find(s => s.id === activeSessionId) || null;
      },
    }),
    {
      name: 'backtest-store',
      partialize: (state) => ({
        sessions: state.sessions,
        journalEntries: state.journalEntries,
      }),
    }
  )
);

// ============ EMOTIONAL STATE LABELS ============

export const EMOTIONAL_STATES: { value: EmotionalState; label: string; emoji: string; color: string }[] = [
  { value: 'confident', label: 'Confiant', emoji: '😎', color: '#22c55e' },
  { value: 'calm', label: 'Calme', emoji: '😌', color: '#3b82f6' },
  { value: 'neutral', label: 'Neutre', emoji: '😐', color: '#6b7280' },
  { value: 'fearful', label: 'Peureux', emoji: '😰', color: '#f59e0b' },
  { value: 'greedy', label: 'Avide', emoji: '🤑', color: '#eab308' },
  { value: 'frustrated', label: 'Frustré', emoji: '😤', color: '#ef4444' },
];

export const MARKET_CONDITIONS: { value: MarketCondition; label: string; emoji: string }[] = [
  { value: 'trending_up', label: 'Tendance Haussière', emoji: '📈' },
  { value: 'trending_down', label: 'Tendance Baissière', emoji: '📉' },
  { value: 'ranging', label: 'Range', emoji: '↔️' },
  { value: 'volatile', label: 'Volatile', emoji: '⚡' },
  { value: 'calm', label: 'Calme', emoji: '🌊' },
];
