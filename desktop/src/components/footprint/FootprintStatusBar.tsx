// Phase B / M4.7a — live status bar above the footprint canvas.
//
// Replaces the textual <h2> header on the crypto branch with a
// compact ATAS-style row: connection dot · symbol · timeframe ·
// exchange · last price · session delta · session volume · trade
// count · countdown to next bar close.
//
// Countdown ticks at 4 Hz so it stays smooth without burning a lot
// of CPU. The component does not subscribe to any Tauri event —
// bars come in via props and the engine timeout is derived from
// `bars[0].bucketTsNs + timeframeMs - now`.

import { useEffect, useState } from "react";
import type { FootprintBar } from "../FootprintBarView";
import "./FootprintStatusBar.css";

type Props = {
  symbol: string;
  /** Display label, e.g. "Bybit Linear". */
  exchange: string;
  timeframe: string;
  /** Bars sorted newest-first. */
  bars: FootprintBar[];
  connected: boolean;
  busy: boolean;
  priceDecimals?: number;
};

const TF_TO_MS: Record<string, number> = {
  "5s": 5_000,
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
};

export function FootprintStatusBar({
  symbol,
  exchange,
  timeframe,
  bars,
  connected,
  busy,
  priceDecimals = 2,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const last = bars[0]; // newest, since CryptoFootprint sorts desc
  const lastPrice = last?.close ?? null;
  const sessionDelta = bars.reduce((s, b) => s + b.totalDelta, 0);
  const sessionVol = bars.reduce((s, b) => s + b.totalVolume, 0);
  const sessionTrades = bars.reduce((s, b) => s + b.tradeCount, 0);

  const tfMs = TF_TO_MS[timeframe] ?? 0;
  // bucketTsNs is the bar START. The bar closes at start + tfMs.
  const countdownMs =
    last && tfMs > 0
      ? Math.max(0, last.bucketTsNs / 1_000_000 + tfMs - now)
      : 0;
  const cdMin = Math.floor(countdownMs / 60_000);
  const cdSec = Math.floor((countdownMs % 60_000) / 1_000);

  const dotClass = busy
    ? "fsb-dot fsb-dot-busy"
    : connected
      ? "fsb-dot fsb-dot-on"
      : "fsb-dot fsb-dot-off";
  const dotTitle = busy
    ? "Busy"
    : connected
      ? "Connected"
      : "Disconnected";

  const showCountdown = tfMs > 0 && last !== undefined;

  return (
    <div className="fsb-bar" role="status" aria-live="polite">
      <span className={dotClass} title={dotTitle} aria-hidden />
      <span className="fsb-symbol">{symbol}</span>
      <span className="fsb-sep">·</span>
      <span className="fsb-tf">{timeframe}</span>
      <span className="fsb-sep">·</span>
      <span className="fsb-exchange">{exchange}</span>

      <span className="fsb-spacer" />

      {lastPrice !== null && (
        <span className="fsb-price">{lastPrice.toFixed(priceDecimals)}</span>
      )}
      <span
        className={`fsb-delta ${sessionDelta >= 0 ? "fsb-pos" : "fsb-neg"}`}
        title="Session cumulative delta"
      >
        Δ {sessionDelta >= 0 ? "+" : ""}
        {sessionDelta.toFixed(0)}
      </span>
      <span className="fsb-vol" title="Session cumulative volume">
        vol {sessionVol.toFixed(0)}
      </span>
      <span className="fsb-trades" title="Session trade count">
        {sessionTrades} trades
      </span>
      {showCountdown && (
        <span className="fsb-countdown" title="Time until current bar closes">
          ⏱ {String(cdMin).padStart(2, "0")}:{String(cdSec).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
