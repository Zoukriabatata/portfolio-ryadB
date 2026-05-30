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
      if (!COUNTRIES.includes(c)) return false;
      if (!filters.countries[c]) return false;
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
    return Array.from(map.entries());
  }, [visible]);

  return (
    <div className="eco-cal">
      <div className="eco-cal-header">
        <span>Economic Calendar</span>
        <span className="eco-cal-count">
          {visible.length} {visible.length === 1 ? "event" : "events"}
        </span>
      </div>

      <div className="eco-cal-filter-group">
        <div className="eco-cal-filter-label">Range</div>
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
            7 days
          </button>
        </div>
      </div>

      <div className="eco-cal-filter-group">
        <div className="eco-cal-filter-label">Impact</div>
        <div className="eco-cal-filters">
          {IMPACTS.map((i) => (
            <button
              key={i}
              type="button"
              className={`eco-cal-pill eco-cal-pill-${i} ${filters.impact[i] ? "eco-cal-pill-active" : ""}`}
              onClick={() => toggleImpact(i)}
            >
              {i.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="eco-cal-filter-group">
        <div className="eco-cal-filter-label">Countries</div>
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
      </div>

      {error && <div className="eco-cal-error">{error}</div>}
      {!error && grouped.length === 0 && !loading && (
        <div className="eco-cal-empty">No events match the current filters.</div>
      )}

      <div className="eco-cal-list">
        {grouped.map(([dayK, list]) => (
          <div key={dayK} className="eco-cal-section">
            <div className="eco-cal-section-header">
              <span>{dayLabel(list[0].timeUtc)}</span>
              <span className="eco-cal-section-count">{list.length}</span>
            </div>
            <div className="eco-cal-section-rows">
              {list.map((ev) => (
                <EconomicEventRow key={ev.id} event={ev} onClick={setSelected} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <EconomicEventDetail event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
