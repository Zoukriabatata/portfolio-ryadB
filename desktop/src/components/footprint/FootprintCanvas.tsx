// Phase B / M4 — React wrapper around the imperative
// FootprintCanvasRenderer.
//
// Responsibilities:
//   - mount/unmount the renderer on the canvas ref
//   - observe container size and forward resizes
//   - throttle re-renders to one per RAF when bars change
//
// The underlying renderer has no internal animation loop; this
// component is the only place that calls .draw(). Bars come in via
// props from CryptoFootprint, which already filters by symbol +
// timeframe.

import { useEffect, useMemo, useRef } from "react";
import type { FootprintBar } from "../FootprintBarView";
import { FootprintCanvasRenderer } from "../../lib/footprint/FootprintCanvasRenderer";
import { tauriBarToRendererBar } from "../../lib/footprint/adapter";
import "./FootprintCanvas.css";

export interface FootprintCanvasProps {
  bars: FootprintBar[];
  symbol: string;
  timeframe: string;
  priceDecimals?: number;
  /** Header label shown above the canvas. Optional override. */
  title?: string;
}

export function FootprintCanvas({
  bars,
  symbol,
  timeframe,
  priceDecimals = 2,
  title,
}: FootprintCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FootprintCanvasRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // Mount the renderer once + tear it down on unmount. Theme is
  // baked in (Senzoukria default); switching themes later means
  // calling rendererRef.current?.setTheme(t) inside an effect.
  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new FootprintCanvasRenderer(canvasRef.current);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rendererRef.current = null;
    };
  }, []);

  // ResizeObserver keeps the canvas DPR-correct as the route
  // re-flows (e.g. when devtools opens, fullscreen toggles).
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      rendererRef.current?.resize(width, height);
      scheduleDraw();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Translate Tauri bars to the renderer's shape lazily — adapter
  // is ~50ns per bar so this is cheap, but useMemo means we don't
  // recompute when only an unrelated prop (title) changed.
  const rendererBars = useMemo(
    () => bars.map(tauriBarToRendererBar),
    [bars],
  );

  // RAF-throttle redraws so a 50-tick burst can't trigger 50 paints
  // — at most one paint per displayed frame.
  function scheduleDraw() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const r = rendererRef.current;
      if (!r) return;
      r.draw(rendererBars, priceDecimals);
    });
  }

  useEffect(() => {
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererBars, priceDecimals]);

  return (
    <div className="fp-canvas-wrap">
      <header className="fp-canvas-header">
        <span className="fp-canvas-title">{title ?? `${symbol} · ${timeframe}`}</span>
        <span className="fp-canvas-meta">
          {bars.length} bar{bars.length === 1 ? "" : "s"}
        </span>
      </header>
      <div ref={containerRef} className="fp-canvas-container">
        <canvas ref={canvasRef} className="fp-canvas" />
      </div>
    </div>
  );
}
