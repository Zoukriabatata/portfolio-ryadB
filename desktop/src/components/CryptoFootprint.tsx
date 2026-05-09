// Phase B / M3 + M4 + M4.7a — crypto-side footprint client.
//
// Public-feed exchanges (Bybit linear, Binance spot) — no broker
// settings, no vault, no auth flow. The component:
//   1. on mount: invoke('crypto_connect', { exchange })
//   2. user picks a symbol via the modal → invoke('crypto_subscribe')
//   3. listens to `crypto-footprint-update` events filtered to the
//      current exchange-qualified symbol + timeframe
//
// M4.7a — visible chrome is now: status bar + symbol picker button +
// timeframe pills + subscribe / unsubscribe + canvas with a floating
// zoom toolbar. The legacy text-input + dropdown layout is gone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type FootprintBar } from "./FootprintBarView";
import {
  FootprintCanvas,
  type FootprintCanvasHandle,
} from "./footprint/FootprintCanvas";
import { SymbolPickerModal } from "./footprint/SymbolPickerModal";
import {
  TimeframePills,
  type SupportedTimeframe,
} from "./footprint/TimeframePills";
import { ZoomControls } from "./footprint/ZoomControls";
import { FootprintStatusBar } from "./footprint/FootprintStatusBar";
import { MagnetToggle } from "./footprint/MagnetToggle";
import { AdvancedSettingsModal } from "./footprint/AdvancedSettingsModal";
import { useFootprintSettingsStore } from "../stores/useFootprintSettingsStore";
import type { FootprintRendererSettings } from "../lib/footprint/FootprintCanvasRenderer";
import "./footprint/CryptoFootprintNav.css";

type CryptoExchange = "bybit" | "binance";

type CryptoStatus = {
  binanceConnected: boolean;
  bybitConnected: boolean;
  deribitConnected: boolean;
  binanceSubscriptions: string[];
  bybitSubscriptions: string[];
  deribitSubscriptions: string[];
};

const MAX_BARS = 20;
const PRICE_DECIMALS = 2;

const EXCHANGE_LABELS: Record<CryptoExchange, string> = {
  bybit: "Bybit Linear",
  binance: "Binance Spot",
};

export function CryptoFootprint({
  exchange,
  defaultSymbol,
}: {
  exchange: CryptoExchange;
  defaultSymbol: string;
}) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>("5s");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canvasHandle = useRef<FootprintCanvasHandle>(null);

  // Subscribe field-by-field so the effect below only fires on the
  // bits the renderer actually consumes — avoids a re-render storm
  // when an unrelated store field is added later.
  const showGrid = useFootprintSettingsStore((s) => s.showGrid);
  const showPocSession = useFootprintSettingsStore((s) => s.showPocSession);
  const showPocBar = useFootprintSettingsStore((s) => s.showPocBar);
  const showVolumeTooltip = useFootprintSettingsStore(
    (s) => s.showVolumeTooltip,
  );
  const showOhlcHeader = useFootprintSettingsStore((s) => s.showOhlcHeader);
  const priceDecimalsMode = useFootprintSettingsStore(
    (s) => s.priceDecimalsMode,
  );
  const volumeFormat = useFootprintSettingsStore((s) => s.volumeFormat);
  const magnetMode = useFootprintSettingsStore((s) => s.magnetMode);

  // Map the store shape to the renderer's settings shape. Resolves
  // priceDecimalsMode "auto" → null (renderer falls back to the
  // priceDecimals prop) vs numeric override.
  const rendererSettings: FootprintRendererSettings = useMemo(
    () => ({
      showGrid,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsOverride:
        priceDecimalsMode === "auto" ? null : parseInt(priceDecimalsMode, 10),
      volumeFormat,
      magnetMode,
    }),
    [
      showGrid,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsMode,
      volumeFormat,
      magnetMode,
    ],
  );

  // Push settings to the renderer whenever they change. The handle
  // request a paint internally so the canvas updates immediately.
  useEffect(() => {
    canvasHandle.current?.applySettings(rendererSettings);
  }, [rendererSettings]);

  // Reset bars + symbol when exchange changes — the operator chose a
  // different venue, the previous bars no longer make sense.
  const lastExchangeRef = useRef(exchange);
  useEffect(() => {
    if (lastExchangeRef.current !== exchange) {
      lastExchangeRef.current = exchange;
      setSymbol(defaultSymbol);
      setBars(new Map());
    }
  }, [exchange, defaultSymbol]);

  // On mount / exchange change: open the WebSocket and start the
  // engine pump. crypto_connect is idempotent — calling it twice on
  // the same exchange tears down the previous adapter cleanly.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const next = await invoke<CryptoStatus>("crypto_connect", {
          args: { exchange },
        });
        if (!cancelled) {
          setStatus(next);
          setConnected(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setConnected(false);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exchange]);

  // The Rust parsers suffix every crypto Tick.symbol with the
  // exchange tag ("BTCUSDT.BYBIT", "BTC-PERPETUAL.DERIBIT", …) so
  // the shared engine doesn't collide bars across venues.
  const fullSymbol = useMemo(
    () => `${symbol.toUpperCase()}.${exchange.toUpperCase()}`,
    [symbol, exchange],
  );

  // Listen for crypto-side bar updates filtered to the current
  // exchange-qualified symbol + timeframe.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen<FootprintBar>("crypto-footprint-update", (event) => {
      const bar = event.payload;
      if (bar.symbol !== fullSymbol || bar.timeframe !== timeframe) return;
      setBars((prev) => {
        const next = new Map(prev);
        next.set(bar.bucketTsNs, bar);
        if (next.size > MAX_BARS) {
          const sorted = [...next.keys()].sort((a, b) => a - b);
          for (const k of sorted.slice(0, sorted.length - MAX_BARS)) {
            next.delete(k);
          }
        }
        return next;
      });
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [fullSymbol, timeframe]);

  const handleSubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<CryptoStatus>("crypto_subscribe", {
        args: { exchange, symbol },
      });
      setStatus(next);
      setBars(new Map());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [exchange, symbol]);

  const handleUnsubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<CryptoStatus>("crypto_unsubscribe", {
        args: { exchange, symbol },
      });
      setStatus(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [exchange, symbol]);

  // Symbol switch from the picker. Clear the bar cache so the new
  // ticker doesn't render mixed with stale bars from the previous
  // symbol while the first new bar forms.
  const handleSymbolPicked = useCallback((nextSymbol: string) => {
    setSymbol(nextSymbol);
    setBars(new Map());
  }, []);

  // Timeframe switch — same reasoning, drop stale bars.
  const handleTimeframeChange = useCallback(
    (next: SupportedTimeframe) => {
      setTimeframe(next);
      setBars(new Map());
    },
    [],
  );

  const subscriptions = useMemo(() => {
    if (!status) return [];
    if (exchange === "bybit") return status.bybitSubscriptions;
    return status.binanceSubscriptions;
  }, [exchange, status]);

  const isSubscribed = subscriptions.includes(symbol.toUpperCase());

  const sortedBars = useMemo(
    () => [...bars.values()].sort((a, b) => b.bucketTsNs - a.bucketTsNs),
    [bars],
  );

  return (
    <>
      <FootprintStatusBar
        symbol={symbol}
        exchange={EXCHANGE_LABELS[exchange]}
        timeframe={timeframe}
        bars={sortedBars}
        connected={connected}
        busy={busy}
        priceDecimals={PRICE_DECIMALS}
      />

      <section className="cf-controls">
        <button
          type="button"
          className="cf-symbol-btn"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
        >
          {symbol} <span className="cf-symbol-caret">▾</span>
        </button>
        <TimeframePills
          value={timeframe}
          onChange={handleTimeframeChange}
          disabled={busy}
        />
        <MagnetToggle />
        <button
          type="button"
          className="cf-icon-btn"
          onClick={() => setSettingsOpen(true)}
          title="Footprint settings"
          aria-label="Footprint settings"
        >
          ⚙
        </button>
        <span className="cf-controls-spacer" />
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={busy || !connected}
          className="cf-action-btn cf-action-primary"
        >
          Subscribe
        </button>
        {isSubscribed && (
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={busy}
            className="cf-action-btn cf-action-secondary"
          >
            Unsubscribe
          </button>
        )}
      </section>

      {error && <div className="rf-error">{error}</div>}

      <section className="rf-footprint">
        <div className="cf-canvas-wrap">
          <FootprintCanvas
            ref={canvasHandle}
            bars={sortedBars}
            symbol={symbol}
            timeframe={timeframe}
            priceDecimals={PRICE_DECIMALS}
            bare
          />
          <ZoomControls
            onZoomIn={() => canvasHandle.current?.zoomIn()}
            onZoomOut={() => canvasHandle.current?.zoomOut()}
            onReset={() => canvasHandle.current?.resetView()}
          />
        </div>
      </section>

      <SymbolPickerModal
        open={pickerOpen}
        exchange={exchange}
        currentSymbol={symbol}
        onSelect={handleSymbolPicked}
        onClose={() => setPickerOpen(false)}
      />

      <AdvancedSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
