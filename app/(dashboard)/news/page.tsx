'use client';

import { useEffect, useState, useCallback } from 'react';
import { CalendarIcon, RefreshIcon } from '@/components/ui/Icons';

/**
 * ECONOMIC NEWS / CALENDAR PAGE
 *
 * Displays upcoming and past economic events with impact levels
 * Similar to Forex Factory calendar
 * Uses SENZOUKRIA theme CSS variables throughout
 */

interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  event: string;
  actual?: string;
  forecast?: string;
  previous?: string;
}

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  JPY: '🇯🇵',
  AUD: '🇦🇺',
  CAD: '🇨🇦',
  CHF: '🇨🇭',
  NZD: '🇳🇿',
  CNY: '🇨🇳',
};

// Impact level colors are intentionally kept as semantic colors (red/orange/yellow)
const IMPACT_COLORS = {
  high: 'bg-red-500',
  medium: 'bg-orange-500',
  low: 'bg-yellow-500',
};

const IMPACT_TEXT_COLORS = {
  high: 'text-red-400',
  medium: 'text-orange-400',
  low: 'text-yellow-400',
};

const IMPACT_GLOW = {
  high: 'shadow-red-500/50',
  medium: 'shadow-orange-500/50',
  low: 'shadow-yellow-500/50',
};

const CURRENCY_FILTERS = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
const IMPACT_FILTERS = ['All', 'High', 'Medium', 'Low'];

export default function NewsPage() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Filters
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [impactFilter, setImpactFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('today');

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/news/calendar');
      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setEvents(data.events || []);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    // Refresh every 5 minutes
    const interval = setInterval(fetchEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Filter events
  const filteredEvents = events.filter(event => {
    // Currency filter
    if (currencyFilter !== 'All' && event.currency !== currencyFilter) return false;

    // Impact filter
    if (impactFilter !== 'All' && event.impact !== impactFilter.toLowerCase()) return false;

    // Time filter
    const eventDate = new Date(event.time);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    switch (timeFilter) {
      case 'today':
        return eventDate >= today && eventDate < tomorrow;
      case 'tomorrow':
        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
        return eventDate >= tomorrow && eventDate < dayAfterTomorrow;
      case 'week':
        return eventDate >= today && eventDate < weekEnd;
      default:
        return true;
    }
  });

  // Group events by date
  const groupedEvents: Record<string, EconomicEvent[]> = {};
  filteredEvents.forEach(event => {
    const date = new Date(event.time).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    if (!groupedEvents[date]) groupedEvents[date] = [];
    groupedEvents[date].push(event);
  });

  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isEventPast = (timeStr: string) => {
    return new Date(timeStr) < new Date();
  };

  const isEventSoon = (timeStr: string) => {
    const eventTime = new Date(timeStr).getTime();
    const now = Date.now();
    return eventTime > now && eventTime - now < 60 * 60 * 1000; // Within 1 hour
  };

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-[var(--primary-glow)]">
                <CalendarIcon size={22} color="#fff" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Economic Calendar</h1>
                <p className="text-xs text-[var(--text-muted)]">High-impact events & releases</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {lastUpdate && (
              <span className="text-xs text-[var(--text-muted)]">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchEvents}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm bg-[var(--primary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--primary-dark)] transition-all duration-200 disabled:opacity-50 flex items-center gap-2 hover:scale-105 active:scale-95 shadow-md shadow-[var(--primary-glow)]"
            >
              <RefreshIcon size={14} color="#fff" className={isLoading ? 'animate-spin' : ''} />
              <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Time Filter */}
          <div className="flex items-center gap-1 bg-[var(--surface-elevated)] rounded-lg p-1 border border-[var(--border)]">
            {(['today', 'tomorrow', 'week', 'all'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-3 py-1.5 text-xs rounded-md capitalize relative overflow-hidden
                  transition-all duration-200 ease-out
                  ${timeFilter === filter
                    ? 'bg-[var(--primary)] text-[var(--text-primary)] shadow-md shadow-[var(--primary-glow)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] active:scale-95'
                  }`}
              >
                {filter === 'all' ? 'All Time' : filter}
              </button>
            ))}
          </div>

          {/* Currency Filter */}
          <div className="flex items-center gap-1 bg-[var(--surface-elevated)] rounded-lg p-1 border border-[var(--border)]">
            {CURRENCY_FILTERS.map(currency => (
              <button
                key={currency}
                onClick={() => setCurrencyFilter(currency)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-all duration-200 ${
                  currencyFilter === currency
                    ? 'bg-[var(--primary)] text-[var(--text-primary)] shadow-md shadow-[var(--primary-glow)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {currency === 'All' ? 'All' : `${CURRENCY_FLAGS[currency] || ''} ${currency}`}
              </button>
            ))}
          </div>

          {/* Impact Filter */}
          <div className="flex items-center gap-1 bg-[var(--surface-elevated)] rounded-lg p-1 border border-[var(--border)]">
            {IMPACT_FILTERS.map(impact => (
              <button
                key={impact}
                onClick={() => setImpactFilter(impact)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                  impactFilter === impact
                    ? 'bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-light)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {impact !== 'All' && (
                  <span className={`w-2 h-2 rounded-full ${IMPACT_COLORS[impact.toLowerCase() as keyof typeof IMPACT_COLORS]}`} />
                )}
                {impact}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--text-muted)]">Loading economic events...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-[var(--error)] mb-4">{error}</p>
              <button
                onClick={fetchEvents}
                className="px-4 py-2 bg-[var(--surface-elevated)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-all duration-200"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-[var(--text-muted)]">No events match your filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <div key={date}>
                {/* Date Header */}
                <div className="sticky top-0 bg-[var(--background)] py-2 z-10">
                  <h2 className="text-sm font-semibold text-[var(--text-secondary)] border-b border-[var(--border)] pb-2">
                    {date}
                  </h2>
                </div>

                {/* Events Table */}
                <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-[var(--text-muted)] border-b border-[var(--border-light)]">
                        <th className="text-left py-2.5 px-3 w-20 font-medium">Time</th>
                        <th className="text-left py-2.5 px-3 w-16 font-medium">Currency</th>
                        <th className="text-center py-2.5 px-3 w-16 font-medium">Impact</th>
                        <th className="text-left py-2.5 px-3 font-medium">Event</th>
                        <th className="text-right py-2.5 px-3 w-20 font-medium">Actual</th>
                        <th className="text-right py-2.5 px-3 w-20 font-medium">Forecast</th>
                        <th className="text-right py-2.5 px-3 w-20 font-medium">Previous</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayEvents.map(event => {
                        const isPast = isEventPast(event.time);
                        const isSoon = isEventSoon(event.time);

                        return (
                          <tr
                            key={event.id}
                            className={`border-b border-[var(--border)] last:border-0 transition-colors duration-150 ${
                              isPast
                                ? 'opacity-50'
                                : isSoon
                                  ? 'bg-[var(--warning-bg)]'
                                  : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <td className="py-3 px-3">
                              <span className={`text-sm font-mono ${isSoon ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
                                {formatTime(event.time)}
                              </span>
                              {isSoon && (
                                <span className="ml-1.5 text-[10px] text-[var(--warning)] animate-pulse font-semibold">SOON</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-sm flex items-center gap-1.5">
                                <span>{CURRENCY_FLAGS[event.currency] || '🏳️'}</span>
                                <span className="text-[var(--text-primary)] font-medium">{event.currency}</span>
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex justify-center gap-0.5">
                                {[0, 1, 2].map(i => (
                                  <div
                                    key={i}
                                    className={`w-2 h-4 rounded-sm ${
                                      (event.impact === 'high' && i < 3) ||
                                      (event.impact === 'medium' && i < 2) ||
                                      (event.impact === 'low' && i < 1)
                                        ? IMPACT_COLORS[event.impact]
                                        : 'bg-[var(--border-light)]'
                                    }`}
                                  />
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`text-sm ${IMPACT_TEXT_COLORS[event.impact]} font-medium`}>
                                {event.event}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className={`text-sm font-mono ${
                                event.actual
                                  ? event.actual.startsWith('-')
                                    ? 'text-[var(--bear)]'
                                    : 'text-[var(--bull)]'
                                  : 'text-[var(--text-dimmed)]'
                              }`}>
                                {event.actual || '-'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-sm font-mono text-[var(--text-secondary)]">
                                {event.forecast || '-'}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-sm font-mono text-[var(--text-muted)]">
                                {event.previous || '-'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Legend */}
      <div className="flex-shrink-0 p-3 border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded shadow-sm ${IMPACT_GLOW.high} ${IMPACT_COLORS.high}`} />
            <span>High Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded shadow-sm ${IMPACT_GLOW.medium} ${IMPACT_COLORS.medium}`} />
            <span>Medium Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded shadow-sm ${IMPACT_GLOW.low} ${IMPACT_COLORS.low}`} />
            <span>Low Impact</span>
          </div>
          <span className="text-[var(--border-light)]">|</span>
          <span className="text-[var(--text-dimmed)]">Data simulated for demo</span>
        </div>
      </div>
    </div>
  );
}
