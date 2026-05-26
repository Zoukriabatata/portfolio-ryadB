import { useMemo, useState } from "react";
import type { EconomicEvent, Impact } from "../../lib/news/api";
import { useNewsStore } from "../../lib/news/useNewsStore";
import { EconomicEventDetail } from "./EconomicEventDetail";
import { EconomicEventRow } from "./EconomicEventRow";

const IMPACTS: Impact[] = ["high", "medium", "low"];
const COUNTRIES = ["US", "EU", "GB", "JP", "CN"] as const;

function dayLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dStart = new Date(d);
  dStart.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dStart.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "x";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function EconomicCalendar() {
  const events = useNewsStore((s) => s.events);
  const loading = useNewsStore((s) => s.eventsLoading);
  const error = useNewsStore((s) => s.eventsError);
  const filters = useNewsStore((s) => s.filters);
  const setRange = useNewsStore((s) => s.setRange);
  const toggleImpact = useNewsStore((s) => s.toggleImpact);
  const toggleCountry = useNewsStore((s) => s.toggleCountry);
  const [selected, setSelected] = useState<EconomicEvent | null>(null);

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (!filters.impact[e.impact]) return false;
      const c = e.country as (typeof COUNTRIES)[number];
      if (COUNTRIES.includes(c) && !filters.countries[c]) return false;
      // Events with country outside the toggle set: hide unless any
      // is enabled (default behaviour : we show only toggled-on countries).
      if (!COUNTRIES.includes(c)) return false;
      return true;
    });
  }, [events, filters]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const e of visible) {
      const k = dayKey(e.timeUtc);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    return Array.from(map.entries()); // already chronological from server sort
  }, [visible]);

  return (
    <div className="eco-cal">
      <div className="eco-cal-header">
        <span>Economic Calendar</span>
      </div>
      <div className="eco-cal-filters">
        <button
          type="button"
          className={`eco-cal-pill ${filters.range === "today" ? "eco-cal-pill-active" : ""}`}
          onClick={() => setRange("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={`eco-cal-pill ${filters.range === "7d" ? "eco-cal-pill-active" : ""}`}
          onClick={() => setRange("7d")}
        >
          7d
        </button>
      </div>
      <div className="eco-cal-filters">
        {IMPACTS.map((i) => (
          <button
            key={i}
            type="button"
            className={`eco-cal-pill ${filters.impact[i] ? "eco-cal-pill-active" : ""}`}
            onClick={() => toggleImpact(i)}
          >
            {i.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="eco-cal-filters">
        {COUNTRIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`eco-cal-pill ${filters.countries[c] ? "eco-cal-pill-active" : ""}`}
            onClick={() => toggleCountry(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {error && <div className="eco-cal-error">{error}</div>}
      {!error && grouped.length === 0 && !loading && (
        <div className="eco-cal-empty">No events match the current filters.</div>
      )}
      {grouped.map(([dayK, list]) => (
        <div key={dayK}>
          <div className="eco-cal-section-header">{dayLabel(list[0].timeUtc)}</div>
          {list.map((ev) => (
            <EconomicEventRow key={ev.id} event={ev} onClick={setSelected} />
          ))}
        </div>
      ))}
      {selected && (
        <EconomicEventDetail event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
