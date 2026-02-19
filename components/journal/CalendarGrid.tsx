'use client';

import { useJournalStore } from '@/stores/useJournalStore';
import { getColorForPnl, formatCurrency } from '@/lib/journal/chartUtils';

interface DayData {
  date: string;
  pnl: number;
  tradeCount: number;
}

interface CalendarGridProps {
  days: Map<string, DayData>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarGrid({ days, selectedDate, onSelectDate }: CalendarGridProps) {
  const { calendarMonth } = useJournalStore();
  const [year, month] = calendarMonth.split('-').map(Number);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Build cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  // Max P&L for color scaling
  const allPnl = Array.from(days.values()).map(d => Math.abs(d.pnl));
  const maxAbsPnl = Math.max(...allPnl, 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 bg-[var(--surface-elevated)]">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-[var(--text-muted)]">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="h-20 border-t border-r border-[var(--border)]" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayData = days.get(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasTrades = dayData && dayData.tradeCount > 0;

          return (
            <button
              key={i}
              onClick={() => onSelectDate(dateStr)}
              className={`h-20 border-t border-r border-[var(--border)] p-1.5 text-left transition-colors relative ${
                isSelected ? 'ring-2 ring-[var(--primary)] ring-inset' : ''
              } ${hasTrades ? 'hover:bg-[var(--surface-hover)]' : ''}`}
              style={hasTrades ? { background: getColorForPnl(dayData.pnl, maxAbsPnl) } : undefined}
            >
              <span className={`text-xs ${
                isToday ? 'font-bold text-[var(--primary)]' : 'text-[var(--text-muted)]'
              }`}>
                {day}
              </span>

              {hasTrades && (
                <div className="mt-1">
                  <p
                    className="text-xs font-bold font-mono"
                    style={{ color: dayData.pnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}
                  >
                    {formatCurrency(dayData.pnl)}
                  </p>
                  <p className="text-[10px] text-[var(--text-dimmed)]">
                    {dayData.tradeCount} trade{dayData.tradeCount > 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
