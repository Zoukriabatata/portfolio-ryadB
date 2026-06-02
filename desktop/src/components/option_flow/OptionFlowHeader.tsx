import { useEffect, useState } from "react";
import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";
import { OptionFlowSymbolPanel } from "./OptionFlowSymbolPanel";
import {
  formatMarketStatus,
  getMarketStatus,
  type MarketStatus,
} from "../../lib/option_flow/marketHours";

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Refresh the market status every 30s so the countdown stays current
 *  without burning render cycles. */
function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);
  return status;
}

export function OptionFlowHeader() {
  const trades = useOptionFlowStore((s) => s.trades);
  const loading = useOptionFlowStore((s) => s.loading);
  const lastPolledAt = useOptionFlowStore((s) => s.lastPolledAt);
  const autoRefresh = useOptionFlowStore((s) => s.autoRefresh);
  const toggleAutoRefresh = useOptionFlowStore((s) => s.toggleAutoRefresh);
  const poll = useOptionFlowStore((s) => s.poll);
  const clearTrades = useOptionFlowStore((s) => s.clearTrades);
  const marketStatus = useMarketStatus();
  const isMarketOpen = marketStatus.state === "open";

  return (
    <div className="of-header">
      <OptionFlowSymbolPanel />

      <div className="of-header-count">
        <span className="of-count-label">Trades</span>
        <span className="of-count-value">{trades.length}</span>
        {/* Replaces the static "LIVE" badge with a real-time status chip
            so users don't think the panel is broken when the option
            market is closed. State-driven class lets us colour open
            vs closed differently from CSS. */}
        <span
          className={`of-header-market of-header-market-${marketStatus.state}`}
          title={
            isMarketOpen
              ? "US options market is open. New trades arrive on a 15-min delay (Alpaca free tier)."
              : "US options market is closed. The feed only carries new trades during regular session (Mon–Fri 09:30–16:00 New York)."
          }
        >
          {formatMarketStatus(marketStatus)}
        </span>
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
