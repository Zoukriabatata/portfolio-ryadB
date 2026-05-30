// Native port of `components/journal/CalendarNav.tsx`. Month nav +
// summary stats. Driven by props (no Zustand needed).

import { formatCurrency } from "../../lib/journal/format";
import type { CalendarMonthStats } from "../../types/journal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  /** "YYYY-MM" */
  month: string;
  onMonthChange: (next: string) => void;
  monthStats: CalendarMonthStats;
}

export default function CalendarNav({ month, onMonthChange, monthStats }: Props) {
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
    <div className="space-y-4">
      {/* Month header — pill-shaped nav + Today shortcut. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Stat cards row — same visual language as TradesTab. */}
      <div className="j-stat-row">
        <div className="j-stat">
          <div className="j-stat-label">Net P&L</div>
          <div className={`j-stat-value ${monthStats.totalPnl >= 0 ? "is-pos" : "is-neg"}`}>
            {formatCurrency(monthStats.totalPnl)}
          </div>
          <div className="j-stat-sub">{monthStats.tradingDays} trading days</div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Winning · Losing</div>
          <div className="j-stat-value">
            <span style={{ color: "#7ed321" }}>{monthStats.winningDays}</span>
            <span className="opacity-30 mx-1.5">·</span>
            <span>{monthStats.losingDays}</span>
          </div>
          <div className="j-stat-sub">days breakdown</div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Best Day</div>
          <div className="j-stat-value is-pos">{formatCurrency(monthStats.bestDay)}</div>
          <div className="j-stat-sub">peak session</div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Worst Day</div>
          <div className="j-stat-value">{formatCurrency(monthStats.worstDay)}</div>
          <div className="j-stat-sub">deepest drawdown</div>
        </div>
      </div>
    </div>
  );
}
