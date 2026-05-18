import { useGexStore } from "../../lib/gex/useGexStore";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function GexHeader() {
  const symbol = useGexStore((s) => s.symbol);
  const setSymbol = useGexStore((s) => s.setSymbol);
  const snapshot = useGexStore((s) => s.snapshot);
  const loading = useGexStore((s) => s.loading);
  const lastFetchedAt = useGexStore((s) => s.lastFetchedAt);
  const autoRefresh = useGexStore((s) => s.autoRefresh);
  const toggleAutoRefresh = useGexStore((s) => s.toggleAutoRefresh);
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);

  return (
    <div className="gex-header">
      <div className="gex-header-symbol">
        {(["SPY", "QQQ"] as const).map((sym) => (
          <button
            key={sym}
            type="button"
            className={`gex-symbol-pill ${symbol === sym ? "gex-symbol-pill-active" : ""}`}
            onClick={() => void setSymbol(sym)}
            disabled={loading}
          >
            {sym}
          </button>
        ))}
      </div>

      <div>
        <span className="gex-header-spot-label">Spot</span>
        <span className="gex-header-spot">
          {snapshot ? `$${snapshot.spot.toFixed(2)}` : "—"}
        </span>
      </div>

      <div className="gex-header-actions">
        <label className="gex-auto-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={toggleAutoRefresh}
          />
          Auto 15min
        </label>
        <span className="gex-header-refreshed">{timeAgo(lastFetchedAt)}</span>
        <button
          type="button"
          className="gex-refresh-btn"
          onClick={() => void fetchSnapshot()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
