// Phase B / M3 — crypto-side footprint client.
//
// Public-feed exchanges (Bybit linear, Binance spot) — no broker
// settings, no vault, no auth flow. The component:
//   1. on mount: invoke('crypto_connect', { exchange })
//   2. user picks a symbol → invoke('crypto_subscribe', ...)
//   3. listens to `crypto-footprint-update` events filtered to the
//      current symbol + timeframe
//   4. seeds historical bars via crypto_get_bars (TODO M4)
//
// Reuses BarView/LevelRow from FootprintBarView for visual parity
// with the Rithmic side.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BarView, type FootprintBar } from "./FootprintBarView";

type CryptoExchange = "bybit" | "binance";

type CryptoStatus = {
  binanceConnected: boolean;
  bybitConnected: boolean;
  deribitConnected: boolean;
  binanceSubscriptions: string[];
  bybitSubscriptions: string[];
  deribitSubscriptions: string[];
};

const TIMEFRAMES = ["5s", "15s", "1m", "5m"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
const MAX_BARS = 20;

// Crypto prices on BTC/ETH range from 0.01 to 5+ digits depending on
// the asset. 2 decimals is enough for BTC/ETH; SOL/lower-cap pairs
// can pass priceDecimals through if needed later.
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
  const [timeframe, setTimeframe] = useState<Timeframe>("5s");
  const [bars, setBars] = useState<Map<number, FootprintBar>>(new Map());
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

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
  const totalTrades = useMemo(
    () => sortedBars.reduce((s, b) => s + b.tradeCount, 0),
    [sortedBars],
  );

  return (
    <>
      <header className="rf-header">
        <div className="rf-status-info">
          <span
            className={
              connected
                ? "rf-status rf-status-connected"
                : "rf-status rf-status-disconnected"
            }
          >
            {connected ? "Connected" : "Connecting…"}
          </span>
          <span className="rf-status-detail">
            {EXCHANGE_LABELS[exchange]} · public feed (no auth)
          </span>
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
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={busy || !connected}
        >
          Subscribe
        </button>
        {isSubscribed && (
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
          {symbol} · {timeframe} · {sortedBars.length} bar
          {sortedBars.length === 1 ? "" : "s"} · {totalTrades} trade
          {totalTrades === 1 ? "" : "s"}
        </h2>
        {sortedBars.length === 0 ? (
          <div className="rf-empty">
            {isSubscribed
              ? "Waiting for ticks…"
              : "Subscribe to start streaming."}
          </div>
        ) : (
          <div className="rf-bars">
            {sortedBars.map((bar) => (
              <BarView
                key={bar.bucketTsNs}
                bar={bar}
                priceDecimals={PRICE_DECIMALS}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
