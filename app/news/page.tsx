'use client';

import { useEconomicCalendar } from '@/hooks/useEconomicCalendar';
import { useNewsThemeStore } from '@/stores/useNewsThemeStore';
import { NEWS_THEMES, themeToCSS } from '@/lib/news/newsThemes';
import { CalendarHeader } from '@/components/news/CalendarHeader';
import { CalendarFilters } from '@/components/news/CalendarFilters';
import { CalendarFooter } from '@/components/news/CalendarFooter';
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
    filters,
    setCurrency,
    setImpact,
    setTime,
    simulationMode,
    toggleSimulation,
    refresh,
    nextHighImpact,
    totalToday,
  } = useEconomicCalendar();

  const themeId = useNewsThemeStore(s => s.theme);
  const themeCSS = themeToCSS(NEWS_THEMES[themeId]);

  return (
    <div className="h-full flex flex-col bg-[var(--background)]" style={themeCSS}>
      <CalendarHeader
        isLoading={isLoading}
        lastUpdate={lastUpdate}
        totalToday={totalToday}
        nextHighImpact={nextHighImpact}
        onRefresh={refresh}
      />

      <CalendarFilters
        time={filters.time}
        currency={filters.currency}
        impact={filters.impact}
        simulationMode={simulationMode}
        onTimeChange={setTime}
        onCurrencyChange={setCurrency}
        onImpactChange={setImpact}
        onSimulationToggle={toggleSimulation}
      />

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState error={error} onRetry={refresh} />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <div key={date} className="animate-fadeIn">
                {/* Date section header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-[var(--primary)] shadow-md shadow-[var(--primary-glow)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-secondary)] tracking-wide uppercase">
                    {date}
                  </h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-[var(--border)] to-transparent" />
                  <span className="text-[10px] text-[var(--text-dimmed)] tabular-nums">
                    {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Timeline */}
                <div className="relative pl-8">
                  <div className="absolute left-[5px] top-0 bottom-0 w-px bg-gradient-to-b from-[var(--primary)]/30 via-[var(--border)] to-transparent" />
                  <div className="space-y-3">
                    {dayEvents.map((event, idx) => (
                      <TimelineEvent
                        key={event.id}
                        event={event}
                        index={idx}
                        simulationMode={simulationMode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CalendarFooter simulationMode={simulationMode} />
    </div>
  );
}
