// Native port of `components/journal/DailyNotesCalendarNav.tsx`.
// Identical month nav as CalendarNav but with note count instead of
// trade stats.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  /** "YYYY-MM" */
  month: string;
  onMonthChange: (next: string) => void;
  noteCount: number;
}

export default function DailyNotesCalendarNav({
  month,
  onMonthChange,
  noteCount,
}: Props) {
  const [yearStr, mStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const m = parseInt(mStr, 10);

  const prev = () => {
    const d = new Date(year, m - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const next = () => {
    const d = new Date(year, m, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const today = () => {
    const now = new Date();
    onMonthChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="j-month-pill">
        <button onClick={prev} className="j-month-arrow" aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="j-month-label">
          {MONTH_NAMES[m - 1]} {year}
        </h2>
        <button onClick={next} className="j-month-arrow" aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <button onClick={today} className="j-btn-ghost">Today</button>
      <span
        className="text-[11px] font-medium tracking-wider uppercase ml-1"
        style={{ color: "rgba(255,255,255,0.42)" }}
      >
        {noteCount} note{noteCount !== 1 ? "s" : ""} this month
      </span>
    </div>
  );
}
