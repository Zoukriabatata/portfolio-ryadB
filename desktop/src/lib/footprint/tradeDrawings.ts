// LONG / SHORT position drawing — a graphical trade visualisation
// dropped on the chart with entry / stop / target levels. Stored
// scale-independently (price + epoch seconds) so panning and zooming
// the chart never desync the drawing from the bars beneath it.

export type TradeDrawingType = "LONG" | "SHORT";

export interface TradeDrawing {
  id: string;
  type: TradeDrawingType;
  /** Symbol the drawing is anchored to, e.g. "MNQM6.CME". The
   *  renderer filters drawings by the currently-displayed symbol so
   *  a Rithmic MNQ drawing doesn't bleed onto a Bybit BTC chart. */
  symbol: string;
  /** Epoch seconds, compatible with `FootprintLayoutEngine.timeToX`. */
  entryTimeSec: number;
  /** Right edge of the drawing in epoch seconds. Risk/reward zones
   *  and entry/stop/target lines stop here instead of bleeding all
   *  the way to the price axis. Defaults to ~20 bars ahead of entry
   *  at placement time. Optional for backward-compat with drawings
   *  persisted before this field existed; the renderer falls back to
   *  a sensible default. */
  endTimeSec?: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** Unix ms — purely for "most recent first" sort in any future UI. */
  createdAt: number;
  /** Zone-fill opacity multiplier (0..1.5). 1.0 = default, 0 fully
   *  transparent. Applied uniformly to both the faint background
   *  and the brighter "actual progression" fill so the relative
   *  contrast between them stays consistent regardless of dial. */
  zoneOpacity?: number;
}

/** Default R:R when placing a fresh drawing — target distance is
 *  this multiple of the stop distance. */
const DEFAULT_RR = 2;
/** Number of ticks used as the default stop distance. Sized for
 *  index futures: MNQ tick 0.25 × 80 = 20 pts, which matches the
 *  typical MNQ scalping stop range. Other instruments scale
 *  proportionally to their tick size. */
const DEFAULT_STOP_TICKS = 80;
/** Fallback stop distance as a fraction of the entry price when no
 *  tick size is available (e.g. brand-new symbol with no trades yet).
 *  0.05 % — keeps the drawing small enough to stay readable on most
 *  scales without ballooning across the chart. */
const FALLBACK_STOP_PCT = 0.0005;

/** Default stop distance in price units. Picks the bigger of
 *  (tickSize × 80) and (price × 0.05%) so we never produce a stop
 *  smaller than a single bar's noise floor on very-tight-tick
 *  instruments. */
export function defaultStopDelta(price: number, tickSize?: number): number {
  const tickBased = (tickSize ?? 0) * DEFAULT_STOP_TICKS;
  const pctBased = price * FALLBACK_STOP_PCT;
  return Math.max(tickBased, pctBased);
}

/** Default forward extent in number of bars. The right edge of the
 *  drawing sits this many bars after the entry. Keeps the visual
 *  compact instead of stretching all the way to the price axis. */
const DEFAULT_FORWARD_BARS = 20;

/** Default end-time in epoch seconds, given the entry and the current
 *  bar spacing (seconds per bar). Falls back to entry + 1200 s
 *  (20 minutes — matches 20 × 1m, the most common TF) when no
 *  spacing hint is provided. */
export function defaultEndTimeSec(
  entryTimeSec: number,
  barSpacingSec?: number,
): number {
  const spacing = barSpacingSec && barSpacingSec > 0 ? barSpacingSec : 60;
  return entryTimeSec + DEFAULT_FORWARD_BARS * spacing;
}

export function createDefaultDrawing(
  type: TradeDrawingType,
  price: number,
  timeSec: number,
  symbol: string,
  tickSize?: number,
  barSpacingSec?: number,
): TradeDrawing {
  const stopDelta = defaultStopDelta(price, tickSize);
  const targetDelta = stopDelta * DEFAULT_RR;
  const isLong = type === "LONG";
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    symbol,
    entryTimeSec: timeSec,
    endTimeSec: defaultEndTimeSec(timeSec, barSpacingSec),
    entryPrice: price,
    stopPrice: isLong ? price - stopDelta : price + stopDelta,
    targetPrice: isLong ? price + targetDelta : price - targetDelta,
    createdAt: Date.now(),
  };
}

/** Risk/reward ratio. Returns +Infinity when stop == entry to avoid
 *  a divide-by-zero in the renderer; callers should display "∞". */
export function computeRR(d: TradeDrawing): number {
  const risk = Math.abs(d.entryPrice - d.stopPrice);
  const reward = Math.abs(d.targetPrice - d.entryPrice);
  if (risk === 0) return Number.POSITIVE_INFINITY;
  return reward / risk;
}

// ─── Line drawings ──────────────────────────────────────────────────────

/** Kinds of line / ray / trend / rect drawings the toolbar exposes.
 *  Kept separate from `TradeDrawingType` so the trade-position logic
 *  doesn't have to handle the new shapes. */
export type LineDrawingKind =
  | "h-line"
  | "h-ray"
  | "trend"
  | "rect"
  | "text"
  | "ruler";

/** Horizontal infinite line at a single price — spans the entire
 *  width of the chart, regardless of pan / zoom. Used to mark
 *  support/resistance, weekly highs, etc. */
/** Visual style shared by every line-shaped drawing (h-line, h-ray,
 *  trend, ruler). Optional everywhere — the renderer falls back to
 *  the brand defaults so drawings created before these fields
 *  existed keep their original look. */
export type LineStyle = "solid" | "dashed" | "dotted";
export interface LineStyleProps {
  color?: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
}

export interface HLineDrawing extends LineStyleProps {
  kind: "h-line";
  id: string;
  symbol: string;
  price: number;
  createdAt: number;
  /** When true, the renderer paints the line as an alert affordance
   *  (orange dashed + bell badge) and the alert watcher beeps when
   *  price crosses it. Plain undefined / false keeps the line as a
   *  pure visual S/R marker. */
  isAlert?: boolean;
  /** Optional center-of-line pill text. Used by the sim-position
   *  entry line to surface "entry · P&L" without opening the
   *  properties panel. Renderer draws nothing extra when omitted. */
  centerLabel?: string;
  /** Optional zone fill — paints a translucent rect spanning the full
   *  chart width between this line's price and `fillToPrice`. Used by
   *  the sim-position SL / TP overlays to highlight the loss / profit
   *  zone. Color comes from `fillColor` (already includes alpha). */
  fillToPrice?: number;
  fillColor?: string;
}

/** Horizontal ray starting at a specific time, extending to the
 *  RIGHT of the chart forever. Useful to mark a level that became
 *  relevant only after a specific moment (e.g. swing high).
 *
 *  `extendLeft`: when true, the ray ALSO extends to the left of its
 *  origin point — effectively turning the ray into a full
 *  horizontal line anchored on the (start, price) handle. Toggled
 *  via the properties panel. Right extension is implicit (it's a
 *  ray) but `extendRight: false` shortens it to just a marker dot. */
export interface HRayDrawing extends LineStyleProps {
  kind: "h-ray";
  id: string;
  symbol: string;
  startTimeSec: number;
  price: number;
  createdAt: number;
  extendLeft?: boolean;
  extendRight?: boolean;
}

/** Diagonal segment between two arbitrary (time, price) points.
 *  Used for trend channels, fan lines, ABCD legs, etc.
 *
 *  `extendLeft` / `extendRight`: when true, the line is projected
 *  beyond the matching endpoint to the chart edge using the same
 *  slope. Both can be true (= infinite line both ways). Toggled via
 *  the properties panel. */
export interface TrendDrawing extends LineStyleProps {
  kind: "trend";
  id: string;
  symbol: string;
  startTimeSec: number;
  startPrice: number;
  endTimeSec: number;
  endPrice: number;
  createdAt: number;
  extendLeft?: boolean;
  extendRight?: boolean;
}

/** Axis-aligned rectangle bounded by a time interval and a price
 *  band. Used to highlight zones (consolidation, supply/demand
 *  boxes, key range). Stored canonically with
 *  `startTimeSec ≤ endTimeSec` and `topPrice ≥ bottomPrice` — the
 *  store's update action re-normalises after every drag so the
 *  invariants hold even if the user crosses an axis mid-drag. */
export interface RectangleDrawing {
  kind: "rect";
  id: string;
  symbol: string;
  startTimeSec: number;
  endTimeSec: number;
  topPrice: number;
  bottomPrice: number;
  createdAt: number;
  /** Border colour + fill colour are independently pickable — the
   *  fill keeps the brand 10 % alpha so a translucent zone still
   *  reads clearly through the chart cells underneath. Optional;
   *  the renderer falls back to Senzoukria green. */
  borderColor?: string;
  borderWidth?: number;
  lineStyle?: LineStyle;
  fillColor?: string;
  /** Fill alpha override (0..1). When set, the renderer composes
   *  the rgba from `fillColor`'s hue + this opacity. */
  fillOpacity?: number;
  /** Extend the rectangle's price band beyond the time bounds.
   *  `extendLeft` projects the band leftwards to x=0; `extendRight`
   *  projects it rightwards to the chart's right edge. Useful for
   *  supply/demand zones that stay relevant once the price returns
   *  to the zone in the future. */
  extendLeft?: boolean;
  extendRight?: boolean;
}

/** Free-floating text annotation anchored at a single (time, price)
 *  point. Used to label setups, scribble session notes, etc. The
 *  content can be empty momentarily while the inline editor has
 *  focus — the canvas garbage-collects empty drawings on blur so a
 *  text-tool click that the user changes their mind about doesn't
 *  leave a phantom. */
export interface TextDrawing {
  kind: "text";
  id: string;
  symbol: string;
  timeSec: number;
  price: number;
  content: string;
  createdAt: number;
  /** Text + background colour. Optional; renderer falls back to
   *  white text / translucent dark pill. */
  color?: string;
  bgColor?: string;
  /** Text styling. Optional everywhere — the renderer falls back
   *  to 12 px regular when unset. */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

/** Ruler / measure tool — a segment between two (time, price)
 *  points that displays the deltas (price, %, bars, time) at its
 *  midpoint. Same geometry as a trend line, different rendering
 *  (stats badge instead of slope label). */
export interface RulerDrawing extends LineStyleProps {
  kind: "ruler";
  id: string;
  symbol: string;
  startTimeSec: number;
  startPrice: number;
  endTimeSec: number;
  endPrice: number;
  createdAt: number;
}

export type LineDrawing =
  | HLineDrawing
  | HRayDrawing
  | TrendDrawing
  | RectangleDrawing
  | TextDrawing
  | RulerDrawing;

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Default trend-line slope: end is this many bars to the right of
 *  the start point, with a slight upward bias derived from the
 *  instrument's tick. The user is expected to drag the endpoints
 *  to fit the actual move; this just makes the drawing visible. */
const DEFAULT_TREND_BARS = 30;
const DEFAULT_TREND_SLOPE_TICKS = 20;
/** Default ray length isn't used (rays extend infinitely); kept here
 *  as a comment for symmetry with other line tools. */

export function createDefaultLineDrawing(
  kind: LineDrawingKind,
  price: number,
  timeSec: number,
  symbol: string,
  barSpacingSec?: number,
  tickSize?: number,
): LineDrawing {
  const id = makeId();
  const createdAt = Date.now();
  if (kind === "h-line") {
    return { kind: "h-line", id, symbol, price, createdAt };
  }
  if (kind === "h-ray") {
    return {
      kind: "h-ray",
      id,
      symbol,
      startTimeSec: timeSec,
      price,
      createdAt,
    };
  }
  if (kind === "rect") {
    // Seed start==end and top==bottom so the click-drag placement
    // flow can extend the rectangle live; a static click leaves a
    // zero-area rect that gets garbage-collected on mouseUp.
    return {
      kind: "rect",
      id,
      symbol,
      startTimeSec: timeSec,
      endTimeSec: timeSec,
      topPrice: price,
      bottomPrice: price,
      createdAt,
    };
  }
  if (kind === "text") {
    return {
      kind: "text",
      id,
      symbol,
      timeSec,
      price,
      content: "",
      createdAt,
    };
  }
  if (kind === "ruler") {
    // Seed start==end so the click-drag flow can extend the ruler
    // live; zero-length rulers are garbage-collected on mouseUp
    // (same rule as trend / rect).
    return {
      kind: "ruler",
      id,
      symbol,
      startTimeSec: timeSec,
      startPrice: price,
      endTimeSec: timeSec,
      endPrice: price,
      createdAt,
    };
  }
  // trend
  const spacing = barSpacingSec && barSpacingSec > 0 ? barSpacingSec : 60;
  const tick = tickSize && tickSize > 0 ? tickSize : 0.25;
  return {
    kind: "trend",
    id,
    symbol,
    startTimeSec: timeSec,
    startPrice: price,
    endTimeSec: timeSec + DEFAULT_TREND_BARS * spacing,
    endPrice: price + DEFAULT_TREND_SLOPE_TICKS * tick,
    createdAt,
  };
}

/** Re-normalise a rectangle so `startTimeSec ≤ endTimeSec` and
 *  `topPrice ≥ bottomPrice` after a drag has crossed an axis. The
 *  store's `updateLineDrawing` action runs this on every rectangle
 *  patch to keep the invariant. */
export function normalizeRectangle(d: RectangleDrawing): RectangleDrawing {
  return {
    ...d,
    startTimeSec: Math.min(d.startTimeSec, d.endTimeSec),
    endTimeSec: Math.max(d.startTimeSec, d.endTimeSec),
    topPrice: Math.max(d.topPrice, d.bottomPrice),
    bottomPrice: Math.min(d.topPrice, d.bottomPrice),
  };
}
