'use client';

import { useMemo } from 'react';
import { useEconomicCalendar } from '@/hooks/useEconomicCalendar';
import { useNewsThemeStore } from '@/stores/useNewsThemeStore';
import { useNewsSettingsStore } from '@/stores/useNewsSettingsStore';
import { NEWS_THEMES, themeToCSS } from '@/lib/news/newsThemes';
import { CalendarHeader } from '@/components/news/CalendarHeader';
import { CalendarFilters } from '@/components/news/CalendarFilters';
import { CalendarFooter } from '@/components/news/CalendarFooter';
import { SurpriseTape } from '@/components/news/SurpriseTape';
import { TimelineEvent } from '@/components/news/EventCard';
import { LoadingSkeleton } from '@/components/news/LoadingSkeleton';
import { EmptyState } from '@/components/news/EmptyState';
import { ErrorState } from '@/components/news/ErrorState';

export default function NewsPage() {
  const {
    events,
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
    totalToday,
    todayStats,
    searchQuery,
    setSearchQuery,
    clearSearch,
  } = useEconomicCalendar();

  const themeId = useNewsThemeStore(s => s.theme);
  const themeCSS = themeToCSS(NEWS_THEMES[themeId]);

  const watchlistMode = useNewsSettingsStore(s => s.watchlistMode);
  const watchlist = useNewsSettingsStore(s => s.watchlist);

  // Apply watchlist filter on top of existing grouped events
  const displayedGroups = useMemo(() => {
    if (!watchlistMode || watchlist.length === 0) return groupedEvents;
    return Object.fromEntries(
      Object.entries(groupedEvents)
        .map(([date, evts]) => [date, evts.filter(e => watchlist.includes(e.event))] as const)
        .filter(([, evts]) => evts.length > 0)
    );
  }, [groupedEvents, watchlistMode, watchlist]);

  return (
    <div className="h-full flex flex-col bg-[var(--background)]" style={themeCSS}>
      <CalendarHeader
        isLoading={isLoading}
        lastUpdate={lastUpdate}
        totalToday={totalToday}
        nextHighImpact={nextHighImpact}
        dataSource={dataSource}
        onRefresh={refresh}
        events={events}
      />

      <CalendarFilters
        time={filters.time}
        currency={filters.currency}
        impact={filters.impact}
        simulationMode={simulationMode}
        searchQuery={searchQuery}
        onTimeChange={setTime}
        onCurrencyChange={setCurrency}
        onImpactChange={setImpact}
        onSimulationToggle={toggleSimulation}
        onSearchChange={setSearchQuery}
        onSearchClear={clearSearch}
      />

      <SurpriseTape events={events} />

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : Object.keys(displayedGroups).length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {Object.entries(displayedGroups).map(([date, dayEvents]) => {
              const high = dayEvents.filter(e => e.impact === 'high').length;
              const med = dayEvents.filter(e => e.impact === 'medium').length;
              const low = dayEvents.filter(e => e.impact === 'low').length;
              return (
                <div key={date} className="animate-fadeIn">
                  {/* Date section header */}
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wider uppercase">
                      {date}
                    </h2>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {high > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums" style={{ color: 'var(--bear)', backgroundColor: 'var(--bear-bg)' }}>
                          {high}H
                        </span>
                      )}
                      {med > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tabular-nums" style={{ color: 'var(--warning)', backgroundColor: 'var(--warning-bg)' }}>
                          {med}M
                        </span>
                      )}
                      {low > 0 && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded tabular-nums" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-elevated)' }}>
                          {low}L
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Event rows */}
                  <div className="space-y-1.5">
                    {dayEvents.map((event, idx) => (
                      <div key={event.id} className="animate-slideUp" style={{ animationDelay: `${idx * 30}ms`, animationFillMode: 'both' }}>
                        <TimelineEvent
                          event={event}
                          index={idx}
                          simulationMode={simulationMode}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CalendarFooter simulationMode={simulationMode} dataSource={dataSource} />
    </div>
  );
}
