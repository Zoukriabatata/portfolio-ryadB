'use client';

import { useState, useEffect, useCallback } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
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

export function useJournalAnalytics() {
  const { dashboardDateRange } = useJournalStore();
  const [analytics, setAnalytics] = useState<JournalAnalytics>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dashboardDateRange.from) params.set('from', dashboardDateRange.from);
      if (dashboardDateRange.to) params.set('to', dashboardDateRange.to);

      const res = await fetch(`/api/journal/analytics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');

      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [dashboardDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
