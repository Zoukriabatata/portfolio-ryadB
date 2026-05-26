import type { EconomicEvent } from "../../lib/news/api";

function formatNum(n: number | null, unit: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const trimmed = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return unit ? `${trimmed}${unit}` : trimmed;
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function EconomicEventDetail({
  event,
  onClose,
}: {
  event: EconomicEvent;
  onClose: () => void;
}) {
  const hasSurprise =
    event.actual !== null &&
    event.forecast !== null &&
    Number.isFinite(event.actual) &&
    Number.isFinite(event.forecast);
  const surprise = hasSurprise ? (event.actual! - event.forecast!) : null;

  return (
    <div className="eco-modal-backdrop" onClick={onClose}>
      <div className="eco-modal" onClick={(e) => e.stopPropagation()}>
        <div className="eco-modal-title">{event.event}</div>
        <div className="eco-modal-sub">
          {event.country} · {formatDateTime(event.timeUtc)} · impact: {event.impact}
        </div>
        <div className="eco-modal-grid">
          <div>
            <div className="eco-modal-cell-label">Actual</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.actual, event.unit)}
            </div>
          </div>
          <div>
            <div className="eco-modal-cell-label">Forecast</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.forecast, event.unit)}
            </div>
          </div>
          <div>
            <div className="eco-modal-cell-label">Previous</div>
            <div className="eco-modal-cell-value">
              {formatNum(event.previous, event.unit)}
            </div>
          </div>
        </div>
        {surprise !== null && (
          <div
            className={
              surprise >= 0
                ? "eco-modal-surprise-positive"
                : "eco-modal-surprise-negative"
            }
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            Surprise : {surprise >= 0 ? "+" : ""}{surprise.toFixed(2)}{event.unit}
          </div>
        )}
        <button className="eco-modal-close" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
