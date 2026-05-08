// Phase B / M4.5 — pan / zoom / hover state machine.
//
// Pure module: no DOM, no React, no canvas. The React component
// holds an `InteractionState` ref, mutates it through these helpers
// in response to wheel/mouse events, then asks the renderer to
// redraw. Keeps the renderer agnostic of pointer concerns and
// makes the math individually testable.
//
// Coordinate convention: all `x` inputs are CSS pixels relative to
// the canvas top-left. `scrollX` is also in CSS pixels — positive
// values shift bars to the right (revealing past), negative is
// equivalent to scrolling forward and is clamped out by
// `clampScrollX` so the chart never empties.

export type InteractionState = {
  /** Horizontal scroll offset in CSS px. >0 reveals older bars. */
  scrollX: number;
  /** Per-bar width in CSS px. Includes the inter-bar gap when set. */
  cellWidth: number;
  isDragging: boolean;
  /** Pointer X at drag start (window-space). */
  dragStartX: number;
  /** scrollX captured at drag start. */
  dragStartScrollX: number;
  /** Last hover position (canvas-relative CSS px). null = no hover. */
  hoverX: number | null;
  hoverY: number | null;
};

export const DEFAULT_INTERACTION: InteractionState = {
  scrollX: 0,
  cellWidth: 110,
  isDragging: false,
  dragStartX: 0,
  dragStartScrollX: 0,
  hoverX: null,
  hoverY: null,
};

export const MIN_CELL_WIDTH = 40;
export const MAX_CELL_WIDTH = 220;
const ZOOM_STEP = 1.15;

/** Multiplicative wheel zoom anchored under the cursor. */
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

  // Zoom anchor: keep whatever bar slot lives under the cursor at
  // the same screen X after the resize. Distance from the right
  // edge governs the bar slot, so we work in "bars from right":
  //   barFromRight = (rightEdge - (cursorX + scrollX)) / cellWidth
  // Rearranging: scrollX' = scrollX + (cellWidth' - cellWidth) * barFromRight
  // We don't have the right edge here, but the cursor distance from
  // the canvas's right edge stays constant during zoom, so anchoring
  // on the cursor itself is equivalent.
  const barIdxUnderCursor =
    (cursorX - state.scrollX) / state.cellWidth;
  const newScrollX = cursorX - barIdxUnderCursor * newCellWidth;

  return {
    ...state,
    cellWidth: newCellWidth,
    scrollX: newScrollX,
  };
}

export function startDrag(
  state: InteractionState,
  windowX: number,
): InteractionState {
  return {
    ...state,
    isDragging: true,
    dragStartX: windowX,
    dragStartScrollX: state.scrollX,
    hoverX: null,
    hoverY: null,
  };
}

export function updateDrag(
  state: InteractionState,
  windowX: number,
): InteractionState {
  if (!state.isDragging) return state;
  const dx = windowX - state.dragStartX;
  return { ...state, scrollX: state.dragStartScrollX + dx };
}

export function endDrag(state: InteractionState): InteractionState {
  if (!state.isDragging) return state;
  return { ...state, isDragging: false };
}

export function setHover(
  state: InteractionState,
  canvasX: number | null,
  canvasY: number | null,
): InteractionState {
  if (state.isDragging) return state;
  return { ...state, hoverX: canvasX, hoverY: canvasY };
}

/** Constrain scrollX so the chart never reveals empty space.
 *  - The most recent bar always ends at the right edge (scrollX=0
 *    is the rest position).
 *  - The user can scroll back up to `(barCount-1) * cellWidth` to
 *    see older bars.
 */
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
