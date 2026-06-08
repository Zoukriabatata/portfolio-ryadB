// Phase B / M4 + M4.5 + M4.7a — React wrapper around the
// imperative FootprintCanvasRenderer.
//
// Owns the InteractionState ref (pan/zoom/hover) so the renderer
// can pull the latest values inside its draw loop without React
// rerenders. Mouse/wheel/keyboard handlers update the ref through
// the pure helpers in `lib/footprint/interactions.ts` and then ask
// the renderer for a paint via `tickRender()`.
//
// M4.7a — exposes an imperative `FootprintCanvasHandle`
// (zoomIn/zoomOut/resetView) via forwardRef + useImperativeHandle
// so the floating ZoomControls toolbar can drive the same internal
// state that the wheel/drag listeners mutate.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FootprintBar } from "../FootprintBarView";
// P1.5 — switched to the Pro adapter that internally drives the
// ported web FootprintProRenderer. Same public API as the legacy
// FootprintCanvasRenderer; richer visuals (heatmap gradient, POC
// arrow, VAH/VAL pills, etc.).
import {
  FootprintCanvasRenderer,
  getTradeDrawingDeleteRect,
  getPositionEntryCloseRect,
  getTradeDrawingHandles,
  getLineDrawingHandles,
  DRAWING_HANDLE_SIZE,
  type DrawingHandleKind,
  type LineHandleKind,
  type FootprintRendererSettings,
} from "../../lib/footprint/FootprintProAdapter";
import { tauriBarToRendererBar } from "../../lib/footprint/adapter";
import type { IndicatorsResult } from "../../lib/footprint/indicators";
import {
  DEFAULT_INTERACTION,
  applyWheelZoom,
  applyWheelZoomY,
  applyWheelZoomXY,
  clampScrollX,
  endDrag,
  setHover,
  startDrag,
  updateDrag,
  goLive,
  resetScale,
  isLiveMode,
  type InteractionState,
} from "../../lib/footprint/interactions";
import { ChartLiveBanner } from "./ChartLiveBanner";
import { useToolDrawingsStore } from "../../stores/useToolDrawingsStore";
import { useFootprintSettingsStore } from "../../stores/useFootprintSettingsStore";
import { useSimAccountStore } from "../../lib/sim/useSimAccountStore";
import {
  createDefaultDrawing,
  createDefaultLineDrawing,
  defaultEndTimeSec,
  type TradeDrawing,
  type LineDrawing,
  type LineDrawingKind,
  type TradeDrawingType,
  type HLineDrawing,
} from "../../lib/footprint/tradeDrawings";
import {
  ChartContextMenu,
  IconBell,
  IconCopy,
  IconPaste,
  IconSettings,
  type ChartContextMenuItem,
} from "./ChartContextMenu";
import { TextDrawingEditor } from "./TextDrawingEditor";
import { DrawingPropertiesPanel } from "./DrawingPropertiesPanel";
import { POSITION_ENTRY_LINE_ID } from "../../lib/sim/useSimPositionOverlay";
import { computePnl, getContractSpec } from "../../lib/sim/contractSpecs";
import type { Side as SimSide } from "../../lib/sim/useSimAccountStore";
import { isAppActive } from "../../lib/usePauseOnBlur";

/** Temporary ghost line id for the "drag from entry to create
 *  SL/TP" interaction. Lives only for the duration of the drag. */
const BRACKET_GHOST_LINE_ID = "sim:bracket:ghost";
import "./FootprintCanvas.css";

// Pixel tolerance for hit-testing trade-drawing line handles
// (entry/stop/target horizontal lines).
const DRAWING_HANDLE_TOLERANCE_PX = 5;
// Hit-test pad around the corner/edge resize handles (white squares).
// Slightly bigger than the rendered square so the user doesn't have
// to land on the exact pixel.
const DRAWING_BOX_HANDLE_PAD_PX = 3;

type HandleDrag = {
  drawingId: string;
  handle: DrawingHandleKind;
};

export interface FootprintCanvasProps {
  bars: FootprintBar[];
  symbol: string;
  timeframe: string;
  priceDecimals?: number;
  /** Header label shown above the canvas. Optional override. */
  title?: string;
  /** When true the component renders just the canvas + header
   *  (no internal toolbars). Caller is responsible for any chrome
   *  around it — used by CryptoFootprint M4.7a where the
   *  ZoomControls floats over the canvas at the route level. */
  bare?: boolean;
  /** Wires the right-click context menu's "Settings" entry to the
   *  caller's AdvancedSettingsModal (opening behaviour lives in the
   *  page-level component, the canvas just needs to fire it). */
  onOpenSettings?: () => void;
}

export type FootprintCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  /** M4.7b — push the user-controlled settings (visibility flags,
   *  numeric format, magnet mode) into the renderer and request a
   *  paint. Caller passes the renderer's shape, not the Zustand
   *  store directly, so the component stays decoupled from the
   *  store's exact field names. */
  applySettings: (settings: FootprintRendererSettings) => void;
  /** M4.7c — feed pre-computed indicator overlays into the
   *  renderer. The React layer's IndicatorsRunner produces these
   *  off the main thread and pipes them through this method. */
  applyIndicators: (result: IndicatorsResult) => void;
  /** Sibling components (DOM panel, indicator sidebars) that render
   *  in their own DOM element next to the canvas can read this on
   *  RAF to align their rows with the chart's price axis. Returns
   *  null until the first paint has produced metrics. */
  getPriceMap: () => PriceMap | null;
};

export type PriceMap = {
  /** Lowest price visible in the chart's price area. */
  minPrice: number;
  /** Highest price visible in the chart's price area. */
  maxPrice: number;
  /** Top of the price area in CSS pixels relative to the canvas
   *  DOM element's top. Includes any header / OHLC strip space. */
  areaTopPx: number;
  /** Height of the price area in CSS pixels — corresponds to the
   *  full minPrice→maxPrice band. */
  areaHeightPx: number;
};

export const FootprintCanvas = forwardRef<
  FootprintCanvasHandle,
  FootprintCanvasProps
>(function FootprintCanvas(
  {
    bars,
    symbol,
    timeframe,
    priceDecimals = 2,
    title,
    bare = false,
    onOpenSettings,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<FootprintCanvasRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  // 60 FPS cap state. lastRenderTimeRef holds the rAF timestamp of
  // the last actual paint; renderCountRef ticks once per real paint
  // so the FPS counter reports rendered-frames-per-second (not
  // monitor-refresh-per-second, which is what a naive rAF counter
  // gives and which doesn't reflect actual fluidity).
  const lastRenderTimeRef = useRef(0);
  const renderCountRef = useRef(0);
  const interactionRef = useRef<InteractionState>({ ...DEFAULT_INTERACTION });
  const barsCountRef = useRef<number>(0);

  // Trade-drawing state. We subscribe field-by-field so an unrelated
  // store update doesn't force a re-render of the whole canvas tree.
  const drawings = useToolDrawingsStore((s) => s.drawings);
  const lineDrawings = useToolDrawingsStore((s) => s.lineDrawings);
  const activeTool = useToolDrawingsStore((s) => s.activeTool);
  const addDrawing = useToolDrawingsStore((s) => s.addDrawing);
  const updateDrawing = useToolDrawingsStore((s) => s.updateDrawing);
  const removeDrawing = useToolDrawingsStore((s) => s.removeDrawing);
  const addLineDrawing = useToolDrawingsStore((s) => s.addLineDrawing);
  const updateLineDrawing = useToolDrawingsStore((s) => s.updateLineDrawing);
  const removeLineDrawing = useToolDrawingsStore((s) => s.removeLineDrawing);
  const setActiveTool = useToolDrawingsStore((s) => s.setActiveTool);
  const crosshairOn = useFootprintSettingsStore((s) => s.showCrosshair);
  // Stable refs for the mouse-handler closures (registered once on
  // mount). Without the refs, every store change would re-bind the
  // canvas listeners and we'd drop mid-drag updates.
  const activeToolRef = useRef(activeTool);
  const drawingsRef = useRef(drawings);
  const lineDrawingsRef = useRef(lineDrawings);
  const symbolRef = useRef(symbol);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);
  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);
  useEffect(() => {
    lineDrawingsRef.current = lineDrawings;
  }, [lineDrawings]);
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);
  const handleDragRef = useRef<HandleDrag | null>(null);
  // Active "drag-from-entry to create SL/TP" session. When non-null,
  // mousemove paints a ghost h-line at the cursor price and mouseup
  // commits it as `position.stopLoss` or `takeProfit` based on the
  // drag direction relative to entry. Captured at mousedown so the
  // sim position state at the moment of the drag-start is the
  // reference, even if it changes mid-drag.
  const bracketCreateRef = useRef<{
    symbol: string;
    side: SimSide;
    qty: number;
    entryPrice: number;
  } | null>(null);
  // Selection model — only the drawing whose id matches gets the
  // resize handles + delete button rendered. Click off any drawing
  // deselects (clean render). Re-click on a drawing selects it again.
  // Kept as a ref (not state) because every change pushes through
  // the renderer + triggers a paint manually; React doesn't need to
  // know about it.
  const selectedDrawingIdRef = useRef<string | null>(null);
  // React-state mirror of the selection. The ref above stays for
  // fast-path access from the mouse handlers (no re-render on every
  // drag tick), the state drives the floating properties panel's
  // mount / unmount lifecycle.
  const [selectedDrawingIdState, setSelectedDrawingIdState] = useState<
    string | null
  >(null);
  // Live screen anchor (viewport coords) for the floating properties
  // panel. Recomputed by a rAF loop while a drawing is selected so
  // the panel follows pan / zoom.
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Right-click context menu state. `null` = closed. When open we
  // also cache the price + time + bar spacing snapped at the click
  // point so the menu actions don't have to re-hit-test against a
  // potentially-stale cursor position.
  const [ctxMenu, setCtxMenu] = useState<null | {
    clientX: number;
    clientY: number;
    price: number;
    timeSec: number;
    barSpacingSec: number;
  }>(null);
  // Inline text editor — when set, an <input> overlays the canvas
  // at the anchor of the matching TextDrawing. Used both for fresh
  // text-tool placements and (later) double-click-to-edit. The
  // x/y are captured viewport coords at the moment of placement;
  // panning the chart while the editor is open doesn't move the
  // overlay (the user is typing, the chart can shift underneath —
  // commit then settle).
  const [editingText, setEditingText] = useState<null | {
    id: string;
    clientX: number;
    clientY: number;
    initial: string;
  }>(null);
  const [isLive, setIsLive] = useState(true);
  function setSelectedDrawingId(id: string | null) {
    if (selectedDrawingIdRef.current === id) return;
    selectedDrawingIdRef.current = id;
    setSelectedDrawingIdState(id);
    rendererRef.current?.setSelectedDrawingId(id);
    tickRender();
  }
  // Line-drawing drag state. The `anchor` snapshot lets body drags
  // translate the whole shape while preserving the offset between
  // the click point and the line itself (TradingView-style "grab
  // where I clicked"). Endpoint handle drags don't need the anchor.
  // `isFreshCreation` flags a drag that started by placing a new
  // trend-line via the click-drag flow — on mouseUp we discard the
  // drawing if the user never actually dragged (zero-length).
  const lineHandleDragRef = useRef<{
    drawingId: string;
    kind: LineHandleKind;
    anchor?: {
      clickTime: number;
      clickPrice: number;
      snapshot: LineDrawing;
    };
    isFreshCreation?: boolean;
  } | null>(null);

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

  // Push the latest trade-drawings + current symbol to the renderer
  // and request a repaint. Cheap pass-through; the heavy lifting
  // (hit-test on drag) lives in the mouse handlers below.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setTradeDrawings(drawings);
    r.setLineDrawings(lineDrawings);
    r.setCurrentSymbol(symbol);
    // Drop the selection if the selected drawing was just deleted
    // (right-click, keyboard Delete, clear-all) or belongs to a
    // different symbol than the one being shown.
    const selId = selectedDrawingIdRef.current;
    if (selId !== null) {
      const stillExists =
        drawings.some((d) => d.id === selId && d.symbol === symbol) ||
        lineDrawings.some((d) => d.id === selId && d.symbol === symbol);
      if (!stillExists) setSelectedDrawingId(null);
    }
    tickRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings, lineDrawings, symbol]);

  // Track the selected drawing's anchor in viewport coords so the
  // floating properties panel follows pan / zoom. We poll via rAF
  // because the chart redraws on a ref (not React state), and the
  // panel needs to stick to the drawing through every drag /
  // wheel-zoom frame. Loop stops the moment selection clears.
  useEffect(() => {
    if (selectedDrawingIdState === null) {
      setPanelPos(null);
      return;
    }
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const r = rendererRef.current;
      const metrics = r?.getLastMetrics() ?? null;
      const layout = r?.getLayoutEngine();
      if (canvas && metrics && layout) {
        const id = selectedDrawingIdState;
        const trade = drawingsRef.current.find((d) => d.id === id);
        const line = lineDrawingsRef.current.find((d) => d.id === id);
        const anchor = trade
          ? computeTradeAnchor(trade, layout, metrics)
          : line
            ? computeLineAnchor(line, layout, metrics)
            : null;
        if (anchor) {
          const rect = canvas.getBoundingClientRect();
          setPanelPos({
            x: rect.left + anchor.x,
            y: rect.top + anchor.y,
          });
        } else {
          setPanelPos(null);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    let rafId = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    };
  }, [selectedDrawingIdState]);

  // Cursor: when a LONG/SHORT tool is armed in the toolbar the canvas
  // shows a crosshair to signal "click to place"; otherwise it stays
  // default (drag / pan).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.toggle("fp-canvas-placing-tool", activeTool !== null);
  }, [activeTool]);

  // Hide the OS cursor when the chart crosshair is on — the
  // on-canvas crosshair is the only pointer affordance. Skipped
  // when a drawing tool is armed or a handle drag is active so
  // their own cursors stay visible.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.classList.toggle(
      "fp-canvas-cursor-hidden",
      crosshairOn && activeTool === null,
    );
  }, [crosshairOn, activeTool]);

  // Escape cancels an armed tool. Bound on window so it works even
  // when the canvas hasn't been focused.
  useEffect(() => {
    if (activeTool === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, setActiveTool]);

  // Delete / Backspace → remove ONLY the currently selected drawing
  // (whichever id is held in selectedDrawingIdRef). If nothing is
  // selected the shortcut is a no-op — the user has to either
  // click the drawing first or use the trash icon for a wipe-all.
  // Listener is bound permanently because the selection ref is
  // mutated in place; an effect-with-deps would race against the
  // ref update and miss the latest selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const id = selectedDrawingIdRef.current;
      if (!id) return;
      // The id can belong to either the trade-drawing set or the
      // line-drawing set — try both, the one that doesn't match is
      // a no-op. setSelectedDrawingId(null) at the end keeps the
      // ref consistent in case the cleanup-on-removed effect races
      // (it would clear it anyway, but explicit is safer).
      const inTrade = drawingsRef.current.some((d) => d.id === id);
      const inLine = lineDrawingsRef.current.some((d) => d.id === id);
      if (inTrade) removeDrawing(id);
      else if (inLine) removeLineDrawing(id);
      if (inTrade || inLine) setSelectedDrawingId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep canvas dimensions in sync with the container. Three triggers:
  //   1. ResizeObserver on the container (covers most cases — layout
  //      reflow, splitter drag, font reflow).
  //   2. window.resize as a fallback (RO is debounced by some browsers
  //      and can drop frames during fast drags / maximize / restore).
  //   3. matchMedia('resolution: ...') — catches devicePixelRatio changes
  //      when the window crosses monitors with different DPRs.
  useEffect(() => {
    if (!containerRef.current) return;

    const measureFromContainer = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      rendererRef.current?.resize(rect.width, rect.height);
      tickRender();
    };

    const ro = new ResizeObserver(() => measureFromContainer());
    ro.observe(containerRef.current);

    const onWinResize = () => measureFromContainer();
    window.addEventListener("resize", onWinResize);

    // DPR change listener — bind/rebind a matchMedia for the current ratio.
    let mql: MediaQueryList | null = null;
    const bindDpr = () => {
      mql?.removeEventListener("change", onDpr);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onDpr);
    };
    const onDpr = () => {
      measureFromContainer();
      bindDpr(); // re-bind for the new DPR value
    };
    bindDpr();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      mql?.removeEventListener("change", onDpr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rendererBars = useMemo(
    () => bars.map(tauriBarToRendererBar),
    [bars],
  );

  // Push bars + decimals into the renderer when they change, then
  // request a paint.
  //
  // Reset / re-fit the viewport on two transitions:
  //   1. Bar list collapsed to empty — user picked a different
  //      symbol/exchange, the price range is brand new, any stale
  //      pan/zoom would leave the chart looking empty or off-axis.
  //   2. Bar count grew by >2× (history fetch just landed). Without
  //      this, the chart stays pinned to whatever the live-only
  //      handful of bars was zoomed to, hiding the freshly-loaded
  //      00:00 → now session bars off-screen to the left. We pick
  //      a cellWidth that fits all bars in the visible viewport so
  //      the user immediately sees the whole session.
  useEffect(() => {
    const prev = barsCountRef.current;
    const next = rendererBars.length;
    const collapsedToEmpty = next === 0 && prev > 0;
    // History landed = bar count crossed the "more than a viewport
    // could show at default zoom" threshold AND grew significantly.
    // Triggers on:
    //   • cold start (prev=0) when history loads ≥30 bars in one go
    //   • re-fetch on timeframe change (prev=N, next=2N+)
    //   • first live bars arriving on a TF that didn't have history
    //     (prev was small, next > prev*2) — already handled by 2nd condition
    const historyLanded =
      next - prev >= 10 && (next >= 30 || next >= prev * 2);
    // Respect user navigation — once they've panned or zoomed,
    // never wipe their interaction state from under their hands.
    // Without this guard, a late history fetch (e.g. SQLite partial
    // fallback adding 100+ bars mid-drag) reset cellWidth to the
    // auto-fit, making it look like the chart "zoomed out by itself".
    const userInteracted =
      interactionRef.current.userOverrodeX ||
      interactionRef.current.userOverrodeY ||
      interactionRef.current.isDragging;
    // Cold-start auto-fit always wins: when prev was 0 the user
    // hasn't had a chance to interact yet, so respecting an
    // accidentally-true userOverrode flag (e.g. set by a stale wheel
    // event before first paint) would leave them stuck at the
    // default 110 px cellWidth and only see ~14 bars. For subsequent
    // landings (TF switch with stale interaction state), still
    // respect user override.
    const coldStart = prev === 0;
    const shouldAutoFit =
      historyLanded && (coldStart || !userInteracted);
    if (collapsedToEmpty) {
      interactionRef.current = { ...DEFAULT_INTERACTION };
    } else if (shouldAutoFit) {
      const rect = canvasRef.current?.getBoundingClientRect();
      // Reserve ~88px for the right-side price axis. The renderer
      // also pads ~8px on the left.
      const usableW = Math.max(200, (rect?.width ?? 1200) - 96);
      // Per-bar SLOT width on screen = (footprintWidth + ohlcWidth) * zoom + barGap
      // where zoom = cellWidth / footprintWidth. The default layout has
      // footprintWidth=112, ohlcWidth=12, barGap=4 — so a slot adds
      // ≈ 16px of overhead per bar that we MUST subtract before
      // solving for cellWidth, otherwise we overflow the viewport.
      const BASE_FP = 112; // bidWidth + askWidth from DEFAULT_LAYOUT
      const OHLC = 12;
      const GAP = 1; // mirror of DEFAULT_LAYOUT.barGap (types.ts)
      const slotTarget = usableW / Math.max(1, next);
      // Solve: (BASE_FP + OHLC) * cellWidth/BASE_FP + GAP = slotTarget
      const cellWidthRaw =
        ((slotTarget - GAP) * BASE_FP) / (BASE_FP + OHLC);
      // Floor at 1 px / cell so the whole session (00:00 → now,
      // up to ~600 × 1m bars at mid-morning) fits the viewport on
      // first load. The previous 6 px floor capped visible-bars at
      // ~200, leaving the user only the most recent ~3 hours after
      // auto-fit and hiding the midnight-anchored synth gap-fillers.
      // At 1 px the LOD switches to candle mode which renders fine
      // — the user can wheel-zoom in on any region they care about.
      const fit = Math.max(
        1,
        Math.min(DEFAULT_INTERACTION.cellWidth, Math.floor(cellWidthRaw)),
      );
      interactionRef.current = {
        ...DEFAULT_INTERACTION,
        cellWidth: fit,
        dragStartCellWidth: fit,
      };
    }
    barsCountRef.current = next;
    const r = rendererRef.current;
    if (!r) return;
    r.setBars(rendererBars);
    r.setPriceDecimals(priceDecimals);
    tickRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendererBars, priceDecimals]);

  function tickRender() {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame((t) => {
      rafRef.current = null;
      // Skip the paint ONLY when the app is truly hidden (minimised),
      // not on mere focus loss — a trader keeps Orderflow visible on a
      // second monitor while the broker is focused, and the chart must
      // keep updating. `isAppActive()` centralises this policy
      // (currently: active === document is visible). The next event
      // (data, resize, visibility return) re-calls tickRender.
      if (!isAppActive()) return;
      // 60 FPS cap. Without it, monitors at 120 / 144 / 170 Hz would
      // try to paint at native rate — burning CPU on per-frame work
      // (cells, gauges, text) just to have the OS compositor drop
      // most frames anyway. Capping at ~16.6 ms gives consistent
      // delivery and frees headroom so heavy frames don't blow past
      // their budget and create the 170 → 30 swing the user sees.
      if (t - lastRenderTimeRef.current < 15) {
        // Re-schedule one frame out so a pending update still paints,
        // just on the NEXT rAF tick (which by definition is ≥ the
        // monitor period away, so the gate will be satisfied).
        rafRef.current = requestAnimationFrame((t2) => {
          rafRef.current = null;
          if (!isAppActive()) return;
          lastRenderTimeRef.current = t2;
          renderCountRef.current += 1;
          rendererRef.current?.render();
        });
        return;
      }
      lastRenderTimeRef.current = t;
      renderCountRef.current += 1;
      rendererRef.current?.render();
    });
  }

  // P1.7 — drag without limits: don't clamp scrollX/scrollY. The user
  // can pan into arbitrary price ranges (above/below the data) and into
  // empty time ranges. The layout engine internally clamps the visible
  // bar slice, and `priceToY` accepts any scrollY — the chart simply
  // shows empty canvas past the data, which is what we want.
  // Clamp scrollX so dragging right past the leftmost bar (#0) doesn't
  // run scrollIndex off the end of the candle array — without this,
  // each extra pixel of drag was peeling one bar off the right side
  // of the viewport ("bars disappear when I drag right" bug).
  // Slot width formula mirrors FootprintLayoutEngine.getEffectiveFootprintWidth:
  //   slot = (BASE_FP + OHLC) * cellWidth / BASE_FP + GAP
  function clampAndRender() {
    const s = interactionRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    const usableW = Math.max(200, (rect?.width ?? 1200) - 96);
    const BASE_FP = 112;
    const OHLC = 12;
    const GAP = 1; // mirror of DEFAULT_LAYOUT.barGap (types.ts)
    const slot = ((BASE_FP + OHLC) * s.cellWidth) / BASE_FP + GAP;
    const capacity = Math.max(1, Math.floor(usableW / Math.max(1, slot)));
    const newScrollX = clampScrollX(s.scrollX, barsCountRef.current, slot, capacity);
    if (newScrollX !== s.scrollX) {
      interactionRef.current = { ...s, scrollX: newScrollX };
    }
    const nextIsLive = isLiveMode(interactionRef.current);
    setIsLive((prev) => (prev !== nextIsLive ? nextIsLive : prev));
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
      // Modifier mapping (P1.7 nav redesign):
      //   • plain wheel  = uniform XY zoom (anchored at cursor)
      //   • Shift+wheel  = Y only (anchored at cursor)
      //   • Ctrl/⌘+wheel = X only (anchored at cursor)
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      if (e.shiftKey) {
        interactionRef.current = applyWheelZoomY(
          interactionRef.current, e.deltaY, cursorY,
        );
      } else if (e.ctrlKey || e.metaKey) {
        interactionRef.current = applyWheelZoom(
          interactionRef.current, e.deltaY, cursorX, rect.width,
        );
      } else {
        interactionRef.current = applyWheelZoomXY(
          interactionRef.current, e.deltaY, cursorX, cursorY, rect.width,
        );
      }
      clampAndRender();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Drag mode (P1.7 nav redesign):
      //   • mousedown on price axis (right ~64px) → axisY (Y zoom)
      //   • mousedown on time axis (bottom ~22px) → axisX (X zoom)
      //   • mousedown anywhere else                → free 360° pan
      const PRICE_AXIS_W = 80;
      const TIME_AXIS_H = 22;
      const onPriceAxis = x >= rect.width - PRICE_AXIS_W;
      const onTimeAxis = y >= rect.height - TIME_AXIS_H;

      // Selection-aware dispatch: handles + delete button are gated by
      // selection (they're only rendered on the selected drawing, so
      // a "hit" outside the selection is geometry-only — ignore it).
      // A body-click on any drawing selects it. A click on empty
      // chart deselects.
      const selectedId = selectedDrawingIdRef.current;
      if (!onPriceAxis && !onTimeAxis) {
        const deleteHit = hitTestDeleteButton(x, y, rect.width - PRICE_AXIS_W);
        if (deleteHit && deleteHit === selectedId) {
          removeDrawing(deleteHit);
          setSelectedDrawingId(null);
          return;
        }
      }

      // Sim-position manual-close [×] button — checked BEFORE the
      // entry-line drag handler so a click on the button never gets
      // interpreted as the start of a bracket-create drag.
      if (!onPriceAxis && !onTimeAxis) {
        if (hitTestPositionEntryClose(x, y, rect.width - PRICE_AXIS_W)) {
          const pos = useSimAccountStore.getState().position;
          if (pos && pos.symbol === symbolRef.current) {
            useSimAccountStore.getState().flatten();
            return;
          }
        }
      }

      // Sim-position entry line — special drag UX. The line itself is
      // anchored to the fill price (can't move); grabbing it instead
      // starts a "create SL/TP" drag whose direction picks the
      // bracket. We hit-test it BEFORE the generic line hit-test so
      // it can never be selected as a regular drawing.
      if (!onPriceAxis && !onTimeAxis) {
        const entryHit = hitTestEntryLine(x, y, rect.width - PRICE_AXIS_W);
        if (entryHit) {
          const pos = useSimAccountStore.getState().position;
          if (pos && pos.symbol === symbolRef.current) {
            bracketCreateRef.current = {
              symbol: pos.symbol,
              side: pos.side,
              qty: pos.qty,
              entryPrice: pos.entryPrice,
            };
            canvas.classList.add("fp-canvas-handle-drag");
            return;
          }
        }
      }

      if (!onPriceAxis && !onTimeAxis) {
        const hit = hitTestHandle(x, y, rect.width - PRICE_AXIS_W);
        if (hit && hit.drawingId === selectedId) {
          handleDragRef.current = hit;
          canvas.classList.add("fp-canvas-handle-drag");
          return;
        }
        const lineHit = hitTestLineHandle(x, y, rect.width - PRICE_AXIS_W);
        if (lineHit && lineHit.drawingId === selectedId) {
          lineHandleDragRef.current = lineHit;
          canvas.classList.add("fp-canvas-handle-drag");
          return;
        }
        // Body-click on a TRADE drawing — selects it + starts drag of
        // the entry line (most common interaction). Without this the
        // user had no obvious way to select a trade drawing.
        const tradeBodyHit = hitTestDrawing(x, y, rect.width - PRICE_AXIS_W);
        if (tradeBodyHit) {
          setSelectedDrawingId(tradeBodyHit.id);
          return;
        }
        const bodyHit = hitTestLineDrawing(x, y, rect.width - PRICE_AXIS_W);
        if (bodyHit) {
          // First click on an unselected line drawing → just select
          // it (don't immediately start a drag — TradingView pattern).
          // Second click on the already-selected one → grab + drag.
          if (bodyHit.id !== selectedId) {
            setSelectedDrawingId(bodyHit.id);
            return;
          }
          const r = rendererRef.current;
          const metrics = r?.getLastMetrics() ?? null;
          const layout = r?.getLayoutEngine();
          if (metrics && layout) {
            const clickTime = layout.xToTime(x, metrics);
            const clickPrice = layout.yToPrice(y, metrics);
            const kind: LineHandleKind =
              bodyHit.kind === "h-line"
                ? "h-line-body"
                : bodyHit.kind === "h-ray"
                  ? "h-ray-body"
                  : bodyHit.kind === "rect"
                    ? "rect-body"
                    : bodyHit.kind === "ruler"
                      ? "ruler-body"
                      : bodyHit.kind === "text"
                        ? "text-body"
                        : "trend-body";
            lineHandleDragRef.current = {
              drawingId: bodyHit.id,
              kind,
              anchor: { clickTime, clickPrice, snapshot: bodyHit },
            };
            canvas.classList.add("fp-canvas-handle-drag");
          }
          return;
        }
      }

      // Next priority: tool placement. When a LONG/SHORT tool is
      // armed in the toolbar, the next click drops a new drawing and
      // disarms the tool. We deliberately ignore clicks on axes here
      // so a misplaced click on the price axis doesn't create a
      // drawing far out of range.
      const armedTool = activeToolRef.current;
      if (armedTool && !onPriceAxis && !onTimeAxis) {
        const r = rendererRef.current;
        const metrics = r?.getLastMetrics() ?? null;
        const layout = r?.getLayoutEngine();
        if (metrics && layout) {
          const price = layout.yToPrice(y, metrics);
          const timeSec = layout.xToTime(x, metrics);
          const tickSize = r?.getDetectedTickSize() ?? undefined;
          const vc = metrics.visibleCandles;
          const barSpacingSec =
            vc.length >= 2 ? vc[1].time - vc[0].time : undefined;
          // Helper to auto-select a newly placed drawing — the user
          // just decided to put it there, surface the handles so they
          // can immediately fine-tune without a second click.
          const selectAfterPlace = (id: string) => setSelectedDrawingId(id);
          if (armedTool === "trend") {
            // Click-drag flow: mouse-down sets point A, drag previews
            // the line live, mouse-up commits point B. We seed the
            // drawing with start==end and enter trend-end drag mode
            // immediately so the existing endpoint-drag machinery
            // handles the live preview for free.
            const id =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const newDrawing: LineDrawing = {
              kind: "trend",
              id,
              symbol: symbolRef.current,
              startTimeSec: timeSec,
              startPrice: price,
              endTimeSec: timeSec,
              endPrice: price,
              createdAt: Date.now(),
            };
            addLineDrawing(newDrawing);
            selectAfterPlace(id);
            lineHandleDragRef.current = {
              drawingId: id,
              kind: "trend-end",
              isFreshCreation: true,
            };
            canvas.classList.add("fp-canvas-handle-drag");
          } else if (armedTool === "ruler") {
            // Click-drag flow for the measure tool — same pattern
            // as trend. Seed start==end at the mousedown point and
            // hand off to ruler-end drag so the deltas update live.
            const id =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const newDrawing: LineDrawing = {
              kind: "ruler",
              id,
              symbol: symbolRef.current,
              startTimeSec: timeSec,
              startPrice: price,
              endTimeSec: timeSec,
              endPrice: price,
              createdAt: Date.now(),
            };
            addLineDrawing(newDrawing);
            selectAfterPlace(id);
            lineHandleDragRef.current = {
              drawingId: id,
              kind: "ruler-end",
              isFreshCreation: true,
            };
            canvas.classList.add("fp-canvas-handle-drag");
          } else if (armedTool === "text") {
            // Single-click placement — drop an empty text annotation
            // at the cursor and open the inline editor on it. The
            // editor commits the content on Enter / blur, and the
            // empty-content garbage collector in onBlur removes the
            // drawing if the user backs out without typing.
            const id =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const newDrawing: LineDrawing = {
              kind: "text",
              id,
              symbol: symbolRef.current,
              timeSec,
              price,
              content: "",
              createdAt: Date.now(),
            };
            addLineDrawing(newDrawing);
            selectAfterPlace(id);
            setEditingText({
              id,
              clientX: e.clientX,
              clientY: e.clientY,
              initial: "",
            });
          } else if (armedTool === "rect") {
            // Click-drag flow for rectangles — same pattern as the
            // trend tool. Seed start==end at the mousedown point and
            // hand off to the rect-br endpoint drag so dragging
            // the cursor extends the opposite corner live. The store
            // normalises automatically if the user drags up-left.
            const id =
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const newDrawing: LineDrawing = {
              kind: "rect",
              id,
              symbol: symbolRef.current,
              startTimeSec: timeSec,
              endTimeSec: timeSec,
              topPrice: price,
              bottomPrice: price,
              createdAt: Date.now(),
            };
            addLineDrawing(newDrawing);
            selectAfterPlace(id);
            lineHandleDragRef.current = {
              drawingId: id,
              kind: "rect-br",
              isFreshCreation: true,
            };
            canvas.classList.add("fp-canvas-handle-drag");
          } else if (armedTool === "LONG" || armedTool === "SHORT") {
            const newTrade = createDefaultDrawing(
              armedTool as TradeDrawingType,
              price,
              timeSec,
              symbolRef.current,
              tickSize ?? undefined,
              barSpacingSec,
            );
            addDrawing(newTrade);
            selectAfterPlace(newTrade.id);
          } else {
            // h-line / h-ray → single-click placement with defaults.
            const newLine = createDefaultLineDrawing(
              armedTool as LineDrawingKind,
              price,
              timeSec,
              symbolRef.current,
              barSpacingSec,
              tickSize,
            );
            addLineDrawing(newLine);
            selectAfterPlace(newLine.id);
          }
        }
        setActiveTool(null);
        return;
      }

      // Click landed on empty chart (no drawing, no handle, no tool
      // armed) — clear any active selection so handles disappear.
      if (!onPriceAxis && !onTimeAxis && selectedDrawingIdRef.current !== null) {
        setSelectedDrawingId(null);
      }

      const mode = onPriceAxis ? "axisY" : onTimeAxis ? "axisX" : "free";
      interactionRef.current = startDrag(interactionRef.current, x, y, mode);
      canvas.classList.add("fp-canvas-dragging");
      if (mode === "axisY" || mode === "axisX") {
        canvas.classList.add("fp-canvas-y-drag");
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Reveal the OS cursor when the pointer leaves the plot area
      // (price axis on the right, time axis on the bottom, padding
      // gutters). When the pointer comes back into the plot area
      // AND the crosshair setting is on AND no tool is armed, we
      // re-hide it so the on-canvas crosshair is the sole pointer
      // affordance. Drag states (dragging / handle-hover / handle-drag)
      // are excluded by the CSS selector for the `cursor-hidden`
      // class itself, so we don't have to repeat them here.
      const r0 = rendererRef.current;
      const bounds = r0?.getPlotBounds();
      if (bounds) {
        const insidePlot =
          x >= bounds.left &&
          x <= bounds.right &&
          y >= bounds.top &&
          y <= bounds.bottom;
        const crosshairOnNow =
          useFootprintSettingsStore.getState().showCrosshair;
        const shouldHide =
          insidePlot && crosshairOnNow && activeToolRef.current === null;
        canvas.classList.toggle("fp-canvas-cursor-hidden", shouldHide);
      }

      // Bracket-creation drag (from entry line). While active, paint
      // a ghost h-line at the cursor price with the projected P&L. We
      // only commit (and remove the ghost) on mouseup.
      const bracketCreate = bracketCreateRef.current;
      if (bracketCreate) {
        const r = rendererRef.current;
        const metrics = r?.getLastMetrics() ?? null;
        const layout = r?.getLayoutEngine();
        if (metrics && layout) {
          const spec = getContractSpec(bracketCreate.symbol);
          const rawPrice = layout.yToPrice(y, metrics);
          const snapped =
            Math.round(rawPrice / spec.tickSize) * spec.tickSize;
          // Direction → bracket kind.
          //   long + above → TP / long + below → SL
          //   short + above → SL / short + below → TP
          const above = snapped > bracketCreate.entryPrice;
          const isTp =
            (bracketCreate.side === "long" && above) ||
            (bracketCreate.side === "short" && !above);
          const color = isTp ? "#22c55e" : "#ff3d71";
          const pnl = computePnl(
            spec,
            bracketCreate.side,
            bracketCreate.entryPrice,
            snapped,
            bracketCreate.qty,
          );
          const sign = pnl >= 0 ? "+" : "−";
          const decimals = spec.tickSize < 1 ? 2 : 0;
          const label =
            `${snapped.toFixed(decimals)}  ·  ${sign}$${Math.abs(pnl).toFixed(2)}`;
          const existing = lineDrawingsRef.current.find(
            (ld) => ld.kind === "h-line" && ld.id === BRACKET_GHOST_LINE_ID,
          );
          if (!existing) {
            addLineDrawing({
              kind: "h-line",
              id: BRACKET_GHOST_LINE_ID,
              symbol: bracketCreate.symbol,
              price: snapped,
              createdAt: Date.now(),
              color,
              lineStyle: "solid",
              lineWidth: 2.5,
              centerLabel: label,
            });
          } else {
            updateLineDrawing(BRACKET_GHOST_LINE_ID, {
              price: snapped,
              color,
              centerLabel: label,
            });
          }
        }
        return;
      }

      // Line-drawing handle drag wins over everything else when
      // active (set in onMouseDown above). Reads the live layout
      // to convert pointer XY back to (time, price).
      const lineDragging = lineHandleDragRef.current;
      if (lineDragging) {
        const r = rendererRef.current;
        const metrics = r?.getLastMetrics() ?? null;
        const layout = r?.getLayoutEngine();
        if (metrics && layout) {
          // Ctrl/Cmd + drag activates the OHLC magnet on the
          // endpoint being dragged — the price snaps to the
          // nearest open / high / low / close of the candle under
          // the cursor when one is within 20 px Y. Body drags
          // (translation) skip the snap so the offset stays as
          // dragged. `*-body` kinds are filtered below.
          const isBodyDrag =
            lineDragging.kind.endsWith("-body");
          const ctrlSnap = (e.ctrlKey || e.metaKey) && !isBodyDrag;
          let newPrice = layout.yToPrice(y, metrics);
          if (ctrlSnap) {
            const snapped = snapPriceToOHLC(x, y, metrics, layout);
            if (snapped !== null) newPrice = snapped;
          }
          const newTime = layout.xToTime(x, metrics);
          const anchor = lineDragging.anchor;
          const dt = anchor ? newTime - anchor.clickTime : 0;
          const dp = anchor ? newPrice - anchor.clickPrice : 0;
          // Shift+drag on a trend line locks the segment to a 0°
          // angle (perfectly horizontal). The locked Y is whichever
          // endpoint is NOT being dragged so the static end stays
          // put. For body drags we sync end to start so the line
          // stays flat after translation.
          const shiftLock = e.shiftKey;
          switch (lineDragging.kind) {
            // Endpoint / direct handles — set to current pointer.
            case "h-line-mid":
              updateLineDrawing(lineDragging.drawingId, { price: newPrice });
              break;
            case "h-ray-start":
              updateLineDrawing(lineDragging.drawingId, {
                price: newPrice,
                startTimeSec: newTime,
              });
              break;
            case "trend-start": {
              const current = lineDrawingsRef.current.find(
                (it) => it.id === lineDragging.drawingId,
              );
              const lockedY =
                shiftLock && current && current.kind === "trend"
                  ? current.endPrice
                  : newPrice;
              updateLineDrawing(lineDragging.drawingId, {
                startPrice: lockedY,
                startTimeSec: newTime,
              });
              break;
            }
            case "trend-end": {
              const current = lineDrawingsRef.current.find(
                (it) => it.id === lineDragging.drawingId,
              );
              const lockedY =
                shiftLock && current && current.kind === "trend"
                  ? current.startPrice
                  : newPrice;
              updateLineDrawing(lineDragging.drawingId, {
                endPrice: lockedY,
                endTimeSec: newTime,
              });
              break;
            }
            // Body drags — delta from the click point, preserving the
            // initial click-to-anchor offset for natural feel.
            case "h-line-body": {
              if (anchor && anchor.snapshot.kind === "h-line") {
                updateLineDrawing(lineDragging.drawingId, {
                  price: anchor.snapshot.price + dp,
                });
              }
              break;
            }
            case "h-ray-body": {
              if (anchor && anchor.snapshot.kind === "h-ray") {
                updateLineDrawing(lineDragging.drawingId, {
                  price: anchor.snapshot.price + dp,
                  startTimeSec: anchor.snapshot.startTimeSec + dt,
                });
              }
              break;
            }
            case "trend-body": {
              if (anchor && anchor.snapshot.kind === "trend") {
                const newStartPrice = anchor.snapshot.startPrice + dp;
                // Shift held → keep the line flat through the move.
                // We anchor on start's Y so the slope flattens around
                // the line's left endpoint.
                const newEndPrice = shiftLock
                  ? newStartPrice
                  : anchor.snapshot.endPrice + dp;
                updateLineDrawing(lineDragging.drawingId, {
                  startTimeSec: anchor.snapshot.startTimeSec + dt,
                  startPrice: newStartPrice,
                  endTimeSec: anchor.snapshot.endTimeSec + dt,
                  endPrice: newEndPrice,
                });
              }
              break;
            }
            // Rectangle endpoint + edge handles. The store normalises
            // after each patch so dragging a corner past the opposite
            // corner cleanly flips the rect (no inverted-width bug).
            case "rect-tl":
              updateLineDrawing(lineDragging.drawingId, {
                startTimeSec: newTime,
                topPrice: newPrice,
              });
              break;
            case "rect-tr":
              updateLineDrawing(lineDragging.drawingId, {
                endTimeSec: newTime,
                topPrice: newPrice,
              });
              break;
            case "rect-bl":
              updateLineDrawing(lineDragging.drawingId, {
                startTimeSec: newTime,
                bottomPrice: newPrice,
              });
              break;
            case "rect-br":
              updateLineDrawing(lineDragging.drawingId, {
                endTimeSec: newTime,
                bottomPrice: newPrice,
              });
              break;
            case "rect-top":
              updateLineDrawing(lineDragging.drawingId, { topPrice: newPrice });
              break;
            case "rect-bottom":
              updateLineDrawing(lineDragging.drawingId, {
                bottomPrice: newPrice,
              });
              break;
            case "rect-left":
              updateLineDrawing(lineDragging.drawingId, {
                startTimeSec: newTime,
              });
              break;
            case "rect-right":
              updateLineDrawing(lineDragging.drawingId, {
                endTimeSec: newTime,
              });
              break;
            case "rect-body": {
              if (anchor && anchor.snapshot.kind === "rect") {
                updateLineDrawing(lineDragging.drawingId, {
                  startTimeSec: anchor.snapshot.startTimeSec + dt,
                  endTimeSec: anchor.snapshot.endTimeSec + dt,
                  topPrice: anchor.snapshot.topPrice + dp,
                  bottomPrice: anchor.snapshot.bottomPrice + dp,
                });
              }
              break;
            }
            // Ruler — endpoint handles + body translation. Shift
            // doesn't lock the angle (measurement should reflect
            // whatever the user actually draws; not the trend tool).
            case "ruler-start":
              updateLineDrawing(lineDragging.drawingId, {
                startTimeSec: newTime,
                startPrice: newPrice,
              });
              break;
            case "ruler-end":
              updateLineDrawing(lineDragging.drawingId, {
                endTimeSec: newTime,
                endPrice: newPrice,
              });
              break;
            case "ruler-body": {
              if (anchor && anchor.snapshot.kind === "ruler") {
                updateLineDrawing(lineDragging.drawingId, {
                  startTimeSec: anchor.snapshot.startTimeSec + dt,
                  startPrice: anchor.snapshot.startPrice + dp,
                  endTimeSec: anchor.snapshot.endTimeSec + dt,
                  endPrice: anchor.snapshot.endPrice + dp,
                });
              }
              break;
            }
            // Text annotation — one anchor handle (drag moves the
            // whole label). Body and anchor patches are identical
            // since the text has a single (time, price) point.
            case "text-anchor":
              updateLineDrawing(lineDragging.drawingId, {
                timeSec: newTime,
                price: newPrice,
              });
              break;
            case "text-body": {
              if (anchor && anchor.snapshot.kind === "text") {
                updateLineDrawing(lineDragging.drawingId, {
                  timeSec: anchor.snapshot.timeSec + dt,
                  price: anchor.snapshot.price + dp,
                });
              }
              break;
            }
          }
        }
        return;
      }

      // Drawing-handle drag wins over pan — covers both line handles
      // (entry/stop/target) and the 6 bounding-box handles (corners
      // + entry-line edges) for true TradingView-style resize.
      const dragging = handleDragRef.current;
      if (dragging) {
        const r = rendererRef.current;
        const metrics = r?.getLastMetrics() ?? null;
        const layout = r?.getLayoutEngine();
        if (metrics && layout) {
          // Ctrl/Cmd + drag activates OHLC magnet for trade-drawing
          // handles too (entry / stop / target / corners). Same
          // 20 px tolerance as the line drag path; falls through
          // to the raw cursor price when no OHLC candidate is in
          // range.
          let newPrice = layout.yToPrice(y, metrics);
          if (e.ctrlKey || e.metaKey) {
            const snapped = snapPriceToOHLC(x, y, metrics, layout);
            if (snapped !== null) newPrice = snapped;
          }
          const newTime = layout.xToTime(x, metrics);
          const d = drawingsRef.current.find(
            (it) => it.id === dragging.drawingId,
          );
          if (d) {
            const isLong = d.type === "LONG";
            // For LONG: top line is target, bottom is stop.
            // For SHORT: top is stop, bottom is target.
            const topKey = isLong ? "targetPrice" : "stopPrice";
            const bottomKey = isLong ? "stopPrice" : "targetPrice";
            const patch: Partial<typeof d> = {};
            switch (dragging.handle) {
              case "entry":
                patch.entryPrice = newPrice;
                break;
              case "stop":
                patch.stopPrice = newPrice;
                break;
              case "target":
                patch.targetPrice = newPrice;
                break;
              case "tl":
                patch[topKey] = newPrice;
                patch.entryTimeSec = newTime;
                break;
              case "tr":
                patch[topKey] = newPrice;
                patch.endTimeSec = newTime;
                break;
              case "bl":
                patch[bottomKey] = newPrice;
                patch.entryTimeSec = newTime;
                break;
              case "br":
                patch[bottomKey] = newPrice;
                patch.endTimeSec = newTime;
                break;
              case "ml":
                patch.entryPrice = newPrice;
                patch.entryTimeSec = newTime;
                break;
              case "mr":
                patch.endTimeSec = newTime;
                break;
            }
            updateDrawing(dragging.drawingId, patch);
          }
        }
        return;
      }

      if (interactionRef.current.isDragging) {
        interactionRef.current = updateDrag(
          interactionRef.current,
          x,
          y,
          rect.width,
          rect.height,
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
        // Hover cursor: tailored to the handle kind (diagonal for
        // corners, move for the left-middle, ew for the right-edge,
        // ns for the horizontal lines). Only update when not in
        // placing-tool mode (that owns the crosshair cursor).
        if (activeToolRef.current === null) {
          const PRICE_AXIS_W_HOVER = 80;
          const TIME_AXIS_H_HOVER = 22;
          const overAxis =
            x >= rect.width - PRICE_AXIS_W_HOVER ||
            y >= rect.height - TIME_AXIS_H_HOVER;
          const hovered = overAxis
            ? null
            : hitTestHandle(x, y, rect.width - PRICE_AXIS_W_HOVER);
          if (hovered) {
            canvas.style.cursor = cursorForHandleKind(hovered.handle);
          } else {
            // Clear the inline cursor so the CSS class layer (grab /
            // crosshair / etc.) regains control.
            canvas.style.cursor = "";
          }
          canvas.classList.toggle("fp-canvas-handle-hover", hovered !== null);
        }
        tickRender();
      }
    };

    const onMouseUp = () => {
      // Bracket-create commit. The ghost line in the drawings store
      // carries the final price; we look it up, route to setBrackets,
      // then strip the ghost. If the user mouseupped without moving
      // (no ghost ever rendered) we just drop the session.
      if (bracketCreateRef.current) {
        const session = bracketCreateRef.current;
        bracketCreateRef.current = null;
        canvas.classList.remove("fp-canvas-handle-drag");
        const ghost = lineDrawingsRef.current.find(
          (ld) => ld.kind === "h-line" && ld.id === BRACKET_GHOST_LINE_ID,
        );
        if (ghost && ghost.kind === "h-line") {
          const above = ghost.price > session.entryPrice;
          const isTp =
            (session.side === "long" && above) ||
            (session.side === "short" && !above);
          const pos = useSimAccountStore.getState().position;
          if (pos && pos.symbol === session.symbol) {
            const nextSl = isTp ? pos.stopLoss : ghost.price;
            const nextTp = isTp ? ghost.price : pos.takeProfit;
            useSimAccountStore.getState().setBrackets(nextSl, nextTp);
          }
          removeLineDrawing(BRACKET_GHOST_LINE_ID);
        }
        return;
      }
      if (lineHandleDragRef.current) {
        const dragInfo = lineHandleDragRef.current;
        lineHandleDragRef.current = null;
        canvas.classList.remove("fp-canvas-handle-drag");
        // A drag that started via the click-drag creation flow but
        // never actually moved → zero-size shape. Worse than no
        // drawing at all (invisible, eats clicks). Garbage-collect
        // it instead of leaving a phantom in the store.
        if (dragInfo.isFreshCreation) {
          const drawing = lineDrawingsRef.current.find(
            (it) => it.id === dragInfo.drawingId,
          );
          if (drawing) {
            const isZeroTrend =
              drawing.kind === "trend" &&
              drawing.startTimeSec === drawing.endTimeSec &&
              drawing.startPrice === drawing.endPrice;
            const isZeroRect =
              drawing.kind === "rect" &&
              drawing.startTimeSec === drawing.endTimeSec &&
              drawing.topPrice === drawing.bottomPrice;
            const isZeroRuler =
              drawing.kind === "ruler" &&
              drawing.startTimeSec === drawing.endTimeSec &&
              drawing.startPrice === drawing.endPrice;
            if (isZeroTrend || isZeroRect || isZeroRuler) {
              removeLineDrawing(dragInfo.drawingId);
            }
          }
        }
        return;
      }
      if (handleDragRef.current) {
        handleDragRef.current = null;
        canvas.classList.remove("fp-canvas-handle-drag");
        return;
      }
      if (!interactionRef.current.isDragging) return;
      interactionRef.current = endDrag(interactionRef.current);
      canvas.classList.remove("fp-canvas-dragging");
      canvas.classList.remove("fp-canvas-y-drag");
      // Full repaint now that the drag-lite gate is off — restores
      // the volume profile, indicators, cluster panel and session
      // header that we skipped during the drag.
      tickRender();
    };

    const onMouseLeave = () => {
      interactionRef.current = setHover(interactionRef.current, null, null);
      canvas.classList.remove("fp-canvas-handle-hover");
      canvas.style.cursor = "";
      tickRender();
    };

    // Right-click → open the chart context menu (copy price / paste
    // / add alert / settings). The native browser menu is always
    // suppressed so the user never sees the OS-level menu over the
    // chart. Drawing deletion now lives on the × button + keyboard
    // Delete + trash icon — three explicit paths, no need to
    // double-up via right-click.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const r = rendererRef.current;
      const metrics = r?.getLastMetrics() ?? null;
      const layout = r?.getLayoutEngine();
      if (!metrics || !layout) return;
      const price = layout.yToPrice(y, metrics);
      const timeSec = layout.xToTime(x, metrics);
      const vc = metrics.visibleCandles;
      const barSpacingSec = vc.length >= 2 ? vc[1].time - vc[0].time : 60;
      setCtxMenu({
        clientX: e.clientX,
        clientY: e.clientY,
        price,
        timeSec,
        barSpacingSec,
      });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Map a handle kind to its native CSS cursor. */
  function cursorForHandleKind(kind: DrawingHandleKind): string {
    switch (kind) {
      case "tl":
      case "br":
        return "nwse-resize";
      case "tr":
      case "bl":
        return "nesw-resize";
      case "ml":
        return "move";
      case "mr":
        return "ew-resize";
      case "entry":
      case "stop":
      case "target":
      default:
        return "ns-resize";
    }
  }

  // Hit-test helpers. Both read the renderer's last metrics + layout
  // so they use the exact same coordinate space that just got drawn.

  /** Compute a drawing's painted x-extent (entry → end). Mirrors the
   *  renderer's bounding so the hit-test stops at the drawing's right
   *  edge instead of the chart edge. */
  function drawingXRange(
    d: TradeDrawing,
    metrics: NonNullable<
      ReturnType<NonNullable<typeof rendererRef.current>["getLastMetrics"]>
    >,
    chartRight: number,
  ): { entryX: number; endX: number } {
    const layout = rendererRef.current!.getLayoutEngine();
    const entryX = layout.timeToX(d.entryTimeSec, metrics);
    const vc = metrics.visibleCandles;
    const spacing = vc.length >= 2 ? vc[1].time - vc[0].time : 60;
    const endTimeSec = d.endTimeSec ?? defaultEndTimeSec(d.entryTimeSec, spacing);
    const endX = Math.min(chartRight, layout.timeToX(endTimeSec, metrics));
    return { entryX, endX };
  }

  function hitTestHandle(
    x: number,
    y: number,
    chartRight: number,
  ): HandleDrag | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    // Pass 1: corner + mid box handles. Small precise targets, so
    // checked FIRST — otherwise a corner click would slip onto the
    // line beneath it and trigger the wrong drag mode.
    const boxHalf = DRAWING_HANDLE_SIZE / 2 + DRAWING_BOX_HANDLE_PAD_PX;
    for (const d of drawingsRef.current) {
      if (d.symbol !== sym) continue;
      const handles = getTradeDrawingHandles(d, layout, metrics, chartRight);
      for (const h of handles) {
        if (
          Math.abs(x - h.x) <= boxHalf &&
          Math.abs(y - h.y) <= boxHalf
        ) {
          return { drawingId: d.id, handle: h.kind };
        }
      }
    }
    // Pass 2: line handles (drag any horizontal line). Bigger
    // tolerance, but only inside the drawing's x-range.
    for (const d of drawingsRef.current) {
      if (d.symbol !== sym) continue;
      const { entryX, endX } = drawingXRange(d, metrics, chartRight);
      if (x < entryX || x > endX) continue;
      const entryY = layout.priceToY(d.entryPrice, metrics);
      if (Math.abs(y - entryY) <= DRAWING_HANDLE_TOLERANCE_PX) {
        return { drawingId: d.id, handle: "entry" };
      }
      const stopY = layout.priceToY(d.stopPrice, metrics);
      if (Math.abs(y - stopY) <= DRAWING_HANDLE_TOLERANCE_PX) {
        return { drawingId: d.id, handle: "stop" };
      }
      const targetY = layout.priceToY(d.targetPrice, metrics);
      if (Math.abs(y - targetY) <= DRAWING_HANDLE_TOLERANCE_PX) {
        return { drawingId: d.id, handle: "target" };
      }
    }
    return null;
  }

  /** Hit-test specifically the sim-position entry h-line. Returns
   *  the drawing when the cursor is within tolerance, else null. We
   *  keep this separate from `hitTestLineDrawing` (which filters
   *  the entry line out so it can't be selected as a regular line)
   *  because the entry line still needs a hit zone for the bracket-
   *  create drag — distinct semantics, distinct path. */
  function hitTestEntryLine(
    x: number,
    y: number,
    chartRight: number,
  ): HLineDrawing | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    const TOL = 6;
    for (const d of lineDrawingsRef.current) {
      if (d.id !== POSITION_ENTRY_LINE_ID) continue;
      if (d.symbol !== sym) continue;
      if (d.kind !== "h-line") continue;
      const ly = layout.priceToY(d.price, metrics);
      if (Math.abs(y - ly) <= TOL) return d;
    }
    return null;
  }

  /** Hit-test the [×] delete button next to the Entry label. Returns
   *  the drawing id whose button was hit, or null. Uses the same
   *  geometry helper the renderer uses so click and visual stay in
   *  lockstep. */
  function hitTestDeleteButton(
    x: number,
    y: number,
    chartRight: number,
  ): string | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    for (const d of drawingsRef.current) {
      if (d.symbol !== sym) continue;
      const entryY = layout.priceToY(d.entryPrice, metrics);
      const rect = getTradeDrawingDeleteRect(entryY, chartRight);
      if (
        x >= rect.x &&
        x <= rect.x + rect.w &&
        y >= rect.y &&
        y <= rect.y + rect.h
      ) {
        return d.id;
      }
    }
    return null;
  }

  /** Hit-test a click against the manual-close [×] button rendered
   *  on the sim-position entry h-line. Returns true when the click
   *  lands inside the button rect; the caller invokes `flatten()`
   *  on the sim account store. Always active when a position h-line
   *  exists for the current symbol — no selection gate. */
  function hitTestPositionEntryClose(
    x: number,
    y: number,
    chartRight: number,
  ): boolean {
    if (x > chartRight) return false;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return false;
    const sym = symbolRef.current;
    for (const d of lineDrawingsRef.current) {
      if (d.id !== POSITION_ENTRY_LINE_ID) continue;
      if (d.symbol !== sym) continue;
      if (d.kind !== "h-line") continue;
      const entryY = layout.priceToY(d.price, metrics);
      const rect = getPositionEntryCloseRect(entryY, chartRight);
      if (
        x >= rect.x &&
        x <= rect.x + rect.w &&
        y >= rect.y &&
        y <= rect.y + rect.h
      ) {
        return true;
      }
    }
    return false;
  }

  /** Hit-test a click against the handles of every line drawing
   *  for the current symbol. Returns the handle hit (drawingId +
   *  kind) for the canvas's mouse-down dispatcher. */
  function hitTestLineHandle(
    x: number,
    y: number,
    chartRight: number,
  ): { drawingId: string; kind: LineHandleKind } | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    const boxHalf = DRAWING_HANDLE_SIZE / 2 + DRAWING_BOX_HANDLE_PAD_PX;
    for (const d of lineDrawingsRef.current) {
      if (d.symbol !== sym) continue;
      const handles = getLineDrawingHandles(d, layout, metrics, chartRight);
      for (const h of handles) {
        if (Math.abs(x - h.x) <= boxHalf && Math.abs(y - h.y) <= boxHalf) {
          return { drawingId: h.drawingId, kind: h.kind };
        }
      }
    }
    return null;
  }

  /** Hit-test a click anywhere on a line drawing (not just its
   *  handles) for the right-click-to-delete affordance. Uses a
   *  generous pixel tolerance around the segment because thin
   *  lines are hard to click precisely. */
  function hitTestLineDrawing(
    x: number,
    y: number,
    chartRight: number,
  ): LineDrawing | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    const TOL = 6; // px tolerance around the segment
    for (const d of lineDrawingsRef.current) {
      if (d.symbol !== sym) continue;
      // Sim position entry line is read-only signage — never hit-test
      // so clicks pass through to whatever's underneath (cell, other
      // drawing, context menu) and the properties panel never opens.
      if (d.id === POSITION_ENTRY_LINE_ID) continue;
      if (d.kind === "h-line") {
        const ly = layout.priceToY(d.price, metrics);
        if (Math.abs(y - ly) <= TOL) return d;
      } else if (d.kind === "h-ray") {
        const lx = layout.timeToX(d.startTimeSec, metrics);
        const ly = layout.priceToY(d.price, metrics);
        if (x >= lx - TOL && Math.abs(y - ly) <= TOL) return d;
      } else if (d.kind === "rect") {
        // Hit anywhere on the rectangle — border OR interior. Selecting
        // a rect requires the user to be able to click *the visible
        // thing they drew*, which includes the translucent fill. The
        // border-only rule was too strict and made the rect feel dead
        // once placed.
        const xL = layout.timeToX(d.startTimeSec, metrics);
        const xR = layout.timeToX(d.endTimeSec, metrics);
        const yT = layout.priceToY(d.topPrice, metrics);
        const yB = layout.priceToY(d.bottomPrice, metrics);
        if (
          x >= xL - TOL && x <= xR + TOL &&
          y >= yT - TOL && y <= yB + TOL
        ) {
          return d;
        }
      } else if (d.kind === "ruler") {
        // Same perpendicular-distance test as trend — measurement
        // segments are geometrically identical to trend lines.
        const x1 = layout.timeToX(d.startTimeSec, metrics);
        const y1 = layout.priceToY(d.startPrice, metrics);
        const x2 = layout.timeToX(d.endTimeSec, metrics);
        const y2 = layout.priceToY(d.endPrice, metrics);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const px = x1 + t * dx;
        const py = y1 + t * dy;
        if (Math.hypot(x - px, y - py) <= TOL) return d;
      } else if (d.kind === "text") {
        // Hit if the click lands in the rendered label box (or its
        // ~6 px halo). Empty content → only the anchor dot reacts.
        const ax = layout.timeToX(d.timeSec, metrics);
        const ay = layout.priceToY(d.price, metrics);
        if (!d.content || d.content.trim().length === 0) {
          if (Math.hypot(x - ax, y - ay) <= TOL) return d;
          continue;
        }
        // Approximate the rendered box (font @ 12 px, padX = 7, padY = 4,
        // boxH = 20). Slight over-estimate via TEXT_HIT_W so the user
        // gets a forgiving target without re-measuring in the hit-test.
        const TEXT_HIT_W = Math.max(40, d.content.length * 7.5 + 14);
        const boxX = ax + 8;
        const boxY = ay - 10;
        if (
          x >= boxX - TOL && x <= boxX + TEXT_HIT_W + TOL &&
          y >= boxY - TOL && y <= boxY + 20 + TOL
        ) {
          return d;
        }
      } else {
        // trend — perpendicular distance from point to segment
        const x1 = layout.timeToX(d.startTimeSec, metrics);
        const y1 = layout.priceToY(d.startPrice, metrics);
        const x2 = layout.timeToX(d.endTimeSec, metrics);
        const y2 = layout.priceToY(d.endPrice, metrics);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
        const px = x1 + t * dx;
        const py = y1 + t * dy;
        const dist = Math.hypot(x - px, y - py);
        if (dist <= TOL) return d;
      }
    }
    return null;
  }

  function hitTestDrawing(
    x: number,
    y: number,
    chartRight: number,
  ): TradeDrawing | null {
    if (x > chartRight) return null;
    const r = rendererRef.current;
    const metrics = r?.getLastMetrics() ?? null;
    const layout = r?.getLayoutEngine();
    if (!metrics || !layout) return null;
    const sym = symbolRef.current;
    for (const d of drawingsRef.current) {
      if (d.symbol !== sym) continue;
      const { entryX, endX } = drawingXRange(d, metrics, chartRight);
      if (x < entryX || x > endX) continue;
      const entryY = layout.priceToY(d.entryPrice, metrics);
      const stopY = layout.priceToY(d.stopPrice, metrics);
      const targetY = layout.priceToY(d.targetPrice, metrics);
      const minY = Math.min(entryY, stopY, targetY);
      const maxY = Math.max(entryY, stopY, targetY);
      if (y >= minY && y <= maxY) return d;
    }
    return null;
  }

  function onResetView() {
    interactionRef.current = { ...DEFAULT_INTERACTION };
    tickRender();
  }

  // Imperative API for ZoomControls. Both zoom buttons synthesise a
  // wheel event anchored at the centre of the canvas — same pure
  // helper the wheel listener uses, so the buttons end up in the
  // exact same state the user would reach by scrolling.
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        interactionRef.current = applyWheelZoom(
          interactionRef.current,
          -100,
          rect.width / 2,
          rect.width,
        );
        tickRender();
      },
      zoomOut: () => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        interactionRef.current = applyWheelZoom(
          interactionRef.current,
          100,
          rect.width / 2,
          rect.width,
        );
        tickRender();
      },
      resetView: onResetView,
      applySettings: (settings) => {
        rendererRef.current?.setSettings(settings);
        tickRender();
      },
      applyIndicators: (result) => {
        rendererRef.current?.setIndicators(result);
        tickRender();
      },
      getPriceMap: () => {
        const m = rendererRef.current?.getLastMetrics();
        if (!m) return null;
        return {
          minPrice: m.visiblePriceMin,
          maxPrice: m.visiblePriceMax,
          areaTopPx: m.footprintAreaY,
          areaHeightPx: m.footprintAreaHeight,
        };
      },
    }),
    // The handlers read mutable refs only, so a stable identity is
    // fine — useImperativeHandle deps stay empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const ctxMenuItems: ChartContextMenuItem[] = ctxMenu
    ? buildContextMenuItems({
        price: ctxMenu.price,
        timeSec: ctxMenu.timeSec,
        barSpacingSec: ctxMenu.barSpacingSec,
        priceDecimals,
        symbol,
        addLineDrawing,
        onOpenSettings,
      })
    : [];

  const menuPortal = ctxMenu ? (
    <ChartContextMenu
      x={ctxMenu.clientX}
      y={ctxMenu.clientY}
      items={ctxMenuItems}
      onClose={() => setCtxMenu(null)}
    />
  ) : null;

  // Resolve the actual drawing object for the panel so it can fan
  // out into per-kind fields. Skips rendering while the editor is
  // open (text annotation in mid-typing — the editor owns input).
  const selectedDrawingObj = selectedDrawingIdState
    ? (drawings.find((d) => d.id === selectedDrawingIdState) ??
        lineDrawings.find((d) => d.id === selectedDrawingIdState) ??
        null)
    : null;
  const showPanel =
    selectedDrawingObj !== null &&
    panelPos !== null &&
    selectedDrawingObj.symbol === symbol &&
    editingText === null;
  const propertiesPanel = showPanel ? (
    <DrawingPropertiesPanel
      drawing={selectedDrawingObj}
      clientX={panelPos.x}
      clientY={panelPos.y}
      onUpdateLine={updateLineDrawing}
      onUpdateTrade={updateDrawing}
      onClose={() => setSelectedDrawingId(null)}
    />
  ) : null;

  const textEditorPortal = editingText ? (
    <TextDrawingEditor
      key={editingText.id}
      clientX={editingText.clientX}
      clientY={editingText.clientY}
      initial={editingText.initial}
      onCommit={(content) => {
        const trimmed = content.trim();
        if (trimmed.length === 0) {
          // User pressed Enter on empty / whitespace-only input —
          // treat as a cancellation and garbage-collect the
          // placeholder drawing so we don't litter the chart with
          // invisible anchors.
          removeLineDrawing(editingText.id);
        } else {
          updateLineDrawing(editingText.id, { content: trimmed });
        }
        setEditingText(null);
      }}
      onCancel={() => {
        // Escape — same GC rule for empty drawings; non-empty ones
        // keep their previous content (the editor only owns the
        // input field, the store state didn't get mutated).
        const current = lineDrawingsRef.current.find(
          (d) => d.id === editingText.id,
        );
        if (
          current &&
          current.kind === "text" &&
          current.content.trim().length === 0
        ) {
          removeLineDrawing(editingText.id);
        }
        setEditingText(null);
      }}
    />
  ) : null;

  if (bare) {
    return (
      <>
        <div
          ref={containerRef}
          className="fp-canvas-container fp-canvas-container-bare"
        >
          <canvas ref={canvasRef} className="fp-canvas" />
          <FpsCounter countRef={renderCountRef} />
        </div>
        {menuPortal}
        {textEditorPortal}
        {propertiesPanel}
      </>
    );
  }

  return (
    <>
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
          <ChartLiveBanner
            isLive={isLive}
            onGoLive={() => {
              interactionRef.current = goLive(interactionRef.current);
              setIsLive(true);
              tickRender();
            }}
            onResetScale={() => {
              interactionRef.current = resetScale(
                interactionRef.current,
                DEFAULT_INTERACTION.cellWidth,
                DEFAULT_INTERACTION.rowHeight,
              );
              tickRender();
            }}
          />
          <FpsCounter countRef={renderCountRef} />
        </div>
      </div>
      {menuPortal}
    </>
  );
});

/** Discrete FPS read-out parked in the top-right of the chart. Reads
 *  the parent's rendered-frame counter (NOT raw rAF callbacks) so the
 *  number reflects the canvas paint rate — what the user actually
 *  sees — rather than the monitor refresh rate (which would just show
 *  120 / 144 / 170 on idle even when we're not painting that fast).
 *  Updates every 500 ms so the value is steady enough to read.
 *  Colour-graded so a glance tells you the regime (green ≥ 55,
 *  amber 35-54, red < 35). */
function FpsCounter({
  countRef,
}: {
  countRef: { current: number };
}) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let lastCount = countRef.current;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      const cur = countRef.current;
      const frames = cur - lastCount;
      if (dt > 0) {
        setFps(Math.round((frames * 1000) / dt));
      }
      lastCount = cur;
      last = now;
    }, 500);
    return () => window.clearInterval(id);
    // `countRef` is a ref — stable identity, never triggers a re-mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const color =
    fps >= 55 ? "rgba(126, 211, 33, 0.7)"
      : fps >= 35 ? "rgba(255, 200, 0, 0.7)"
        : "rgba(255, 71, 87, 0.8)";
  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        right: 86,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: '"Consolas", "Monaco", monospace',
        letterSpacing: "0.04em",
        color,
        textShadow: "0 0 3px rgba(0, 0, 0, 0.9)",
        pointerEvents: "none",
        zIndex: 5,
        userSelect: "none",
      }}
    >
      {fps} FPS
    </div>
  );
}

/** Build the array of right-click context-menu items. Kept as a
 *  module-level function so it doesn't allocate per render — the
 *  caller composes a fresh array only when the menu is open
 *  (otherwise `[]`). Paste reads the system clipboard async so the
 *  parse-and-place is deferred into the onSelect closure. */
/** Snap a cursor Y to the nearest OHLC of the candle under the
 *  cursor X. Returns the OHLC price when one of {open, high, low,
 *  close} sits within `tolerancePx` of the cursor's screen Y;
 *  null otherwise (caller keeps the un-snapped value). Centralised
 *  so every drawing-handle drag uses the same snap rule when the
 *  user holds Ctrl — equivalent to the crosshair's existing
 *  magnet mode but applied to drawing edits. */
function snapPriceToOHLC(
  x: number,
  y: number,
  metrics: import("../../lib/orderflow/FootprintLayoutEngine").LayoutMetrics,
  layout: import("../../lib/orderflow/FootprintLayoutEngine").FootprintLayoutEngine,
  tolerancePx = 20,
): number | null {
  const visible = metrics.visibleCandles;
  if (visible.length === 0) return null;
  const idx = layout.getCandleIndexAtX(x, metrics);
  if (idx < 0 || idx >= visible.length) return null;
  const c = visible[idx];
  let bestPrice: number | null = null;
  let bestDist = Infinity;
  for (const p of [c.open, c.high, c.low, c.close]) {
    const yp = layout.priceToY(p, metrics);
    const d = Math.abs(yp - y);
    if (d < bestDist) {
      bestDist = d;
      bestPrice = p;
    }
  }
  if (bestPrice === null || bestDist > tolerancePx) return null;
  return bestPrice;
}

/** Resolve the floating-panel anchor for a trade drawing — the
 *  midpoint of the entry line, in canvas-local pixel coords. The
 *  rAF loop adds the canvas's clientRect offset before passing to
 *  the panel so the final coords are viewport-space. */
function computeTradeAnchor(
  d: TradeDrawing,
  layout: import("../../lib/orderflow/FootprintLayoutEngine").FootprintLayoutEngine,
  metrics: import("../../lib/orderflow/FootprintLayoutEngine").LayoutMetrics,
): { x: number; y: number } {
  const entryY = layout.priceToY(d.entryPrice, metrics);
  const entryX = layout.timeToX(d.entryTimeSec, metrics);
  return { x: entryX + 60, y: entryY };
}

/** Resolve the floating-panel anchor for a line drawing — the
 *  visual centre of the shape (segment midpoint, rect centre,
 *  text position) so the panel reads as "attached" to the
 *  drawing it's editing. */
function computeLineAnchor(
  d: LineDrawing,
  layout: import("../../lib/orderflow/FootprintLayoutEngine").FootprintLayoutEngine,
  metrics: import("../../lib/orderflow/FootprintLayoutEngine").LayoutMetrics,
): { x: number; y: number } {
  if (d.kind === "h-line") {
    // H-lines span the entire chart width, so anchor the panel
    // around 1/4 width — close to the leftmost candle, where the
    // line is most visible and the panel won't crowd the price axis.
    return {
      x: 120,
      y: layout.priceToY(d.price, metrics),
    };
  }
  if (d.kind === "h-ray") {
    return {
      x: layout.timeToX(d.startTimeSec, metrics) + 12,
      y: layout.priceToY(d.price, metrics),
    };
  }
  if (d.kind === "trend" || d.kind === "ruler") {
    const x1 = layout.timeToX(d.startTimeSec, metrics);
    const y1 = layout.priceToY(d.startPrice, metrics);
    const x2 = layout.timeToX(d.endTimeSec, metrics);
    const y2 = layout.priceToY(d.endPrice, metrics);
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  if (d.kind === "rect") {
    const xL = layout.timeToX(d.startTimeSec, metrics);
    const xR = layout.timeToX(d.endTimeSec, metrics);
    const yT = layout.priceToY(d.topPrice, metrics);
    return { x: (xL + xR) / 2, y: yT };
  }
  // text
  return {
    x: layout.timeToX(d.timeSec, metrics),
    y: layout.priceToY(d.price, metrics),
  };
}

function buildContextMenuItems({
  price,
  timeSec,
  barSpacingSec,
  priceDecimals,
  symbol,
  addLineDrawing,
  onOpenSettings,
}: {
  price: number;
  timeSec: number;
  barSpacingSec: number;
  priceDecimals: number;
  symbol: string;
  addLineDrawing: (d: LineDrawing) => void;
  onOpenSettings?: () => void;
}): ChartContextMenuItem[] {
  const priceText = price.toFixed(priceDecimals);
  const items: ChartContextMenuItem[] = [
    {
      id: "copy-price",
      label: "Copy price",
      detail: priceText,
      icon: <IconCopy />,
      onSelect: () => {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          navigator.clipboard.writeText(priceText).catch(() => {
            // Clipboard write can reject when the document isn't
            // focused (e.g. modal stacking) — fail silent, the user
            // can retry; no toast yet.
          });
        }
      },
    },
    {
      id: "paste-price",
      label: "Paste price",
      icon: <IconPaste />,
      onSelect: () => {
        // Async clipboard read → if it parses as a number, drop a
        // horizontal line at that exact price. Lets the user pull
        // a level from another tool (TradingView, Discord, an
        // analysis tweet) straight onto the chart.
        if (
          typeof navigator === "undefined" ||
          !navigator.clipboard ||
          typeof navigator.clipboard.readText !== "function"
        ) {
          return;
        }
        navigator.clipboard.readText().then((text) => {
          // Tolerant parse: strip $, commas, whitespace before
          // parseFloat so "29,350.00", "$29350", "29350 " all work.
          const cleaned = text.replace(/[$,\s]/g, "");
          const parsed = parseFloat(cleaned);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          addLineDrawing({
            kind: "h-line",
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            symbol,
            price: parsed,
            createdAt: Date.now(),
          });
        }).catch(() => {});
      },
    },
    {
      id: "add-alert",
      label: "Add alert",
      detail: priceText,
      icon: <IconBell />,
      divider: true,
      onSelect: () => {
        // Drop an alert-flagged h-line at the cursor price. The
        // alert watcher (mounted in RithmicFootprint /
        // CryptoFootprint) listens for the live close crossing this
        // level and fires an audible beep + auto-removes the line.
        addLineDrawing({
          kind: "h-line",
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          symbol,
          price,
          createdAt: Date.now(),
          isAlert: true,
        });
      },
    },
  ];

  // ── Sim trading actions at the clicked price ──────────────
  // Pull the trading symbol (no exchange suffix) and current market
  // tick from the sim store. The buttons only show when we have a
  // live price to compare against (otherwise we can't tell apart
  // limit vs stop for the side+price combo).
  const tradingSymbol = symbol.split(".")[0] ?? symbol;
  const simState = useSimAccountStore.getState();
  const lastTick = simState.livePrices[tradingSymbol];
  if (Number.isFinite(lastTick) && lastTick !== undefined) {
    // Limit vs Stop semantics relative to the clicked price :
    //  Buy : price below market = Buy Limit, above = Buy Stop
    //  Sell: price above market = Sell Limit, below = Sell Stop
    const buyKind: "buy_limit" | "buy_stop" =
      price < lastTick ? "buy_limit" : "buy_stop";
    const sellKind: "sell_limit" | "sell_stop" =
      price > lastTick ? "sell_limit" : "sell_stop";
    const buyLabel = buyKind === "buy_limit" ? "Buy Limit" : "Buy Stop";
    const sellLabel = sellKind === "sell_limit" ? "Sell Limit" : "Sell Stop";
    items.push(
      {
        id: "buy-at-price",
        label: `${buyLabel} 1 @`,
        detail: priceText,
        icon: <IconBell />,
        divider: true,
        onSelect: () => {
          useSimAccountStore.getState().placeWorkingOrder({
            symbol: tradingSymbol,
            type: buyKind,
            qty: 1,
            triggerPrice: price,
          });
        },
      },
      {
        id: "sell-at-price",
        label: `${sellLabel} 1 @`,
        detail: priceText,
        icon: <IconBell />,
        onSelect: () => {
          useSimAccountStore.getState().placeWorkingOrder({
            symbol: tradingSymbol,
            type: sellKind,
            qty: 1,
            triggerPrice: price,
          });
        },
      },
    );
  }

  items.push({
    id: "settings",
    label: "Settings",
    icon: <IconSettings />,
    divider: true,
    disabled: !onOpenSettings,
    onSelect: () => {
      onOpenSettings?.();
    },
  });
  // Reference `timeSec` / `barSpacingSec` so the linter doesn't flag
  // them as unused — they're plumbed through for future menu items
  // (e.g. "Place note at this candle") that will need both.
  void timeSec;
  void barSpacingSec;
  return items;
}
