// Phase B / M6 / M6a-1 — Liquidity heatmap route.
//
// M6a-1 ships the WebGL passive-orders bg only: symbol picker
// (Bybit Linear), Subscribe button (drives crypto_orderbook_*
// IPC), and the slim HeatmapCanvas. Pan/zoom + crosshair + trade
// bubbles + key-level overlays come in M6a-2 / M6b / M6c.

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeatmapCanvas } from "../components/heatmap/HeatmapCanvas";
import { SymbolPickerModal } from "../components/footprint/SymbolPickerModal";
import "./HeatmapRoute.css";

type CryptoStatus = {
  bybitOrderbookSubscriptions: string[];
};

export function HeatmapRoute() {
  const [symbol, setSymbol] = useState<string | null>("BTCUSDT");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = useCallback(async () => {
    if (!symbol) return;
    setBusy(true);
    setError(null);
    try {
      await invoke<CryptoStatus>("crypto_orderbook_subscribe", {
        args: { exchange: "bybit", symbol },
      });
      setSubscribed(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [symbol]);

  const handleUnsubscribe = useCallback(async () => {
    if (!symbol) return;
    setBusy(true);
    setError(null);
    try {
      await invoke<CryptoStatus>("crypto_orderbook_unsubscribe", {
        args: { exchange: "bybit", symbol },
      });
      setSubscribed(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [symbol]);

  // Tear the orderbook subscription down on unmount so the
  // background WS doesn't keep streaming when the user navigates
  // away. We swallow errors because crypto_orderbook_unsubscribe
  // is idempotent.
  useEffect(() => {
    return () => {
      if (subscribed && symbol) {
        void invoke("crypto_orderbook_unsubscribe", {
          args: { exchange: "bybit", symbol },
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Symbol switch resets the subscribed flag (the React user picks
  // a fresh contract → click Subscribe again). We don't auto-
  // unsubscribe the previous one here; the operator can do that
  // manually if they want a clean swap, and the renderer is keyed
  // by symbol so it'll cycle the WS adapter regardless.
  const handleSymbolPicked = useCallback((next: string) => {
    setSymbol(next);
    setSubscribed(false);
    setError(null);
  }, []);

  // Build the exchange-suffixed symbol the renderer filters on.
  // Only feeds the canvas when the user has actually subscribed —
  // otherwise the canvas shows its empty state.
  const canvasSymbol = subscribed && symbol ? `${symbol}.BYBIT` : null;

  return (
    <div className="hm-route">
      <nav className="hm-route-nav">
        <button
          type="button"
          className="hm-symbol-btn"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
        >
          {symbol ?? "Pick symbol"} <span className="hm-symbol-caret">▾</span>
        </button>
        <span className="hm-spacer" />
        {!subscribed && (
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={busy || !symbol}
            className="hm-subscribe-btn"
          >
            Subscribe
          </button>
        )}
        {subscribed && (
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={busy}
            className="hm-unsubscribe-btn"
          >
            Unsubscribe
          </button>
        )}
      </nav>

      {error && <div className="hm-route-error">{error}</div>}

      <HeatmapCanvas symbol={canvasSymbol} displaySymbol={symbol ?? undefined} />

      <SymbolPickerModal
        open={pickerOpen}
        exchange="bybit"
        currentSymbol={symbol ?? ""}
        onSelect={handleSymbolPicked}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
