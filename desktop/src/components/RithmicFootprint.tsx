import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BrokerSettings } from "./BrokerSettings";
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
import { IndicatorsRunner } from "../lib/footprint/indicatorsAsync";
import { findSymbol } from "../lib/footprint/symbols";
import "./RithmicFootprint.css";
import "./footprint/CryptoFootprintNav.css";

// Mirror of RithmicStatus on the Rust side (camelCase via serde rename).
type RithmicStatus = {
  connected: boolean;
  loggedIn: boolean;
  user?: string | null;
  systemName?: string | null;
  fcm?: string | null;
  ib?: string | null;
  country?: string | null;
  heartbeatSecs?: number | null;
  subscriptions: string[];
};

type PriceLevel = {
  price: number;
  buyVolume: number;
  sellVolume: number;
  buyTrades: number;
  sellTrades: number;
};

type FootprintBar = {
  symbol: string;
  timeframe: string;
  bucketTsNs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalDelta: number;
  tradeCount: number;
  levels: PriceLevel[];
};

type RedactedCreds = {
  preset: string;
  gatewayUrl: string;
  systemName: string;
  username: string;
  hasPassword: boolean;
};

type Phase =
  | { kind: "checking" }
  | { kind: "needs-creds" }
  | { kind: "settings"; creds: RedactedCreds | null }
  | { kind: "connecting" }
  | { kind: "ready"; creds: RedactedCreds }
  | { kind: "failed"; error: string };

// Timeframes come from `TimeframePills` (M4.7a) — same supported set
// (5s/15s/1m/5m) on both Rithmic and crypto until the Rust side
// grows 30s/3m/15m. MAX_BARS caps the React-side bar Map; the
// renderer still pans through whatever's mounted.
const MAX_BARS = 20;

const EMPTY_STATUS: RithmicStatus = {
  connected: false,
  loggedIn: false,
  subscriptions: [],
};

export function RithmicFootprint() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });

  // Bootstrap: read vault → either route to BrokerSettings or auto-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const creds = await invoke<RedactedCreds | null>(
          "load_broker_credentials",
        );
        if (cancelled) return;
        if (!creds) {
          setPhase({ kind: "needs-creds" });
          return;
        }
        setPhase({ kind: "connecting" });
        try {
          await invoke<RithmicStatus>("rithmic_login_from_vault");
          if (cancelled) return;
          setPhase({ kind: "ready", creds });
        } catch (e) {
          if (!cancelled) setPhase({ kind: "failed", error: String(e) });
        }
      } catch (e) {
        if (!cancelled) setPhase({ kind: "failed", error: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onCredsSaved = useCallback(async (creds: RedactedCreds) => {
    setPhase({ kind: "connecting" });
    try {
      await invoke<RithmicStatus>("rithmic_login_from_vault");
      setPhase({ kind: "ready", creds });
    } catch (e) {
      setPhase({ kind: "failed", error: String(e) });
    }
  }, []);

  const onOpenSettings = useCallback(() => {
    setPhase((p) =>
      p.kind === "ready"
        ? { kind: "settings", creds: p.creds }
        : { kind: "settings", creds: null },
    );
  }, []);

  const onCloseSettings = useCallback(() => {
    // If creds still exist, go back to ready (re-login if needed); else
    // back to needs-creds.
    (async () => {
      const creds = await invoke<RedactedCreds | null>(
        "load_broker_credentials",
      );
      if (!creds) {
        setPhase({ kind: "needs-creds" });
        return;
      }
      // Try rebooting the connection in case credentials changed.
      setPhase({ kind: "connecting" });
      try {
        await invoke("rithmic_disconnect").catch(() => {});
        await invoke<RithmicStatus>("rithmic_login_from_vault");
        setPhase({ kind: "ready", creds });
      } catch (e) {
        setPhase({ kind: "failed", error: String(e) });
      }
    })();
  }, []);

  if (phase.kind === "checking") {
    return (
      <div className="rithmic-footprint">
        <div className="rf-splash">Loading saved broker configuration…</div>
      </div>
    );
  }

  if (phase.kind === "needs-creds") {
    return (
      <div className="rithmic-footprint">
        <header className="rf-header">
          <h1>OrderflowV2 — Rithmic Live</h1>
        </header>
        <BrokerSettings onSaved={onCredsSaved} />
      </div>
    );
  }

  if (phase.kind === "settings") {
    return (
      <div className="rithmic-footprint">
        <header className="rf-header">
          <h1>OrderflowV2 — Rithmic Live</h1>
        </header>
        <BrokerSettings onSaved={onCredsSaved} onClose={onCloseSettings} />
      </div>
    );
  }

  if (phase.kind === "connecting") {
    return (
      <div className="rithmic-footprint">
        <div className="rf-splash">Connecting to broker…</div>
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <div className="rithmic-footprint">
        <header className="rf-header">
          <h1>OrderflowV2 — Rithmic Live</h1>
        </header>
        <div className="rf-failed">
          <h2>Connection failed</h2>
          <pre className="rf-failed-msg">{phase.error}</pre>
          <div className="rf-failed-actions">
            <button type="button" onClick={onOpenSettings}>
              Edit broker settings
            </button>
            <button
              type="button"
              onClick={async () => {
                const creds = await invoke<RedactedCreds | null>(
                  "load_broker_credentials",
                );
                if (!creds) {
                  setPhase({ kind: "needs-creds" });
                  return;
                }
                setPhase({ kind: "connecting" });
                try {
                  await invoke<RithmicStatus>("rithmic_login_from_vault");
                  setPhase({ kind: "ready", creds });
                } catch (e) {
                  setPhase({ kind: "failed", error: String(e) });
                }
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase.kind === "ready"
  return <FootprintLive creds={phase.creds} onOpenSettings={onOpenSettings} />;
}

/** Map a tick-size hint to a sensible display decimals count. */
function decimalsFromTick(tick: number | undefined): number {
  if (!tick || !isFinite(tick)) return 2;
  if (tick >= 1) return 0;
  // Count fractional digits — works for 0.25 → 2, 0.005 → 3, 0.001 → 3.
  const text = tick.toString();
  const dot = text.indexOf(".");
  if (dot === -1) return 2;
  return Math.min(8, text.length - dot - 1);
}

function FootprintLive({
  creds,
  onOpenSettings,
}: {
  creds: RedactedCreds;
  onOpenSettings: () => void;
}) {
  const [status, setStatus] = useState<RithmicStatus>(EMPTY_STATUS);
  const [symbol, setSymbol] = useState("MNQM6");
  const [exchange, setExchange] = useState("CME");
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>("5s");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canvasHandle = useRef<FootprintCanvasHandle>(null);
  const runnerRef = useRef<IndicatorsRunner | null>(null);

  const fullSymbol = useMemo(() => `${symbol}.${exchange}`, [symbol, exchange]);

  // Derive the price decimals from the catalog tick hint. Auto mode
  // in the renderer falls back to this prop; numeric override in
  // settings still wins.
  const priceDecimals = useMemo(() => {
    const def = findSymbol("rithmic", symbol);
    return decimalsFromTick(def?.tickSizeHint);
  }, [symbol]);

  // Subscribe field-by-field to the settings store (same pattern as
  // CryptoFootprint) so the renderer-effect only fires when a flag
  // it actually consumes changes.
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
  const showStackedImbalances = useFootprintSettingsStore(
    (s) => s.showStackedImbalances,
  );
  const showNakedPOCs = useFootprintSettingsStore((s) => s.showNakedPOCs);
  const showUnfinishedAuctions = useFootprintSettingsStore(
    (s) => s.showUnfinishedAuctions,
  );
  const imbalanceRatio = useFootprintSettingsStore((s) => s.imbalanceRatio);
  const imbalanceMinConsecutive = useFootprintSettingsStore(
    (s) => s.imbalanceMinConsecutive,
  );

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
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
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
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
    ],
  );

  useEffect(() => {
    canvasHandle.current?.applySettings(rendererSettings);
  }, [rendererSettings]);

  // Indicators runner — symmetric to CryptoFootprint. Same store
  // settings drive both surfaces so user prefs follow them across
  // tabs without sync work.
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

  useEffect(() => {
    invoke<RithmicStatus>("rithmic_status")
      .then(setStatus)
      .catch((e) => console.error("rithmic_status failed:", e));
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen<FootprintBar>("footprint-update", (event) => {
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
      const next = await invoke<RithmicStatus>("rithmic_subscribe", {
        args: { symbol, exchange },
      });
      setStatus(next);
      setBars(new Map());
      const initial = await invoke<FootprintBar[]>("rithmic_get_bars", {
        args: { symbol: fullSymbol, timeframe, nBars: MAX_BARS },
      });
      const seeded = new Map<number, FootprintBar>();
      for (const bar of initial) seeded.set(bar.bucketTsNs, bar);
      setBars(seeded);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [symbol, exchange, fullSymbol, timeframe]);

  const handleUnsubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<RithmicStatus>("rithmic_unsubscribe", {
        args: { symbol, exchange },
      });
      setStatus(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [symbol, exchange]);

  const sortedBars = useMemo(
    () => [...bars.values()].sort((a, b) => b.bucketTsNs - a.bucketTsNs),
    [bars],
  );

  // Reschedule the indicator pipeline whenever bars or compute-
  // affecting settings change. Visibility-only flags don't trigger
  // recompute (renderer uses cached IndicatorsResult).
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
  ]);

  // Picker selects a symbol; the catalog entry tells us which CME
  // group venue to subscribe through (CME / NYMEX / COMEX / CBOT).
  // If a user types a custom symbol that isn't in the catalog the
  // exchange stays whatever it was — usually CME, which is fine for
  // the index futures most operators trade.
  const handleSymbolPicked = useCallback((nextSymbol: string) => {
    setSymbol(nextSymbol);
    const def = findSymbol("rithmic", nextSymbol);
    if (def?.cmeExchange) setExchange(def.cmeExchange);
    setBars(new Map());
  }, []);

  const handleTimeframeChange = useCallback((next: SupportedTimeframe) => {
    setTimeframe(next);
    setBars(new Map());
  }, []);

  const isSubscribed = status.subscriptions.includes(fullSymbol);
  const connected = status.connected && status.loggedIn;

  return (
    <div className="rithmic-footprint">
      <FootprintStatusBar
        symbol={symbol}
        exchange={`Rithmic ${exchange}`}
        timeframe={timeframe}
        bars={sortedBars}
        connected={connected}
        busy={busy}
        priceDecimals={priceDecimals}
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
        <button
          type="button"
          onClick={onOpenSettings}
          className="cf-action-btn"
          title={`${creds.systemName} · ${creds.username}`}
        >
          Edit broker
        </button>
      </section>

      {error && <div className="rf-error">{error}</div>}

      <section className="rf-footprint">
        <div className="cf-canvas-wrap">
          <FootprintCanvas
            ref={canvasHandle}
            bars={sortedBars}
            symbol={symbol}
            timeframe={timeframe}
            priceDecimals={priceDecimals}
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
        exchange="rithmic"
        currentSymbol={symbol}
        onSelect={handleSymbolPicked}
        onClose={() => setPickerOpen(false)}
      />

      <AdvancedSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
