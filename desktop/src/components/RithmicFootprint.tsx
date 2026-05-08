import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

const TIMEFRAMES = ["5s", "15s", "1m", "5m"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const MAX_BARS = 20;
const SYSTEM_NAMES = ["Rithmic Test", "Rithmic Paper Trading", "Rithmic 01"] as const;

const EMPTY_STATUS: RithmicStatus = {
  connected: false,
  loggedIn: false,
  subscriptions: [],
};

export function RithmicFootprint() {
  const [status, setStatus] = useState<RithmicStatus>(EMPTY_STATUS);
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    systemName: "Rithmic Test",
  });
  const [symbol, setSymbol] = useState("MNQM6");
  const [exchange, setExchange] = useState("CME");
  const [timeframe, setTimeframe] = useState<Timeframe>("5s");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fullSymbol = useMemo(() => `${symbol}.${exchange}`, [symbol, exchange]);

  // Initial status query — picks up an already-running session if the
  // user reloads the dev shell with cargo running.
  useEffect(() => {
    invoke<RithmicStatus>("rithmic_status")
      .then(setStatus)
      .catch((e) => console.error("rithmic_status failed:", e));
  }, []);

  // Subscribe to live bar updates. Re-registers on filter change so
  // the closure always sees the current (symbol, timeframe).
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

  // Best-effort cleanup on unmount: tell Rust to disconnect so we
  // don't leak the WebSocket / heartbeat task across React reloads.
  useEffect(
    () => () => {
      void invoke("rithmic_disconnect").catch(() => {});
    },
    [],
  );

  const handleLogin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<RithmicStatus>("rithmic_login", {
        args: credentials,
      });
      setStatus(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [credentials]);

  const handleSubscribe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const next = await invoke<RithmicStatus>("rithmic_subscribe", {
        args: { symbol, exchange },
      });
      setStatus(next);
      // Reset chart state — we're watching a different bucket layout
      // even if the symbol is the same.
      setBars(new Map());
      // Backfill from snapshot in case the engine already collected
      // a few bars before this subscribe wave.
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

  const handleDisconnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await invoke("rithmic_disconnect");
      setStatus(EMPTY_STATUS);
      setBars(new Map());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

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
        <StatusBadge status={status} />
      </header>

      {!status.loggedIn && (
        <section className="rf-login">
          <h2>Login Rithmic</h2>
          <div className="rf-form">
            <label>
              <span>Username</span>
              <input
                type="email"
                autoComplete="username"
                value={credentials.username}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, username: e.target.value }))
                }
                disabled={busy}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, password: e.target.value }))
                }
                disabled={busy}
              />
            </label>
            <label>
              <span>System</span>
              <select
                value={credentials.systemName}
                onChange={(e) =>
                  setCredentials((c) => ({ ...c, systemName: e.target.value }))
                }
                disabled={busy}
              >
                {SYSTEM_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleLogin}
              disabled={busy || !credentials.username || !credentials.password}
            >
              {busy ? "Connecting…" : "Login"}
            </button>
          </div>
        </section>
      )}

      {status.loggedIn && (
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
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="rf-danger"
          >
            Disconnect
          </button>
        </section>
      )}

      {error && <div className="rf-error">{error}</div>}

      {status.loggedIn && (
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
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RithmicStatus }) {
  if (!status.connected) {
    return (
      <span className="rf-status rf-status-disconnected">Disconnected</span>
    );
  }
  if (!status.loggedIn) {
    return <span className="rf-status rf-status-connecting">Connecting…</span>;
  }
  return (
    <div className="rf-status-info">
      <span className="rf-status rf-status-connected">Connected</span>
      <span className="rf-status-detail">
        {status.systemName} · {status.user}
      </span>
      <span className="rf-status-detail">
        FCM {status.fcm} · IB {status.ib} · {status.country} · heartbeat{" "}
        {status.heartbeatSecs ?? "?"}s
      </span>
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
