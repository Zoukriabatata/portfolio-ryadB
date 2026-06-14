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
  /**
   * Exchange-pushed cumulative session volume (NT Market Analyzer's
   * "Daily volume" column source). Only the bridge connector knows
   * this number — Rithmic-native and crypto stay null. When
   * available, the bar shows it alongside the bar-summed counter so
   * the user can see both the authoritative session total and what
   * we actually ingested.
   */
  brokerDailyVolume?: number | null;
  /**
   * Inline mode: render only the live readout (price · Δ · vol ·
   * trades · countdown) with no bar chrome (no background, border,
   * padding, connection dot, symbol/tf/exchange). Used when the
   * status bar is merged into the single top toolbar — the symbol,
   * timeframe and connection state are already shown there.
   */
  inline?: boolean;
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
  brokerDailyVolume = null,
  inline = false,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const last = bars[0]; // newest, since CryptoFootprint sorts desc
  const lastPrice = last?.close ?? null;

  // Daily session boundary = local midnight today. The bridge replays
  // the full NT chart history (which can span several days) and the
  // Rust engine keeps every bar, so summing the whole cache mixes
  // previous sessions into the "session" counters — a multi-day cache
  // produced ~1.3M vol on MNQ where NT showed ~341k. Filtering at
  // local midnight scopes the counters to today only.
  const sessionStartNs = new Date().setHours(0, 0, 0, 0) * 1_000_000;
  const dailyBars = bars.filter((b) => b.bucketTsNs >= sessionStartNs);
  const sessionDelta = dailyBars.reduce((s, b) => s + b.totalDelta, 0);
  const sessionVol = dailyBars.reduce((s, b) => s + b.totalVolume, 0);
  const sessionTrades = dailyBars.reduce((s, b) => s + b.tradeCount, 0);

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
    <div
      className={inline ? "fsb-bar fsb-inline" : "fsb-bar"}
      role="status"
      aria-live="polite"
    >
      {!inline && (
        <>
          <span className={dotClass} title={dotTitle} aria-hidden />
          <span className="fsb-symbol">{symbol}</span>
          <span className="fsb-sep">·</span>
          <span className="fsb-tf">{timeframe}</span>
          <span className="fsb-sep">·</span>
          <span className="fsb-exchange">{exchange}</span>
          <span className="fsb-spacer" />
        </>
      )}

      {lastPrice !== null && (
        <span className="fsb-price">{lastPrice.toFixed(priceDecimals)}</span>
      )}
      <span
        className={`fsb-delta ${sessionDelta >= 0 ? "fsb-pos" : "fsb-neg"}`}
        title="Today's cumulative delta (since 00:00 local)"
      >
        Δ {sessionDelta >= 0 ? "+" : ""}
        {sessionDelta.toFixed(0)}
      </span>
      {brokerDailyVolume !== null ? (
        <span
          className="fsb-vol"
          title={`Exchange session volume (authoritative, from broker feed) — ${sessionVol.toFixed(0)} captured locally since 00:00 local`}
        >
          vol {brokerDailyVolume.toLocaleString("fr-FR")}
          <span style={{ opacity: 0.55, marginLeft: 4 }}>
            ({sessionVol.toFixed(0)} capt)
          </span>
        </span>
      ) : (
        <span
          className="fsb-vol"
          title="Today's cumulative volume (since 00:00 local)"
        >
          vol {sessionVol.toFixed(0)}
        </span>
      )}
      <span
        className="fsb-trades"
        title="Today's trade count (since 00:00 local)"
      >
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
