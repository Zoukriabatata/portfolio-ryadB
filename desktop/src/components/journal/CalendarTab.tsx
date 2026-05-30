// Native port of `components/journal/CalendarTab.tsx`. Wires
// `journal_calendar_month` (per-day aggregates) +
// `journal_trades_on_day` (drill-down trades).

import { useEffect, useMemo, useState } from "react";
import { calendarMonth, tradesOnDay } from "../../lib/journal/api";
import CalendarNav from "./CalendarNav";
import CalendarGrid from "./CalendarGrid";
import CalendarDaySummary from "./CalendarDaySummary";
import type {
  CalendarDay,
  CalendarMonthStats,
  JournalEntry,
} from "../../types/journal";

const EMPTY_STATS: CalendarMonthStats = {
  totalPnl: 0,
  tradingDays: 0,
  winningDays: 0,
  losingDays: 0,
  bestDay: 0,
  worstDay: 0,
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CalendarTab() {
  const [month, setMonth] = useState<string>(currentMonth);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [stats, setStats] = useState<CalendarMonthStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<JournalEntry[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  // Refetch month aggregates when month changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    calendarMonth(month)
      .then((res) => {
        if (cancelled) return;
        setDays(res.days);
        setStats(res.stats);
      })
      .catch(() => {
        if (cancelled) return;
        setDays([]);
        setStats(EMPTY_STATS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Drill-down: fetch trades for the selected day
  useEffect(() => {
    if (!selectedDate) {
      setSelectedTrades([]);
      return;
    }
    let cancelled = false;
    setLoadingDay(true);
    tradesOnDay(selectedDate)
      .then((trades) => {
        if (!cancelled) setSelectedTrades(trades);
      })
      .catch(() => {
        if (!cancelled) setSelectedTrades([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDay(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const daysMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  // Reset selection when changing month so the day summary doesn't
  // flash stale trades from the previous month.
  useEffect(() => {
    setSelectedDate(null);
  }, [month]);

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto h-full overflow-y-auto">
      <CalendarNav month={month} onMonthChange={setMonth} monthStats={stats} />

      {loading ? (
        <div className="j-skeleton" style={{ height: 624 }} />
      ) : (
        <CalendarGrid
          month={month}
          daysMap={daysMap}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      {selectedDate &&
        (loadingDay ? (
          <div className="j-skeleton" style={{ height: 120 }} />
        ) : selectedTrades.length > 0 ? (
          <CalendarDaySummary
            date={selectedDate}
            trades={selectedTrades}
            onClose={() => setSelectedDate(null)}
          />
        ) : (
          <div className="j-empty">
            <div className="j-empty-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8"  y1="2" x2="8"  y2="6" />
                <line x1="3"  y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="j-empty-title">No trades on this day</div>
            <div className="j-empty-sub">Pick another day or log a new trade.</div>
          </div>
        ))}
    </div>
  );
}
