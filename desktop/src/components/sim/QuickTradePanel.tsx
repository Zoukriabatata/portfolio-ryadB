// QuickTradePanel.tsx
// =====================================================================
// Floating one-click trading widget — Quantower / TradingView style.
// Lives on top of the chart canvas (absolute positioning, top-left
// corner by default), NOT in the side dock. Compact horizontal
// layout: [SELL] [qty ±] [BUY] with an optional FLATTEN row when
// a position is open.
//
// Uses the same `useSimAccountStore` actions as the full
// `SimTradePanel`, so positions opened from here are visible
// (and closeable) from the side dock and vice versa.

import { useEffect, useMemo, useState } from "react";
import { useSimAccountStore } from "../../lib/sim/useSimAccountStore";
import { computePnl, getContractSpec } from "../../lib/sim/contractSpecs";
import "./sim.css";

type Props = {
  /** Trading symbol without exchange suffix, e.g. "MNQM6" or "MNQ 06-26". */
  symbol: string;
};

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n);
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function QuickTradePanel({ symbol }: Props) {
  const position = useSimAccountStore((s) => s.position);
  const livePrices = useSimAccountStore((s) => s.livePrices);
  const lastError = useSimAccountStore((s) => s.lastError);
  const openMarket = useSimAccountStore((s) => s.openMarket);
  const flatten = useSimAccountStore((s) => s.flatten);
  const clearError = useSimAccountStore((s) => s.clearError);

  const [qty, setQty] = useState(1);

  const spec = useMemo(() => getContractSpec(symbol), [symbol]);
  const lastPrice = livePrices[symbol] ?? null;
  const priceDecimals = spec.tickSize < 1 ? 2 : 0;

  // Auto-clear the error toast.
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [lastError, clearError]);

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

  // Synthetic bid/ask spread of one tick around the last trade —
  // we don't carry a real top-of-book in the sim store. Cosmetic
  // only: market orders fill at `lastPrice` regardless.
  const sellPrice =
    lastPrice !== null ? lastPrice - spec.tickSize / 2 : null;
  const buyPrice =
    lastPrice !== null ? lastPrice + spec.tickSize / 2 : null;

  const stepQty = (delta: number) =>
    setQty((q) => Math.max(1, Math.min(999, q + delta)));

  const disabled = lastPrice === null || !symbol;
  const hasPosition = position && position.symbol === symbol;
  const pnlColor =
    unrealized > 0 ? "#22c55e" : unrealized < 0 ? "#ef4444" : "#9ca3af";

  return (
    <div className="fqt-widget" role="toolbar" aria-label="Quick trade">
      <div className="fqt-row">
        {/* SELL — red */}
        <button
          type="button"
          className="fqt-side fqt-side-sell"
          onClick={() => openMarket({ symbol, side: "short", qty })}
          disabled={disabled}
          title={`Sell ${qty} ${symbol} at market`}
        >
          <span className="fqt-price">
            {sellPrice !== null ? sellPrice.toFixed(priceDecimals) : "—"}
          </span>
          <span className="fqt-label">SELL</span>
        </button>

        {/* QTY stepper */}
        <div className="fqt-qty">
          <button
            type="button"
            className="fqt-qty-btn"
            onClick={() => stepQty(-1)}
            aria-label="Decrease qty"
            tabIndex={-1}
          >
            −
          </button>
          <input
            type="number"
            className="fqt-qty-input"
            value={qty}
            min={1}
            max={999}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n > 0) setQty(Math.min(999, n));
            }}
            aria-label="Order quantity"
          />
          <button
            type="button"
            className="fqt-qty-btn"
            onClick={() => stepQty(1)}
            aria-label="Increase qty"
            tabIndex={-1}
          >
            +
          </button>
        </div>

        {/* BUY — green */}
        <button
          type="button"
          className="fqt-side fqt-side-buy"
          onClick={() => openMarket({ symbol, side: "long", qty })}
          disabled={disabled}
          title={`Buy ${qty} ${symbol} at market`}
        >
          <span className="fqt-price">
            {buyPrice !== null ? buyPrice.toFixed(priceDecimals) : "—"}
          </span>
          <span className="fqt-label">BUY</span>
        </button>
      </div>

      {/* Position row — only when one is open */}
      {hasPosition && position && (
        <div className="fqt-position-row">
          <span
            className={
              position.side === "long" ? "fqt-pos-long" : "fqt-pos-short"
            }
            title={`Open ${position.side.toUpperCase()} ${position.qty} @ ${position.entryPrice.toFixed(priceDecimals)}`}
          >
            {position.side === "long" ? "▲" : "▼"} {position.qty}
            {" @ "}
            {position.entryPrice.toFixed(priceDecimals)}
          </span>
          <span className="fqt-pos-pnl" style={{ color: pnlColor }}>
            {fmtMoney(unrealized)}
          </span>
          <button
            type="button"
            className="fqt-flatten"
            onClick={() => flatten()}
            title="Close position at market"
          >
            FLATTEN
          </button>
        </div>
      )}

      {/* Error toast */}
      {lastError && (
        <div className="fqt-error" title={lastError.message}>
          {lastError.message}
        </div>
      )}
    </div>
  );
}
