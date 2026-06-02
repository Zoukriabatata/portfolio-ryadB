import { useEffect, useMemo, useState } from "react";
import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";
import type { OptionTrade } from "../../lib/option_flow/api";
import {
  formatMarketStatus,
  getMarketStatus,
  type MarketStatus,
} from "../../lib/option_flow/marketHours";

function fmtPremium(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function premiumTier(n: number): string {
  if (n >= 500_000) return "of-tier-mega";
  if (n >= 100_000) return "of-tier-large";
  if (n >= 25_000) return "of-tier-mid";
  return "of-tier-small";
}

export function OptionFlowTable() {
  const trades = useOptionFlowStore((s) => s.trades);
  const minPremium = useOptionFlowStore((s) => s.minPremium);
  const minSize = useOptionFlowStore((s) => s.minSize);
  const contractFilter = useOptionFlowStore((s) => s.contractFilter);
  const sideFilter = useOptionFlowStore((s) => s.sideFilter);
  const resetFilters = useOptionFlowStore((s) => s.resetFilters);

  const visible = useMemo(() => {
    return trades.filter((t: OptionTrade) => {
      if (t.premium < minPremium) return false;
      if (t.size < minSize) return false;
      if (contractFilter !== "all" && t.contractType !== contractFilter)
        return false;
      if (sideFilter !== "all" && t.side !== sideFilter) return false;
      return true;
    });
  }, [trades, minPremium, minSize, contractFilter, sideFilter]);

  if (trades.length === 0) {
    return <EmptyTradesState />;
  }

  return (
    <div className="of-table-wrap">
      <div className="of-table-header-row">
        <span>Time</span>
        <span>Symbol</span>
        <span>Strike</span>
        <span className="of-th-right">Size</span>
        <span className="of-th-right">Price</span>
        <span className="of-th-right">Premium</span>
        <span>Side</span>
        <span>Exch</span>
      </div>
      <div className="of-table-body">
        {visible.length === 0 ? (
          <div className="of-table-empty">
            <div style={{ marginBottom: 10 }}>
              <strong>{trades.length}</strong> trades hidden by active filters.
            </div>
            <div className="of-empty-filters">
              {minPremium > 0 && <span>premium ≥ ${minPremium.toLocaleString()}</span>}
              {minSize > 0 && <span>size ≥ {minSize}</span>}
              {contractFilter !== "all" && <span>type = {contractFilter}</span>}
              {sideFilter !== "all" && <span>side = {sideFilter}</span>}
            </div>
            <button
              type="button"
              className="of-action-btn"
              style={{ marginTop: 16 }}
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>
        ) : (
          visible.map((t) => (
            <div
              key={`${t.symbol}|${t.timestampMs}|${t.price}|${t.size}`}
              className={`of-row of-row-${t.contractType} ${premiumTier(t.premium)}`}
            >
              <span className="of-cell-time">{fmtTime(t.timestampMs)}</span>
              <span className="of-cell-symbol">
                <span className={`of-cp-tag of-cp-${t.contractType}`}>
                  {t.contractType === "call" ? "C" : "P"}
                </span>
                <span className="of-cell-underlying">{t.underlying}</span>
                <span className="of-cell-exp">{t.expiration}</span>
              </span>
              <span className="of-cell-strike">${t.strike.toFixed(2)}</span>
              <span className="of-cell-right">{t.size.toLocaleString()}</span>
              <span className="of-cell-right">${t.price.toFixed(2)}</span>
              <span className={`of-cell-right of-cell-premium`}>
                {fmtPremium(t.premium)}
              </span>
              <span className={`of-cell-side of-side-${t.side}`}>
                {t.side === "buy"
                  ? "BUY"
                  : t.side === "sell"
                  ? "SELL"
                  : t.side === "mid"
                  ? "MID"
                  : "—"}
              </span>
              <span className="of-cell-exch">{t.exchange || "—"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Empty-state view shown before the first non-empty poll. Branches
 *  on US options market status so a closed market doesn't look like
 *  a broken feed. Refreshes the status every 30s for live countdowns. */
function EmptyTradesState() {
  const [status, setStatus] = useState<MarketStatus>(() => getMarketStatus());
  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (status.state === "open") {
    return (
      <div className="of-table-wrap">
        <div className="of-table-empty">
          <div className="of-empty-title">Waiting for the first poll…</div>
          <div className="of-empty-sub">
            US options market is <strong>OPEN</strong>. Trades arrive on a
            15-minute delay (Alpaca free tier). If nothing shows up within a
            minute or two, double-check your Alpaca API keys in Settings.
          </div>
        </div>
      </div>
    );
  }

  // Closed / pre-market / weekend — explain why and when it'll come back.
  const headline =
    status.state === "pre-market"
      ? "Market is in pre-market"
      : status.state === "weekend"
      ? "Market is closed for the weekend"
      : "Market is closed";

  return (
    <div className="of-table-wrap">
      <div className="of-table-empty">
        <div className="of-empty-title">{headline}</div>
        <div className="of-empty-sub">
          {formatMarketStatus(status)}.
          <br />
          The option flow feed is live <strong>Mon–Fri 09:30 → 16:00 New York</strong>.
          Outside that window we don&apos;t receive any new trades —
          the empty feed isn&apos;t a connection issue.
        </div>
      </div>
    </div>
  );
}
