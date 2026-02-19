'use client';

import { useState } from 'react';
import { useJournalCalendar } from '@/hooks/useJournalCalendar';
import CalendarNav from './CalendarNav';
import CalendarGrid from './CalendarGrid';
import CalendarDaySummary from './CalendarDaySummary';

export default function CalendarTab() {
  const { calendarData, loading } = useJournalCalendar();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedDayData = selectedDate ? calendarData.days.get(selectedDate) : null;

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <CalendarNav monthStats={calendarData.monthStats} />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        </div>
      ) : (
        <CalendarGrid
          days={calendarData.days}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      {selectedDayData && selectedDayData.trades.length > 0 && (
        <CalendarDaySummary
          date={selectedDate!}
          trades={selectedDayData.trades}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
