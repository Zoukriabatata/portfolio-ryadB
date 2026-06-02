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

export type DragMode = "x" | "y" | "free" | "axisY" | "axisX" | null;

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
  /** Snapshot of cellWidth/rowHeight at drag start. Used by axis-drag
   *  zoom modes (axisX / axisY) so each frame derives the new zoom
   *  multiplicatively from the *start* value, not from the previous
   *  frame's value (which would compound). */
  dragStartCellWidth: number;
  dragStartRowHeight: number;
};

export const DEFAULT_INTERACTION: InteractionState = {
  scrollX: 0,
  scrollY: 0,
  // cellWidth = horizontal width of a full footprint column (bid +
  // ohlc + ask + profile). The renderer hides the per-level numbers
  // when cellWidth < 90 (color-only fallback). The previous default
  // of 110 left only a 20 px margin before text disappeared, and
  // the auto-fit was capped at this value too — busy sessions
  // landed close to that margin and the numbers read as cramped.
  // Bumped to 140 so values like "138 x 115" breathe by default
  // and the auto-fit ceiling is more generous on wide displays.
  cellWidth: 140,
  // Per-level row height when the user has Y-zoomed. Bumped 16 → 20
  // so a manual Y-zoom doesn't squeeze text back against the 9 px
  // visibility threshold. Matches the layout cap (17) + 3 px of
  // user-zoom headroom.
  rowHeight: 20,
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
  dragStartCellWidth: 140,
  dragStartRowHeight: 20,
};

// Wider zoom envelope — user wants to zoom in much further (per-cell detail
// at high prices like BTC) and dezoom much further (overview of dozens of bars).
export const MIN_CELL_WIDTH = 12;
export const MAX_CELL_WIDTH = 600;
export const MIN_ROW_HEIGHT = 3;
export const MAX_ROW_HEIGHT = 120;
// Per-notch baseline zoom step. The actual factor scales continuously
// with `deltaY` magnitude so trackpads + smooth-scroll mice glide.
// Tightened from 1.15 → 1.08 so each notch is ~7 % rather than ~13 %
// — the previous step was perceptibly chunky on mechanical wheels.
const ZOOM_STEP = 1.08;
const Y_MIN_VISIBLE_PX = 80; // ≈ 5 rows at default rowHeight
/** Minimum mouse travel before a drag flips userOverrodeX/Y on.
 *  Below this we treat the gesture as a click + small jitter and
 *  stay in auto-follow / autofit. Avoids the M6a-2 footgun where
 *  a click anywhere on the heatmap canvas locked the viewport. */
const DRAG_THRESHOLD_PX = 3;

/** Continuous zoom factor from a wheel `deltaY`. Matches the legacy
 *  fixed-step behaviour at |deltaY|=100 (one classic mouse notch)
 *  and scales smoothly down for trackpad / smooth-scroll deltas. */
function wheelZoomFactor(deltaY: number): number {
  // pow(1.15, -1) ≈ 0.870 at deltaY=100 (dezoom by ~13%)
  // pow(1.15, +1) ≈ 1.150 at deltaY=-100 (zoom by ~15%)
  // pow(1.15, -0.1) ≈ 0.986 at deltaY=10 (trackpad nudge)
  return Math.pow(ZOOM_STEP, -deltaY / 100);
}

/** Width of the right-side price axis in CSS px. Used to convert
 *  the wheel-handler's `canvasWidth` into the actual chart right
 *  edge for cursor-anchored zoom. Mirrors the value baked into
 *  `FootprintCanvas.onMouseDown` (PRICE_AXIS_W = 80). */
const PRICE_AXIS_W = 80;

/** Multiplicative X zoom anchored under the cursor. The chart is
 *  right-aligned (newest candle pinned to the right edge), so the
 *  cursor's "bar index from the right" is the invariant we preserve
 *  through the zoom. Derivation:
 *
 *   dataIdxUnderCursor = totalCandles
 *                      + (cursorX - chartRight - scrollX) / cellWidth
 *
 *  Holding `dataIdxUnderCursor` constant across w_old → w_new gives:
 *
 *   scrollX_new = (cursorX - chartRight) * (1 - factor)
 *               + scrollX_old * factor
 *
 *  where `factor = cellWidth_new / cellWidth_old`. */
export function applyWheelZoom(
  state: InteractionState,
  deltaY: number,
  cursorX: number,
  canvasWidth: number,
): InteractionState {
  const factor = wheelZoomFactor(deltaY);
  const newCellWidth = clamp(
    state.cellWidth * factor,
    MIN_CELL_WIDTH,
    MAX_CELL_WIDTH,
  );
  if (newCellWidth === state.cellWidth) return state;
  const actualFactor = newCellWidth / state.cellWidth;
  const chartRight = Math.max(1, canvasWidth - PRICE_AXIS_W);
  const newScrollX =
    (cursorX - chartRight) * (1 - actualFactor) + state.scrollX * actualFactor;
  return {
    ...state,
    cellWidth: newCellWidth,
    scrollX: newScrollX,
    userOverrodeX: true,
  };
}

/** Uniform XY zoom — applies X and Y anchored at the cursor.
 *  Used by the plain mouse-wheel binding when neither Shift nor Ctrl
 *  is held. Both axes anchor to the cursor so the price + candle
 *  under the pointer stay visually pinned through the zoom. */
export function applyWheelZoomXY(
  state: InteractionState,
  deltaY: number,
  cursorX: number,
  cursorY: number,
  canvasWidth: number,
): InteractionState {
  const afterX = applyWheelZoom(state, deltaY, cursorX, canvasWidth);
  return applyWheelZoomY(afterX, deltaY, cursorY);
}

/** Multiplicative Y zoom — modifies rowHeight and compensates scrollY
 *  so the price under the cursor stays pinned. When `cursorY` is
 *  undefined we fall back to no anchoring (chart-area shift). */
export function applyWheelZoomY(
  state: InteractionState,
  deltaY: number,
  cursorY?: number,
): InteractionState {
  const factor = wheelZoomFactor(deltaY);
  const newRowHeight = clamp(
    state.rowHeight * factor,
    MIN_ROW_HEIGHT,
    MAX_ROW_HEIGHT,
  );
  if (newRowHeight === state.rowHeight && state.userOverrodeY) return state;
  // Anchor: pre-zoom, the pixel offset from chartTop to the cursor is
  // `cursorY ≈ relativeY` (approximated as the cursor's canvas-relative
  // Y; treats the chart as starting at y=0 — close enough since the
  // chart fills the canvas minus a few pixels of padding). Adjust
  // scrollY so the same price stays at the same pixel after the
  // rowHeight change:
  //   newScrollY = oldScrollY + (oldScrollY + relativeY) * (f - 1)
  // where f = newRowHeight / oldRowHeight. Derivation in
  // interactions.test.ts (Y-anchor section).
  let newScrollY = state.scrollY;
  if (cursorY !== undefined && state.rowHeight > 0) {
    const actualFactor = newRowHeight / state.rowHeight;
    newScrollY =
      state.scrollY + (state.scrollY + cursorY) * (actualFactor - 1);
  }
  return {
    ...state,
    rowHeight: newRowHeight,
    scrollY: newScrollY,
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
    dragStartCellWidth: state.cellWidth,
    dragStartRowHeight: state.rowHeight,
    hoverX: null,
    hoverY: null,
  };
}

export function updateDrag(
  state: InteractionState,
  canvasX: number,
  canvasY: number,
  canvasWidth = 0,
  canvasHeight = 0,
): InteractionState {
  if (!state.isDragging) return state;
  const dx = canvasX - state.dragStartX;
  const dy = canvasY - state.dragStartY;

  if (state.dragMode === "y") {
    // Below the threshold + no prior override → treat as a quiet
    // click, return the same state. Once override is on, we
    // accept any further dy without gating.
    if (Math.abs(dy) < DRAG_THRESHOLD_PX && !state.userOverrodeY) {
      return state;
    }
    return {
      ...state,
      scrollY: state.dragStartScrollY + dy,
      userOverrodeY: true,
    };
  }

  if (state.dragMode === "free") {
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX
        && !state.userOverrodeX && !state.userOverrodeY) {
      return state;
    }
    return {
      ...state,
      scrollX: state.dragStartScrollX + dx,
      scrollY: state.dragStartScrollY + dy,
      userOverrodeX: true,
      userOverrodeY: true,
    };
  }

  if (state.dragMode === "axisY") {
    // Drag on the price axis → multiplicative Y zoom, anchored at the
    // cursor's start position. Up = zoom in (rows taller), down =
    // zoom out. We pivot on `dragStartY` instead of the chart centre
    // so the price the user grabbed stays glued under their pointer
    // for the duration of the drag.
    const factor = Math.exp(-dy / 120);
    const newRowHeight = clamp(
      state.dragStartRowHeight * factor,
      MIN_ROW_HEIGHT,
      MAX_ROW_HEIGHT,
    );
    const actualFactor = newRowHeight / Math.max(1, state.dragStartRowHeight);
    // Chart vertical centre — see priceToY in FootprintLayoutEngine,
    // which scales the price range around (areaY + areaHeight/2).
    const chartCenterY = canvasHeight / 2;
    const newScrollY =
      (state.dragStartY - chartCenterY) * (1 - actualFactor) +
      state.dragStartScrollY * actualFactor;
    return {
      ...state,
      rowHeight: newRowHeight,
      scrollY: newScrollY,
      userOverrodeY: true,
    };
  }

  if (state.dragMode === "axisX") {
    // Drag on the time axis → multiplicative X zoom, anchored at the
    // cursor's start position. Right = zoom in. Same derivation as
    // applyWheelZoom but the pivot is the dragStartX instead of the
    // live cursor X (so the gesture origin stays fixed).
    const factor = Math.exp(dx / 120);
    const newCellWidth = clamp(
      state.dragStartCellWidth * factor,
      MIN_CELL_WIDTH,
      MAX_CELL_WIDTH,
    );
    const actualFactor = newCellWidth / Math.max(1, state.dragStartCellWidth);
    const chartRight = Math.max(1, canvasWidth - PRICE_AXIS_W);
    const newScrollX =
      (state.dragStartX - chartRight) * (1 - actualFactor) +
      state.dragStartScrollX * actualFactor;
    return {
      ...state,
      cellWidth: newCellWidth,
      scrollX: newScrollX,
      userOverrodeX: true,
    };
  }

  if (Math.abs(dx) < DRAG_THRESHOLD_PX && !state.userOverrodeX) {
    return state;
  }
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

/** Maximum negative scrollX as a fraction of the viewport width.
 *  0.7 means the newest bar can slide up to ~30% from the left edge
 *  (70% of the viewport free as empty future). Caps how far the user
 *  can drag past the latest candle: with the previous 0.95 cap the
 *  last bar could slip off-screen entirely, which read as a "missing
 *  data" glitch when the user dragged back to find it. */
const MAX_RIGHT_MARGIN_FRAC = 0.7;

export function clampScrollX(
  scrollX: number,
  barCount: number,
  cellWidth: number,
  visibleBarsCapacity: number,
): number {
  // Allow scrolling *past* the most recent bar so the user can pull
  // the chart left and look at the latest candle from the middle of
  // the viewport. The renderer treats negative scrollX as a right
  // margin (shifts every bar left, doesn't change which slice of the
  // data is drawn).
  const lo = -(visibleBarsCapacity * cellWidth * MAX_RIGHT_MARGIN_FRAC);
  if (barCount <= visibleBarsCapacity) {
    return clamp(scrollX, lo, 0);
  }
  const maxScroll = (barCount - visibleBarsCapacity) * cellWidth;
  return clamp(scrollX, lo, maxScroll);
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
