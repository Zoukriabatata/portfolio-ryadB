'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { EconomicEvent, CalendarFilters, TimeFilter } from '@/types/news';

const STORAGE_KEY = 'senzoukria-news-simulation';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useEconomicCalendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Filters
  const [filters, setFilters] = useState<CalendarFilters>({
    currency: 'All',
    impact: 'All',
    time: 'week',
  });

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
      const response = await fetch(url);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setEvents(data.events || []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setIsLoading(false);
    }
  }, [simulationMode]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // Filter
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (filters.currency !== 'All' && event.currency !== filters.currency) return false;
      if (filters.impact !== 'All' && event.impact !== filters.impact.toLowerCase()) return false;

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
    setSimulationMode(prev => !prev);
  }, []);

  return {
    events: filteredEvents,
    groupedEvents,
    isLoading,
    error,
    lastUpdate,
    filters,
    setCurrency,
    setImpact,
    setTime,
    simulationMode,
    toggleSimulation,
    refresh,
    nextHighImpact,
    totalToday: filteredEvents.length,
  };
}
