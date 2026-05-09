// Phase B / M6a-1 — React wrapper for the WebGL heatmap.
//
// Renders one WebGL canvas (the bg passive-orders layer) plus a
// thin React overlay for the right-side price axis + bottom time
// axis. Pan/zoom + crosshair + tooltip arrive in M6a-2; for now
// the viewport is fixed to the latest 5 minutes and the entire
// price range visible across the window.

import { useRef } from "react";
import { useHeatmap } from "../../lib/heatmap/useHeatmap";
import "./HeatmapCanvas.css";

export type HeatmapCanvasProps = {
  /** Exchange-suffixed symbol like "BTCUSDT.BYBIT". null → empty
   *  state. */
  symbol: string | null;
  /** Display-only label (e.g. "BTCUSDT") shown in the corner. */
  displaySymbol?: string;
};

const PRICE_AXIS_LABELS = 6;

export function HeatmapCanvas({ symbol, displaySymbol }: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ready, stats, state } = useHeatmap(canvasRef, symbol);

  const [minPrice, maxPrice] = stats.priceRange;
  const hasRange = maxPrice > minPrice;
  const decimals = inferDecimals(maxPrice - minPrice);

  // Build N evenly-spaced labels for the price axis. Top of canvas
  // = highest price; bottom = lowest.
  const priceLabels: { yPct: number; label: string }[] = [];
  if (hasRange) {
    for (let i = 0; i <= PRICE_AXIS_LABELS; i++) {
      const t = i / PRICE_AXIS_LABELS;
      const price = maxPrice - t * (maxPrice - minPrice);
      priceLabels.push({
        yPct: t * 100,
        label: price.toFixed(decimals),
      });
    }
  }

  const oldestMs = state.history[0]?.timestampMs ?? 0;
  const newestMs =
    state.history[state.history.length - 1]?.timestampMs ?? 0;
  const timeLabels: { xPct: number; label: string }[] = [];
  if (newestMs > 0 && oldestMs > 0 && newestMs > oldestMs) {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const ms = oldestMs + t * (newestMs - oldestMs);
      timeLabels.push({
        xPct: t * 100,
        label: formatHHMMSS(new Date(ms)),
      });
    }
  }

  return (
    <div className="hm-wrap">
      <canvas ref={canvasRef} className="hm-canvas" />

      {symbol && !ready && (
        <div className="hm-loading">Initializing WebGL…</div>
      )}
      {!symbol && (
        <div className="hm-empty">Select a symbol to begin.</div>
      )}

      {ready && state.history.length > 0 && (
        <>
          <div className="hm-price-axis" aria-hidden>
            {priceLabels.map((l, i) => (
              <span
                key={i}
                className="hm-axis-tick"
                style={{ top: `${l.yPct}%` }}
              >
                {l.label}
              </span>
            ))}
          </div>
          <div className="hm-time-axis" aria-hidden>
            {timeLabels.map((l, i) => (
              <span
                key={i}
                className="hm-time-tick"
                style={{ left: `${l.xPct}%` }}
              >
                {l.label}
              </span>
            ))}
          </div>
          <div className="hm-corner" aria-hidden>
            <span className="hm-symbol-tag">
              {displaySymbol ?? symbol}
            </span>
            <span className="hm-mid-tag">
              mid {stats.midPrice.toFixed(decimals)}
            </span>
            <span className="hm-meta-tag">
              {state.history.length}/300 · {Math.round(stats.fps)} fps
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function inferDecimals(span: number): number {
  if (span <= 0) return 2;
  if (span >= 100) return 1;
  if (span >= 1) return 2;
  if (span >= 0.01) return 4;
  return 6;
}

function formatHHMMSS(d: Date): string {
  return d.toLocaleTimeString("fr-FR", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
