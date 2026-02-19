'use client';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DailyNotesCalendarNavProps {
  month: string; // "2026-02"
  onMonthChange: (month: string) => void;
  noteCount: number;
}

export default function DailyNotesCalendarNav({ month, onMonthChange, noteCount }: DailyNotesCalendarNavProps) {
  const [year, m] = month.split('-').map(Number);

  const prev = () => {
    const d = new Date(year, m - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const d = new Date(year, m, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const today = () => {
    const now = new Date();
    onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button onClick={prev} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] min-w-[180px] text-center">
          {MONTH_NAMES[m - 1]} {year}
        </h2>
        <button onClick={next} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <button onClick={today} className="px-2.5 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
          Today
        </button>
      </div>
      <span className="text-xs text-[var(--text-muted)]">
        {noteCount} note{noteCount !== 1 ? 's' : ''} this month
      </span>
    </div>
  );
}
