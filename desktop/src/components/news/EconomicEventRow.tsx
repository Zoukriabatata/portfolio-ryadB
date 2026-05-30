import type { EconomicEvent, Impact } from "../../lib/news/api";
import { describeEvent } from "../../lib/news/eventImpact";

function formatHourLocal(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatNum(n: number | null, unit: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const trimmed = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return unit ? `${trimmed}${unit}` : trimmed;
}

/** Visual impact rating : 3 dots filled by severity (●●● / ●●○ / ●○○). */
function impactDots(level: Impact) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className={`eco-row-dots eco-row-dots-${level}`} aria-label={`impact ${level}`}>
      <span className={filled >= 1 ? "on" : ""} />
      <span className={filled >= 2 ? "on" : ""} />
      <span className={filled >= 3 ? "on" : ""} />
    </span>
  );
}

export function EconomicEventRow({
  event,
  onClick,
}: {
  event: EconomicEvent;
  onClick: (e: EconomicEvent) => void;
}) {
  const hasActual =
    event.actual !== null && Number.isFinite(event.actual);
  const summary = describeEvent(event.event);

  return (
    <div
      className="eco-row"
      role="button"
      tabIndex={0}
      onClick={() => onClick(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(event);
        }
      }}
    >
      <div className="eco-row-time">{formatHourLocal(event.timeUtc)}</div>
      <div className="eco-row-country">{event.country || "—"}</div>
      <div className="eco-row-main">
        <div className="eco-row-event">{event.event}</div>
        {summary && <div className="eco-row-summary">{summary}</div>}
        <div className="eco-row-numbers">
          <span className="eco-row-num">
            <span className="eco-row-num-label">F</span>
            <span className="eco-row-num-value">{formatNum(event.forecast, event.unit)}</span>
          </span>
          <span className="eco-row-num">
            <span className="eco-row-num-label">P</span>
            <span className="eco-row-num-value">{formatNum(event.previous, event.unit)}</span>
          </span>
          {hasActual && (
            <span className="eco-row-num eco-row-num-actual">
              <span className="eco-row-num-label">A</span>
              <span className="eco-row-num-value">{formatNum(event.actual, event.unit)}</span>
            </span>
          )}
        </div>
      </div>
      {impactDots(event.impact)}
    </div>
  );
}
