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
import { useAlertWatcher } from "../hooks/useAlertWatcher";
import type { FootprintRendererSettings } from "../lib/footprint/FootprintCanvasRenderer";
import { IndicatorsRunner } from "../lib/footprint/indicatorsAsync";
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
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>("1m");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canvasHandle = useRef<FootprintCanvasHandle>(null);
  // Auto-subscribe: tracks the (exchange, symbol) pair currently
  // streaming so we can swap on user change without manual clicks.
  // Set to "__paused__" if the user manually clicks Pause.
  const autoSubscribedRef = useRef<string | null>(null);

  // Subscribe field-by-field so the effect below only fires on the
  // bits the renderer actually consumes — avoids a re-render storm
  // when an unrelated store field is added later.
  const showGrid = useFootprintSettingsStore((s) => s.showGrid);
  const showCrosshair = useFootprintSettingsStore((s) => s.showCrosshair);
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
  const timezone = useFootprintSettingsStore((s) => s.timezone);
  const showStackedImbalances = useFootprintSettingsStore(
    (s) => s.showStackedImbalances,
  );
  const showNakedPOCs = useFootprintSettingsStore((s) => s.showNakedPOCs);
  const showUnfinishedAuctions = useFootprintSettingsStore(
    (s) => s.showUnfinishedAuctions,
  );
  const showAbsorption = useFootprintSettingsStore((s) => s.showAbsorption);
  const imbalanceRatio = useFootprintSettingsStore((s) => s.imbalanceRatio);
  const imbalanceMinConsecutive = useFootprintSettingsStore(
    (s) => s.imbalanceMinConsecutive,
  );
  const showVwapIndicator = useFootprintSettingsStore(
    (s) => s.showVwapIndicator,
  );
  const showClusterStat = useFootprintSettingsStore((s) => s.showClusterStat);
  const showBarDelta = useFootprintSettingsStore((s) => s.showBarDelta);
  const chartBgColor = useFootprintSettingsStore((s) => s.chartBgColor);
  const chartGridColor = useFootprintSettingsStore((s) => s.chartGridColor);
  const candleBodyUp = useFootprintSettingsStore((s) => s.candleBodyUp);
  const candleBodyDown = useFootprintSettingsStore((s) => s.candleBodyDown);
  const candleBorderUp = useFootprintSettingsStore((s) => s.candleBorderUp);
  const candleBorderDown = useFootprintSettingsStore((s) => s.candleBorderDown);
  const candleWickUp = useFootprintSettingsStore((s) => s.candleWickUp);
  const candleWickDown = useFootprintSettingsStore((s) => s.candleWickDown);
  const bidColor = useFootprintSettingsStore((s) => s.bidColor);
  const askColor = useFootprintSettingsStore((s) => s.askColor);
  const crosshairColor = useFootprintSettingsStore((s) => s.crosshairColor);
  const crosshairOpacity = useFootprintSettingsStore(
    (s) => s.crosshairOpacity,
  );
  const crosshairStyle = useFootprintSettingsStore((s) => s.crosshairStyle);
  const crosshairWidth = useFootprintSettingsStore((s) => s.crosshairWidth);
  const showDeltaProfile = useFootprintSettingsStore((s) => s.showDeltaProfile);
  const showCvd = useFootprintSettingsStore((s) => s.showCvd);
  const cvdMode = useFootprintSettingsStore((s) => s.cvdMode);
  const cvdPanelHeight = useFootprintSettingsStore((s) => s.cvdPanelHeight);
  const imbalanceCellRate = useFootprintSettingsStore((s) => s.imbalanceCellRate);
  const imbalanceCellVolumeFilter = useFootprintSettingsStore(
    (s) => s.imbalanceCellVolumeFilter,
  );
  const imbalanceCellMinDiff = useFootprintSettingsStore(
    (s) => s.imbalanceCellMinDiff,
  );
  const imbalanceCellIgnoreZero = useFootprintSettingsStore(
    (s) => s.imbalanceCellIgnoreZero,
  );
  const showDom = useFootprintSettingsStore((s) => s.showDom);
  const domProportion = useFootprintSettingsStore((s) => s.domProportion);

  // Map the store shape to the renderer's settings shape. Resolves
  // priceDecimalsMode "auto" → null (renderer falls back to the
  // priceDecimals prop) vs numeric override.
  const rendererSettings: FootprintRendererSettings = useMemo(
    () => ({
      showGrid,
      showCrosshair,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsOverride:
        priceDecimalsMode === "auto" ? null : parseInt(priceDecimalsMode, 10),
      // Crypto-side: no per-symbol catalog yet, let the renderer
      // infer from level gaps. Plumbed for interface parity.
      tickSizeOverride: null,
      volumeFormat,
      magnetMode,
      timezone,
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
      showAbsorption,
      showVwapIndicator,
      showClusterStat,
      showBarDelta,
      showDeltaProfile,
      showCvd,
      cvdMode,
      cvdPanelHeight,
      imbalanceCellRate,
      imbalanceCellVolumeFilter,
      imbalanceCellMinDiff,
      imbalanceCellIgnoreZero,
      showDom,
      domProportion,
      chartBgColor,
      chartGridColor,
      candleBodyUp,
      candleBodyDown,
      candleBorderUp,
      candleBorderDown,
      candleWickUp,
      candleWickDown,
      bidColor,
      askColor,
      crosshairColor,
      crosshairOpacity,
      crosshairStyle,
      crosshairWidth,
    }),
    [
      showGrid,
      showCrosshair,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsMode,
      volumeFormat,
      timezone,
      magnetMode,
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
      showAbsorption,
      showVwapIndicator,
      showClusterStat,
      showBarDelta,
      showDeltaProfile,
      showCvd,
      cvdMode,
      cvdPanelHeight,
      imbalanceCellRate,
      imbalanceCellVolumeFilter,
      imbalanceCellMinDiff,
      imbalanceCellIgnoreZero,
      showDom,
      domProportion,
      chartBgColor,
      chartGridColor,
      candleBodyUp,
      candleBodyDown,
      candleBorderUp,
      candleBorderDown,
      candleWickUp,
      candleWickDown,
      bidColor,
      askColor,
      crosshairColor,
      crosshairOpacity,
      crosshairStyle,
      crosshairWidth,
    ],
  );

  // Push settings to the renderer whenever they change. The handle
  // request a paint internally so the canvas updates immediately.
  useEffect(() => {
    canvasHandle.current?.applySettings(rendererSettings);
  }, [rendererSettings]);

  // M4.7c — async indicator pipeline. The runner debounces bursty
  // FootprintBar updates (Bybit BTC 5s peaks at 10+ updates/sec)
  // and defers compute to requestIdleCallback. Listener pushes the
  // result through the canvas handle, which forwards to the
  // renderer + ticks a paint.
  const runnerRef = useRef<IndicatorsRunner | null>(null);
  useEffect(() => {
    const runner = new IndicatorsRunner();
    runner.setListener((result) => {
      canvasHandle.current?.applyIndicators(result);
    });
    runnerRef.current = runner;
    return () => {
      runner.destroy();
      runnerRef.current = null;
    };
  }, []);

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

  // Auto-subscribe to whatever (exchange, symbol) pair is currently
  // selected, as soon as the crypto WebSocket connects. When the user
  // picks a different symbol we unsubscribe the previous one first.
  const fullKey = `${exchange}:${symbol.toUpperCase()}`;
  useEffect(() => {
    if (!connected) {
      autoSubscribedRef.current = null;
      return;
    }
    if (autoSubscribedRef.current === fullKey) return;
    if (autoSubscribedRef.current === "__paused__") return;
    let cancelled = false;
    const run = async () => {
      const prev = autoSubscribedRef.current;
      if (prev && prev !== fullKey && prev !== "__paused__") {
        const [prevEx, prevSym] = prev.split(":");
        try {
          await invoke("crypto_unsubscribe", {
            args: { exchange: prevEx, symbol: prevSym },
          });
        } catch (e) {
          console.warn("auto-unsub previous symbol failed:", e);
        }
      }
      if (cancelled) return;
      autoSubscribedRef.current = fullKey;
      try {
        await handleSubscribe();
      } catch {
        if (!cancelled) autoSubscribedRef.current = null;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [connected, fullKey, handleSubscribe]);

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

  // Price alerts — beep when an armed h-line is crossed by the
  // live close. Symbol is the bare prop value (e.g. "BTCUSDT") so
  // it matches what the store persists.
  useAlertWatcher(sortedBars[0]?.close, symbol);

  // Reschedule the indicator pipeline whenever the bar set changes
  // OR a parameter that affects the compute changes. Visibility-only
  // toggles don't trigger a recompute — the renderer can flip them
  // for free using the cached IndicatorsResult.
  useEffect(() => {
    const runner = runnerRef.current;
    if (!runner) return;
    const currentPrice = sortedBars[0]?.close ?? 0;
    runner.schedule(
      sortedBars,
      {
        imbalanceRatio,
        minConsecutive: imbalanceMinConsecutive,
        enableStackedImbalances: showStackedImbalances,
        enableNakedPOCs: showNakedPOCs,
        enableUnfinishedAuctions: showUnfinishedAuctions,
        enableAbsorption: showAbsorption,
        absorptionRatio: 0.6,
        absorptionMinVolume: 0,
        absorptionToleranceTicks: 1,
      },
      currentPrice,
    );
  }, [
    sortedBars,
    imbalanceRatio,
    imbalanceMinConsecutive,
    showStackedImbalances,
    showNakedPOCs,
    showUnfinishedAuctions,
    showAbsorption,
  ]);

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
          hideTickBased
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
        {/* Auto-subscribe is always on: the stream starts as soon as
            the crypto WebSocket connects. Pause = manual escape hatch
            that stays paused until the user picks a different symbol
            or hits Resume. */}
        {isSubscribed && (
          <button
            type="button"
            onClick={() => {
              autoSubscribedRef.current = "__paused__";
              void handleUnsubscribe();
            }}
            disabled={busy}
            className="cf-action-btn cf-action-secondary"
            title="Pause live data for the current symbol"
          >
            Pause
          </button>
        )}
        {!isSubscribed && connected && (
          <button
            type="button"
            onClick={() => {
              autoSubscribedRef.current = null;
              void handleSubscribe();
            }}
            disabled={busy}
            className="cf-action-btn cf-action-primary"
            title="Resume live data"
          >
            Resume
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
            onOpenSettings={() => setSettingsOpen(true)}
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
