import type { EconomicEvent } from "../../lib/news/api";

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

export function EconomicEventRow({
  event,
  onClick,
}: {
  event: EconomicEvent;
  onClick: (e: EconomicEvent) => void;
}) {
  return (
    <div
      className="eco-row"
      role="button"
      tabIndex={0}
      onClick={() => onClick(event)}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(event); }}
    >
      <span className="eco-row-time">{formatHourLocal(event.timeUtc)}</span>
      <span className="eco-row-country">{event.country || "—"}</span>
      <span className="eco-row-event">
        <span className={`eco-row-impact eco-row-impact-${event.impact}`} />
        &nbsp;{event.event}
      </span>
      <span className="eco-row-numbers">
        F:{formatNum(event.forecast, event.unit)} · P:{formatNum(event.previous, event.unit)}
      </span>
    </div>
  );
}
