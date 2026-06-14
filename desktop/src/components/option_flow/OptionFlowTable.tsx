import { useEffect, useMemo, useState, type CSSProperties } from "react";
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

function fmtDelta(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return "—";
  // Sign forced — calls are +0..+1, puts are -1..0. The sign carries
  // the directional intuition (long calls = long stock-equivalent).
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(2)}`;
}

/** Bucket for cell colour. Negative = put-side bias (red),
 *  positive ITM ≥ 0.5 = high conviction directional (bright green). */
function deltaTier(d: number | null | undefined): string {
  if (d == null || !Number.isFinite(d)) return "of-delta-null";
  const abs = Math.abs(d);
  if (abs >= 0.6) return d >= 0 ? "of-delta-deep-call" : "of-delta-deep-put";
  if (abs >= 0.3) return d >= 0 ? "of-delta-mid-call" : "of-delta-mid-put";
  return "of-delta-otm";
}

function fmtIv(iv: number | null | undefined): string {
  if (iv == null || !Number.isFinite(iv)) return "—";
  return `${(iv * 100).toFixed(1)}%`;
}

/** Bucket for IV cell colour: ≥80% = hot (red glow), 40-80% = elevated,
 *  ≤20% = cheap (cool). Helps eyeballing "expensive vs cheap" at glance. */
function ivTier(iv: number | null | undefined): string {
  if (iv == null || !Number.isFinite(iv)) return "of-iv-null";
  if (iv >= 0.8) return "of-iv-hot";
  if (iv >= 0.4) return "of-iv-elevated";
  if (iv >= 0.2) return "of-iv-normal";
  return "of-iv-cool";
}

/** Vol/OI ratio for a trade: trade size against the contract's standing
 *  open interest. >= 1 means the single print is as large as the entire
 *  open interest → almost certainly an OPENING position (you can't close
 *  more contracts than exist). Null when OI is unknown/zero. */
function voiRatio(t: OptionTrade): number | null {
  const oi = t.openInterest;
  if (oi == null || !Number.isFinite(oi) || oi <= 0) return null;
  return t.size / oi;
}

function isOpening(t: OptionTrade): boolean {
  const r = voiRatio(t);
  return r != null && r >= 1;
}

function sizeTitle(t: OptionTrade): string | undefined {
  const r = voiRatio(t);
  if (r == null) return undefined;
  return `OI ${t.openInterest!.toLocaleString()} · Vol/OI ${r.toFixed(2)}${r >= 1 ? " — opening (size ≥ OI)" : ""}`;
}

const OPENING_TAG_STYLE: CSSProperties = {
  marginLeft: 5,
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "1px 4px",
  borderRadius: 3,
  color: "#f5a623",
  background: "rgba(245,166,35,0.14)",
  border: "1px solid rgba(245,166,35,0.35)",
  verticalAlign: "middle",
};

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
        <span className="of-th-right" title="Delta — directional exposure per contract (calls 0…+1, puts -1…0)">Δ</span>
        <span className="of-th-right" title="Implied volatility — option's market-implied expectation of underlying movement">IV</span>
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
              <span className="of-cell-right" title={sizeTitle(t)}>
                {t.size.toLocaleString()}
                {isOpening(t) && <span style={OPENING_TAG_STYLE}>OPEN</span>}
              </span>
              <span className="of-cell-right">${t.price.toFixed(2)}</span>
              <span className={`of-cell-right of-cell-premium`}>
                {fmtPremium(t.premium)}
              </span>
              <span
                className={`of-cell-right of-cell-delta ${deltaTier(t.delta)}`}
                title={
                  t.gamma != null || t.theta != null
                    ? `γ ${t.gamma?.toFixed(3) ?? "—"} · θ ${t.theta?.toFixed(2) ?? "—"}`
                    : undefined
                }
              >
                {fmtDelta(t.delta)}
              </span>
              <span className={`of-cell-right of-cell-iv ${ivTier(t.iv)}`}>
                {fmtIv(t.iv)}
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
