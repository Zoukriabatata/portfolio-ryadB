// BridgeFootprint.tsx
// =============================================================
// Orderflow chart fed by the NinjaTrader TCP bridge, with the
// full RithmicFootprint feature set wired in (drawings toolbar,
// indicators, sim trade panel, advanced settings modal, status
// bar, magnet toggle, timezone cycle).
//
// The bridge bypasses Rithmic auth + subscribe + fetch_history
// because the NinjaScript indicator sends:
//   1. an `M` header with symbol + tick_size,
//   2. the full historical batch on connect,
//   3. an `E` sentinel,
//   4. then live `L,...` lines.
//
// All bars are written to the same FootprintEngine the native
// Rithmic adapter uses, so `footprint-update` events fan out
// exactly as in the Rithmic flow. We additionally pull a
// `rithmic_get_bars` snapshot after the Live transition to
// recover any bar-update events the broadcast channel evicted
// during the 700k-tick replay burst.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  FootprintCanvas,
  type FootprintCanvasHandle,
} from "./footprint/FootprintCanvas";
import {
  FootprintToolbar,
  IconCrosshair,
  IconLong,
  IconShort,
  IconHLine,
  IconHRay,
  IconTrend,
  IconRect,
  IconText,
  IconRuler,
  IconTrash,
  type FootprintTool,
} from "./footprint/FootprintToolbar";
import {
  TimeframePills,
  type SupportedTimeframe,
} from "./footprint/TimeframePills";
import { FootprintStatusBar } from "./footprint/FootprintStatusBar";
import { MagnetToggle } from "./footprint/MagnetToggle";
import { IndicatorsButton } from "./footprint/IndicatorsButton";
import { AdvancedSettingsModal } from "./footprint/AdvancedSettingsModal";
import { SimTradePanel } from "./sim/SimTradePanel";
import { QuickTradePanel } from "./sim/QuickTradePanel";
import { useSimTicker } from "../lib/sim/useSimTicker";
import { useSimPositionOverlay } from "../lib/sim/useSimPositionOverlay";
import { useSimVoice } from "../lib/sim/useSimVoice";
import { useToolDrawingsStore } from "../stores/useToolDrawingsStore";
import {
  useFootprintSettingsStore,
  type TimezoneKey,
} from "../stores/useFootprintSettingsStore";
import { useAlertWatcher } from "../hooks/useAlertWatcher";
import type { FootprintRendererSettings } from "../lib/footprint/FootprintCanvasRenderer";
import { IndicatorsRunner } from "../lib/footprint/indicatorsAsync";
import { getContractSpec } from "../lib/sim/contractSpecs";
import type { FootprintBar } from "./FootprintBarView";
import "./RithmicFootprint.css";

type BridgeStatus = {
  connected: boolean;
  host: string;
  port: number;
};

// Mirror of the Rust `BridgeConnState` enum — serde tag="kind".
type BridgeConnState =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "receivingHistory"; received: number; total: number }
  | { kind: "live"; symbol: string; tickSize: number }
  | { kind: "reconnecting"; inMs: number }
  | { kind: "drift"; symbol: string; received: number; expected: number }
  | { kind: "misconfigured"; symbol: string; reason: string }
  | { kind: "dailyVolume"; symbol: string; volume: number };

// Drift info captured from `bridge-state` Drift events, surfaced as a
// warning badge next to the timeframe pills. Indicates the historical
// tick count NT announced (`expected`) did not match what we received
// (`received`), so tick-based bars (100T) won't be bar-aligned with NT.
type DriftInfo = { symbol: string; received: number; expected: number };

// Misconfig info captured from `bridge-state` Misconfigured events.
// Currently the only reason emitted is `"no-seq"` (NT chart isn't on
// Tick Replay or OrderflowBridge.cs is older than v2). Surfaced as a
// persistent orange banner — unlike Drift, the user can fix this
// upstream and reconnect.
type MisconfigInfo = { symbol: string; reason: string };

const DEFAULT_TIMEFRAME: SupportedTimeframe = "1m";
const SEED_BARS = 5000;

const TZ_CYCLE: TimezoneKey[] = [
  "LCL",
  "UTC",
  "NY",
  "CHI",
  "LON",
  "PAR",
  "TYO",
];
const TZ_LABELS: Record<TimezoneKey, string> = {
  LCL: "Local",
  UTC: "UTC",
  NY: "New York",
  CHI: "Chicago",
  LON: "London",
  PAR: "Paris",
  TYO: "Tokyo",
};

function decimalsFromTick(tick: number | undefined): number {
  if (!tick || !isFinite(tick)) return 2;
  if (tick >= 1) return 0;
  const text = tick.toString();
  const dot = text.indexOf(".");
  if (dot === -1) return 2;
  return Math.min(8, text.length - dot - 1);
}

export function BridgeFootprint({
  onSwitchToRithmic,
}: {
  onSwitchToRithmic: () => void;
}) {
  // ── Connection / data state ───────────────────────────────
  const [connState, setConnState] = useState<BridgeConnState>({
    kind: "disconnected",
  });
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [timeframe, setTimeframe] =
    useState<SupportedTimeframe>(DEFAULT_TIMEFRAME);
  const [symbol, setSymbol] = useState<string>("");
  const [tickSize, setTickSize] = useState<number>(0.25);
  const [error, setError] = useState<string | null>(null);
  // Latest drift warning from the bridge (null when count matched or
  // no end-of-history yet). Reset on every new backfill.
  const [drift, setDrift] = useState<DriftInfo | null>(null);
  // Latest misconfig warning from the bridge (null when the C# side
  // is on the v2 wire format). Reset on every new backfill.
  const [misconfig, setMisconfig] = useState<MisconfigInfo | null>(null);
  // Latest exchange-pushed session volume from the C# bridge — the
  // authoritative running daily counter NT's Market Analyzer reads,
  // independent of how many ticks we ingested. Null until the first
  // V wire line arrives (typically within a few seconds of going live).
  const [brokerDailyVolume, setBrokerDailyVolume] = useState<number | null>(
    null,
  );

  // ── UI state ──────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [simPanelOpen, setSimPanelOpen] = useState(true);

  // Sim ticker — feeds the sim trading store with live closes.
  useSimTicker();
  // Sim voice — plays order-filled / closed sounds. Mounted at this
  // level (not inside SimTradePanel) so audio cues fire whether the
  // dock is open OR collapsed (and the user is trading via the
  // floating QuickTradePanel).
  useSimVoice();

  // ── Refs ──────────────────────────────────────────────────
  // Per-timeframe bar cache (mirror of RithmicFootprint's pattern).
  const barsCacheRef = useRef<Map<string, Map<number, FootprintBar>>>(
    new Map(),
  );
  const currentTfRef = useRef<SupportedTimeframe>(DEFAULT_TIMEFRAME);
  // Mirror of `symbol` for the footprint-update listener. Without
  // it the listener would capture the empty initial symbol forever
  // and accept every bar (which is what we explicitly want to
  // avoid post-2026-05-26 to prevent stale-symbol pollution).
  const symbolRef = useRef<string>("");
  const canvasHandle = useRef<FootprintCanvasHandle>(null);
  const runnerRef = useRef<IndicatorsRunner | null>(null);
  // Snapshot guard — fetch each (symbol, timeframe) pair once per
  // session via rithmic_get_bars (engine-direct), then rely on the
  // live footprint-update stream.

  // Mirror sim position into the chart TradeDrawing layer.
  useSimPositionOverlay(symbol);

  // ── Settings store (renderer flags + colors + timezone) ────
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
  const setTimezone = useFootprintSettingsStore((s) => s.set);
  const toggleSetting = useFootprintSettingsStore((s) => s.toggle);
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

  // ── Drawing tools store ────────────────────────────────────
  const activeTool = useToolDrawingsStore((s) => s.activeTool);
  const setActiveTool = useToolDrawingsStore((s) => s.setActiveTool);
  const clearDrawingsForSymbol = useToolDrawingsStore((s) => s.clearForSymbol);
  const drawingsForSymbolCount = useToolDrawingsStore(
    (s) =>
      s.drawings.filter((d) => d.symbol === symbol).length +
      s.lineDrawings.filter((d) => d.symbol === symbol).length,
  );

  // ── Connect to bridge on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await invoke<BridgeStatus>("bridge_connect", {
          args: { host: null, port: null },
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Subscribe to bridge-state events ──────────────────────
  // When `Live` arrives with a DIFFERENT symbol than what we were
  // tracking, the user switched the NT chart's instrument. Wipe the
  // per-timeframe bar cache + snapshot guard so the new symbol's
  // bars don't render on top of the old one's footprint.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen<BridgeConnState>("bridge-state", (event) => {
      const s = event.payload;
      // Drift events don't replace the current visible state (still
      // "live"); they just surface the badge. Skip the setConnState
      // for that variant so e.g. "LIVE" stays the displayed state.
      if (s.kind !== "drift") {
        setConnState(s);
      }
      // A fresh backfill is starting (M-header → first ReceivingHistory).
      // Wipe the local view so the new history fully REPLACES whatever a
      // previous session left here — mirrors the engine-side clear_symbol.
      // Without this, a reconnect (or re-applied indicator) layers the new
      // backfill under stale cached bars and leaves a mid-chart gap.
      if (s.kind === "receivingHistory" && s.received === 0) {
        barsCacheRef.current.clear();
        setBars(new Map());
        setDrift(null);
        setMisconfig(null);
        // Reset broker daily volume too — a fresh backfill means a
        // (potentially) different symbol; we want to show the stale
        // value only until the next V update arrives.
        setBrokerDailyVolume(null);
        console.info("Bridge: new backfill — cache reset");
      }
      if (s.kind === "dailyVolume") {
        setBrokerDailyVolume(s.volume);
      }
      if (s.kind === "drift") {
        setDrift({
          symbol: s.symbol,
          received: s.received,
          expected: s.expected,
        });
        console.warn(
          `Bridge drift: received ${s.received.toLocaleString()} ticks, expected ${s.expected.toLocaleString()} for ${s.symbol}. 100T bars may not align with NT.`,
        );
      }
      if (s.kind === "misconfigured") {
        setMisconfig({ symbol: s.symbol, reason: s.reason });
        console.warn(
          `Bridge misconfigured (${s.reason}) for ${s.symbol}. Tick-based timeframes (100T) won't match NT until the upstream is fixed.`,
        );
      }
      if (s.kind === "live") {
        setSymbol((prev) => {
          if (prev && prev !== s.symbol) {
            // Symbol change — reset every per-symbol view.
            barsCacheRef.current.clear();
            setBars(new Map());
            console.info(
              `Bridge: symbol changed ${prev} → ${s.symbol} — cache reset`,
            );
          }
          return s.symbol;
        });
        setTickSize(s.tickSize);
      }
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
  }, []);

  // ── footprint-update-batch listener (rAF-coalesced) ───────
  // Backend coalesces bars on a 16ms window and ships them as
  // `Vec<FootprintBar>` in a single Tauri event. We apply each bar
  // to the per-tf cache then schedule a single RAF flush per batch,
  // so a batch of 50 bars triggers exactly one React state update.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    let rafScheduled = false;

    const flush = () => {
      rafScheduled = false;
      const tf = currentTfRef.current;
      const tfMap = barsCacheRef.current.get(tf);
      setBars(tfMap ? new Map(tfMap) : new Map());
    };

    const applyBar = (bar: FootprintBar): boolean => {
      // STRICT symbol filter — only accept bars for the symbol the
      // bridge has announced. Without this, a stale Rithmic-native
      // adapter or a previous bridge session whose ticks are still
      // draining through the shared FootprintEngine can pollute our
      // cache. While the bridge session hasn't yet reported a symbol
      // (M header not arrived), drop EVERYTHING.
      if (!symbolRef.current) return false;
      if (bar.symbol !== symbolRef.current) return false;
      let tfMap = barsCacheRef.current.get(bar.timeframe);
      if (!tfMap) {
        tfMap = new Map();
        barsCacheRef.current.set(bar.timeframe, tfMap);
      }
      tfMap.set(bar.bucketTsNs, bar);
      return bar.timeframe === currentTfRef.current;
    };

    void listen<FootprintBar[]>("footprint-update-batch", (event) => {
      let touchedCurrentTf = false;
      for (const bar of event.payload) {
        if (applyBar(bar)) touchedCurrentTf = true;
      }
      if (touchedCurrentTf && !rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flush);
      }
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
  }, []);

  // ── Keep currentTfRef in sync + reflect bars on TF switch ─
  useEffect(() => {
    currentTfRef.current = timeframe;
    const tfMap = barsCacheRef.current.get(timeframe);
    setBars(tfMap ? new Map(tfMap) : new Map());
  }, [timeframe]);

  // Mirror the symbol state into the ref the listener reads.
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  // ── Engine-direct snapshot once Live (recovers bars the
  // footprint-update broadcast channel evicted during the
  // historical burst — engine.bars has the canonical state).
  //
  // Re-fetch on EVERY (symbol, timeframe) change rather than once
  // per key. The "Live" state is sent by the bridge reader the
  // moment EndOfHistory arrives on the wire — the engine still has
  // 700k+ ticks queued in its broadcast receiver at that point and
  // its bars are partial. The default-timeframe snapshot taken
  // right then is the one that's most stale; without a re-fetch
  // when the user comes back to it (after switching away and
  // letting the engine catch up), 1m would stay frozen on the
  // partial view while other TFs look fine. The "take larger" merge
  // below makes repeat snapshots safe — they can only grow the
  // cached bars, never shrink them.
  //
  // We also schedule a delayed re-fetch ~3s after first reaching
  // Live so the default TF auto-heals even if the user never
  // switches away.
  useEffect(() => {
    if (connState.kind !== "live") return;
    if (!symbol) return;

    let cancelled = false;
    const fetchSnapshot = async () => {
      try {
        const snap = await invoke<FootprintBar[]>("rithmic_get_bars", {
          args: { symbol, timeframe, nBars: SEED_BARS },
        });
        if (cancelled) return;
        let tfMap = barsCacheRef.current.get(timeframe);
        if (!tfMap) {
          tfMap = new Map();
          barsCacheRef.current.set(timeframe, tfMap);
        }
        for (const bar of snap) {
          const existing = tfMap.get(bar.bucketTsNs);
          if (
            !existing ||
            existing.totalVolume < bar.totalVolume ||
            existing.tradeCount < bar.tradeCount
          ) {
            tfMap.set(bar.bucketTsNs, bar);
          }
        }
        setBars(new Map(tfMap));
        console.info(
          `Bridge: snapshot ${snap.length} bars for ${symbol} ${timeframe}`,
        );
      } catch (e) {
        console.error("rithmic_get_bars failed:", e);
      }
    };

    void fetchSnapshot();
    // Catch-up snapshot — at +3s the engine has typically drained
    // the backfill queue, so this picks up everything the first
    // call missed.
    const retryId = window.setTimeout(() => {
      if (!cancelled) void fetchSnapshot();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(retryId);
    };
  }, [connState.kind, symbol, timeframe]);

  // ── Renderer settings ─────────────────────────────────────
  const rendererSettings: FootprintRendererSettings = useMemo(
    () => ({
      showGrid,
      showCrosshair,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsOverride:
        priceDecimalsMode === "auto"
          ? null
          : parseInt(priceDecimalsMode, 10),
      tickSizeOverride: tickSize > 0 ? tickSize : null,
      volumeFormat,
      magnetMode,
      timezone,
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
      showVwapIndicator,
      showClusterStat,
      showBarDelta,
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
      tickSize,
      showGrid,
      showCrosshair,
      showPocSession,
      showPocBar,
      showVolumeTooltip,
      showOhlcHeader,
      priceDecimalsMode,
      volumeFormat,
      magnetMode,
      timezone,
      showStackedImbalances,
      showNakedPOCs,
      showUnfinishedAuctions,
      showVwapIndicator,
      showClusterStat,
      showBarDelta,
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

  useEffect(() => {
    canvasHandle.current?.applySettings(rendererSettings);
  }, [rendererSettings]);

  // ── Indicators runner ─────────────────────────────────────
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

  // ── Derived ───────────────────────────────────────────────
  const sortedBars = useMemo(
    () =>
      [...bars.values()].sort((a, b) => b.bucketTsNs - a.bucketTsNs),
    [bars],
  );

  const priceDecimals = useMemo(() => decimalsFromTick(tickSize), [tickSize]);

  // Human-readable contract label looked up from the catalog.
  // "MNQ 06-26" → "Micro E-mini Nasdaq". Falls back to the raw
  // bridge symbol when the root isn't in the catalog (custom /
  // exotic instruments still display, just without the long name).
  const contractLabel = useMemo(() => {
    if (!symbol) return "";
    const spec = getContractSpec(symbol);
    // getContractSpec returns the root as `name` when unknown — in
    // that case avoid the noisy "X · X" duplication.
    if (spec.name === spec.root) return symbol;
    return `${spec.name} · ${symbol}`;
  }, [symbol]);

  // Price alerts on the live tick (same hook as Rithmic).
  useAlertWatcher(sortedBars[0]?.close, symbol);

  // Reschedule indicators when bars / settings change.
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

  // ── Drawings toolbar ──────────────────────────────────────
  const tools: FootprintTool[] = useMemo(
    () => [
      {
        id: "crosshair",
        label: showCrosshair ? "Hide crosshair" : "Show crosshair",
        icon: <IconCrosshair />,
        active: showCrosshair,
        onClick: () => toggleSetting("showCrosshair"),
      },
      {
        id: "long",
        label:
          activeTool === "LONG"
            ? "Cancel LONG placement"
            : "Place LONG position (click on chart)",
        icon: <IconLong />,
        active: activeTool === "LONG",
        onClick: () => setActiveTool(activeTool === "LONG" ? null : "LONG"),
      },
      {
        id: "short",
        label:
          activeTool === "SHORT"
            ? "Cancel SHORT placement"
            : "Place SHORT position (click on chart)",
        icon: <IconShort />,
        active: activeTool === "SHORT",
        onClick: () => setActiveTool(activeTool === "SHORT" ? null : "SHORT"),
      },
      {
        id: "h-line",
        label:
          activeTool === "h-line"
            ? "Cancel horizontal line"
            : "Draw horizontal line",
        icon: <IconHLine />,
        active: activeTool === "h-line",
        onClick: () =>
          setActiveTool(activeTool === "h-line" ? null : "h-line"),
      },
      {
        id: "h-ray",
        label:
          activeTool === "h-ray"
            ? "Cancel horizontal ray"
            : "Draw horizontal ray",
        icon: <IconHRay />,
        active: activeTool === "h-ray",
        onClick: () => setActiveTool(activeTool === "h-ray" ? null : "h-ray"),
      },
      {
        id: "trend",
        label:
          activeTool === "trend" ? "Cancel trend line" : "Draw trend line",
        icon: <IconTrend />,
        active: activeTool === "trend",
        onClick: () => setActiveTool(activeTool === "trend" ? null : "trend"),
      },
      {
        id: "rect",
        label:
          activeTool === "rect" ? "Cancel rectangle" : "Draw rectangle",
        icon: <IconRect />,
        active: activeTool === "rect",
        onClick: () => setActiveTool(activeTool === "rect" ? null : "rect"),
      },
      {
        id: "text",
        label:
          activeTool === "text"
            ? "Cancel text annotation"
            : "Add text annotation",
        icon: <IconText />,
        active: activeTool === "text",
        onClick: () => setActiveTool(activeTool === "text" ? null : "text"),
      },
      {
        id: "ruler",
        label: activeTool === "ruler" ? "Cancel ruler" : "Measure",
        icon: <IconRuler />,
        active: activeTool === "ruler",
        onClick: () => setActiveTool(activeTool === "ruler" ? null : "ruler"),
      },
      {
        id: "trash",
        label:
          drawingsForSymbolCount > 0
            ? `Delete all ${drawingsForSymbolCount} drawing${drawingsForSymbolCount > 1 ? "s" : ""} on ${symbol}`
            : "No drawings to delete",
        icon: <IconTrash />,
        active: false,
        position: "bottom",
        onClick: () => {
          if (drawingsForSymbolCount > 0) {
            clearDrawingsForSymbol(symbol);
          }
        },
      },
    ],
    [
      showCrosshair,
      toggleSetting,
      activeTool,
      setActiveTool,
      drawingsForSymbolCount,
      clearDrawingsForSymbol,
      symbol,
    ],
  );

  // ── Callbacks ─────────────────────────────────────────────
  const cycleTimezone = useCallback(() => {
    const idx = TZ_CYCLE.indexOf(timezone);
    const next = TZ_CYCLE[(idx + 1) % TZ_CYCLE.length];
    setTimezone("timezone", next);
  }, [timezone, setTimezone]);

  const handleTimeframeChange = useCallback((next: SupportedTimeframe) => {
    setTimeframe(next);
  }, []);

  // Diagnostic CSV export — copies the visible bars to clipboard in
  // a format directly comparable to NinjaTrader's footprint export
  // ("Save as" on the OFA indicator). Each row = one bar; the
  // `levels` column lists every traded price with its bid/ask split.
  // Lets us isolate whether a NT vs us mismatch is data (different
  // ticks ingested) or visual (same data, different rendering).
  const handleCopyDiagnostic = useCallback(async () => {
    if (sortedBars.length === 0) {
      console.warn("Diagnostic: no bars to export");
      return;
    }
    // sortedBars is newest-first; flip to oldest-first for CSV.
    const rows = [...sortedBars].reverse();
    const header =
      "ts_utc,ts_local,timeframe,open,high,low,close,vol,delta,trades,n_levels,levels_detail";
    const lines = rows.map((bar) => {
      const ms = bar.bucketTsNs / 1_000_000;
      const utc = new Date(ms).toISOString();
      const local = new Date(ms).toLocaleString("fr-FR", {
        timeZone: "America/New_York",
        hour12: false,
      });
      // Sort levels high → low to mirror how footprint cells stack
      // visually in NT. Each level: `price=B<buy>/S<sell>`.
      const levels = [...bar.levels]
        .sort((a, b) => b.price - a.price)
        .map(
          (l) =>
            `${l.price.toFixed(2)}=B${l.buyVolume.toFixed(0)}/S${l.sellVolume.toFixed(0)}`,
        )
        .join("|");
      return [
        utc,
        local,
        bar.timeframe,
        bar.open.toFixed(2),
        bar.high.toFixed(2),
        bar.low.toFixed(2),
        bar.close.toFixed(2),
        bar.totalVolume.toFixed(0),
        bar.totalDelta.toFixed(0),
        bar.tradeCount.toString(),
        bar.levels.length.toString(),
        `"${levels}"`,
      ].join(",");
    });
    const csv = [header, ...lines].join("\n");
    // Trigger a browser-style download so the user gets a real file
    // on disk (clipboard is invisible and confusing). Works inside
    // the Tauri webview without needing tauri-plugin-fs permissions.
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      a.href = url;
      a.download = `orderflow-diag-${symbol || "nosym"}-${timeframe}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.info(
        `Diagnostic: ${rows.length} bars exported (${csv.length} chars) as ${a.download}`,
      );
    } catch (e) {
      console.error("Diagnostic: download failed:", e);
    }
  }, [sortedBars, symbol, timeframe]);

  const onDisconnect = useCallback(async () => {
    try {
      await invoke("bridge_disconnect");
    } catch (e) {
      console.error("bridge_disconnect failed:", e);
    }
    onSwitchToRithmic();
  }, [onSwitchToRithmic]);

  const connected = connState.kind === "live";
  const busy =
    connState.kind === "connecting" ||
    connState.kind === "receivingHistory" ||
    connState.kind === "reconnecting";

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="rithmic-footprint">
      <FootprintStatusBar
        symbol={symbol || "(waiting)"}
        exchange={
          contractLabel
            ? `NinjaTrader Bridge · ${contractLabel.replace(`· ${symbol}`, "").trim()}`
            : "NinjaTrader Bridge"
        }
        timeframe={timeframe}
        bars={sortedBars}
        connected={connected}
        busy={busy}
        priceDecimals={priceDecimals}
        brokerDailyVolume={brokerDailyVolume}
      />

      <BridgeStatusBanner state={connState} misconfig={misconfig} />

      {error && <div className="rf-error">{error}</div>}

      <section className="cf-controls">
        <span
          className="cf-symbol-btn"
          title={
            contractLabel
              ? `${contractLabel} — locked to the NinjaTrader chart`
              : "Symbol is locked to the NinjaTrader chart"
          }
          style={{ cursor: "default", opacity: 0.85 }}
        >
          {symbol || "—"}
        </span>
        <TimeframePills
          value={timeframe}
          onChange={handleTimeframeChange}
          disabled={false}
        />
        <button
          type="button"
          onClick={handleCopyDiagnostic}
          title={`Copy current ${timeframe} bars to clipboard as CSV. Paste alongside NT's footprint "Save as" export to diff OHLC / volume / per-cell bid-ask numbers row-by-row.`}
          aria-label="Copy diagnostic CSV to clipboard"
          style={{
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 600,
            color: "#a5b4fc",
            background: "rgba(99, 102, 241, 0.10)",
            border: "1px solid rgba(99, 102, 241, 0.4)",
            borderRadius: 4,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          ⬇ DIAG
        </button>
        {drift && (
          <span
            title={`NinjaTrader announced ${drift.expected.toLocaleString()} historical ticks for ${drift.symbol}, but only ${drift.received.toLocaleString()} were received. 100T bars may not align bar-for-bar with NT's chart for this session — reconnect to retry.`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "#fbbf24",
              background: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.4)",
              borderRadius: 4,
              cursor: "help",
            }}
            aria-label="Tick count drift warning"
          >
            ⚠ drift {(drift.expected - drift.received).toLocaleString()}
          </span>
        )}
        <IndicatorsButton />
        <MagnetToggle />
        <button
          type="button"
          className="cf-icon-btn"
          onClick={cycleTimezone}
          title={`Time axis timezone: ${TZ_LABELS[timezone]} — click to switch`}
          aria-label={`Time axis timezone (${TZ_LABELS[timezone]})`}
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
            minWidth: 44,
          }}
        >
          {timezone}
        </button>
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
          onClick={onDisconnect}
          className="cf-action-btn"
          title="Disconnect bridge and switch back to Rithmic native"
        >
          Switch to Rithmic native
        </button>
      </section>

      <section className="rf-footprint">
        <div className="footprint-workspace">
          <FootprintToolbar tools={tools} />
          <div className="cf-canvas-wrap" style={{ position: "relative" }}>
            <FootprintCanvas
              ref={canvasHandle}
              bars={sortedBars}
              symbol={symbol}
              timeframe={timeframe}
              priceDecimals={priceDecimals}
              onOpenSettings={() => setSettingsOpen(true)}
              bare
            />
            <QuickTradePanel symbol={symbol} />
          </div>
          <div
            className={`rf-sim-dock ${simPanelOpen ? "rf-sim-dock-open" : "rf-sim-dock-closed"}`}
            onClick={
              !simPanelOpen ? () => setSimPanelOpen(true) : undefined
            }
            role={!simPanelOpen ? "button" : undefined}
            title={!simPanelOpen ? "Show sim panel" : undefined}
          >
            <button
              type="button"
              className="rf-sim-dock-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setSimPanelOpen((v) => !v);
              }}
              aria-label={simPanelOpen ? "Hide sim panel" : "Show sim panel"}
              title={simPanelOpen ? "Hide sim panel" : "Show sim panel"}
            >
              {simPanelOpen ? "›" : "‹"}
            </button>
            {simPanelOpen && <SimTradePanel symbol={symbol} />}
          </div>
        </div>
      </section>

      <AdvancedSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function describeMisconfig(reason: string): string {
  switch (reason) {
    case "no-seq":
      return "OrderflowBridge.cs is older than v2 (no seq counter on the wire) or NT Tick Replay is OFF — 100T bars won't align with NT's chart. Update the indicator and toggle Tick Replay ON in NT, then reconnect.";
    default:
      return `Unknown misconfig reason: ${reason}`;
  }
}

function BridgeStatusBanner({
  state,
  misconfig,
}: {
  state: BridgeConnState;
  misconfig: MisconfigInfo | null;
}) {
  const text = useMemo<string | null>(() => {
    switch (state.kind) {
      case "disconnected":
        return "Bridge: disconnected";
      case "connecting":
        return "Bridge: connecting to NinjaTrader on 127.0.0.1:7272…";
      case "receivingHistory": {
        const pct =
          state.total > 0
            ? Math.round((state.received / state.total) * 100)
            : 0;
        return `Replaying history: ${state.received.toLocaleString()} / ${state.total.toLocaleString()} (${pct}%)`;
      }
      case "live":
        // FootprintStatusBar carries the LIVE indicator already.
        return null;
      case "reconnecting":
        return `Bridge dropped. Reconnecting in ${Math.round(state.inMs / 1000)}s…`;
      case "drift":
        // Surfaced by the dedicated drift badge next to the
        // timeframe pills — nothing to add here.
        return null;
      case "misconfigured":
        // Handled by the persistent banner above (driven by the
        // `misconfig` prop captured higher up); nothing to add.
        return null;
      case "dailyVolume":
        // Exchange-pushed session volume — surfaced inside the
        // FootprintStatusBar alongside the bar-summed counter,
        // not in this top banner.
        return null;
      default: {
        // Exhaustiveness check — if a new variant is added to
        // `BridgeConnState`, TypeScript will fail this assignment.
        const _exhaustive: never = state;
        return _exhaustive;
      }
    }
  }, [state]);

  // Persistent misconfig banner — shown even when state is "live"
  // because the user has to fix NT upstream and reconnect; muting
  // this on live would let a silently wrong footprint stand.
  if (misconfig) {
    return (
      <div
        style={{
          padding: "8px 16px",
          background: "rgba(251, 191, 36, 0.10)",
          borderBottom: "1px solid rgba(251, 191, 36, 0.4)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          color: "#fbbf24",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#f59e0b",
            flexShrink: 0,
          }}
        />
        <span>
          <b>NT misconfigured</b> ({misconfig.symbol}) — {describeMisconfig(misconfig.reason)}
        </span>
      </div>
    );
  }

  if (text === null) return null;

  const dotColor = (() => {
    switch (state.kind) {
      case "receivingHistory":
        return "#f59e0b";
      case "reconnecting":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  })();

  return (
    <div
      style={{
        padding: "8px 16px",
        background: "#1a1a1a",
        borderBottom: "1px solid #2a2a2a",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: "#e5e7eb",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span>{text}</span>
    </div>
  );
}
