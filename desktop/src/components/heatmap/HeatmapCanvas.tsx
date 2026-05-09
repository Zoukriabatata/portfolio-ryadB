// Phase B / M6a-1 + M6a-2 — React wrapper for the WebGL heatmap.
//
// Renders three layers stacked:
//   1. WebGL canvas — passive-orders bg painted by HeatmapRenderer
//   2. Canvas2D overlay — crosshair / price+time tags / cell tooltip
//   3. CSS spans — right-edge price axis + bottom time axis
//
// Pan/zoom (M6a-2) reuses the InteractionState machine from
// `lib/footprint/interactions` (same wheel + drag conventions as
// the footprint surface). The InteractionState lives in a ref so
// the renderer's RAF loop can read it without React rerenders;
// every event handler ends with a `tickRender()` that pushes the
// viewport + redraws the overlay.

import { useCallback, useEffect, useRef } from "react";
import { useHeatmap } from "../../lib/heatmap/useHeatmap";
import {
  DEFAULT_INTERACTION,
  applyWheelZoom,
  applyWheelZoomY,
  endDrag,
  setHover,
  startDrag,
  updateDrag,
  type InteractionState,
} from "../../lib/footprint/interactions";
import "./HeatmapCanvas.css";

export type HeatmapCanvasProps = {
  /** Exchange-suffixed symbol like "BTCUSDT.BYBIT". null → empty
   *  state. */
  symbol: string | null;
  /** Display-only label (e.g. "BTCUSDT") shown in the corner. */
  displaySymbol?: string;
};

const PRICE_AXIS_LABELS = 6;
const DEFAULT_CELL_WIDTH = 110;
const DEFAULT_ROW_HEIGHT = 16;

export function HeatmapCanvas({ symbol, displaySymbol }: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState>({ ...DEFAULT_INTERACTION });
  const { ready, stats, state, rendererRef } = useHeatmap(canvasRef, symbol);

  const [minPrice, maxPrice] = stats.priceRange;
  const hasRange = maxPrice > minPrice;
  const decimals = inferDecimals(maxPrice - minPrice);

  // Translate the footprint-flavoured InteractionState into the
  // heatmap viewport uniforms. We don't refactor the names yet —
  // M7 GEX will be the third call site and that's when extracting
  // a shared "Camera" type starts paying for itself.
  const tickRender = useCallback(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    const interaction = interactionRef.current;
    const xZoom = clamp(interaction.cellWidth / DEFAULT_CELL_WIDTH, 0.2, 5);
    const yZoom = clamp(interaction.rowHeight / DEFAULT_ROW_HEIGHT, 0.2, 5);
    // Auto-follow X: when userOverrodeX is false, lock the right
    // edge to the latest texel (sample.x = 1 at v_uv.x = 1, which
    // means viewport.x = 1 - 0.5/xZoom). When the user has panned,
    // shift by their accumulated drag in texture-uv units.
    const wrapWidth = wrap.clientWidth || 1;
    const wrapHeight = wrap.clientHeight || 1;
    const baseX = 1 - 0.5 / xZoom;
    // Pixel-to-texture mapping: we let one full pixel-width of
    // canvas drag move one pixel-equivalent in the visible window.
    // Scaling by xZoom keeps the apparent drag speed constant
    // regardless of zoom level (drag a feature, it sticks under
    // the cursor).
    const xPanUv = interaction.userOverrodeX
      ? -interaction.scrollX / wrapWidth / xZoom
      : 0;
    const baseY = 0.5;
    const yPanUv = interaction.userOverrodeY
      ? -interaction.scrollY / wrapHeight / yZoom
      : 0;

    // (Future-proof: there's no clamp on viewport here — out-of-
    // range samples paint the bg in the shader. The user can pan
    // off the data into navy and come back; harmless.)

    rendererRef.current?.setViewport({
      x: baseX + xPanUv,
      y: baseY + yPanUv,
      xZoom,
      yZoom,
    });

    drawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build N evenly-spaced labels for the price axis.
  const priceLabels: { yPct: number; label: string }[] = [];
  if (hasRange) {
    for (let i = 0; i <= PRICE_AXIS_LABELS; i++) {
      const t = i / PRICE_AXIS_LABELS;
      const price = maxPrice - t * (maxPrice - minPrice);
      priceLabels.push({ yPct: t * 100, label: price.toFixed(decimals) });
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

  function drawOverlay() {
    const overlay = overlayRef.current;
    const wrap = wrapperRef.current;
    if (!overlay || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    if (
      overlay.width !== Math.floor(w * dpr) ||
      overlay.height !== Math.floor(h * dpr)
    ) {
      overlay.width = Math.floor(w * dpr);
      overlay.height = Math.floor(h * dpr);
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
    }

    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const interaction = interactionRef.current;
    if (
      interaction.hoverX === null ||
      interaction.hoverY === null ||
      interaction.isDragging
    ) {
      return;
    }
    const hx = interaction.hoverX;
    const hy = interaction.hoverY;

    // Crosshair
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, 0);
    ctx.lineTo(Math.round(hx) + 0.5, h);
    ctx.moveTo(0, Math.round(hy) + 0.5);
    ctx.lineTo(w, Math.round(hy) + 0.5);
    ctx.stroke();
    ctx.restore();

    // getCellAt expects coordinates relative to the WebGL canvas,
    // which has the same wrapper origin and dimensions, so we can
    // pass hx/hy through directly.
    const cell = rendererRef.current?.getCellAt(hx, hy) ?? null;

    // Price tag on the right edge — gold border, navy bg.
    if (cell) {
      const priceLabel = cell.price.toFixed(decimals);
      ctx.font =
        "10px ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace";
      const tagW = Math.max(56, ctx.measureText(priceLabel).width + 14);
      const tagH = 16;
      const tagX = w - tagW - 4;
      const tagY = hy - tagH / 2;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = "#fbbf24";
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1);
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(priceLabel, tagX + 6, hy);
    }

    // Time tag at the bottom — gold border, navy bg.
    if (cell) {
      const tLabel = formatHHMMSS(new Date(cell.timestampMs));
      ctx.font =
        "10px ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace";
      const tagW = Math.max(72, ctx.measureText(tLabel).width + 14);
      const tagH = 16;
      const tagX = hx - tagW / 2;
      const tagY = h - tagH - 4;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = "#fbbf24";
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1);
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tLabel, hx, tagY + tagH / 2);
    }

    // Cell tooltip — bid/ask qty at the snapped price.
    if (cell && (cell.bidQty !== null || cell.askQty !== null)) {
      const lines = [
        `${cell.price.toFixed(decimals)}`,
        `bid ${formatQty(cell.bidQty)}  ·  ask ${formatQty(cell.askQty)}`,
      ];
      ctx.font =
        "11px ui-monospace, SFMono-Regular, 'SF Mono', Consolas, monospace";
      const lineH = 14;
      const padX = 8;
      const padY = 6;
      const ttW =
        Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      const ttH = lines.length * lineH + padY * 2;
      let tx = hx + 14;
      let ty = hy + 14;
      if (tx + ttW > w - 4) tx = hx - ttW - 14;
      if (ty + ttH > h - 4) ty = hy - ttH - 14;
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.fillRect(tx, ty, ttW, ttH);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(tx + 0.5, ty + 0.5, ttW - 1, ttH - 1);
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], tx + padX, ty + padY + i * lineH);
      }
    }
  }

  // Mouse / wheel handlers — same skeleton as FootprintCanvas.
  // Window-level mousemove + mouseup so a drag that escapes the
  // wrapper still tracks correctly.
  useEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap || !ready) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        interactionRef.current = applyWheelZoomY(
          interactionRef.current,
          e.deltaY,
        );
      } else {
        interactionRef.current = applyWheelZoom(
          interactionRef.current,
          e.deltaY,
          e.clientX - rect.left,
          rect.width,
        );
      }
      tickRender();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const mode = e.shiftKey ? "y" : "x";
      interactionRef.current = startDrag(interactionRef.current, x, y, mode);
      wrap.classList.add("hm-dragging");
      if (mode === "y") wrap.classList.add("hm-dragging-y");
      tickRender();
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (interactionRef.current.isDragging) {
        interactionRef.current = updateDrag(interactionRef.current, x, y);
      } else {
        const inside =
          x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
        interactionRef.current = setHover(
          interactionRef.current,
          inside ? x : null,
          inside ? y : null,
        );
      }
      tickRender();
    };

    const onMouseUp = () => {
      if (!interactionRef.current.isDragging) return;
      interactionRef.current = endDrag(interactionRef.current);
      wrap.classList.remove("hm-dragging");
      wrap.classList.remove("hm-dragging-y");
      tickRender();
    };

    const onMouseLeave = () => {
      interactionRef.current = setHover(interactionRef.current, null, null);
      tickRender();
    };

    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    wrap.addEventListener("mouseleave", onMouseLeave);
    return () => {
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      wrap.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [ready, tickRender]);

  // Re-tick whenever the renderer reports new stats (a new
  // history sample landed). Keeps the auto-follow X locked to the
  // latest texel without us racing the renderer's RAF loop.
  useEffect(() => {
    tickRender();
  }, [stats.midPrice, state.history.length, tickRender]);

  function onResetView() {
    interactionRef.current = { ...DEFAULT_INTERACTION };
    tickRender();
  }

  return (
    <div className="hm-wrap" ref={wrapperRef}>
      <canvas ref={canvasRef} className="hm-canvas" />
      <canvas ref={overlayRef} className="hm-overlay" />

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
          <button
            type="button"
            className="hm-reset-view"
            onClick={onResetView}
            title="Reset pan + zoom"
          >
            ⟲ Reset view
          </button>
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

function formatQty(q: number | null): string {
  if (q === null) return "—";
  if (q >= 1000) return `${(q / 1000).toFixed(1)}K`;
  if (q >= 1) return q.toFixed(2);
  return q.toFixed(4);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
