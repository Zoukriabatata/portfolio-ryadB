import { useEffect, useMemo, useState } from "react";
import { useSimAccountStore } from "../../lib/sim/useSimAccountStore";
import { useSimVoice } from "../../lib/sim/useSimVoice";
import { computePnl, getContractSpec } from "../../lib/sim/contractSpecs";
import "./sim.css";

type Props = {
  /** Trading symbol without exchange suffix, e.g. "MNQM6". */
  symbol: string;
};

const CAPITAL_PRESETS = [25_000, 50_000, 100_000, 250_000];

function fmtMoney(n: number, signed = false): string {
  const sign = signed && n >= 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

export function SimTradePanel({ symbol }: Props) {
  useSimVoice();

  const balance = useSimAccountStore((s) => s.balance);
  const startingCapital = useSimAccountStore((s) => s.startingCapital);
  const position = useSimAccountStore((s) => s.position);
  const livePrices = useSimAccountStore((s) => s.livePrices);
  const history = useSimAccountStore((s) => s.history);
  const lastError = useSimAccountStore((s) => s.lastError);
  const lastFill = useSimAccountStore((s) => s.lastFill);
  const voiceEnabled = useSimAccountStore((s) => s.voiceEnabled);

  const workingOrders = useSimAccountStore((s) => s.workingOrders);
  const openMarket = useSimAccountStore((s) => s.openMarket);
  const flatten = useSimAccountStore((s) => s.flatten);
  const setBrackets = useSimAccountStore((s) => s.setBrackets);
  const clearError = useSimAccountStore((s) => s.clearError);
  const resetAccount = useSimAccountStore((s) => s.resetAccount);
  const resetHistory = useSimAccountStore((s) => s.resetHistory);
  const toggleVoice = useSimAccountStore((s) => s.toggleVoice);
  const placeWorkingOrder = useSimAccountStore((s) => s.placeWorkingOrder);
  const cancelWorkingOrder = useSimAccountStore((s) => s.cancelWorkingOrder);

  const [qty, setQty] = useState(1);
  const [slPts, setSlPts] = useState<string>("");
  const [tpPts, setTpPts] = useState<string>("");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">(
    "market",
  );
  const [triggerStr, setTriggerStr] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  const spec = useMemo(() => getContractSpec(symbol), [symbol]);
  const lastPrice = livePrices[symbol] ?? null;
  const priceDecimals = spec.tickSize < 1 ? 2 : 0;

  // Auto-clear the error toast after 3.5s.
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [lastError, clearError]);

  // Trigger a brief pulse class when a fill arrives.
  const fillFlash = lastFill ? Date.now() - lastFill.ts < 900 : false;

  const unrealized = useMemo(() => {
    if (!position || lastPrice === null) return 0;
    if (position.symbol !== symbol) return 0;
    return computePnl(
      spec,
      position.side,
      position.entryPrice,
      lastPrice,
      position.qty,
    );
  }, [position, lastPrice, spec, symbol]);

  const equity = balance + unrealized;
  const sessionPnl = balance - startingCapital + unrealized;
  const sessionPct = startingCapital > 0 ? (sessionPnl / startingCapital) * 100 : 0;

  const computeBrackets = (side: "long" | "short") => {
    const slPtsN = parseFloat(slPts);
    const tpPtsN = parseFloat(tpPts);
    if (lastPrice === null) return { sl: null, tp: null };
    const sl = Number.isFinite(slPtsN) && slPtsN > 0
      ? side === "long" ? lastPrice - slPtsN : lastPrice + slPtsN
      : null;
    const tp = Number.isFinite(tpPtsN) && tpPtsN > 0
      ? side === "long" ? lastPrice + tpPtsN : lastPrice - tpPtsN
      : null;
    return { sl, tp };
  };

  const trigger = parseFloat(triggerStr);
  const triggerValid = Number.isFinite(trigger) && trigger > 0;

  /** Brackets for a limit/stop are computed relative to the *trigger
   *  price*, not the current market, because that's where the entry
   *  will fill. */
  const computeBracketsAt = (side: "long" | "short", entry: number) => {
    const slPtsN = parseFloat(slPts);
    const tpPtsN = parseFloat(tpPts);
    const sl = Number.isFinite(slPtsN) && slPtsN > 0
      ? side === "long" ? entry - slPtsN : entry + slPtsN
      : null;
    const tp = Number.isFinite(tpPtsN) && tpPtsN > 0
      ? side === "long" ? entry + tpPtsN : entry - tpPtsN
      : null;
    return { sl, tp };
  };

  const handleBuy = () => {
    if (orderType === "market") {
      const { sl, tp } = computeBrackets("long");
      openMarket({ symbol, side: "long", qty, stopLoss: sl, takeProfit: tp });
      return;
    }
    if (!triggerValid) return;
    const { sl, tp } = computeBracketsAt("long", trigger);
    // buy_limit (trigger < market) | buy_stop (trigger > market)
    const type =
      lastPrice !== null && trigger < lastPrice ? "buy_limit" : "buy_stop";
    placeWorkingOrder({
      symbol, type, qty,
      triggerPrice: trigger,
      stopLoss: sl,
      takeProfit: tp,
    });
    setTriggerStr("");
  };
  const handleSell = () => {
    if (orderType === "market") {
      const { sl, tp } = computeBrackets("short");
      openMarket({ symbol, side: "short", qty, stopLoss: sl, takeProfit: tp });
      return;
    }
    if (!triggerValid) return;
    const { sl, tp } = computeBracketsAt("short", trigger);
    // sell_limit (trigger > market) | sell_stop (trigger < market)
    const type =
      lastPrice !== null && trigger > lastPrice ? "sell_limit" : "sell_stop";
    placeWorkingOrder({
      symbol, type, qty,
      triggerPrice: trigger,
      stopLoss: sl,
      takeProfit: tp,
    });
    setTriggerStr("");
  };

  const noPrice = lastPrice === null;
  const recentTrades = history.slice(0, 8);

  // Risk preview — money on the line if SL is hit.
  const riskPreview = useMemo(() => {
    const sl = parseFloat(slPts);
    if (!Number.isFinite(sl) || sl <= 0) return null;
    return sl * spec.multiplier * qty;
  }, [slPts, spec, qty]);

  const rewardPreview = useMemo(() => {
    const tp = parseFloat(tpPts);
    if (!Number.isFinite(tp) || tp <= 0) return null;
    return tp * spec.multiplier * qty;
  }, [tpPts, spec, qty]);

  const rrRatio = riskPreview && rewardPreview ? rewardPreview / riskPreview : null;

  return (
    <div className={`sim-panel ${fillFlash ? "sim-panel-flash" : ""}`}>
      {/* ── Error toast ───────────────────────── */}
      {lastError && (
        <div className="sim-toast sim-toast-error">
          <span className="sim-toast-icon">✕</span>
          <span className="sim-toast-msg">{lastError.message}</span>
        </div>
      )}

      {/* ── Header (Balance + Equity) ─────────── */}
      <div className="sim-header">
        <div className="sim-header-block">
          <div className="sim-header-label">Balance</div>
          <div className="sim-header-balance">{fmtMoney(balance)}</div>
        </div>
        <div className="sim-header-block sim-header-block-right">
          <div className="sim-header-label">Equity</div>
          <div className={`sim-header-equity ${sessionPnl >= 0 ? "sim-pos" : "sim-neg"}`}>
            {fmtMoney(equity)}
          </div>
          <div className={`sim-header-pct ${sessionPnl >= 0 ? "sim-pos" : "sim-neg"}`}>
            {fmtMoney(sessionPnl, true)} · {sessionPct >= 0 ? "+" : ""}
            {sessionPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* ── Instrument + Live price ──────────── */}
      <div className="sim-card sim-card-instrument">
        <div className="sim-card-row">
          <div>
            <div className="sim-symbol-tag">{spec.root}</div>
            <div className="sim-symbol-name">{spec.name}</div>
          </div>
          <div className="sim-card-meta">
            <span><span className="sim-meta-label">tick</span> {spec.tickSize}</span>
            <span><span className="sim-meta-label">$/tick</span> {spec.tickValue.toFixed(2)}</span>
          </div>
        </div>
        <div className="sim-price-block">
          <span className="sim-price-label">LAST</span>
          <span className={`sim-price-value ${noPrice ? "sim-price-pending" : ""}`}>
            {noPrice ? "Waiting tick…" : lastPrice.toFixed(priceDecimals)}
          </span>
        </div>
      </div>

      {/* ── Order form ───────────────────────── */}
      <div className="sim-section-label">Order</div>
      <div className="sim-form">
        {/* Order-type tab strip */}
        <div className="sim-type-strip">
          {(["market", "limit", "stop"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`sim-type-pill ${orderType === t ? "sim-type-pill-active" : ""}`}
              onClick={() => setOrderType(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="sim-form-row">
          <label className="sim-field">
            <span>Qty</span>
            <input
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
              className="sim-input"
            />
          </label>
          <label className="sim-field">
            <span>SL pts</span>
            <input
              type="number"
              min={0}
              step={spec.tickSize}
              value={slPts}
              onChange={(e) => setSlPts(e.target.value)}
              placeholder="—"
              className="sim-input"
            />
          </label>
          <label className="sim-field">
            <span>TP pts</span>
            <input
              type="number"
              min={0}
              step={spec.tickSize}
              value={tpPts}
              onChange={(e) => setTpPts(e.target.value)}
              placeholder="—"
              className="sim-input"
            />
          </label>
        </div>

        {/* Trigger price input — only shown for non-market orders */}
        {orderType !== "market" && (
          <label className="sim-field sim-field-full">
            <span>{orderType === "limit" ? "Limit price" : "Stop price"}</span>
            <input
              type="number"
              min={0}
              step={spec.tickSize}
              value={triggerStr}
              onChange={(e) => setTriggerStr(e.target.value)}
              placeholder={lastPrice !== null ? lastPrice.toFixed(priceDecimals) : "—"}
              className="sim-input"
            />
          </label>
        )}

        {(riskPreview || rewardPreview) && (
          <div className="sim-risk-preview">
            {riskPreview !== null && (
              <span>
                <span className="sim-risk-label">Risk</span>
                <span className="sim-neg">−{fmtMoney(riskPreview)}</span>
              </span>
            )}
            {rewardPreview !== null && (
              <span>
                <span className="sim-risk-label">Reward</span>
                <span className="sim-pos">+{fmtMoney(rewardPreview)}</span>
              </span>
            )}
            {rrRatio !== null && (
              <span>
                <span className="sim-risk-label">R:R</span>
                <span className={rrRatio >= 1.5 ? "sim-pos" : "sim-neutral"}>
                  1:{rrRatio.toFixed(2)}
                </span>
              </span>
            )}
          </div>
        )}

        <div className="sim-buttons">
          <button
            type="button"
            className="sim-btn sim-btn-buy"
            onClick={handleBuy}
            disabled={noPrice || (orderType !== "market" && !triggerValid)}
          >
            <span className="sim-btn-icon">▲</span>
            {orderType === "market"
              ? "BUY"
              : orderType === "limit"
              ? "BUY LIMIT"
              : "BUY STOP"}
          </button>
          <button
            type="button"
            className="sim-btn sim-btn-sell"
            onClick={handleSell}
            disabled={noPrice || (orderType !== "market" && !triggerValid)}
          >
            <span className="sim-btn-icon">▼</span>
            {orderType === "market"
              ? "SELL"
              : orderType === "limit"
              ? "SELL LIMIT"
              : "SELL STOP"}
          </button>
        </div>
      </div>

      {/* ── Position ─────────────────────────── */}
      <div className="sim-section-label">Position</div>
      {position ? (
        <div className={`sim-position sim-position-${position.side}`}>
          <div className="sim-position-header">
            <span className={`sim-position-side sim-side-${position.side}`}>
              <span className="sim-position-side-arrow">
                {position.side === "long" ? "▲" : "▼"}
              </span>
              {position.side.toUpperCase()}
            </span>
            <span className="sim-position-qty">{position.qty}×</span>
            <span className="sim-position-symbol">{position.symbol}</span>
            <span className={`sim-position-unreal ${unrealized >= 0 ? "sim-pos" : "sim-neg"}`}>
              {fmtMoney(unrealized, true)}
            </span>
          </div>
          <div className="sim-position-grid">
            <div>
              <div className="sim-position-label">Entry</div>
              <div className="sim-position-value">
                {position.entryPrice.toFixed(priceDecimals)}
              </div>
            </div>
            <div>
              <div className="sim-position-label">Last</div>
              <div className="sim-position-value">
                {lastPrice !== null ? lastPrice.toFixed(priceDecimals) : "—"}
              </div>
            </div>
            <div>
              <div className="sim-position-label">Opened</div>
              <div className="sim-position-value sim-position-value-time">
                {new Date(position.openedAtMs).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </div>
          </div>
          <div className="sim-bracket-row">
            <div className="sim-bracket-item">
              <span className="sim-bracket-tag sim-bracket-tag-sl">SL</span>
              <span>
                {position.stopLoss !== null
                  ? position.stopLoss.toFixed(priceDecimals)
                  : "—"}
              </span>
            </div>
            <div className="sim-bracket-item">
              <span className="sim-bracket-tag sim-bracket-tag-tp">TP</span>
              <span>
                {position.takeProfit !== null
                  ? position.takeProfit.toFixed(priceDecimals)
                  : "—"}
              </span>
            </div>
            <button
              type="button"
              className="sim-bracket-btn"
              onClick={() => setBrackets(null, null)}
              disabled={position.stopLoss === null && position.takeProfit === null}
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            className="sim-btn sim-btn-flatten"
            onClick={() => flatten()}
          >
            FLATTEN
          </button>
        </div>
      ) : (
        <div className="sim-no-position">
          <div className="sim-no-position-icon">○</div>
          <div>No open position</div>
        </div>
      )}

      {/* ── Working orders ──────────────────── */}
      {workingOrders.length > 0 && (
        <>
          <div className="sim-section-label sim-section-label-row">
            <span>Pending orders</span>
            <span className="sim-history-count">{workingOrders.length}</span>
          </div>
          <div className="sim-working-list">
            {workingOrders.map((o) => {
              const isBuy =
                o.type === "buy_limit" || o.type === "buy_stop";
              const typeLabel = o.type
                .replace("buy_", "Buy ")
                .replace("sell_", "Sell ")
                .replace("limit", "Limit")
                .replace("stop", "Stop");
              return (
                <div
                  key={o.id}
                  className={`sim-working-row sim-side-${isBuy ? "long" : "short"}`}
                >
                  <span className="sim-working-type">{typeLabel}</span>
                  <span className="sim-working-qty">{o.qty}×</span>
                  <span className="sim-working-trigger">
                    @ {o.triggerPrice.toFixed(priceDecimals)}
                  </span>
                  <button
                    type="button"
                    className="sim-working-cancel"
                    onClick={() => cancelWorkingOrder(o.id)}
                    title="Cancel order"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── History ──────────────────────────── */}
      <div className="sim-section-label sim-section-label-row">
        <span>History</span>
        <span className="sim-history-count">{history.length}</span>
      </div>
      {recentTrades.length === 0 ? (
        <div className="sim-history-empty">No trades yet.</div>
      ) : (
        <div className="sim-history-list">
          {recentTrades.map((t) => (
            <div key={t.id} className="sim-history-row">
              <div className="sim-history-top">
                <span className={`sim-history-side sim-side-${t.side}`}>
                  {t.side === "long" ? "L" : "S"}
                </span>
                <span className="sim-history-sym">{t.symbol}</span>
                <span className="sim-history-qty">{t.qty}×</span>
                <span className={`sim-history-pnl ${t.pnl >= 0 ? "sim-pos" : "sim-neg"}`}>
                  {fmtMoney(t.pnl, true)}
                </span>
              </div>
              <div className="sim-history-bot">
                <span className="sim-history-prices">
                  {t.entryPrice.toFixed(priceDecimals)} →{" "}
                  {t.exitPrice.toFixed(priceDecimals)}
                </span>
                <span className={`sim-history-reason sim-history-reason-${t.reason}`}>
                  {t.reason}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────── */}
      <div className="sim-footer">
        <button
          type="button"
          className="sim-link"
          onClick={() => setShowSettings((v) => !v)}
        >
          {showSettings ? "Hide settings" : "Settings"}
        </button>
        <span className="sim-footer-stats">
          {history.length > 0 && (
            <>
              <span>
                {Math.round((history.filter((t) => t.pnl > 0).length / history.length) * 100)}% WR
              </span>
              <span className="sim-footer-dot">·</span>
              <span>{fmtCompact(history.length)} trades</span>
            </>
          )}
        </span>
      </div>
      {showSettings && (
        <div className="sim-settings">
          <label className="sim-voice-toggle">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={toggleVoice}
            />
            <span className="sim-voice-icon" aria-hidden>
              {voiceEnabled ? "🔊" : "🔇"}
            </span>
            <span>Voice feedback (order filled / rejected)</span>
          </label>

          <div className="sim-settings-label">Starting capital</div>
          <div className="sim-settings-presets">
            {CAPITAL_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`sim-preset ${startingCapital === c ? "sim-preset-active" : ""}`}
                onClick={() => resetAccount(c)}
              >
                {fmtMoney(c)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sim-reset"
            onClick={resetHistory}
          >
            Reset history (keep capital)
          </button>
        </div>
      )}
    </div>
  );
}
