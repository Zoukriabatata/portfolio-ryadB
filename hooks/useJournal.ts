'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { JournalEntry, JournalStats } from '@/types/journal';

interface UseJournalReturn {
  entries: JournalEntry[];
  stats: JournalStats;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
  refetch: () => void;
}

const DEFAULT_STATS: JournalStats = {
  totalPnl: 0,
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
  winRate: 0,
};

/**
 * Convert local closedTrades to JournalEntry[] for fallback.
 */
function closedTradesToEntries(
  trades: { id: string; symbol: string; side: 'buy' | 'sell'; quantity: number; entryPrice: number; exitPrice: number; pnl: number; entryTime: number; exitTime: number; broker: string }[]
): JournalEntry[] {
  return trades.map(t => ({
    id: t.id,
    userId: 'local',
    symbol: t.symbol,
    side: t.side === 'buy' ? 'LONG' as const : 'SHORT' as const,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    pnl: t.pnl,
    entryTime: new Date(t.entryTime).toISOString(),
    exitTime: new Date(t.exitTime).toISOString(),
    timeframe: null,
    setup: null,
    tags: '["auto-tracked"]',
    notes: `Auto-tracked from ${t.broker}`,
    rating: null,
    emotions: null,
    screenshotUrl: null,
    screenshotUrls: [],
    playbookSetupId: null,
    createdAt: new Date(t.entryTime).toISOString(),
    updatedAt: new Date(t.exitTime).toISOString(),
  }));
}

export function useJournal(): UseJournalReturn {
  const { tradeFilters, tradeTableSort, tradeTablePageSize, lastAutoTrackSync } = useJournalStore();
  const [apiEntries, setApiEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>(DEFAULT_STATS);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiFailed, setApiFailed] = useState(false);

  // Local closed trades from trading store (for fallback)
  const closedTrades = useTradingStore(s => s.closedTrades);

  const localEntries = useMemo(() => {
    if (!apiFailed) return [];
    // Also include trades that were synced (they're still relevant for local display)
    const allTrades = useTradingStore.getState().closedTrades;
    return closedTradesToEntries(allTrades);
  }, [closedTrades, apiFailed]);

  const localStats = useMemo(() => {
    if (!apiFailed || localEntries.length === 0) return DEFAULT_STATS;
    const totalPnl = localEntries.reduce((s, e) => s + (e.pnl ?? 0), 0);
    const winCount = localEntries.filter(e => (e.pnl ?? 0) > 0).length;
    const lossCount = localEntries.filter(e => (e.pnl ?? 0) < 0).length;
    return {
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalTrades: localEntries.length,
      winCount,
      lossCount,
      winRate: localEntries.length > 0 ? Math.round((winCount / localEntries.length) * 1000) / 10 : 0,
    };
  }, [localEntries, apiFailed]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(tradeTablePageSize));
      params.set('sortBy', tradeTableSort.column);
      params.set('sortDir', tradeTableSort.direction);

      if (tradeFilters.dateFrom) params.set('from', tradeFilters.dateFrom);
      if (tradeFilters.dateTo) params.set('to', tradeFilters.dateTo);
      if (tradeFilters.symbols.length > 0) params.set('symbols', tradeFilters.symbols.join(','));
      if (tradeFilters.setups.length > 0) params.set('setups', tradeFilters.setups.join(','));
      if (tradeFilters.emotions.length > 0) params.set('emotions', tradeFilters.emotions.join(','));
      if (tradeFilters.side !== 'ALL') params.set('side', tradeFilters.side);
      if (tradeFilters.pnlMin !== null) params.set('pnlMin', String(tradeFilters.pnlMin));
      if (tradeFilters.pnlMax !== null) params.set('pnlMax', String(tradeFilters.pnlMax));

      const res = await throttledFetch(`/api/journal?${params}`);
      if (!res.ok) throw new Error('Failed to fetch journal entries');

      const data = await res.json();
      setApiEntries(data.entries || []);
      setStats(data.stats || DEFAULT_STATS);
      setPagination(data.pagination || { page: 1, pageSize: tradeTablePageSize, total: 0, totalPages: 0 });
      setApiFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setApiFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, tradeTablePageSize, tradeTableSort, tradeFilters]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [tradeFilters, tradeTableSort]);

  // Auto-refetch when new trades are auto-tracked
  useEffect(() => {
    if (lastAutoTrackSync > 0) fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAutoTrackSync]);

  // Use API data when available, local fallback otherwise
  const entries = apiFailed ? localEntries : apiEntries;
  const finalStats = apiFailed ? localStats : stats;
  const finalPagination = apiFailed
    ? { page: 1, pageSize: localEntries.length, total: localEntries.length, totalPages: 1 }
    : pagination;

  return { entries, stats: finalStats, pagination: finalPagination, loading, error, page, setPage, refetch: fetchEntries };
}
