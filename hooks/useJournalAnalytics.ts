'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { JournalAnalytics } from '@/types/journal';

const EMPTY_ANALYTICS: JournalAnalytics = {
  equityCurve: [],
  drawdown: [],
  byHour: [],
  byDayOfWeek: [],
  bySymbol: [],
  bySetup: [],
  byEmotion: [],
  streaks: { currentWin: 0, currentLoss: 0, maxWin: 0, maxLoss: 0 },
  metrics: {
    profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownPct: 0,
    expectancy: 0, avgRR: 0, bestTrade: 0, worstTrade: 0, avgWin: 0, avgLoss: 0,
  },
};

/**
 * Compute analytics client-side from local closedTrades.
 * Used as fallback when the journal API is unavailable.
 */
function computeLocalAnalytics(
  trades: { pnl: number; entryTime: number; exitTime: number; symbol: string; side: string }[]
): JournalAnalytics {
  if (trades.length === 0) return EMPTY_ANALYTICS;

  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);

  // Equity curve
  let cumPnl = 0;
  const equityCurve = sorted.map(t => {
    cumPnl += t.pnl;
    return {
      date: new Date(t.entryTime).toISOString().slice(0, 10),
      cumulativePnl: Math.round(cumPnl * 100) / 100,
    };
  });

  // Drawdown
  let peak = 0;
  const drawdown = equityCurve.map(point => {
    if (point.cumulativePnl > peak) peak = point.cumulativePnl;
    const dd = point.cumulativePnl - peak;
    return {
      date: point.date,
      drawdown: Math.round(dd * 100) / 100,
      drawdownPct: peak > 0 ? Math.round((dd / peak) * 1000) / 10 : 0,
    };
  });

  const maxDrawdown = Math.min(...drawdown.map(d => d.drawdown), 0);
  const maxDrawdownPct = Math.min(...drawdown.map(d => d.drawdownPct), 0);

  // Win/Loss
  const wins = sorted.filter(t => t.pnl > 0);
  const losses = sorted.filter(t => t.pnl < 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;

  const avgWin = wins.length > 0 ? Math.round((grossProfit / wins.length) * 100) / 100 : 0;
  const avgLoss = losses.length > 0 ? Math.round((losses.reduce((s, t) => s + t.pnl, 0) / losses.length) * 100) / 100 : 0;
  const winRate = sorted.length > 0 ? wins.length / sorted.length : 0;
  const expectancy = Math.round(((winRate * avgWin) + ((1 - winRate) * avgLoss)) * 100) / 100;
  const avgRR = avgLoss !== 0 ? Math.round((avgWin / Math.abs(avgLoss)) * 100) / 100 : 0;
  const bestTrade = Math.max(...sorted.map(t => t.pnl));
  const worstTrade = Math.min(...sorted.map(t => t.pnl));

  // Sharpe
  const dailyPnlMap = new Map<string, number>();
  for (const t of sorted) {
    const dk = new Date(t.entryTime).toISOString().slice(0, 10);
    dailyPnlMap.set(dk, (dailyPnlMap.get(dk) || 0) + t.pnl);
  }
  const dailyReturns = Array.from(dailyPnlMap.values());
  const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length;
  const stdev = Math.sqrt(variance);
  const sharpeRatio = stdev > 0 ? Math.round((meanReturn / stdev) * Math.sqrt(252) * 100) / 100 : 0;

  // Streaks
  let currentWin = 0, currentLoss = 0, maxWinStreak = 0, maxLossStreak = 0, streak = 0;
  for (const t of sorted) {
    if (t.pnl > 0) { streak = streak > 0 ? streak + 1 : 1; maxWinStreak = Math.max(maxWinStreak, streak); }
    else if (t.pnl < 0) { streak = streak < 0 ? streak - 1 : -1; maxLossStreak = Math.max(maxLossStreak, Math.abs(streak)); }
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].pnl > 0) { if (currentLoss > 0) break; currentWin++; }
    else if (sorted[i].pnl < 0) { if (currentWin > 0) break; currentLoss++; }
  }

  // By hour
  const hourMap = new Map<number, { pnl: number; count: number; wins: number }>();
  for (const t of sorted) {
    const h = new Date(t.entryTime).getHours();
    const e = hourMap.get(h) || { pnl: 0, count: 0, wins: 0 };
    e.pnl += t.pnl; e.count++; if (t.pnl > 0) e.wins++;
    hourMap.set(h, e);
  }
  const byHour = Array.from(hourMap.entries())
    .map(([hour, d]) => ({ hour, pnl: Math.round(d.pnl * 100) / 100, count: d.count, winRate: Math.round((d.wins / d.count) * 1000) / 10 }))
    .sort((a, b) => a.hour - b.hour);

  // By day
  const dayMap = new Map<number, { pnl: number; count: number }>();
  for (const t of sorted) {
    const d = new Date(t.entryTime).getDay();
    const e = dayMap.get(d) || { pnl: 0, count: 0 };
    e.pnl += t.pnl; e.count++;
    dayMap.set(d, e);
  }
  const byDayOfWeek = Array.from(dayMap.entries())
    .map(([day, d]) => ({ day, pnl: Math.round(d.pnl * 100) / 100, count: d.count }))
    .sort((a, b) => a.day - b.day);

  // By symbol
  const symMap = new Map<string, { pnl: number; count: number; wins: number }>();
  for (const t of sorted) {
    const e = symMap.get(t.symbol) || { pnl: 0, count: 0, wins: 0 };
    e.pnl += t.pnl; e.count++; if (t.pnl > 0) e.wins++;
    symMap.set(t.symbol, e);
  }
  const bySymbol = Array.from(symMap.entries())
    .map(([symbol, d]) => {
      const w = d.wins; const l = d.count - w;
      const gp = sorted.filter(t => t.symbol === symbol && t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
      const gl = Math.abs(sorted.filter(t => t.symbol === symbol && t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
      return { symbol, key: symbol, pnl: Math.round(d.pnl * 100) / 100, count: d.count, winRate: Math.round((w / d.count) * 1000) / 10, profitFactor: gl > 0 ? Math.round((gp / gl) * 100) / 100 : gp > 0 ? 999 : 0 };
    }).sort((a, b) => b.pnl - a.pnl);

  return {
    equityCurve,
    drawdown,
    byHour,
    byDayOfWeek,
    bySymbol,
    bySetup: [],
    byEmotion: [],
    streaks: { currentWin, currentLoss, maxWin: maxWinStreak, maxLoss: maxLossStreak },
    metrics: { profitFactor, sharpeRatio, maxDrawdown, maxDrawdownPct, expectancy, avgRR, bestTrade, worstTrade, avgWin, avgLoss },
  };
}

export function useJournalAnalytics() {
  const { dashboardDateRange, lastAutoTrackSync } = useJournalStore();
  const [apiAnalytics, setApiAnalytics] = useState<JournalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  // Local closed trades from trading store (for fallback)
  const closedTrades = useTradingStore(s => s.closedTrades);

  const localAnalytics = useMemo(() => {
    if (!apiFailed && apiAnalytics) return null;
    return computeLocalAnalytics(closedTrades);
  }, [closedTrades, apiFailed, apiAnalytics]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dashboardDateRange.from) params.set('from', dashboardDateRange.from);
      if (dashboardDateRange.to) params.set('to', dashboardDateRange.to);

      const res = await throttledFetch(`/api/journal/analytics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');

      const data = await res.json();
      setApiAnalytics(data);
      setApiFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setApiFailed(true);
    } finally {
      setLoading(false);
    }
  }, [dashboardDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refetch when new trades are auto-tracked
  useEffect(() => {
    if (lastAutoTrackSync > 0) fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAutoTrackSync]);

  // Use API data when available, local fallback otherwise
  const analytics = apiAnalytics && !apiFailed ? apiAnalytics : (localAnalytics || EMPTY_ANALYTICS);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
