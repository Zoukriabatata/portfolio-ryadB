'use client';

import { useState, useEffect, useCallback } from 'react';
import { useJournalStore } from '@/stores/useJournalStore';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { JournalEntry } from '@/types/journal';

interface DayData {
  date: string;
  pnl: number;
  tradeCount: number;
  trades: JournalEntry[];
}

interface CalendarData {
  days: Map<string, DayData>;
  monthStats: {
    totalPnl: number;
    tradingDays: number;
    winningDays: number;
    losingDays: number;
    bestDay: number;
    worstDay: number;
  };
}

const EMPTY_STATS = { totalPnl: 0, tradingDays: 0, winningDays: 0, losingDays: 0, bestDay: 0, worstDay: 0 };

export function useJournalCalendar() {
  const { calendarMonth } = useJournalStore();
  const [calendarData, setCalendarData] = useState<CalendarData>({ days: new Map(), monthStats: EMPTY_STATS });
  const [loading, setLoading] = useState(true);

  const fetchCalendarData = useCallback(async () => {
    setLoading(true);

    try {
      const [year, month] = calendarMonth.split('-').map(Number);
      const from = new Date(year, month - 1, 1).toISOString();
      const to = new Date(year, month, 0, 23, 59, 59).toISOString();

      const params = new URLSearchParams({ from, to, pageSize: '200' });
      const res = await throttledFetch(`/api/journal?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      const entries: JournalEntry[] = data.entries || [];

      // Group by date
      const days = new Map<string, DayData>();
      for (const entry of entries) {
        const dateKey = new Date(entry.entryTime).toISOString().slice(0, 10);
        if (!days.has(dateKey)) {
          days.set(dateKey, { date: dateKey, pnl: 0, tradeCount: 0, trades: [] });
        }
        const day = days.get(dateKey)!;
        day.pnl += entry.pnl || 0;
        day.tradeCount++;
        day.trades.push(entry);
      }

      // Compute month stats
      const dayValues = Array.from(days.values());
      const tradingDays = dayValues.length;
      const winningDays = dayValues.filter(d => d.pnl > 0).length;
      const losingDays = dayValues.filter(d => d.pnl < 0).length;
      const totalPnl = dayValues.reduce((s, d) => s + d.pnl, 0);
      const bestDay = dayValues.length > 0 ? Math.max(...dayValues.map(d => d.pnl)) : 0;
      const worstDay = dayValues.length > 0 ? Math.min(...dayValues.map(d => d.pnl)) : 0;

      setCalendarData({
        days,
        monthStats: {
          totalPnl: Math.round(totalPnl * 100) / 100,
          tradingDays,
          winningDays,
          losingDays,
          bestDay: Math.round(bestDay * 100) / 100,
          worstDay: Math.round(worstDay * 100) / 100,
        },
      });
    } catch {
      setCalendarData({ days: new Map(), monthStats: EMPTY_STATS });
    } finally {
      setLoading(false);
    }
  }, [calendarMonth]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  return { calendarData, loading, refetch: fetchCalendarData };
}
