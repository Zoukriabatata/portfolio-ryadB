'use client';

import { useState, useEffect, useCallback } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
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

export function useJournal(): UseJournalReturn {
  const { tradeFilters, tradeTableSort, tradeTablePageSize } = useJournalStore();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<JournalStats>(DEFAULT_STATS);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const res = await fetch(`/api/journal?${params}`);
      if (!res.ok) throw new Error('Failed to fetch journal entries');

      const data = await res.json();
      setEntries(data.entries || []);
      setStats(data.stats || DEFAULT_STATS);
      setPagination(data.pagination || { page: 1, pageSize: tradeTablePageSize, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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

  return { entries, stats, pagination, loading, error, page, setPage, refetch: fetchEntries };
}
