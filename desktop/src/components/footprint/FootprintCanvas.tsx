// Phase B / M4 + M4.5 — React wrapper around the imperative
// FootprintCanvasRenderer.
//
// Owns the InteractionState ref (pan/zoom/hover) so the renderer
// can pull the latest values inside its draw loop without React
// rerenders. Mouse/wheel/keyboard handlers update the ref through
// the pure helpers in `lib/footprint/interactions.ts` and then ask
// the renderer for a paint via `tickRender()`.

import { useEffect, useMemo, useRef } from "react";
import type { FootprintBar } from "../FootprintBarView";
import { FootprintCanvasRenderer } from "../../lib/footprint/FootprintCanvasRenderer";
import { tauriBarToRendererBar } from "../../lib/footprint/adapter";
import {
  DEFAULT_INTERACTION,
  applyWheelZoom,
  applyWheelZoomY,
  clampScrollX,
  clampScrollY,
  endDrag,
  setHover,
  startDrag,
  updateDrag,
  type InteractionState,
} from "../../lib/footprint/interactions";
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
  const interactionRef = useRef<InteractionState>({ ...DEFAULT_INTERACTION });
  const barsCountRef = useRef<number>(0);

  // Mount renderer once. The interaction getter closes over
  // `interactionRef.current` so the renderer always reads the
  // latest state.
  useEffect(() => {
    if (!canvasRef.current) return;
    rendererRef.current = new FootprintCanvasRenderer(canvasRef.current, {
      getInteractionState: () => interactionRef.current,
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rendererRef.current = null;
    };
  }, []);

  // ResizeObserver — keep DPR + canvas dimensions in sync with the
  // container as the layout reflows.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      rendererRef.current?.resize(width, height);
      tickRender();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rendererBars = useMemo(
    () => bars.map(tauriBarToRendererBar),
    [bars],
  );

  // Push bars + decimals into the renderer when they change, then
  // request a paint.
  //
  // Symbol-switch reset: when the bar list collapses to empty (the
  // user picked a different symbol/exchange), drop any user pan/zoom
  // — keeping a stale scrollY against a brand-new price range would
  // leave the new chart looking either empty or off-axis.
  useEffect(() => {
    if (rendererBars.length === 0 && barsCountRef.current > 0) {
      interactionRef.current = { ...DEFAULT_INTERACTION };
    }
    barsCountRef.current = rendererBars.length;
    const r = rendererRef.current;
    if (!r) return;
    r.setBars(rendererBars);
    r.setPriceDecimals(priceDecimals);
    tickRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererBars, priceDecimals]);

  function tickRender() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      rendererRef.current?.render();
    });
  }

  // Re-clamp scroll after any change that shifts content (zoom,
  // drag, new bars). Called from event handlers below. Both axes
  // are clamped here so we don't have to remember which event
  // touched which axis.
  function clampAndRender() {
    const r = rendererRef.current;
    if (r) {
      const cap = r.getVisibleBarsCapacity();
      const { totalContentHeight, chartHeight } = r.getYExtent();
      interactionRef.current = {
        ...interactionRef.current,
        scrollX: clampScrollX(
          interactionRef.current.scrollX,
          barsCountRef.current,
          interactionRef.current.cellWidth,
          cap,
        ),
        // Y clamp only matters when the user has overridden — the
        // autofit path ignores scrollY entirely.
        scrollY: interactionRef.current.userOverrodeY
          ? clampScrollY(
              interactionRef.current.scrollY,
              totalContentHeight,
              chartHeight,
            )
          : 0,
      };
    }
    tickRender();
  }

  // Mouse / wheel handlers. Mousemove + mouseup live on `window` so
  // a drag that escapes the canvas still updates correctly.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      // Ctrl/Cmd+wheel = Y zoom (modifies rowHeight). Plain wheel
      // stays on the X axis (M4.5 behaviour). We test both keys so
      // Mac trackpads report the same intent as Windows.
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
      clampAndRender();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Shift+drag = Y pan, plain drag = X pan (M4.5 behaviour).
      const mode = e.shiftKey ? "y" : "x";
      interactionRef.current = startDrag(interactionRef.current, x, y, mode);
      canvas.classList.add("fp-canvas-dragging");
      if (mode === "y") canvas.classList.add("fp-canvas-y-drag");
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (interactionRef.current.isDragging) {
        interactionRef.current = updateDrag(
          interactionRef.current,
          x,
          y,
        );
        clampAndRender();
      } else {
        const inside =
          x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
        interactionRef.current = setHover(
          interactionRef.current,
          inside ? x : null,
          inside ? y : null,
        );
        tickRender();
      }
    };

    const onMouseUp = () => {
      if (!interactionRef.current.isDragging) return;
      interactionRef.current = endDrag(interactionRef.current);
      canvas.classList.remove("fp-canvas-dragging");
      canvas.classList.remove("fp-canvas-y-drag");
    };

    const onMouseLeave = () => {
      interactionRef.current = setHover(interactionRef.current, null, null);
      tickRender();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onResetView() {
    interactionRef.current = { ...DEFAULT_INTERACTION };
    tickRender();
  }

  return (
    <div className="fp-canvas-wrap">
      <header className="fp-canvas-header">
        <span className="fp-canvas-title">{title ?? `${symbol} · ${timeframe}`}</span>
        <span className="fp-canvas-meta">
          {bars.length} bar{bars.length === 1 ? "" : "s"}
          <button
            type="button"
            className="fp-reset-view"
            onClick={onResetView}
            title="Reset pan + zoom to defaults"
          >
            Reset view
          </button>
        </span>
      </header>
      <div ref={containerRef} className="fp-canvas-container">
        <canvas ref={canvasRef} className="fp-canvas" />
      </div>
    </div>
  );
}
