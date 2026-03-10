'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { EconomicEvent, CalendarFilters, TimeFilter } from '@/types/news';
import { throttledFetch } from '@/lib/api/throttledFetch';
import { usePageActive } from '@/hooks/usePageActive';

const STORAGE_KEY = 'senzoukria-news-simulation';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useEconomicCalendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'forex-factory' | 'simulation' | null>(null);
  const isActive = usePageActive();

  // Filters
  const [filters, setFilters] = useState<CalendarFilters>({
    currency: 'All',
    impact: 'All',
    time: 'week',
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Simulation mode (persisted)
  const [simulationMode, setSimulationMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') setSimulationMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(simulationMode));
  }, [simulationMode]);

  // Fetch
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = `/api/news/calendar${simulationMode ? '?simulation=true' : ''}`;
      const response = await throttledFetch(url);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setEvents(data.events || []);
      setLastUpdate(new Date());
      setDataSource(data.source === 'forex-factory' ? 'forex-factory' : 'simulation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setIsLoading(false);
    }
  }, [simulationMode]);

  useEffect(() => {
    if (!isActive) return;
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh, isActive]);

  // Auto-refresh ~90s after each upcoming event's scheduled release time
  // so the actual value appears automatically once FF publishes it
  useEffect(() => {
    if (!isActive) return;
    const now = Date.now();
    const next = events
      .filter(e => !e.actual && new Date(e.time).getTime() > now)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0];

    if (!next) return;

    const delay = new Date(next.time).getTime() - now + 90_000; // 90s after scheduled release
    const id = setTimeout(refresh, delay);
    return () => clearTimeout(id);
  }, [events, refresh, isActive]);

  // Today stats (always based on full unfiltered events)
  const todayStats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const todayEvents = events.filter(e => {
      const d = new Date(e.time);
      return d >= today && d < tomorrow;
    });
    return {
      total: todayEvents.length,
      high: todayEvents.filter(e => e.impact === 'high').length,
      medium: todayEvents.filter(e => e.impact === 'medium').length,
      low: todayEvents.filter(e => e.impact === 'low').length,
    };
  }, [events]);

  // Filter
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter(event => {
      if (filters.currency !== 'All' && event.currency !== filters.currency) return false;
      if (filters.impact !== 'All' && event.impact !== filters.impact.toLowerCase()) return false;
      if (q && !event.event.toLowerCase().includes(q) && !event.currency.toLowerCase().includes(q)) return false;

      const eventDate = new Date(event.time);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      switch (filters.time) {
        case 'today':
          return eventDate >= today && eventDate < tomorrow;
        case 'tomorrow': {
          const dayAfter = new Date(tomorrow);
          dayAfter.setDate(dayAfter.getDate() + 1);
          return eventDate >= tomorrow && eventDate < dayAfter;
        }
        case 'week': {
          const weekEnd = new Date(today);
          weekEnd.setDate(weekEnd.getDate() + 7);
          return eventDate >= today && eventDate < weekEnd;
        }
        default:
          return true;
      }
    });
  }, [events, filters]);

  // Group by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, EconomicEvent[]> = {};
    filteredEvents.forEach(event => {
      const date = new Date(event.time).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
    });
    return groups;
  }, [filteredEvents]);

  // Next upcoming high-impact event
  const nextHighImpact = useMemo(() => {
    const now = Date.now();
    return filteredEvents.find(e => e.impact === 'high' && new Date(e.time).getTime() > now) || null;
  }, [filteredEvents]);

  // Helpers
  const setCurrency = useCallback((currency: string) => {
    setFilters(f => ({ ...f, currency }));
  }, []);

  const setImpact = useCallback((impact: string) => {
    setFilters(f => ({ ...f, impact }));
  }, []);

  const setTime = useCallback((time: TimeFilter) => {
    setFilters(f => ({ ...f, time }));
  }, []);

  const toggleSimulation = useCallback(() => {
    // Clear immediately so the user sees loading → fresh data (not stale)
    setEvents([]);
    setIsLoading(true);
    setSimulationMode(prev => !prev);
  }, []);

  const clearSearch = useCallback(() => setSearchQuery(''), []);

  return {
    events: filteredEvents,
    groupedEvents,
    isLoading,
    error,
    lastUpdate,
    dataSource,
    filters,
    setCurrency,
    setImpact,
    setTime,
    simulationMode,
    toggleSimulation,
    refresh,
    nextHighImpact,
    totalToday: filteredEvents.length,
    todayStats,
    searchQuery,
    setSearchQuery,
    clearSearch,
  };
}
