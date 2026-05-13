import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BrokerSettings } from "./BrokerSettings";
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
import { useToolDrawingsStore } from "../stores/useToolDrawingsStore";
import { SymbolPickerModal } from "./footprint/SymbolPickerModal";
import {
  TimeframePills,
  type SupportedTimeframe,
} from "./footprint/TimeframePills";
// ZoomControls removed 2026-05-10 — replaced by the advanced wheel/drag
// navigation (wheel = XY zoom, Shift = Y, Ctrl = X, drag on axes = zoom).
// import { ZoomControls } from "./footprint/ZoomControls";
import { FootprintStatusBar } from "./footprint/FootprintStatusBar";
import { MagnetToggle } from "./footprint/MagnetToggle";
import { IndicatorsButton } from "./footprint/IndicatorsButton";
import { AdvancedSettingsModal } from "./footprint/AdvancedSettingsModal";
import {
  useFootprintSettingsStore,
  type TimezoneKey,
} from "../stores/useFootprintSettingsStore";
import { useFootprintBarsCacheStore } from "../stores/useFootprintBarsCacheStore";
import { useAlertWatcher } from "../hooks/useAlertWatcher";
import type { FootprintRendererSettings } from "../lib/footprint/FootprintCanvasRenderer";
import { IndicatorsRunner } from "../lib/footprint/indicatorsAsync";
import { findSymbol } from "../lib/footprint/symbols";
import "./RithmicFootprint.css";
import "./footprint/CryptoFootprintNav.css";

// Mirror of TickReplayProbeResult on the Rust side (history_probe.rs).
// Surface enough for the UI badge — frames seen, Apex rp_codes, latency.
type TickProbeResult = {
  framesSeen: number;
  barsWithData: number;
  rpCodes: string[];
  elapsedMs: number;
  error: string | null;
};

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

// Per-timeframe cap on the React-side bar Map. Sized to cover ~24h
// at each grain (plus a small buffer for the next session) so the
// live `footprint-update` listener can't purge today's tick-replay
// history when new bars arrive. Sub-minute TFs are live-only on the
// backend (no TickBarReplay below 1m) so they keep a modest cap.
const MAX_BARS_BY_TF: Record<SupportedTimeframe, number> = {
  "15s": 200,
  "30s": 200,
  "1m":  1500,
  "3m":  500,
  "5m":  300,
  "15m": 120,
  "1h":  48,
  "4h":  100,  // ~14 days × 6 bars/day + buffer
  "1d":  200,  // ~180 days + buffer (futures contract life)
};
// Bars requested from the live engine on subscribe. When HISTORY_PLANT
// is permissioned we'd keep this small (50) because the replay backfills
// the rest; here we deliberately ask for more so accounts WITHOUT the
// historical-replay add-on still see whatever the engine has buffered
// since the last reconnect. The engine's bar buffer is per-TF, so this
// is the upper bound across TFs — anything missing is filled from the
// route-spanning localStorage cache on subscribe.
const SEED_BARS = 2000;
// Timeframes preloaded in the background on subscribe so switching
// TFs is instant (cache-hit) instead of triggering a fresh
// HISTORY_PLANT round-trip. Order = most-used first; Apex enforces a
// single concurrent HISTORY_PLANT session per user so they run
// serially through `pendingHistoryRef`.
const PRELOAD_TFS: SupportedTimeframe[] = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"];

/** Timezone cycle order for the TZ toggle button. Local first
 *  (matches the user's natural intuition), UTC second for those
 *  who want a stable absolute reference, then common trading hubs. */
const TZ_CYCLE: TimezoneKey[] = [
  "LCL",
  "UTC",
  "NY",
  "CHI",
  "LON",
  "PAR",
  "TYO",
];
/** Human-readable label for the TZ button tooltip. */
const TZ_LABELS: Record<TimezoneKey, string> = {
  LCL: "Local",
  UTC: "UTC",
  NY: "New York",
  CHI: "Chicago",
  LON: "London",
  PAR: "Paris",
  TYO: "Tokyo",
};

/** IANA timezone for each TZ button selection. Mirrors the lookup
 *  used by `tzFormatter` in FootprintProAdapter. "LCL" = browser
 *  default (no IANA → falls back to `new Date()` semantics). */
const TZ_IANA: Partial<Record<TimezoneKey, string>> = {
  UTC: "UTC",
  NY: "America/New_York",
  CHI: "America/Chicago",
  LON: "Europe/London",
  PAR: "Europe/Paris",
  TYO: "Asia/Tokyo",
};

/** Epoch ms of midnight TODAY in the user's selected TZ. The TZ
 *  button is the source of truth — if the user is on PAR, "today"
 *  means today in Paris regardless of the OS clock. Uses
 *  Intl.DateTimeFormat to extract the local date in the target TZ,
 *  then reconstructs the UTC instant via offset arithmetic so the
 *  result stays stable across DST transitions. */
function midnightMsInTz(now: Date, tz: TimezoneKey): number {
  const ianaTz = TZ_IANA[tz];
  if (!ianaTz) {
    // LCL — use browser local exactly like the legacy code did.
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
  }
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) =>
    parts.find((p) => p.type === t)?.value ?? "0";
  const tzY = Number(get("year"));
  const tzM = Number(get("month")) - 1;
  const tzD = Number(get("day"));
  // `hour: "2-digit"` with hour12:false returns "24" for midnight on
  // some engines — normalise to 0..23.
  const tzH = Number(get("hour")) % 24;
  const tzMin = Number(get("minute"));
  const tzS = Number(get("second"));
  // The TZ-interpreted "now" expressed as if it were UTC. The diff
  // to the real UTC ms is the TZ's offset at this exact instant
  // (handles DST automatically — no manual ±1h bookkeeping).
  const tzAsUtcMs = Date.UTC(tzY, tzM, tzD, tzH, tzMin, tzS);
  const offsetMs = tzAsUtcMs - now.getTime();
  // Midnight in the target TZ = (year, month, day) at 00:00:00
  // interpreted in TZ, then shifted by -offset to land on the real
  // UTC instant.
  const midnightTzAsUtcMs = Date.UTC(tzY, tzM, tzD, 0, 0, 0);
  return midnightTzAsUtcMs - offsetMs;
}

/** TF → bar period in seconds. Module-level so the synthesis
 *  helper can read it without re-declaring the map at the call
 *  site. Mirrors TF_TO_MIN inside fetchHistoryForTimeframe. */
const TF_TO_SECONDS: Record<string, number> = {
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** Fill any gap in `tfMap` between local midnight and the first
 *  existing bar with synthetic flat-priced empty bars. Idempotent
 *  (skips slots that already exist), capped at 24h, prices each
 *  empty slot at the anchor price (= the close of the last bar
 *  before midnight if any, else the first bar's open).
 *
 *  Returns the number of bars synthesised. Mutates `tfMap` in
 *  place — the caller is responsible for calling setBars after.
 *
 *  This runs from three call sites so the timeline starts at
 *  midnight regardless of which path delivered bars first:
 *    1. After the live seed (`rithmic_get_bars`)
 *    2. After the history fetch (`rithmic_fetch_tick_history`)
 *    3. The live listener doesn't call it directly — once any of
 *       the above has filled the gap, the synth bars stay in the
 *       cache and live bars just overwrite where they overlap. */
function ensureMidnightContinuity(
  tfMap: Map<number, FootprintBar>,
  tf: string,
  localMidnightSec: number,
  symbol: string,
): number {
  const barPeriodSec = TF_TO_SECONDS[tf];
  if (!barPeriodSec || barPeriodSec <= 0) return 0;
  // 24h hard cap on synth count so a weekend / market-closed
  // scenario doesn't dump tens of thousands of placeholder bars
  // into memory.
  const maxFillSec = 24 * 60 * 60;

  // Walk the existing bars once to find:
  //   a) the first bar with bucketTsNs >= localMidnightSec
  //   b) the last bar with bucketTsNs < localMidnightSec (anchor)
  let firstAtOrAfterMidnight: FootprintBar | null = null;
  let lastBeforeMidnight: FootprintBar | null = null;
  const midnightNs = localMidnightSec * 1_000_000_000;
  for (const bar of tfMap.values()) {
    if (bar.bucketTsNs >= midnightNs) {
      if (
        !firstAtOrAfterMidnight ||
        bar.bucketTsNs < firstAtOrAfterMidnight.bucketTsNs
      ) {
        firstAtOrAfterMidnight = bar;
      }
    } else {
      if (
        !lastBeforeMidnight ||
        bar.bucketTsNs > lastBeforeMidnight.bucketTsNs
      ) {
        lastBeforeMidnight = bar;
      }
    }
  }

  // No reference at all — caller hasn't loaded anything yet.
  if (!firstAtOrAfterMidnight && !lastBeforeMidnight) return 0;

  // Anchor price: prefer the pre-midnight close (smoother
  // visual transition from yesterday's session), else the first
  // post-midnight bar's open.
  const anchorPrice = lastBeforeMidnight
    ? lastBeforeMidnight.close
    : firstAtOrAfterMidnight!.open;

  // Determine the END of the synth range:
  //   • If a bar exists at/after midnight → fill UP TO that bar (it
  //     keeps its real data).
  //   • Else → fill up to "now" using the wall clock (caller passes
  //     localMidnightSec computed from `new Date()`, so we can't
  //     access it here — instead, just synth one bar at midnight
  //     and let the live listener grow it).
  const endSec = firstAtOrAfterMidnight
    ? Math.floor(firstAtOrAfterMidnight.bucketTsNs / 1_000_000_000)
    : localMidnightSec + barPeriodSec; // single placeholder bar

  // Cap the fill window so a misconfigured midnight (e.g. several
  // days in the past from a clock skew) can't trigger an
  // unbounded loop.
  const fillSpan = endSec - localMidnightSec;
  if (fillSpan <= 0) return 0;
  if (fillSpan > maxFillSec) return 0;

  let count = 0;
  for (let t = localMidnightSec; t < endSec; t += barPeriodSec) {
    const ns = t * 1_000_000_000;
    if (tfMap.has(ns)) continue;
    tfMap.set(ns, {
      symbol,
      timeframe: tf,
      bucketTsNs: ns,
      open: anchorPrice,
      high: anchorPrice,
      low: anchorPrice,
      close: anchorPrice,
      totalVolume: 0,
      totalDelta: 0,
      tradeCount: 0,
      levels: [],
    });
    count++;
  }
  return count;
}

/** Heuristic: is CME Globex closed at `now`? Used to grade the
 *  "0 bars from Apex" log between a benign reason (weekend / daily
 *  pause) and a real bug (open market but Apex returned nothing).
 *
 *  Globex schedule (CME Group reference, MNQ/ES/NQ):
 *    • Daily pause: 16:00 → 17:00 Chicago Time (every weekday).
 *    • Weekend close: Friday 16:00 CT → Sunday 17:00 CT.
 *  Intl.DateTimeFormat with America/Chicago handles the CST/CDT
 *  DST transitions for us — no need to track the seasonal offset
 *  manually. */
function isCmeGlobexClosed(now: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    weekday: "short",
    hour: "numeric",
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (weekday === "Sat") return true;
  if (weekday === "Fri" && hour >= 16) return true;
  if (weekday === "Sun" && hour < 17) return true;
  if (hour === 16) return true; // daily pause on weekdays
  return false;
}

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
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>("1m");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  // Per-TF bar cache. Lets us preload every TF in the background once
  // on subscribe and serve TF switches from memory (no extra
  // HISTORY_PLANT round-trip). Live `footprint-update` events update
  // every TF's cache in parallel — the engine already emits one event
  // per configured TF for each tick. `bars` mirrors `barsCacheRef.current.get(timeframe)`
  // and is the single source of truth for the renderer.
  const barsCacheRef = useRef<Map<SupportedTimeframe, Map<number, FootprintBar>>>(
    new Map(),
  );
  // Mirror of `timeframe` in a ref so the live listener and async
  // history fetches can decide whether to update the render state
  // without forcing the listener to be torn down + recreated every
  // time the user switches TFs (which would drop in-flight events).
  const currentTfRef = useRef<SupportedTimeframe>("1m");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canvasHandle = useRef<FootprintCanvasHandle>(null);
  const runnerRef = useRef<IndicatorsRunner | null>(null);
  // Guards repeated history fetches: each (symbol, timeframe) combo is
  // fetched at most once per session. Prevents spamming Apex's
  // HISTORY_PLANT when the user clicks Subscribe multiple times in a
  // row (which previously left several hanging WebSocket logins).
  const historyFetchedRef = useRef<Set<string>>(new Set());
  // Auto-subscribe state — tracks the (symbol, exchange) currently
  // active so we can unsub the old one + sub the new one on symbol
  // changes without manual clicks. Set when the auto-sub effect
  // succeeds; cleared on disconnect.
  const autoSubscribedRef = useRef<string | null>(null);
  // Visible loader while the HISTORY_PLANT round-trip is in flight
  // (Rithmic spins up a fresh socket → login → request → logout, so
  // it takes ~5-10s on Apex even when the response is small).
  const [historyLoading, setHistoryLoading] = useState(false);
  // Per-fetch progress: `pct` lets the loading badge render "Loading
  // 1m history… 67%" so the user knows the fetch is actually moving
  // even on slow Apex round-trips. Reset to null whenever a fetch
  // completes (success, error, or no-op).
  const [historyProgress, setHistoryProgress] = useState<{
    pct: number;
    barsLoaded: number;
  } | null>(null);
  // History-fetch serialization. Apex enforces a single concurrent
  // HISTORY_PLANT session per user — if a 2nd fetch fires while the
  // 1st is still draining, the gateway closes the 2nd socket with a
  // raw TCP RST (no TLS close_notify). We chain fetches off this
  // promise so the next one waits for the previous to complete.
  const pendingHistoryRef = useRef<Promise<void>>(Promise.resolve());
  // Desired-TF latch — when the user spams TF pills, queued fetches
  // for stale TFs are skipped after the chain unblocks so we don't
  // burn 30s of HISTORY_PLANT time on a chart the user already left.
  const desiredTfRef = useRef<SupportedTimeframe>("1m");

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

  // Persisted bars cache — survives changes of route (`/footprint` →
  // `/heatmap` → back) so we don't re-fetch 24h from Apex on every
  // remount. Selectors return action functions which are stable in
  // Zustand, so they never trigger a re-render even though state
  // mutations underneath change frequently.
  const cacheKeyFor = useFootprintBarsCacheStore((s) => s.keyFor);
  const cacheGetFresh = useFootprintBarsCacheStore((s) => s.getFresh);
  const cacheSetEntry = useFootprintBarsCacheStore((s) => s.setEntry);
  const cacheClearSymbol = useFootprintBarsCacheStore((s) => s.clearSymbol);

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

  // Keep the currentTfRef in sync with `timeframe` so the listener
  // and runHistoryFetch (both async, both long-lived) always see the
  // latest active TF when deciding whether to mirror cache → render.
  useEffect(() => {
    currentTfRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    // Live bars accumulate in `barsCacheRef.current` (RAM only) for the
    // current session. The persisted localStorage cache is reserved for
    // RESULTS OF REAL APEX HISTORY_PLANT FETCHES, written from
    // `runHistoryFetch` after a successful replay. Mixing the two
    // sources — as a previous version did via a 30s persistInterval —
    // poisoned `fetchedAt`: short live-bar batches looked "fresh" and
    // tricked the skip-refetch guard, leaving the chart with 3 bars
    // instead of the 1440 bars the 24h Apex fetch produces.
    void listen<FootprintBar>("footprint-update", (event) => {
      const bar = event.payload;
      if (bar.symbol !== fullSymbol) return;
      const tf = bar.timeframe as SupportedTimeframe;
      // Update the per-TF cache (every supported TF flows through here).
      const cache = barsCacheRef.current;
      let tfMap = cache.get(tf);
      if (!tfMap) {
        tfMap = new Map();
        cache.set(tf, tfMap);
      }
      tfMap.set(bar.bucketTsNs, bar);
      const cap = MAX_BARS_BY_TF[tf] ?? 1500;
      if (tfMap.size > cap) {
        const sorted = [...tfMap.keys()].sort((a, b) => a - b);
        for (const k of sorted.slice(0, sorted.length - cap)) {
          tfMap.delete(k);
        }
      }
      // Mirror to render state only when the bar belongs to the
      // currently displayed TF — other TFs stay warm in the cache.
      if (tf === currentTfRef.current) {
        setBars(new Map(tfMap));
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
  }, [fullSymbol]);

  const handleSubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<RithmicStatus>("rithmic_subscribe", {
        args: { symbol, exchange },
      });
      setStatus(next);
      // Fresh subscription = wipe the in-memory ref. We then hydrate
      // each TF from the persisted bars cache below, so a route
      // round-trip (`/footprint` → `/heatmap` → back) lands on
      // already-warm bars instead of an empty chart waiting on a
      // fresh Apex round-trip.
      barsCacheRef.current.clear();
      historyFetchedRef.current.clear();
      let hydratedActiveTf = false;
      for (const tf of PRELOAD_TFS) {
        const cached = cacheGetFresh(cacheKeyFor(symbol, exchange, tf));
        if (!cached) continue;
        const tfMap = new Map<number, FootprintBar>();
        for (const bar of cached.bars) tfMap.set(bar.bucketTsNs, bar);
        barsCacheRef.current.set(tf, tfMap);
        // NB : on n'add PAS à `historyFetchedRef` ici. L'hydrate est
        // purement visuel (graine pour afficher quelque chose le temps
        // que `fetchHistoryForTimeframe` tourne). La garde de skip se
        // base sur `cacheGetFresh` qui ne vaut que si le cache vient
        // d'un vrai fetch Apex < 6h — celui-ci sera détecté plus bas
        // dans le useEffect preload et skippera proprement.
        if (tf === timeframe) hydratedActiveTf = true;
        console.info(
          `rithmic history: cache hit on subscribe for ${symbol}|${exchange}|${tf} — ${cached.bars.length} bars, age=${((Date.now() - cached.fetchedAt) / 1000).toFixed(1)}s`,
        );
      }
      const initial = await invoke<FootprintBar[]>("rithmic_get_bars", {
        args: { symbol: fullSymbol, timeframe, nBars: SEED_BARS },
      });
      const seeded = barsCacheRef.current.get(timeframe) ??
        new Map<number, FootprintBar>();
      // Merge live seed bars on top of the cached ones — live wins
      // on conflicts because it's strictly fresher.
      for (const bar of initial) seeded.set(bar.bucketTsNs, bar);
      barsCacheRef.current.set(timeframe, seeded);
      // Fill the gap between local midnight (in the user's selected
      // TZ) and the earliest seed bar with synthetic flat-priced
      // empties. Without this the timeline visually starts wherever
      // CME's first trade landed (often 51+ minutes after the
      // session reopen), even though the user expects it to start
      // at 00:00 in their TZ.
      const seedTz = useFootprintSettingsStore.getState().timezone;
      const seedMidnightSec = Math.floor(
        midnightMsInTz(new Date(), seedTz) / 1000,
      );
      const seedSynthCount = ensureMidnightContinuity(
        seeded,
        timeframe,
        seedMidnightSec,
        symbol,
      );
      if (seedSynthCount > 0) {
        console.info(
          `rithmic seed: synthesised ${seedSynthCount} midnight-gap bars ` +
          `for ${timeframe} (tz=${seedTz})`,
        );
      }
      setBars(new Map(seeded));
      if (!hydratedActiveTf) {
        console.info(
          `rithmic history: no cache for active TF ${timeframe} — will fetch from Apex`,
        );
      }
      // Background preload kicks off automatically from the
      // useEffect below when `status.subscriptions` changes.
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [symbol, exchange, fullSymbol, timeframe, cacheGetFresh, cacheKeyFor]);

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

  // Auto-subscribe: kicks in as soon as we're connected + logged in,
  // and re-syncs whenever the user picks a different symbol. On a
  // symbol change we unsubscribe the previous one (best-effort) so
  // Rithmic doesn't keep streaming a market we no longer watch.
  const connectedNow = status.connected && status.loggedIn;
  useEffect(() => {
    if (!connectedNow) {
      // We treat each new connection cycle as a fresh slate so the
      // first symbol change after a reconnect triggers a sub.
      autoSubscribedRef.current = null;
      return;
    }
    if (autoSubscribedRef.current === fullSymbol) return;

    let cancelled = false;
    const run = async () => {
      // Unsub the previously-active symbol if any (best-effort).
      const prev = autoSubscribedRef.current;
      if (prev && prev !== fullSymbol) {
        const [prevSym, prevEx] = prev.split(".");
        try {
          await invoke("rithmic_unsubscribe", {
            args: { symbol: prevSym, exchange: prevEx },
          });
        } catch (e) {
          console.warn("auto-unsub previous symbol failed:", e);
        }
      }
      if (cancelled) return;
      autoSubscribedRef.current = fullSymbol;
      try {
        await handleSubscribe();
      } catch (_e) {
        if (!cancelled) autoSubscribedRef.current = null;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [connectedNow, fullSymbol, handleSubscribe]);

  const toggleSetting = useFootprintSettingsStore((s) => s.toggle);
  const activeTool = useToolDrawingsStore((s) => s.activeTool);
  const setActiveTool = useToolDrawingsStore((s) => s.setActiveTool);
  const clearDrawingsForSymbol = useToolDrawingsStore((s) => s.clearForSymbol);
  // Match the bare `symbol` the canvas stores into `drawing.symbol`
  // (FootprintCanvas writes `symbolRef.current` which mirrors the
  // `symbol` prop). Using `fullSymbol` here would always return 0
  // and silently disable the trash button.
  //
  // Counts BOTH trade drawings (LONG/SHORT) AND line drawings
  // (h-line / h-ray / trend) — the trash button should fire and the
  // Delete-key shortcut should react whenever any drawing exists on
  // the current chart, regardless of which tool produced it.
  const drawingsForSymbolCount = useToolDrawingsStore(
    (s) =>
      s.drawings.filter((d) => d.symbol === symbol).length +
      s.lineDrawings.filter((d) => d.symbol === symbol).length,
  );
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
            : "Draw horizontal line (click on chart to set price)",
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
            : "Draw horizontal ray (click on chart to set start point)",
        icon: <IconHRay />,
        active: activeTool === "h-ray",
        onClick: () => setActiveTool(activeTool === "h-ray" ? null : "h-ray"),
      },
      {
        id: "trend",
        label:
          activeTool === "trend"
            ? "Cancel trend line"
            : "Draw trend line (click on chart, then drag the endpoint)",
        icon: <IconTrend />,
        active: activeTool === "trend",
        onClick: () => setActiveTool(activeTool === "trend" ? null : "trend"),
      },
      {
        id: "rect",
        label:
          activeTool === "rect"
            ? "Cancel rectangle"
            : "Draw rectangle (click on chart, drag to set the opposite corner)",
        icon: <IconRect />,
        active: activeTool === "rect",
        onClick: () => setActiveTool(activeTool === "rect" ? null : "rect"),
      },
      {
        id: "text",
        label:
          activeTool === "text"
            ? "Cancel text annotation"
            : "Add text annotation (click on chart, then type)",
        icon: <IconText />,
        active: activeTool === "text",
        onClick: () => setActiveTool(activeTool === "text" ? null : "text"),
      },
      {
        id: "ruler",
        label:
          activeTool === "ruler"
            ? "Cancel ruler"
            : "Measure (click + drag to measure price / time / % between two points)",
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

  // Delete-shortcut handling lives inside the canvas now — it's the
  // only owner of the "selected drawing id" ref, so scoping the
  // delete to that single drawing (rather than the old wipe-all
  // behaviour) is its responsibility. The trash button keeps the
  // explicit wipe-all path for users who really want everything
  // gone in one click.

  const sortedBars = useMemo(
    () => [...bars.values()].sort((a, b) => b.bucketTsNs - a.bucketTsNs),
    [bars],
  );

  // Price alerts — the watcher diffs sortedBars[0].close from one
  // tick to the next and beeps when an armed h-line is crossed.
  // Symbol is the bare value (e.g. "MNQM6"), the same key the
  // store uses for drawing persistence.
  useAlertWatcher(sortedBars[0]?.close, symbol);

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

  // Per-timeframe history fetch (called on subscribe AND on timeframe
  // change so switching from 5m → 1h re-pulls the day's bars at the
  // new granularity instead of leaving a thin live-only chart).
  //
  // For TFs ≤ 15m we use the TICK-replay path (`rithmic_fetch_tick_history`)
  // which returns bars with real per-price bid/ask cells. For 1h we
  // fall back to TimeBarReplay (OHLCV only) — the volume of ticks
  // needed to populate a 1h footprint is too large for a one-shot
  // replay on Apex (~50k+ trades during RTH).
  const fetchHistoryForTimeframe = useCallback(
    async (tf: SupportedTimeframe) => {
      const TF_TO_MIN: Record<string, number> = {
        "1m":  1,
        "3m":  3,
        "5m":  5,
        "15m": 15,
        "1h":  60,
        "4h":  240,
        "1d":  1440,
      };
      const TF_USES_TICK_REPLAY: Record<string, boolean> = {
        "1m":  true,
        "3m":  true,
        "5m":  true,
        "15m": true,
        "1h":  true,
        // 4H / 1D — OHLCV only via TimeBarReplay (TickBarReplay would
        // need to drain hundreds of thousands of ticks per bar; way
        // beyond Apex's per-replay cap). The renderer falls back to
        // outline candles for these (empty levels).
        "4h":  false,
        "1d":  false,
      };
      const barMinutes = TF_TO_MIN[tf];
      const useTickReplay = TF_USES_TICK_REPLAY[tf] ?? false;
      if (barMinutes === undefined) {
        console.info(`rithmic history: skipping ${tf} (sub-minute, live-only)`);
        return;
      }
      const historyKey = `${fullSymbol}-${tf}`;
      // Garde combinée : ne skip QUE si la clé a déjà été fetched cette
      // session ET si le cache localStorage est encore frais (TTL 6h non
      // dépassé). Si le ref est latch mais le cache stale, on délatch et
      // on refetch — c'est ce qui fait l'auto-load au mount route quand
      // l'utilisateur revient sur /footprint après plusieurs heures.
      const cacheKey = cacheKeyFor(symbol, exchange, tf);
      const cachedFresh = cacheGetFresh(cacheKey);
      if (historyFetchedRef.current.has(historyKey) && cachedFresh) {
        const ageSec = ((Date.now() - cachedFresh.fetchedAt) / 1000).toFixed(0);
        console.info(
          `rithmic history: cache fresh for ${historyKey} (age ${ageSec}s), skip refetch`,
        );
        return;
      }
      if (historyFetchedRef.current.has(historyKey) && !cachedFresh) {
        console.info(`rithmic history: ${historyKey} TTL expired — refetching`);
        historyFetchedRef.current.delete(historyKey);
      }

      // Mark this TF as the desired one and queue the work behind any
      // in-flight HISTORY_PLANT fetch. After the chain unblocks, check
      // the latch again — if the user already switched away to another
      // TF in the meantime, skip this fetch without sending anything.
      desiredTfRef.current = tf;
      const previous = pendingHistoryRef.current;
      const work = (async () => {
        await previous.catch(() => {});
        if (desiredTfRef.current !== tf) {
          console.info(
            `rithmic history: ${tf} no longer the active TF (now ${desiredTfRef.current}), skipping queued fetch`,
          );
          return;
        }
        historyFetchedRef.current.add(historyKey);
        await runHistoryFetch(tf, barMinutes, useTickReplay);
      })();
      pendingHistoryRef.current = work.catch(() => {});
      return work;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fullSymbol, symbol, exchange, cacheGetFresh, cacheKeyFor],
  );

  // Inner fetch — only called from inside the serialized chain above.
  // Lives as a separate function so the outer `useCallback` stays
  // small and the chain logic is easy to follow.
  const runHistoryFetch = useCallback(
    async (tf: SupportedTimeframe, barMinutes: number, useTickReplay: boolean) => {
      const historyKey = `${fullSymbol}-${tf}`;

      // Midnight reference for the user's selected timezone (TZ
      // button). The button is the single source of truth so that
      // "today" on a Paris user is 00:00 Paris regardless of what
      // the OS clock says. Falls back to browser local for "LCL".
      const now = new Date();
      const tz = useFootprintSettingsStore.getState().timezone;
      const localMidnight = midnightMsInTz(now, tz);
      // Strategy:
      //   1. Always ASK Apex for 24h of history (Apex ignores hoursBack
      //      anyway and streams up to its cap of ~10 000 bars).
      //   2. Try to filter to today (≥ local midnight) — preferred view
      //      when the market is open and bars exist.
      //   3. If 0 bars from today (typical weekend / outside RTH),
      //      FALL BACK to the most-recent ~24h slice so the user
      //      always sees the last available trading session instead of
      //      an empty chart. CME globex closes Friday 16:00 CT and
      //      reopens Sunday 17:00 CT — without this fallback, anyone
      //      who opens the app on a Saturday gets a blank screen.
      const localMidnightSec = Math.floor(localMidnight / 1000);
      const localMidnightNs = BigInt(localMidnightSec) * BigInt(1_000_000_000);

      const command = useTickReplay
        ? "rithmic_fetch_tick_history"
        : "rithmic_fetch_history";
      // Lookback window sized per TF: minute-grained TFs only need
      // today (24h covers from 00:00 local Paris); 4H needs ~2 weeks
      // to show enough candles; 1D needs ~6 months (futures contract
      // life). hours_back is the upper bound — backend trims to
      // whatever history Apex actually has.
      const HOURS_BACK_BY_TF: Record<string, number> = {
        "1m":  24,
        "3m":  24,
        "5m":  24,
        "15m": 24,
        "1h":  24,
        "4h":  14 * 24,
        "1d":  180 * 24,
      };
      const hoursBack = HOURS_BACK_BY_TF[tf] ?? 24;
      console.info(
        `rithmic history fetch START: command=${command} symbol=${symbol} exchange=${exchange} tf=${tf} barMinutes=${barMinutes} hoursBack=${hoursBack} (lookback target: local midnight ${new Date(localMidnight).toISOString()})`,
      );
      setHistoryLoading(true);
      setHistoryProgress({ pct: 0, barsLoaded: 0 });
      const t0 = performance.now();
      // Expected bar count for the % calc. For 1m / 24h that's
      // 1440; for 4h / 14 days that's 84; for 1d / 180d that's 180.
      // Capped at 1 to avoid divide-by-zero on degenerate TFs.
      const expectedBars = Math.max(1, Math.floor((hoursBack * 60) / barMinutes));
      // Subscribe to the per-chunk progress stream from the Rust side.
      // We match on (symbol, exchange, barMinutes) so two concurrent
      // fetches on different symbols don't cross-talk. The final
      // payload (done=true) carries Apex's status strings (rpCodes,
      // rqHandlerRpCodes, userMsgs) — these are what tell us WHY a
      // fetch returned 0 bars, so we capture them locally and pull
      // them into the 0-bar branch below.
      let lastRpCodes: string[] = [];
      let lastRqHandlerRpCodes: string[] = [];
      let lastUserMsgs: string[] = [];
      const progressUnlistenPromise = listen<{
        symbol: string;
        exchange: string;
        barMinutes: number;
        barsBucketed: number;
        done: boolean;
        rpCodes?: string[];
        rqHandlerRpCodes?: string[];
        userMsgs?: string[];
      }>("rithmic-history-progress", (event) => {
        const p = event.payload;
        if (
          p.symbol !== symbol ||
          p.exchange !== exchange ||
          p.barMinutes !== barMinutes
        )
          return;
        if (p.rpCodes && p.rpCodes.length > 0) lastRpCodes = p.rpCodes;
        if (p.rqHandlerRpCodes && p.rqHandlerRpCodes.length > 0)
          lastRqHandlerRpCodes = p.rqHandlerRpCodes;
        if (p.userMsgs && p.userMsgs.length > 0) lastUserMsgs = p.userMsgs;
        if (p.done) {
          setHistoryProgress({ pct: 100, barsLoaded: p.barsBucketed });
          return;
        }
        const pct = Math.min(99, Math.floor((p.barsBucketed / expectedBars) * 100));
        setHistoryProgress({ pct, barsLoaded: p.barsBucketed });
      });

      // Step 2 of the cascade — try the local SQLite cache (filled by
      // the Rust CacheWriter from every live bar) before paying the
      // HISTORY_PLANT round-trip. When the Apex history add-on is on
      // we'd still prefer the broker (canonical data), but the cache
      // probe is cheap and gives the chart a real lookback on the
      // add-on-less account that gets rp_code=13 every time.
      // `CachedBar.levelsJson` is a serialised JSON string so we don't
      // duplicate the `PriceLevel` schema between Rust and TS.
      type CachedBar = {
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
        levelsJson: string;
      };
      try {
        const sqliteRows = await invoke<CachedBar[]>("cache_query", {
          args: { fullSymbol, timeframe: tf, hoursBack },
        });
        if (sqliteRows.length > 0) {
          const fromCache: FootprintBar[] = sqliteRows.map((row) => ({
            symbol: row.symbol,
            timeframe: row.timeframe,
            bucketTsNs: row.bucketTsNs,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            totalVolume: row.totalVolume,
            totalDelta: row.totalDelta,
            tradeCount: row.tradeCount,
            levels: JSON.parse(row.levelsJson) as PriceLevel[],
          }));
          // Sort oldest → newest (same as the HISTORY_PLANT path) so
          // tail slicing means newest bars and the renderer's bucket
          // ordering invariant holds.
          const sortedCache = [...fromCache].sort(
            (a, b) => Number(BigInt(a.bucketTsNs) - BigInt(b.bucketTsNs)),
          );
          // Prefer "today only" when we have bars from today; else
          // serve the full slice the cache returned so an out-of-RTH
          // load still shows the most-recent session.
          const todayFromCache = sortedCache.filter(
            (b) => BigInt(b.bucketTsNs) >= localMidnightNs,
          );
          const toServe = todayFromCache.length > 0 ? todayFromCache : sortedCache;
          const cacheMode = todayFromCache.length > 0 ? "sqlite-today" : "sqlite-recent";
          const ms = (performance.now() - t0).toFixed(0);
          console.info(
            `rithmic history: SQLite cache hit — ${sqliteRows.length} rows ` +
            `(kept ${toServe.length} [${cacheMode}]) for ${historyKey} in ${ms}ms`,
          );
          // Mirror the HISTORY_PLANT success path: warm in-memory
          // cache → synth midnight continuity → write localStorage
          // (only when we have today's bars, same anti-stale-loop
          // rule) → mirror to the renderer if this TF is still active.
          const cache = barsCacheRef.current;
          let tfMap = cache.get(tf);
          if (!tfMap) {
            tfMap = new Map();
            cache.set(tf, tfMap);
          }
          for (const bar of toServe) {
            if (!tfMap.has(bar.bucketTsNs)) tfMap.set(bar.bucketTsNs, bar);
          }
          const histSynthCount = ensureMidnightContinuity(
            tfMap,
            tf,
            Math.floor(localMidnight / 1000),
            symbol,
          );
          if (histSynthCount > 0) {
            console.info(
              `rithmic history: synthesised ${histSynthCount} midnight-gap bars for ${tf} (sqlite path)`,
            );
          }
          if (cacheMode === "sqlite-today") {
            const sortedBars = Array.from(tfMap.values()).sort(
              (a, b) => Number(BigInt(a.bucketTsNs) - BigInt(b.bucketTsNs)),
            );
            cacheSetEntry(cacheKeyFor(symbol, exchange, tf), {
              bars: sortedBars,
              fetchedAt: Date.now(),
              finishSec: Math.floor(Date.now() / 1000),
              hoursBack,
            });
          } else {
            console.info(
              `rithmic history: mode=${cacheMode} for ${tf} — skipping localStorage write to avoid stale-loop`,
            );
          }
          if (tf === currentTfRef.current) {
            setBars(new Map(tfMap));
          }
          setHistoryLoading(false);
          setHistoryProgress(null);
          progressUnlistenPromise.then((fn) => fn()).catch(() => {});
          return;
        }
      } catch (e) {
        console.warn("rithmic history: SQLite cache probe failed:", e);
        // fall through to HISTORY_PLANT
      }

      try {
        const history = await invoke<FootprintBar[]>(command, {
          args: { symbol, exchange, hoursBack, barMinutes, timeframe: tf },
        });
        const ms = (performance.now() - t0).toFixed(0);

        // Sort oldest → newest so slicing the tail = newest bars.
        const sorted = [...history].sort(
          (a, b) => Number(BigInt(a.bucketTsNs) - BigInt(b.bucketTsNs)),
        );

        // Try the strict "today only" filter first.
        const todayBars = sorted.filter(
          (b) => BigInt(b.bucketTsNs) >= localMidnightNs,
        );

        // Pick which slice to display.
        let toMerge: FootprintBar[];
        let mode: string;
        if (todayBars.length > 0) {
          toMerge = todayBars;
          mode = "today";
        } else {
          // Apex returned nothing for today's window. Consult the
          // persisted cache as a fallback so an outage / 0-bar
          // response doesn't blank the chart.
          const cachedKey = cacheKeyFor(symbol, exchange, tf);
          const cached = cacheGetFresh(cachedKey);
          const cachedTodayBars = cached?.bars.filter(
            (b) => BigInt(b.bucketTsNs) >= localMidnightNs,
          ) ?? [];
          if (cachedTodayBars.length > 0) {
            toMerge = cachedTodayBars;
            mode = "cache-today";
            console.info(
              `rithmic history: Apex returned 0 bars, serving ${cachedTodayBars.length} bars from cache for ${cachedKey}`,
            );
          } else {
            toMerge = [];
            mode = "empty";
          }
        }

        // Dual-fetch strategy: TickBarReplay only emits bars for
        // periods that had trades, so when CME just reopened (e.g.
        // 17:00 CT = midnight CEST) and MNQ doesn't trade for the
        // first 51 minutes, the chart visually starts at 00:51.
        // To fill the gap we also fetch TimeBarReplay (which emits
        // a bar for EVERY period, including empty ones at the last
        // known price) and merge. TickBar always wins where it has
        // data (richer bid×ask cells); TimeBar fills the gaps with
        // OHLC-only bars.
        //
        // Only runs for tick-replay TFs (1m, 3m, 5m, 15m, 1h) —
        // higher TFs (4h, 1d) already use TimeBarReplay directly.
        // Apex enforces single concurrent HISTORY_PLANT, so this
        // adds one extra serialized round-trip per TF.
        if (useTickReplay && (mode === "today" || mode === "cache-today")) {
          try {
            const tT0 = performance.now();
            const timeBars = await invoke<FootprintBar[]>(
              "rithmic_fetch_history",
              {
                args: { symbol, exchange, hoursBack, barMinutes, timeframe: tf },
              },
            );
            const tMs = (performance.now() - tT0).toFixed(0);
            const tickByBucket = new Map<number, FootprintBar>();
            for (const b of toMerge) tickByBucket.set(b.bucketTsNs, b);
            // TimeBars that aren't already covered by a TickBar
            // get added to the result. Filter to today only so a
            // wider TimeBar window can't leak yesterday's bars.
            const gapFillers: FootprintBar[] = [];
            for (const tb of timeBars) {
              if (BigInt(tb.bucketTsNs) < localMidnightNs) continue;
              if (tickByBucket.has(tb.bucketTsNs)) continue;
              gapFillers.push(tb);
            }
            if (gapFillers.length > 0) {
              const merged = [...toMerge, ...gapFillers].sort(
                (a, b) =>
                  Number(BigInt(a.bucketTsNs) - BigInt(b.bucketTsNs)),
              );
              toMerge = merged;
              mode = `${mode}+time${gapFillers.length}`;
            }
            console.info(
              `rithmic history: TimeBar dual-fetch for ${tf} in ${tMs}ms — ` +
              `+${gapFillers.length} gap-filler bars`,
            );
          } catch (e) {
            console.warn(
              `rithmic history: TimeBar dual-fetch failed for ${tf}, keeping TickBar only:`,
              e,
            );
          }
        }

        console.info(
          `rithmic history fetch DONE: ${history.length} bars in ${ms}ms (${tf}) — ` +
          `kept ${toMerge.length} [${mode}] ` +
          `(anchor=${new Date(localMidnight).toISOString()} tz=${tz}, ` +
          `newest=${toMerge.length ? new Date(Number(BigInt(toMerge[toMerge.length - 1].bucketTsNs) / 1_000_000n)).toISOString() : "n/a"})`,
        );

        if (toMerge.length > 0) {
          // Always write to the per-TF cache so the bars are warm
          // even when the user has already switched to a different
          // TF while this fetch was in flight.
          const cache = barsCacheRef.current;
          let tfMap = cache.get(tf);
          if (!tfMap) {
            tfMap = new Map();
            cache.set(tf, tfMap);
          }
          for (const bar of toMerge) {
            if (!tfMap.has(bar.bucketTsNs)) tfMap.set(bar.bucketTsNs, bar);
          }
          // Fill any remaining gap between local midnight and the
          // earliest history bar with synthetic empties — Apex's
          // TickBarReplay only emits bars where ticks existed, so
          // after a session reopen with low activity the chart
          // would visually start at the first trade (often 51+
          // minutes past midnight). The synthesis runs after the
          // cache write so cached entries also benefit from it.
          const histSynthCount = ensureMidnightContinuity(
            tfMap,
            tf,
            Math.floor(localMidnight / 1000),
            symbol,
          );
          if (histSynthCount > 0) {
            console.info(
              `rithmic history: synthesised ${histSynthCount} midnight-gap bars for ${tf}`,
            );
          }
          // Persist to the route-spanning cache so a `/footprint` →
          // `/heatmap` → back nav lands on these bars instead of
          // re-hitting Apex. Sort ascending so consumers reading
          // back can rely on the ordering.
          //
          // CRITIQUE : on n'écrit le cache QUE si on vient d'un VRAI
          // succès Apex (`mode.startsWith("today")`). Si mode est
          // `cache-today` (fallback recyclant le cache existant) ou
          // `empty`, ré-écrire avec `fetchedAt: Date.now()` créerait
          // un cycle vicieux : tant qu'Apex denies, le cache se
          // perpétuerait éternellement "frais" avec des bars
          // synthétiques, et la garde `cacheGetFresh` n'expirerait
          // jamais → aucun vrai refetch ne pourrait passer.
          if (mode.startsWith("today")) {
            const sortedBars = Array.from(tfMap.values()).sort(
              (a, b) => Number(BigInt(a.bucketTsNs) - BigInt(b.bucketTsNs)),
            );
            cacheSetEntry(cacheKeyFor(symbol, exchange, tf), {
              bars: sortedBars,
              fetchedAt: Date.now(),
              finishSec: Math.floor(Date.now() / 1000),
              hoursBack,
            });
          } else {
            console.info(
              `rithmic history: mode=${mode} for ${tf} — skipping cache write to avoid stale-loop`,
            );
          }
          // Only mirror to render state if the TF is still active.
          if (tf === currentTfRef.current) {
            setBars(new Map(tfMap));
          }
        } else {
          historyFetchedRef.current.delete(historyKey);
          // 0-bar diagnostic — surface Apex's status strings so we
          // know WHY the replay returned nothing instead of guessing
          // (direction, window, permissioning, quota, etc). The
          // strings come from the Rust side via the final
          // `rithmic-history-progress` event.
          const apexStatus =
            lastRpCodes.length || lastRqHandlerRpCodes.length || lastUserMsgs.length
              ? ` | APEX: rpCodes=${JSON.stringify(lastRpCodes)} rqHandler=${JSON.stringify(lastRqHandlerRpCodes)} userMsgs=${JSON.stringify(lastUserMsgs)}`
              : ` | APEX: (no rp_code received — terminator may be missing)`;
          if (isCmeGlobexClosed(now)) {
            console.warn(
              `rithmic history: 0 bars for ${tf} (CME Globex closed — weekend or daily pause)${apexStatus}`,
            );
          } else {
            console.error(
              `rithmic history: 0 bars for ${tf} during OPEN market — Apex returned 0 frames (hoursBack=${hoursBack}, lookbackStartUTC=${new Date(localMidnight).toISOString()})${apexStatus}`,
            );
          }
        }
      } catch (e) {
        const ms = (performance.now() - t0).toFixed(0);
        historyFetchedRef.current.delete(historyKey);
        console.error(
          `rithmic history fetch ERROR after ${ms}ms (live continues):`,
          e,
        );
      } finally {
        setHistoryLoading(false);
        setHistoryProgress(null);
        progressUnlistenPromise.then((fn) => fn()).catch(() => {});
      }
    },
    [fullSymbol, symbol, exchange, cacheSetEntry, cacheKeyFor],
  );

  // Background preload of every tick-replayable TF (1m, 3m, 5m, 15m,
  // 1h). Fires once per (symbol, subscribe-cycle). Apex enforces a
  // single concurrent HISTORY_PLANT session per user, so the fetches
  // serialize naturally through `pendingHistoryRef`. Each completed
  // fetch warms `barsCacheRef`; if the user is sitting on the
  // freshly-loaded TF, `runHistoryFetch` mirrors cache→bars to
  // refresh the chart without a manual reload.
  const subscribedKey = status.subscriptions.includes(fullSymbol)
    ? fullSymbol
    : null;
  useEffect(() => {
    if (!subscribedKey) return;
    let cancelled = false;
    void (async () => {
      for (const tf of PRELOAD_TFS) {
        if (cancelled) return;
        try {
          await fetchHistoryForTimeframe(tf);
        } catch (e) {
          console.warn(`rithmic preload ${tf} failed:`, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subscribedKey, fetchHistoryForTimeframe]);

  // Diagnostic — fires `rithmic_probe_tick_replay` (5 min lookback, 30 s
  // hard timeout) to confirm that the Apex account is permissioned for
  // HISTORY_PLANT. rp_code "0" or any non-zero frames coming back = OK;
  // rp_code "13" = "permission denied", the add-on is still off.
  const [probeResult, setProbeResult] = useState<TickProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const handleProbe = useCallback(async () => {
    setProbing(true);
    setProbeResult(null);
    try {
      const r = await invoke<TickProbeResult>("rithmic_probe_tick_replay", {
        args: { symbol, exchange },
      });
      setProbeResult(r);
    } catch (e) {
      setProbeResult({
        framesSeen: 0,
        barsWithData: 0,
        rpCodes: [],
        elapsedMs: 0,
        error: String(e),
      });
    } finally {
      setProbing(false);
    }
  }, [symbol, exchange]);

  // Test button — wipes the localStorage cache + in-memory TF cache for
  // the current symbol, then re-fires history fetches for every preload
  // TF so we can read each Apex response's rpCodes in DevTools. Useful
  // to confirm whether "permission denied" hits every TF or only a
  // subset (4h/1d).
  const handleForceReloadHistory = useCallback(async () => {
    cacheClearSymbol(symbol);
    historyFetchedRef.current.clear();
    barsCacheRef.current.clear();
    setBars(new Map());
    for (const tf of PRELOAD_TFS) {
      try {
        await fetchHistoryForTimeframe(tf);
      } catch (e) {
        console.warn(`force-reload ${tf} failed:`, e);
      }
    }
  }, [symbol, cacheClearSymbol, fetchHistoryForTimeframe]);

  const cycleTimezone = useCallback(() => {
    const idx = TZ_CYCLE.indexOf(timezone);
    const next = TZ_CYCLE[(idx + 1) % TZ_CYCLE.length];
    setTimezone("timezone", next);
  }, [timezone, setTimezone]);

  const handleTimeframeChange = useCallback(
    (next: SupportedTimeframe) => {
      setTimeframe(next);
      // Serve the new TF's bars from the in-memory cache. The
      // background preload (triggered on subscribe) keeps every
      // tick-replayable TF warm; the live listener keeps every TF
      // fresh in parallel. If the cache is empty for this TF (e.g.
      // preload hasn't reached it yet), the renderer shows whatever
      // live bars have streamed in — and `runHistoryFetch` will
      // mirror cache→bars when the preload completes for this TF.
      const cached = barsCacheRef.current.get(next);
      setBars(cached ? new Map(cached) : new Map());
    },
    [],
  );

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
        <IndicatorsButton />
        <MagnetToggle />
        <button
          type="button"
          className="cf-icon-btn"
          onClick={cycleTimezone}
          title={`Time axis timezone: ${TZ_LABELS[timezone]} — click to switch`}
          aria-label={`Time axis timezone (${TZ_LABELS[timezone]}). Click to cycle.`}
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
        {historyLoading && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: "#7ed321",
              background: "rgba(126, 211, 33, 0.08)",
              border: "1px solid rgba(126, 211, 33, 0.30)",
            }}
            title="Fetching today's bars from Rithmic HISTORY_PLANT"
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#7ed321",
                animation: "pulse 1s ease-in-out infinite",
              }}
            />
            Loading {timeframe} history
            {historyProgress !== null ? `… ${historyProgress.pct}%` : "…"}
            <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
          </span>
        )}
        <span className="cf-controls-spacer" />
        {/* Auto-subscribe is on: the data starts streaming as soon as
            we're connected. The Unsubscribe button is kept as an
            escape hatch — clicking it will pause the auto-sub for the
            current symbol until the user picks a different one. */}
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
        {isSubscribed && (
          <button
            type="button"
            onClick={() => void handleForceReloadHistory()}
            disabled={busy}
            className="cf-action-btn"
            title="Wipe cache + force fresh history fetch for all timeframes (test Apex permissions)"
          >
            Reload history
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleProbe()}
          disabled={busy || probing || !connected}
          className="cf-action-btn"
          title="Probe HISTORY_PLANT permission (5 min lookback, 30 s timeout). Green = perm OK, red = rp_code=13."
        >
          {probing ? "Probing…" : "Probe perm"}
        </button>
        {probeResult && (() => {
          const ok =
            probeResult.error === null &&
            (probeResult.framesSeen > 0 || probeResult.rpCodes.includes("0"));
          const color = ok ? "#7ed321" : "#ff4757";
          const bg = ok ? "rgba(126, 211, 33, 0.08)" : "rgba(255, 71, 87, 0.08)";
          const border = ok
            ? "1px solid rgba(126, 211, 33, 0.30)"
            : "1px solid rgba(255, 71, 87, 0.30)";
          const label = probeResult.error
            ? `err: ${probeResult.error.slice(0, 40)}`
            : `${probeResult.framesSeen} frames · ${probeResult.elapsedMs}ms · rp=${probeResult.rpCodes.join(",") || "—"}`;
          return (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color,
                background: bg,
                border,
              }}
              title={`Probe result for ${symbol}.${exchange} — rpCodes=${JSON.stringify(probeResult.rpCodes)}`}
            >
              {label}
            </span>
          );
        })()}
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
        <div className="footprint-workspace">
          <FootprintToolbar tools={tools} />
          <div className="cf-canvas-wrap">
            <FootprintCanvas
              ref={canvasHandle}
              bars={sortedBars}
              symbol={symbol}
              timeframe={timeframe}
              priceDecimals={priceDecimals}
              onOpenSettings={() => setSettingsOpen(true)}
              bare
            />
          </div>
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
