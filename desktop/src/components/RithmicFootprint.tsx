import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BrokerSettings } from "./BrokerSettings";
import "./RithmicFootprint.css";

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

const TIMEFRAMES = ["5s", "15s", "1m", "5m"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
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
  const [timeframe, setTimeframe] = useState<Timeframe>("5s");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fullSymbol = useMemo(() => `${symbol}.${exchange}`, [symbol, exchange]);

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
  const totalTrades = useMemo(
    () => sortedBars.reduce((s, b) => s + b.tradeCount, 0),
    [sortedBars],
  );

  return (
    <div className="rithmic-footprint">
      <header className="rf-header">
        <h1>OrderflowV2 — Rithmic Live</h1>
        <div className="rf-status-info">
          <span className="rf-status rf-status-connected">Connected</span>
          <span className="rf-status-detail">
            {creds.systemName} · {creds.username}
          </span>
          {status.fcm && (
            <span className="rf-status-detail">
              FCM {status.fcm} · {status.country} · heartbeat{" "}
              {status.heartbeatSecs ?? "?"}s
            </span>
          )}
          <button
            type="button"
            className="rf-link"
            onClick={onOpenSettings}
          >
            Edit broker settings
          </button>
        </div>
      </header>

      <section className="rf-controls">
        <label>
          <span>Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            disabled={busy}
          />
        </label>
        <label>
          <span>Exchange</span>
          <input
            value={exchange}
            onChange={(e) => setExchange(e.target.value.toUpperCase())}
            disabled={busy}
          />
        </label>
        <label>
          <span>Timeframe</span>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            disabled={busy}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleSubscribe} disabled={busy}>
          Subscribe
        </button>
        {status.subscriptions.includes(fullSymbol) && (
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={busy}
            className="rf-secondary"
          >
            Unsubscribe
          </button>
        )}
      </section>

      {error && <div className="rf-error">{error}</div>}

      <section className="rf-footprint">
        <h2>
          {fullSymbol} · {timeframe} · {sortedBars.length} bar
          {sortedBars.length === 1 ? "" : "s"} · {totalTrades} trade
          {totalTrades === 1 ? "" : "s"}
        </h2>
        {sortedBars.length === 0 ? (
          <div className="rf-empty">
            {status.subscriptions.includes(fullSymbol)
              ? "Waiting for ticks…"
              : "Subscribe to start streaming."}
          </div>
        ) : (
          <div className="rf-bars">
            {sortedBars.map((bar) => (
              <BarView key={bar.bucketTsNs} bar={bar} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BarView({ bar }: { bar: FootprintBar }) {
  const date = new Date(bar.bucketTsNs / 1_000_000);
  const time = date.toLocaleTimeString("fr-FR", { hour12: false });

  const maxLevelVolume = Math.max(
    ...bar.levels.map((l) => l.buyVolume + l.sellVolume),
    1,
  );
  const sortedLevels = [...bar.levels].sort((a, b) => b.price - a.price);

  return (
    <div
      className={`rf-bar ${
        bar.totalDelta >= 0 ? "rf-bar-bullish" : "rf-bar-bearish"
      }`}
    >
      <div className="rf-bar-header">
        <span className="rf-bar-time">{time}</span>
        <span className="rf-bar-ohlc">
          O {bar.open.toFixed(2)} · H {bar.high.toFixed(2)} · L{" "}
          {bar.low.toFixed(2)} · C {bar.close.toFixed(2)}
        </span>
        <span
          className={
            bar.totalDelta >= 0 ? "rf-delta-pos" : "rf-delta-neg"
          }
        >
          Δ {bar.totalDelta >= 0 ? "+" : ""}
          {bar.totalDelta.toFixed(0)}
        </span>
        <span className="rf-bar-vol">
          vol {bar.totalVolume.toFixed(0)} · {bar.tradeCount} trade
          {bar.tradeCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="rf-bar-levels">
        {sortedLevels.map((level) => (
          <LevelRow
            key={level.price}
            level={level}
            maxVolume={maxLevelVolume}
          />
        ))}
      </div>
    </div>
  );
}

function LevelRow({
  level,
  maxVolume,
}: {
  level: PriceLevel;
  maxVolume: number;
}) {
  const total = level.buyVolume + level.sellVolume;
  const widthPct = (total / maxVolume) * 100;
  const buyPct = total > 0 ? (level.buyVolume / total) * 100 : 0;
  const delta = level.buyVolume - level.sellVolume;

  return (
    <div className="rf-level">
      <span className="rf-level-price">{level.price.toFixed(2)}</span>
      <span className="rf-level-volumes">
        b {level.buyVolume.toFixed(0)} · s {level.sellVolume.toFixed(0)}
      </span>
      <div className="rf-level-bar-track">
        <div className="rf-level-bar" style={{ width: `${widthPct}%` }}>
          <div className="rf-level-buy" style={{ width: `${buyPct}%` }} />
          <div
            className="rf-level-sell"
            style={{ width: `${100 - buyPct}%` }}
          />
        </div>
      </div>
      <span
        className={delta >= 0 ? "rf-level-delta-pos" : "rf-level-delta-neg"}
      >
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(0)}
      </span>
    </div>
  );
}
