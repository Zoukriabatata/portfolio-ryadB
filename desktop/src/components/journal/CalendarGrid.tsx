// Native port of `components/journal/CalendarGrid.tsx` — month grid
// (7 cols × 6 rows) with per-day P&L cells driven by the
// `journal_calendar_month` Tauri aggregate query.

import { getColorForPnl, formatCurrency } from "../../lib/journal/format";
import type { CalendarDay } from "../../types/journal";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  /** "YYYY-MM" */
  month: string;
  /** Rust-provided per-day aggregates (date string keyed). */
  daysMap: Map<string, CalendarDay>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

export default function CalendarGrid({
  month,
  daysMap,
  selectedDate,
  onSelectDate,
}: Props) {
  const [yearStr, mStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const m = parseInt(mStr, 10);

  const firstDay = new Date(year, m - 1, 1).getDay();
  const daysInMonth = new Date(year, m, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Build cell array (null = padding)
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  // Max abs P&L for color scaling
  const allPnl = Array.from(daysMap.values()).map((d) => Math.abs(d.pnl));
  const maxAbsPnl = Math.max(...allPnl, 1);

  return (
    <div className="j-cal-wrapper">
      <div className="j-cal-headers">
        {DAY_HEADERS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="j-cal-grid">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="j-cal-cell is-empty" />;
          }

          const dateStr = `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayData = daysMap.get(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasTrades = !!dayData && dayData.tradeCount > 0;

          return (
            <button
              key={i}
              type="button"
              data-journal-cell
              onClick={() => onSelectDate(dateStr)}
              className={`j-cal-cell ${hasTrades ? "has-trades" : ""} ${isSelected ? "is-selected" : ""}`}
              style={{
                background: hasTrades ? getColorForPnl(dayData!.pnl, maxAbsPnl) : "transparent",
              }}
            >
              <span className={`j-cal-day ${isToday ? "is-today" : ""}`}>
                {day}
              </span>

              {hasTrades && (
                <>
                  <div className={`j-cal-pnl ${dayData!.pnl >= 0 ? "is-pos" : "is-neg"}`}>
                    {formatCurrency(dayData!.pnl)}
                  </div>
                  <div className="j-cal-count">
                    {dayData!.tradeCount} trade{dayData!.tradeCount > 1 ? "s" : ""}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
