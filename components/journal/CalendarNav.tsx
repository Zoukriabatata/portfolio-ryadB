'use client';

import { useJournalStore } from '@/stores/useJournalStore';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface CalendarNavProps {
  monthStats: {
    totalPnl: number;
    tradingDays: number;
    winningDays: number;
    losingDays: number;
    bestDay: number;
    worstDay: number;
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarNav({ monthStats }: CalendarNavProps) {
  const { calendarMonth, setCalendarMonth } = useJournalStore();
  const [year, month] = calendarMonth.split('-').map(Number);

  const prev = () => {
    const d = new Date(year, month - 2, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const d = new Date(year, month, 1);
    setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const today = () => {
    const now = new Date();
    setCalendarMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="flex items-center justify-between">
      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button onClick={prev} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] min-w-[180px] text-center">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <button onClick={next} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <button onClick={today} className="px-2.5 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          Today
        </button>
      </div>

      {/* Month stats */}
      <div className="flex items-center gap-5">
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">P&L</p>
          <p className="text-sm font-bold font-mono" style={{ color: monthStats.totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {formatCurrency(monthStats.totalPnl)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Days</p>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            <span className="text-[var(--bull)]">{monthStats.winningDays}</span>
            <span className="text-[var(--text-dimmed)]">/</span>
            <span className="text-[var(--bear)]">{monthStats.losingDays}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Best</p>
          <p className="text-sm font-bold font-mono text-[var(--bull)]">{formatCurrency(monthStats.bestDay)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">Worst</p>
          <p className="text-sm font-bold font-mono text-[var(--bear)]">{formatCurrency(monthStats.worstDay)}</p>
        </div>
      </div>
    </div>
  );
}
