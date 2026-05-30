import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";
import { OptionFlowSymbolPanel } from "./OptionFlowSymbolPanel";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function OptionFlowHeader() {
  const trades = useOptionFlowStore((s) => s.trades);
  const loading = useOptionFlowStore((s) => s.loading);
  const lastPolledAt = useOptionFlowStore((s) => s.lastPolledAt);
  const autoRefresh = useOptionFlowStore((s) => s.autoRefresh);
  const toggleAutoRefresh = useOptionFlowStore((s) => s.toggleAutoRefresh);
  const poll = useOptionFlowStore((s) => s.poll);
  const clearTrades = useOptionFlowStore((s) => s.clearTrades);

  return (
    <div className="of-header">
      <OptionFlowSymbolPanel />

      <div className="of-header-count">
        <span className="of-count-label">Trades</span>
        <span className="of-count-value">{trades.length}</span>
        {autoRefresh && <span className="of-header-live">LIVE</span>}
      </div>

      <div className="of-header-actions">
        <label className="of-auto-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={toggleAutoRefresh}
          />
          Auto live (4s)
        </label>
        <span className="of-header-refreshed">{timeAgo(lastPolledAt)}</span>
        <button
          type="button"
          className="of-action-btn"
          onClick={() => void poll()}
          disabled={loading}
        >
          {loading ? "Polling…" : "Refresh"}
        </button>
        <button
          type="button"
          className="of-action-btn of-action-btn-ghost"
          onClick={clearTrades}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
