// Phase B / M4.5 + M4.6 — pan / zoom / hover state machine.
//
// Pure module: no DOM, no React, no canvas. The React component
// holds an `InteractionState` ref, mutates it through these helpers
// in response to wheel/mouse events, then asks the renderer to
// redraw. Keeps the renderer agnostic of pointer concerns and
// makes the math individually testable.
//
// Conventions:
//   • All `x` / `y` inputs are CSS pixels relative to the canvas
//     top-left (so resize handlers translate window-space first).
//   • scrollX > 0 reveals older bars (chart shifts right).
//   • scrollY > 0 makes bars ascend on screen (gridTop decreases),
//     scrollY < 0 makes them descend; the renderer encodes the
//     sign flip when computing `gridTop = chartTop - scrollY`.
//   • Modifier keys (M4.6): plain wheel/drag = X axis (existing
//     M4.5 behaviour), Ctrl/Cmd+wheel = Y zoom, Shift+drag = Y pan.

export type DragMode = "x" | "y" | null;

export type InteractionState = {
  /** Horizontal scroll offset in CSS px. >0 reveals older bars. */
  scrollX: number;
  /** Vertical scroll offset in CSS px. Sign convention above. */
  scrollY: number;
  /** Per-bar width in CSS px (excluding inter-bar gap). */
  cellWidth: number;
  /** Per-price-row height in CSS px. Only consulted by the renderer
   *  when `userOverrodeY` is true; otherwise the renderer keeps its
   *  own autofit logic. */
  rowHeight: number;
  isDragging: boolean;
  dragMode: DragMode;
  /** Pointer X/Y at drag start (canvas-relative). */
  dragStartX: number;
  dragStartY: number;
  dragStartScrollX: number;
  dragStartScrollY: number;
  /** Last hover position (canvas-relative CSS px). null = no hover. */
  hoverX: number | null;
  hoverY: number | null;
  /** True once the user has touched anything Y-related (zoom or
   *  pan). Disables the renderer's autofit so the view doesn't
   *  jump back to whatever rowHeight the autofit would pick when
   *  a new bar lands. Reset to false by `Reset view` and by the
   *  symbol-switch reset in the React layer. */
  userOverrodeY: boolean;
  /** M6a-2 — mirror of userOverrodeY for the X axis. Heatmap uses
   *  this to disable auto-follow (right-anchoring on the latest
   *  snapshot) once the user has panned X manually; footprint
   *  doesn't currently consume it but the field stays available
   *  if a future symbol switch / replay needs the same semantic. */
  userOverrodeX: boolean;
};

export const DEFAULT_INTERACTION: InteractionState = {
  scrollX: 0,
  scrollY: 0,
  cellWidth: 110,
  rowHeight: 16,
  isDragging: false,
  dragMode: null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartScrollX: 0,
  dragStartScrollY: 0,
  hoverX: null,
  hoverY: null,
  userOverrodeY: false,
  userOverrodeX: false,
};

export const MIN_CELL_WIDTH = 40;
export const MAX_CELL_WIDTH = 220;
export const MIN_ROW_HEIGHT = 8;
export const MAX_ROW_HEIGHT = 40;
const ZOOM_STEP = 1.15;
const Y_MIN_VISIBLE_PX = 80; // ≈ 5 rows at default rowHeight

/** Multiplicative X zoom anchored under the cursor. */
export function applyWheelZoom(
  state: InteractionState,
  deltaY: number,
  cursorX: number,
  _canvasWidth: number,
): InteractionState {
  const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newCellWidth = clamp(
    state.cellWidth * factor,
    MIN_CELL_WIDTH,
    MAX_CELL_WIDTH,
  );
  if (newCellWidth === state.cellWidth) return state;
  const barIdxUnderCursor =
    (cursorX - state.scrollX) / state.cellWidth;
  const newScrollX = cursorX - barIdxUnderCursor * newCellWidth;
  return {
    ...state,
    cellWidth: newCellWidth,
    scrollX: newScrollX,
    userOverrodeX: true,
  };
}

/** Multiplicative Y zoom — modifies rowHeight and flips
 *  `userOverrodeY` so the renderer's autofit stops fighting the
 *  user. M4.6 zooms around the chart-area centre (not the cursor)
 *  to keep the math simple; cursor-anchored Y zoom is M4.7. */
export function applyWheelZoomY(
  state: InteractionState,
  deltaY: number,
): InteractionState {
  const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newRowHeight = clamp(
    state.rowHeight * factor,
    MIN_ROW_HEIGHT,
    MAX_ROW_HEIGHT,
  );
  if (newRowHeight === state.rowHeight && state.userOverrodeY) return state;
  return {
    ...state,
    rowHeight: newRowHeight,
    userOverrodeY: true,
  };
}

export function startDrag(
  state: InteractionState,
  canvasX: number,
  canvasY: number,
  mode: DragMode = "x",
): InteractionState {
  return {
    ...state,
    isDragging: true,
    dragMode: mode,
    dragStartX: canvasX,
    dragStartY: canvasY,
    dragStartScrollX: state.scrollX,
    dragStartScrollY: state.scrollY,
    hoverX: null,
    hoverY: null,
  };
}

export function updateDrag(
  state: InteractionState,
  canvasX: number,
  canvasY: number,
): InteractionState {
  if (!state.isDragging) return state;
  if (state.dragMode === "y") {
    const dy = canvasY - state.dragStartY;
    return {
      ...state,
      scrollY: state.dragStartScrollY + dy,
      userOverrodeY: true,
    };
  }
  const dx = canvasX - state.dragStartX;
  return {
    ...state,
    scrollX: state.dragStartScrollX + dx,
    userOverrodeX: true,
  };
}

export function endDrag(state: InteractionState): InteractionState {
  if (!state.isDragging) return state;
  return { ...state, isDragging: false, dragMode: null };
}

export function setHover(
  state: InteractionState,
  canvasX: number | null,
  canvasY: number | null,
): InteractionState {
  if (state.isDragging) return state;
  return { ...state, hoverX: canvasX, hoverY: canvasY };
}

export function clampScrollX(
  scrollX: number,
  barCount: number,
  cellWidth: number,
  visibleBarsCapacity: number,
): number {
  if (barCount <= visibleBarsCapacity) return 0;
  const maxScroll = (barCount - visibleBarsCapacity) * cellWidth;
  return clamp(scrollX, 0, maxScroll);
}

/** Constrain scrollY so the chart always shows at least
 *  Y_MIN_VISIBLE_PX of content. With `gridTop = chartTop - scrollY`:
 *    • scrollY ≤ totalContentHeight - minVisible → grid bottom edge
 *      stays inside the chart bottom by minVisible
 *    • scrollY ≥ -(chartHeight - minVisible) → grid top edge stays
 *      inside the chart top by minVisible
 */
export function clampScrollY(
  scrollY: number,
  totalContentHeight: number,
  chartHeight: number,
): number {
  const minVisible = Math.min(Y_MIN_VISIBLE_PX, chartHeight, totalContentHeight);
  const lo = -(chartHeight - minVisible);
  const hi = totalContentHeight - minVisible;
  if (hi < lo) return 0; // degenerate (chart smaller than minVisible)
  return clamp(scrollY, lo, hi);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
