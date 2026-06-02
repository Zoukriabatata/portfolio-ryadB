// P1.5 — Adapter wrapper that exposes the legacy `FootprintCanvasRenderer`
// API while internally driving the ported web renderer
// (FootprintProRenderer + FootprintLayoutEngine). Lets us swap the visual
// engine without touching FootprintCanvas.tsx wiring.

import { FootprintCanvasRenderer as ProRenderer } from "./FootprintProRenderer";
import { FootprintLayoutEngine } from "../orderflow/FootprintLayoutEngine";
import type { FootprintCandle } from "../orderflow/types";
import type {
  FootprintColors,
  FootprintFonts,
  FootprintFeatures,
  LODState,
  RenderMode,
} from "./rendererTypes";
import {
  PRO_DEFAULT_COLORS,
  PRO_DEFAULT_FONTS,
  PRO_DEFAULT_FEATURES,
  PRO_DEFAULT_CLUSTER_STAT_CONFIG,
} from "./proDefaults";
import {
  DEFAULT_LAYOUT,
  type LayoutConfig,
  type RendererBar,
  type RendererPriceLevel,
} from "./types";
import { rendererBarsToFootprintCandles } from "./proAdapter";
import type { FootprintTheme } from "./theme";
import { SENZOUKRIA_DARK } from "./theme";
import {
  DEFAULT_INTERACTION,
  type InteractionState,
} from "./interactions";
import {
  EMPTY_INDICATORS,
  type IndicatorsResult,
} from "./indicators";
import {
  computeRR,
  defaultEndTimeSec,
  type TradeDrawing,
  type LineDrawing,
} from "./tradeDrawings";

/** Pixel size of the [×] delete button rendered next to the Entry
 *  label. Kept in module scope so hit-testing can reproduce the
 *  exact layout without re-deriving from the renderer state. */
const DELETE_BTN_SIZE = 14;
/** Gap between the Entry label box and the [×] button. */
const DELETE_BTN_GAP = 4;

/** Pixel size of the manual-close [×] button rendered on the sim
 *  position entry h-line. Slightly larger than the TradeDrawing
 *  delete button so it's an unmistakable click target — closing a
 *  live position is a higher-stakes action than deleting a planning
 *  drawing. */
const POSITION_CLOSE_BTN_SIZE = 16;
const POSITION_CLOSE_BTN_GAP = 6;

/** Stable id of the sim-position entry h-line.
 *  Duplicated here (rather than imported from `lib/sim/...`) so the
 *  rendering layer doesn't depend on the sim runtime. The single
 *  source of truth lives in `useSimPositionOverlay.ts` — keep both
 *  values in sync if the constant ever changes there. */
const POSITION_ENTRY_LINE_ID = "sim:position:entry";

/** Resize handle diameter in CSS pixels (filled circle drawn at the
 *  corners and edge midpoints of a trade drawing). Slightly bigger
 *  than the legacy square so the rounded shape still reads as a
 *  clear, clickable grip. */
export const DRAWING_HANDLE_SIZE = 10;

/** IANA mapping for the renderer-side timezone keys. "LCL" is
 *  intentionally NOT mapped — the formatter omits the `timeZone`
 *  option entirely in that case so the runtime's resolved local
 *  zone is used. Setting `timeZone: undefined` is *not* equivalent
 *  in all WebView2 / WebKit builds (some versions silently fall
 *  back to UTC, which produces the "off by a fixed amount" bug). */
const TZ_IANA: Partial<Record<string, string>> = {
  UTC: "UTC",
  NY: "America/New_York",
  CHI: "America/Chicago",
  LON: "Europe/London",
  PAR: "Europe/Paris",
  TYO: "Asia/Tokyo",
};

/** Cache one DateTimeFormat per (tz, withSeconds) combo. Creating a
 *  fresh formatter every frame for every axis tick is measurably
 *  slow on a 1500-bar drag and shows up in profiles. */
const TZ_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
/** Map a `LineStyle` token to the matching `ctx.setLineDash` array.
 *  Empty for solid. Centralised so the renderer and the properties
 *  panel use the same physical patterns. */
function lineStyleToDash(
  style: import("./tradeDrawings").LineStyle | undefined,
): number[] {
  if (style === "dashed") return [6, 4];
  if (style === "dotted") return [2, 3];
  return [];
}

/** Crosshair-specific dash patterns — slightly tighter than the
 *  drawing patterns so the lines read as "guide" rather than
 *  "geometry". */
function crosshairStyleToDash(
  style: "solid" | "dashed" | "dotted" | undefined,
): number[] {
  if (style === "dashed") return [3, 3];
  if (style === "dotted") return [1, 3];
  return [];
}

/** Format a signed integer delta for the per-bar inline label.
 *  Compacts to K / M past 1000 / 1e6 with one decimal so the label
 *  never gets long enough to overlap neighbouring bars. Keeps the
 *  sign explicit on positive deltas — at a glance, "+842" vs "-842"
 *  is the most important read. */
function formatBarDelta(delta: number): string {
  const abs = Math.abs(delta);
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)}K`;
  if (abs >= 1_000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

/** Convert a `#rrggbb` hex (the format produced by `<input
 *  type="color">`) into a CSS rgba() string with the given alpha.
 *  Falls through to a plain rgba(255,255,255,a) if the input isn't
 *  a well-formed 7-char hex — the picker UI guarantees the format,
 *  but defensive on any non-modal-driven path (legacy persisted
 *  state, accidental garbage).
 */
/** Extract the `#rrggbb` hue from either a hex string (returned
 *  as-is) or an `rgba(r,g,b,a)` string. Used by the renderer
 *  whenever an opacity override needs to be applied to a colour
 *  that was originally persisted with its alpha baked in. */
function hexFromRgbaIfPossible(s: string): string {
  if (typeof s === "string" && s.startsWith("#") && s.length === 7) return s;
  const m = s.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/i,
  );
  if (!m) return "#7ed321";
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(parseInt(m[1], 10))}${toHex(parseInt(m[2], 10))}${toHex(parseInt(m[3], 10))}`;
}

function hexToRgba(hex: string, alpha: number): string {
  if (typeof hex !== "string" || hex.length !== 7 || hex[0] !== "#") {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function tzFormatter(tz: string, withSeconds: boolean): Intl.DateTimeFormat {
  const key = `${tz}:${withSeconds ? 1 : 0}`;
  const cached = TZ_FORMATTER_CACHE.get(key);
  if (cached) return cached;
  const tzName = TZ_IANA[tz];
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (withSeconds) opts.second = "2-digit";
  // Only set the timeZone option when we actually have one — see the
  // comment on TZ_IANA above for the WebView-specific reason.
  if (tzName) opts.timeZone = tzName;
  const fmt = new Intl.DateTimeFormat("en-GB", opts);
  TZ_FORMATTER_CACHE.set(key, fmt);
  return fmt;
}

/** Same caching pattern as `tzFormatter` but for the day-boundary
 *  date label ("DD Mmm" e.g. "12 May"). Separate cache key so the
 *  time/date pair doesn't collide. */
const TZ_DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
function tzDateFormatter(tz: string): Intl.DateTimeFormat {
  const cached = TZ_DATE_FORMATTER_CACHE.get(tz);
  if (cached) return cached;
  const tzName = TZ_IANA[tz];
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };
  if (tzName) opts.timeZone = tzName;
  const fmt = new Intl.DateTimeFormat("en-GB", opts);
  TZ_DATE_FORMATTER_CACHE.set(tz, fmt);
  return fmt;
}


/** Logical handle identifier. The line variants (entry/stop/target)
 *  are the existing "drag any horizontal line to change its price"
 *  affordance; the corner + mid variants are the bounding-box style
 *  resize handles. */
export type DrawingHandleKind =
  | "entry"
  | "stop"
  | "target"
  | "tl"
  | "tr"
  | "bl"
  | "br"
  | "ml"
  | "mr";

/** Handle identifiers for line drawings (h-line / h-ray / trend /
 *  rect). The `*-body` variants are used when the user clicks the
 *  shape itself (not its endpoint marker) — they drag the whole
 *  thing while preserving the click-to-anchor offset for natural
 *  feel. Rectangle corner/edge handles let the user resize one
 *  side at a time. */
export type LineHandleKind =
  | "h-line-mid"
  | "h-ray-start"
  | "trend-start"
  | "trend-end"
  | "h-line-body"
  | "h-ray-body"
  | "trend-body"
  | "rect-tl"
  | "rect-tr"
  | "rect-bl"
  | "rect-br"
  | "rect-top"
  | "rect-bottom"
  | "rect-left"
  | "rect-right"
  | "rect-body"
  | "ruler-start"
  | "ruler-end"
  | "ruler-body"
  | "text-anchor"
  | "text-body";

export interface LineHandlePos {
  drawingId: string;
  kind: LineHandleKind;
  x: number;
  y: number;
}

/** Draw a small white disc with a dark outline at (cx, cy). Shared
 *  between the trade-drawing corner handles and the line-drawing
 *  endpoint handles so all handles read as the same visual idiom. */
function drawCircleHandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  stroke: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

/** Draw the price tag at the right edge of a horizontal line / ray. */
function drawPriceLabel(
  ctx: CanvasRenderingContext2D,
  chartRight: number,
  y: number,
  price: number,
  color: string,
): void {
  ctx.save();
  ctx.font = '11px "Consolas", "Monaco", monospace';
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const text = price.toFixed(2);
  const tw = ctx.measureText(text).width;
  const padX = 4;
  const boxW = tw + padX * 2;
  const boxH = 14;
  const boxX = chartRight - boxW - 4;
  const boxY = Math.round(y - boxH / 2) + 0.5;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY, boxW - 1, boxH);
  ctx.fillStyle = color;
  ctx.fillText(text, chartRight - 4 - padX, y);
  ctx.restore();
}

/** Resolve all draggable handle positions for a line drawing. The
 *  canvas hit-tester uses this to determine which handle (if any) a
 *  click landed on, mirroring how `getTradeDrawingHandles` works
 *  for trade drawings. */
export function getLineDrawingHandles(
  d: LineDrawing,
  layout: FootprintLayoutEngine,
  metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
  chartRight: number,
): LineHandlePos[] {
  if (d.kind === "h-line") {
    const y = layout.priceToY(d.price, metrics);
    return [{ drawingId: d.id, kind: "h-line-mid", x: chartRight / 2, y }];
  }
  if (d.kind === "h-ray") {
    const x = layout.timeToX(d.startTimeSec, metrics);
    const y = layout.priceToY(d.price, metrics);
    return [{ drawingId: d.id, kind: "h-ray-start", x, y }];
  }
  if (d.kind === "rect") {
    const xL = layout.timeToX(d.startTimeSec, metrics);
    const xR = layout.timeToX(d.endTimeSec, metrics);
    const yT = layout.priceToY(d.topPrice, metrics);
    const yB = layout.priceToY(d.bottomPrice, metrics);
    const xMid = (xL + xR) / 2;
    const yMid = (yT + yB) / 2;
    return [
      { drawingId: d.id, kind: "rect-tl", x: xL, y: yT },
      { drawingId: d.id, kind: "rect-tr", x: xR, y: yT },
      { drawingId: d.id, kind: "rect-bl", x: xL, y: yB },
      { drawingId: d.id, kind: "rect-br", x: xR, y: yB },
      { drawingId: d.id, kind: "rect-top", x: xMid, y: yT },
      { drawingId: d.id, kind: "rect-bottom", x: xMid, y: yB },
      { drawingId: d.id, kind: "rect-left", x: xL, y: yMid },
      { drawingId: d.id, kind: "rect-right", x: xR, y: yMid },
    ];
  }
  if (d.kind === "ruler") {
    const x1 = layout.timeToX(d.startTimeSec, metrics);
    const y1 = layout.priceToY(d.startPrice, metrics);
    const x2 = layout.timeToX(d.endTimeSec, metrics);
    const y2 = layout.priceToY(d.endPrice, metrics);
    return [
      { drawingId: d.id, kind: "ruler-start", x: x1, y: y1 },
      { drawingId: d.id, kind: "ruler-end", x: x2, y: y2 },
    ];
  }
  if (d.kind === "text") {
    const x = layout.timeToX(d.timeSec, metrics);
    const y = layout.priceToY(d.price, metrics);
    return [{ drawingId: d.id, kind: "text-anchor", x, y }];
  }
  // trend
  const x1 = layout.timeToX(d.startTimeSec, metrics);
  const y1 = layout.priceToY(d.startPrice, metrics);
  const x2 = layout.timeToX(d.endTimeSec, metrics);
  const y2 = layout.priceToY(d.endPrice, metrics);
  return [
    { drawingId: d.id, kind: "trend-start", x: x1, y: y1 },
    { drawingId: d.id, kind: "trend-end", x: x2, y: y2 },
  ];
}

export interface DrawingHandlePos {
  kind: DrawingHandleKind;
  x: number;
  y: number;
}

/** Resolve the resize-handle screen positions for a drawing. Both the
 *  renderer (drawing them) and the canvas hit-test (clicking them)
 *  call this so they stay in lockstep. Returns the 6 bounding-box
 *  handles only — the line variants are hit-tested separately
 *  against the full horizontal extent of each line. */
export function getTradeDrawingHandles(
  d: TradeDrawing,
  layout: FootprintLayoutEngine,
  metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
  chartRight: number,
): DrawingHandlePos[] {
  const entryX = layout.timeToX(d.entryTimeSec, metrics);
  const vc = metrics.visibleCandles;
  const spacing = vc.length >= 2 ? vc[1].time - vc[0].time : 60;
  const endTimeSec =
    d.endTimeSec ?? defaultEndTimeSec(d.entryTimeSec, spacing);
  const endX = Math.min(chartRight, layout.timeToX(endTimeSec, metrics));
  const entryY = layout.priceToY(d.entryPrice, metrics);
  const stopY = layout.priceToY(d.stopPrice, metrics);
  const targetY = layout.priceToY(d.targetPrice, metrics);
  const topY = Math.min(stopY, targetY);
  const bottomY = Math.max(stopY, targetY);
  return [
    { kind: "tl", x: entryX, y: topY },
    { kind: "tr", x: endX, y: topY },
    { kind: "bl", x: entryX, y: bottomY },
    { kind: "br", x: endX, y: bottomY },
    { kind: "ml", x: entryX, y: entryY },
    { kind: "mr", x: endX, y: entryY },
  ];
}

/** Compute the screen-space rect of a drawing's [×] delete button.
 *  Returns null if the entry is off-screen. The renderer draws it
 *  here; the canvas hit-tester clicks-tests it here. Single source. */
export function getTradeDrawingDeleteRect(
  entryY: number,
  chartRight: number,
): { x: number; y: number; w: number; h: number } {
  // The Entry label sits at `chartRight - 4 - boxW` flushed right,
  // 14 px tall, centered on entryY. The × button sits to the LEFT
  // of the label box, vertically aligned.
  const y = Math.round(entryY - DELETE_BTN_SIZE / 2);
  // Estimate label box width — must match the renderer's measurement
  // logic. For "Entry  29999.99" at 11px monospace ≈ 108 px.
  const ENTRY_LABEL_W_ESTIMATE = 112;
  const labelRight = chartRight - 4;
  const labelLeft = labelRight - ENTRY_LABEL_W_ESTIMATE;
  const x = labelLeft - DELETE_BTN_GAP - DELETE_BTN_SIZE;
  return { x, y, w: DELETE_BTN_SIZE, h: DELETE_BTN_SIZE };
}

/** Compute the screen-space rect of the manual-close [×] button on
 *  the sim-position entry h-line. The button sits to the LEFT of the
 *  h-line's price label (rendered by `drawPriceLabel`), vertically
 *  aligned on the entry line. Clicking it calls `flatten()` on the
 *  sim account store. */
export function getPositionEntryCloseRect(
  entryY: number,
  chartRight: number,
): { x: number; y: number; w: number; h: number } {
  // h-line price label width: 8-char price ("29999.99") at 11px
  // monospace ≈ 56 px + 2 × 4 px padding = ~64 px, then 4 px right
  // gap. Use a slightly conservative 76 px so the button never
  // touches the label even at high decimals.
  const PRICE_LABEL_W_ESTIMATE = 76;
  const y = Math.round(entryY - POSITION_CLOSE_BTN_SIZE / 2);
  const x =
    chartRight -
    PRICE_LABEL_W_ESTIMATE -
    POSITION_CLOSE_BTN_GAP -
    POSITION_CLOSE_BTN_SIZE;
  return {
    x,
    y,
    w: POSITION_CLOSE_BTN_SIZE,
    h: POSITION_CLOSE_BTN_SIZE,
  };
}

export { POSITION_ENTRY_LINE_ID as POSITION_ENTRY_LINE_ID_RENDERER };

// Re-export the legacy settings shape so existing consumers
// (FootprintCanvas.tsx, RithmicFootprint, etc.) keep importing it from here.
export type {
  FootprintRendererSettings,
  RendererMagnetMode,
  RendererVolumeFormat,
} from "./FootprintCanvasRenderer";
export { DEFAULT_RENDERER_SETTINGS } from "./FootprintCanvasRenderer";
import type { FootprintRendererSettings } from "./FootprintCanvasRenderer";
import { DEFAULT_RENDERER_SETTINGS } from "./FootprintCanvasRenderer";

export interface RendererOptions {
  theme?: FootprintTheme;
  layout?: Partial<LayoutConfig>;
  /** Called every frame to read the latest pan / zoom / hover state. */
  getInteractionState?: () => InteractionState;
}

// ────────────────────────────────────────────────────────────────────────────
// Theme bridge — Senzoukria FootprintTheme → web FootprintColors
// ────────────────────────────────────────────────────────────────────────────

function themeToColors(theme: FootprintTheme): FootprintColors {
  return {
    ...PRO_DEFAULT_COLORS,
    background: theme.background,
    surface: theme.surface,
    gridColor: theme.grid,
    bidColor: theme.sell,
    askColor: theme.buy,
    bidTextColor: theme.sell,
    askTextColor: theme.buy,
    deltaPositive: theme.buy,
    deltaNegative: theme.sell,
    clusterDeltaPositive: theme.buy,
    clusterDeltaNegative: theme.sell,
    imbalanceBuyBg: theme.buy,
    imbalanceSellBg: theme.sell,
    pocColor: theme.poc,
    textPrimary: theme.textPrimary,
    textSecondary: theme.textSecondary,
    textMuted: theme.textMuted,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Settings bridge — legacy FootprintRendererSettings → web FootprintFeatures
// ────────────────────────────────────────────────────────────────────────────

function settingsToFeatures(
  base: FootprintFeatures,
  s: FootprintRendererSettings,
): FootprintFeatures {
  return {
    ...base,
    showGrid: s.showGrid,
    showCrosshair: s.showCrosshair,
    showPOC: s.showPocSession || s.showPocBar,
    showStackedImbalances: s.showStackedImbalances,
    showNakedPOC: s.showNakedPOCs,
    showUnfinishedAuctions: s.showUnfinishedAuctions,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Indicator bridge — desktop shape (barTsNs) → web shape (candleTime, seconds)
// ────────────────────────────────────────────────────────────────────────────

interface ProIndicators {
  stackedImbalances: import("./rendererTypes").StackedImbalance[];
  nakedPOCs: import("./rendererTypes").NakedPOC[];
  unfinishedAuctions: import("./rendererTypes").UnfinishedAuction[];
}

function indicatorsToProShape(r: IndicatorsResult): ProIndicators {
  return {
    stackedImbalances: r.stackedImbalances.map((x) => ({
      startPrice: x.startPrice,
      endPrice: x.endPrice,
      direction: x.direction,
      count: x.count,
      candleTime: Math.floor(x.barTsNs / 1_000_000_000),
    })),
    nakedPOCs: r.nakedPOCs.map((x) => ({
      price: x.price,
      candleTime: Math.floor(x.barTsNs / 1_000_000_000),
      volume: x.volume,
      tested: false,
    })),
    unfinishedAuctions: r.unfinishedAuctions.map((x) => ({
      price: x.price,
      side: x.side,
      candleTime: Math.floor(x.barTsNs / 1_000_000_000),
      volume: x.volume,
      tested: x.tested,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LOD computation — kept inline for now (full LODSystem.ts not ported in P1)
// ────────────────────────────────────────────────────────────────────────────

// Minimum bar width (in pixels) before footprint cells become
// illegible and we collapse to candle mode. Aligned with ATAS /
// Sierra Chart defaults (~25-30 px). Below this the bid/ask text
// would overlap and the cell rectangles vanish into single-pixel
// stripes, so we switch to OHLC candles which scale gracefully.
const MIN_PIXELS_PER_BAR_FOR_FOOTPRINT = 30;
// Hard cap on visible bar count — even if individual bars happen to
// be wide enough, packing too many candles in a single frame hurts
// frame time (Canvas2D fills + text). Triggers the same fallback.
const MAX_VISIBLE_BARS_FOR_FOOTPRINT = 100;

function computeLOD(
  visibleBars: number,
  pixelsPerBar: number,
  rowHeight: number,
): LODState {
  // Two gates: actual bar width (legibility) AND total bar count
  // (perf). Either tripping kicks us to candle mode.
  const tooNarrow = pixelsPerBar < MIN_PIXELS_PER_BAR_FOR_FOOTPRINT;
  const tooMany = visibleBars > MAX_VISIBLE_BARS_FOR_FOOTPRINT;
  const mode: RenderMode = tooNarrow || tooMany ? "candles" : "footprint";
  return {
    mode,
    visibleBars,
    threshold: MAX_VISIBLE_BARS_FOR_FOOTPRINT,
    fontSize: rowHeight >= 14 ? 11 : 9,
    showSeparator: pixelsPerBar >= 80 && rowHeight >= 14,
    showImbalances: true,
    showPOC: true,
    showDeltaProfile: true,
    showCellBorders: rowHeight >= 12,
    candleBodyWidth: Math.min(0.8, Math.max(0.3, 8 / pixelsPerBar)),
  };
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return Math.round(v).toString();
}

/**
 * Detect tick size from the data: smallest non-zero gap between consecutive
 * level prices across the bar set. Robust to:
 *   • aggregation differences per exchange (BTC $10 on Binance perps, $1 on
 *     Bybit, $0.10 on smaller pairs, $0.25 on ES futures, etc.)
 *   • bars where some intermediate ticks are missing (we take the GCD-ish
 *     min, not a fixed pair).
 * Returns null when there isn't enough data to infer a tick.
 */
function detectTickSize(bars: RendererBar[]): number | null {
  let minGap = Infinity;
  // Sample up to the last 32 bars for speed; tick size won't change mid-session.
  const sampleStart = Math.max(0, bars.length - 32);
  for (let i = sampleStart; i < bars.length; i++) {
    const lvls = bars[i].levels;
    if (lvls.length < 2) continue;
    // Sort prices ascending for the diff scan.
    const prices = lvls.map((l) => l.price).sort((a, b) => a - b);
    for (let j = 1; j < prices.length; j++) {
      const gap = prices[j] - prices[j - 1];
      if (gap > 1e-9 && gap < minGap) minGap = gap;
    }
  }
  if (!isFinite(minGap)) return null;
  // Round to a "nice" number of significant decimals to absorb fp noise.
  return Number(minGap.toPrecision(6));
}

// ────────────────────────────────────────────────────────────────────────────
// FootprintCanvasRenderer — the wrapper. Same name as the legacy class so
// `import { FootprintCanvasRenderer } from "./FootprintProAdapter"` is a
// drop-in replacement for the legacy import path.
// ────────────────────────────────────────────────────────────────────────────

interface FrameSnapshot {
  metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics;
  rowH: number;
  fpWidth: number;
  ohlcWidth: number;
  tickSize: number;
}

export class FootprintCanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  private theme: FootprintTheme;
  private layoutCfg: LayoutConfig;
  private getInteraction: () => InteractionState;

  // Engine instances
  private pro: ProRenderer;
  private layoutEngine: FootprintLayoutEngine;

  // Cached state
  private bars: RendererBar[] = [];
  private candles: FootprintCandle[] = [];
  private priceDecimals = 2;
  private settings: FootprintRendererSettings;
  private indicators: IndicatorsResult = EMPTY_INDICATORS;
  /** Tick size detected from data (smallest non-zero gap between consecutive
   *  level prices). Falls back to 10^-priceDecimals when no data yet. */
  private detectedTickSize: number | null = null;

  // Render state for interactive helpers
  private lastFrame: FrameSnapshot | null = null;

  // Pro renderer config (mutable defaults)
  private colors: FootprintColors = { ...PRO_DEFAULT_COLORS };
  private fonts: FootprintFonts = { ...PRO_DEFAULT_FONTS };
  private features: FootprintFeatures = { ...PRO_DEFAULT_FEATURES };

  // Trade drawings (LONG / SHORT positions) the user has dropped on
  // the chart. Filtered by symbol at render time. Set by the React
  // layer via `setTradeDrawings(...)`; the latest LayoutMetrics
  // is also cached so React handlers can hit-test handles with the
  // same coordinates the renderer just used.
  private tradeDrawings: TradeDrawing[] = [];
  private lineDrawings: LineDrawing[] = [];
  private lastMetrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics | null =
    null;
  private currentSymbol: string | null = null;
  /** When set, only the drawing with this id gets its handles +
   *  delete button drawn — every other drawing renders "clean".
   *  null = nothing selected, no handles visible anywhere. */
  private selectedDrawingId: string | null = null;
  // VWAP indicator cache — keyed by the this.candles reference so
  // that a setBars() call (which produces a fresh array) invalidates
  // it. See renderVwapIndicator + rebuildVwapCache.
  private vwapCacheCandles: typeof this.candles | null = null;
  private vwapByTimeCache: Map<number, number> = new Map();
  // Lazy-built Chicago-time formatter; cached because Intl
  // construction is expensive (~ms) and we'd otherwise pay it on
  // every setBars().
  private chicagoTimeFmt: Intl.DateTimeFormat | null = null;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("FootprintCanvasRenderer: 2D context unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.theme = opts.theme ?? SENZOUKRIA_DARK;
    this.layoutCfg = { ...DEFAULT_LAYOUT, ...(opts.layout ?? {}) };
    this.getInteraction =
      opts.getInteractionState ?? (() => DEFAULT_INTERACTION);

    this.settings = { ...DEFAULT_RENDERER_SETTINGS };

    this.colors = themeToColors(this.theme);
    this.features = settingsToFeatures(PRO_DEFAULT_FEATURES, this.settings);

    // Build the pro renderer + layout engine
    this.pro = new ProRenderer();
    this.layoutEngine = new FootprintLayoutEngine({
      footprintWidth: this.layoutCfg.bidWidth + this.layoutCfg.askWidth,
      ohlcWidth: this.layoutCfg.ohlcWidth || 12,
      rowHeight: this.layoutCfg.rowHeight,
      candleGap: this.layoutCfg.barGap,
      headerHeight: 0,
      footerHeight: this.layoutCfg.timeAxisHeight,
      leftPadding: this.layoutCfg.paddingLeft,
      rightPadding: this.layoutCfg.priceAxisWidth,
      showOHLC: true,
      showDeltaProfile: false,
      showVolumeProfile: true,
      deltaProfilePosition: "right",
    });

    // DPR cap — on Retina / 4K displays the native DPR is 2-3, which
    // would force the canvas to push 4-9× more pixels per frame than
    // a 1× CSS layer. Footprint rendering is the heaviest layer in
    // the app (per-cell text + multi-pass fills) and the visual
    // benefit of going beyond 1.5× DPR is marginal at the cell sizes
    // we use. Clamp to 1.5 to keep text crisp without quadrupling
    // the GPU upload bill.
    const MAX_DPR = 1.5;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    this.applySize(rect.width || 800, rect.height || 400);
  }

  // ── Public API mirroring the legacy renderer ────────────────────────────

  setTheme(theme: FootprintTheme): void {
    this.theme = theme;
    this.colors = themeToColors(theme);
  }

  setBars(bars: RendererBar[]): void {
    // Sort ascending by time so the newest bar is at the end of the array.
    // The web layout engine right-anchors the last candle to the right edge,
    // which gives the standard "new prices appear on the right" behaviour.
    const sorted = [...bars].sort((a, b) => a.timeMs - b.timeMs);
    // Detect whether this is a "shape change" (new bar appended, old
    // bar dropped, full refresh) or just a live-tick mutation of the
    // last bar. Profile + cluster caches downstream are keyed on
    // candle count + last-candle timestamp — invalidating them on
    // every live tick (which only changes the last bar's volume,
    // never the count or open-time) forces a 5000-iteration recompute
    // per frame for nothing. Only invalidate when the shape really
    // shifts; otherwise reuse the cached profile and let the cell
    // pass redraw the latest bar's cells.
    const prevLen = this.bars.length;
    const prevLastTime = this.bars[prevLen - 1]?.timeMs ?? 0;
    const newLen = sorted.length;
    const newLastTime = sorted[newLen - 1]?.timeMs ?? 0;
    const shapeChanged = prevLen !== newLen || prevLastTime !== newLastTime;
    this.bars = sorted;
    this.candles = rendererBarsToFootprintCandles(sorted);
    this.detectedTickSize = detectTickSize(sorted);
    if (shapeChanged) {
      this.pro.invalidateData();
    }
  }

  setPriceDecimals(n: number): void {
    this.priceDecimals = n;
  }

  setSettings(s: FootprintRendererSettings): void {
    const prevShowCluster = this.settings.showClusterStat;
    this.settings = s;
    this.features = settingsToFeatures(this.features, s);
    // Apply user-pickable colours. Bid/Ask text colours mirror the
    // gauge colour so picking one "blue bid" repaints both the bar
    // and the value text in one step. The state-bar in the
    // footprint cells reuses candleUpBody / candleDownBody (see
    // renderSenzoukriaCells) so the cell colour never disagrees
    // with the candle's own colour in candle-mode.
    this.colors = {
      ...this.colors,
      background: s.chartBgColor,
      surface: s.chartBgColor,
      gridColor: s.chartGridColor,
      candleUpBody: s.candleBodyUp,
      candleDownBody: s.candleBodyDown,
      candleUpBorder: s.candleBorderUp,
      candleDownBorder: s.candleBorderDown,
      candleUpWick: s.candleWickUp,
      candleDownWick: s.candleWickDown,
      bidColor: s.bidColor,
      askColor: s.askColor,
      bidTextColor: s.bidColor,
      askTextColor: s.askColor,
      // Cluster-stat delta colour tracks the candle body so a red
      // body / red bullish delta stay coherent if the user picks an
      // unusual palette.
      deltaPositive: s.candleBodyUp,
      deltaNegative: s.candleBodyDown,
      clusterDeltaPositive: s.candleBodyUp,
      clusterDeltaNegative: s.candleBodyDown,
    };
    this.pro.markAllDirty();
    // Cluster stat panel sits between the chart and the time axis.
    // When it's toggled on, increase the layout footer so the
    // footprint area shrinks to make room — otherwise the panel
    // would draw on top of the bottom bars.
    if (prevShowCluster !== s.showClusterStat) {
      const footer =
        this.layoutCfg.timeAxisHeight +
        (s.showClusterStat ? this.clusterStatPanelHeight() : 0);
      this.layoutEngine.setConfig({ footerHeight: footer });
      this.pro.invalidateData();
    }
  }

  // ── Bar-delta inline labels ─────────────────────────────────────────────
  // Draws each visible candle's totalDelta as a small label
  // centred horizontally on the candle, anchored 4 px above its
  // high price. Stays attached to the candle (the Y follows the
  // price) so pan/zoom never desyncs the readout from the bar it
  // describes. Colour tracks the user's body-up / body-down picks
  // so red/green palettes stay coherent.
  //
  // Skips when the candle is too narrow to fit the label cleanly —
  // overlapping labels at low zoom would look like a mess.
  private renderBarDeltaLabels(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    fpWidth: number,
    ohlcWidth: number,
  ): void {
    const visible = metrics.visibleCandles;
    if (visible.length === 0) return;
    const chartTop = metrics.footprintAreaY;
    const totalSlotW = fpWidth + (this.features.showOHLC ? ohlcWidth : 0);
    // Minimum slot width before we drop the label — picked so the
    // text "1.2K" / "-789" doesn't clip into the neighbouring bar.
    const MIN_SLOT_FOR_LABEL = 22;
    if (totalSlotW < MIN_SLOT_FOR_LABEL) return;

    const POS_COLOR = this.colors.candleUpBody;
    const NEG_COLOR = this.colors.candleDownBody;
    ctx.save();
    ctx.font = `bold 10px "Consolas", "Monaco", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      const delta = c.totalDelta;
      if (delta === 0) continue;
      const fpX = this.layoutEngine.getFootprintX(i, metrics);
      const centerX = fpX + totalSlotW / 2;
      const yHigh = this.layoutEngine.priceToY(c.high, metrics);
      // 4 px gap above the high so the label sits in clean air,
      // never overlapping the wick. Clamp to chartTop so a candle
      // pinned at the top of the viewport doesn't push the label
      // out of bounds.
      const labelY = Math.max(chartTop + 10, yHigh - 4);
      const text = formatBarDelta(delta);
      // Soft black pill behind the text so it reads cleanly over
      // both empty chart bg and bright cells underneath.
      const tw = ctx.measureText(text).width;
      const padX = 3;
      const boxH = 13;
      const boxW = tw + padX * 2;
      const boxX = Math.round(centerX - boxW / 2);
      const boxY = Math.round(labelY - boxH);
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = delta > 0 ? POS_COLOR : NEG_COLOR;
      ctx.fillText(text, centerX, labelY - 1);
    }
    ctx.restore();
  }

  /** Plot-area bounds in CSS pixels — the rect where the chart bars
   *  and price grid live. Excludes: price axis (right), time axis
   *  (bottom), cluster-stat panel (bottom-above-time-axis when shown),
   *  and the left/top padding gutters. The mouse handler uses this
   *  to restore the OS cursor when the pointer leaves the chart so
   *  axis labels / stats rows stay clickable. */
  getPlotBounds(): { left: number; top: number; right: number; bottom: number } {
    const clusterH = this.settings.showClusterStat
      ? this.clusterStatPanelHeight()
      : 0;
    return {
      left: this.layoutCfg.paddingLeft,
      top: this.layoutCfg.paddingTop,
      right: this.cssWidth - this.layoutCfg.priceAxisWidth,
      bottom: this.cssHeight - this.layoutCfg.timeAxisHeight - clusterH,
    };
  }

  /** Vertical pixel cost of the cluster-stat panel, derived from
   *  the active rows in PRO_DEFAULT_CLUSTER_STAT_CONFIG. Centralised
   *  so the layout reservation and the renderClusterStatPanel call
   *  agree on the same number. */
  private clusterStatPanelHeight(): number {
    const cfg = PRO_DEFAULT_CLUSTER_STAT_CONFIG;
    let rows = 0;
    if (cfg.showTime) rows++;
    if (cfg.showAsks) rows++;
    if (cfg.showBids) rows++;
    if (cfg.showDelta) rows++;
    if (cfg.showVolume) rows++;
    return Math.max(0, rows * cfg.rowHeight);
  }

  setIndicators(r: IndicatorsResult): void {
    this.indicators = r;
  }

  /** Push the latest array of trade drawings (LONG/SHORT) from React.
   *  Renderer filters by `currentSymbol` so a drawing placed on MNQ
   *  doesn't bleed onto a different chart. */
  setTradeDrawings(drawings: TradeDrawing[]): void {
    this.tradeDrawings = drawings;
  }

  /** Push the latest array of line drawings (h-line, h-ray, trend). */
  setLineDrawings(drawings: LineDrawing[]): void {
    this.lineDrawings = drawings;
  }

  /** Mark a single drawing as "currently being edited". Handles
   *  (white circles) and the [×] delete button only render for that
   *  drawing — everything else stays clean. Pass null to clear. */
  setSelectedDrawingId(id: string | null): void {
    if (this.selectedDrawingId === id) return;
    this.selectedDrawingId = id;
    this.pro.markDirty("tools");
  }

  /** Tells the renderer which symbol is currently displayed so it can
   *  filter drawings. Pass null to suppress all drawings (e.g. when
   *  the chart is between symbols). */
  setCurrentSymbol(symbol: string | null): void {
    this.currentSymbol = symbol;
  }

  /** Last LayoutMetrics computed during render(). React mouse handlers
   *  call this to convert click XY → price/time using the exact same
   *  coordinate space the renderer just drew, avoiding any race with
   *  ongoing zoom/pan animations. */
  getLastMetrics(): import("../orderflow/FootprintLayoutEngine").LayoutMetrics | null {
    return this.lastMetrics;
  }

  /** Direct access to the layout engine so React handlers can call
   *  `yToPrice`, `xToTime`, `priceToY`, `timeToX` against the live
   *  viewport state without going through another indirection. */
  getLayoutEngine(): FootprintLayoutEngine {
    return this.layoutEngine;
  }

  /** Tick size detected from the incoming trade data (smallest
   *  non-zero gap between level prices). Used by React mouse
   *  handlers to size drawing defaults proportionally to the
   *  instrument's actual granularity. */
  getDetectedTickSize(): number | null {
    return this.detectedTickSize;
  }

  draw(bars: RendererBar[], priceDecimals = 2): void {
    this.setBars(bars);
    this.setPriceDecimals(priceDecimals);
    this.render();
  }

  resize(width: number, height: number): void {
    // Skip if dimensions haven't actually changed (avoids burning a render
    // when ResizeObserver fires for unrelated content-box reasons).
    const cappedDpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (width === this.cssWidth && height === this.cssHeight && this.dpr === cappedDpr) {
      return;
    }
    this.applySize(width, height);
    // Invalidate caches so the next render rebuilds layout metrics, profile
    // caches and string format LUTs against the new viewport. Without this,
    // the chart can show stale geometry for one frame after resize (visual
    // tearing / clipped axes when the window is dragged or maximised).
    this.pro.invalidateData();
    this.pro.markAllDirty();
  }

  getVisibleBarsCapacity(): number {
    const cellW = this.getInteraction().cellWidth;
    const usable = this.cssWidth - this.layoutCfg.priceAxisWidth - this.layoutCfg.paddingLeft;
    return Math.max(1, Math.floor(usable / Math.max(1, cellW)));
  }

  getYExtent(): { totalContentHeight: number; chartHeight: number } {
    const f = this.lastFrame;
    if (!f) {
      return {
        totalContentHeight: 0,
        chartHeight: Math.max(0, this.cssHeight - this.layoutCfg.timeAxisHeight - this.layoutCfg.paddingTop),
      };
    }
    return {
      totalContentHeight: f.metrics.priceRange / Math.max(0.01, this.layoutEngine.getZoomY()) * 0,  // approximation
      chartHeight: f.metrics.footprintAreaHeight,
    };
  }

  getCellAtPixel(
    x: number,
    y: number,
  ): { bar: RendererBar; level: RendererPriceLevel } | null {
    const f = this.lastFrame;
    if (!f) return null;
    const candleIdx = this.layoutEngine.getCandleIndexAtX(x, f.metrics);
    if (candleIdx < 0) return null;
    const candle = f.metrics.visibleCandles[candleIdx];
    if (!candle) return null;
    const visibleStart = f.metrics.visibleStartIndex;
    const bar = this.bars[visibleStart + candleIdx];
    if (!bar) return null;
    const price = this.layoutEngine.yToPrice(y, f.metrics);
    const tick = f.tickSize;
    const snapPrice = Math.round(price / tick) * tick;
    const level = bar.levels.find((l) => Math.abs(l.price - snapPrice) < tick / 2);
    if (!level) return null;
    return { bar, level };
  }

  // ── Render pipeline ─────────────────────────────────────────────────────

  render(): void {
    const ctx = this.ctx;
    const width = this.cssWidth;
    const height = this.cssHeight;

    // Chart background — user-pickable via the settings modal.
    // Defaults to noir (#0a0a0a) per the user request from
    // 2026-05-10; never falls back to a gradient.
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    if (this.candles.length === 0) {
      ctx.fillStyle = this.colors.textMuted;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', width / 2, height / 2);
      return;
    }

    // Pull interaction state and feed the layout engine.
    const interaction = this.getInteraction();
    this.layoutEngine.setContainerSize(width, height);
    // Map interaction.cellWidth → layout.zoom (X). cellWidth = footprintWidth * zoom.
    const baseFpWidth = this.layoutCfg.bidWidth + this.layoutCfg.askWidth;
    const targetZoom = interaction.cellWidth / Math.max(1, baseFpWidth);
    this.layoutEngine.setZoom(targetZoom);
    // Map interaction.rowHeight → layout.zoomY (Y). The base layout rowHeight
    // is layoutCfg.rowHeight; ratio gives the multiplier the engine uses to
    // expand/compress the price axis.
    const targetZoomY = interaction.rowHeight / Math.max(1, this.layoutCfg.rowHeight);
    this.layoutEngine.setZoomY(targetZoomY);
    // Map interaction.scrollX → layout.scrollX. Y pan goes through scrollY.
    this.layoutEngine.setScroll(interaction.scrollX, interaction.scrollY);

    // Tick size — prefer the value detected from the actual data feed
    // (e.g. BTC perp on Binance aggregates at $10, ETH at $0.50, SOL at $0.01,
    // ES futures at $0.25). Fallback to 10^-decimals when we have no bars.
    const tickSize = this.detectedTickSize ?? Math.pow(10, -this.priceDecimals);

    const metrics = this.layoutEngine.calculateMetrics(this.candles, tickSize);
    const zoom = this.layoutEngine.getZoom();
    const rowH = this.layoutCfg.rowHeight * zoom;
    const fpWidth = baseFpWidth * zoom;
    const ohlcWidth = (this.layoutCfg.ohlcWidth || 12) * zoom;
    const footprintWidth = this.layoutEngine.getEffectiveFootprintWidth();

    const lod = computeLOD(metrics.visibleCandles.length, footprintWidth, rowH);
    const isFootprintMode = lod.mode === "footprint";

    this.lastFrame = { metrics, rowH, fpWidth, ohlcWidth, tickSize };
    // Cache for the React layer's mouse handlers (hit-testing + click→price).
    this.lastMetrics = metrics;

    // Grid
    if (this.features.showGrid) {
      ctx.strokeStyle = this.colors.gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = this.colors.gridOpacity;
      const gridLevels = this.layoutEngine.getVisiblePriceLevels(metrics, tickSize);
      for (const price of gridLevels) {
        const y = this.layoutEngine.priceToY(price, metrics);
        if (y < metrics.footprintAreaY || y > metrics.footprintAreaY + metrics.footprintAreaHeight) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Build RenderParams shared across calls
    const params = {
      ctx,
      width,
      height,
      candles: this.candles,
      metrics,
      layout: this.layoutEngine,
      colors: this.colors,
      fonts: this.fonts,
      features: this.features,
      lod,
      zoom,
      rowH,
      fpWidth,
      ohlcWidth,
      tickSize,
      isFootprintMode,
    };

    if (isFootprintMode) {
      this.renderSenzoukriaCells(ctx, metrics, rowH, fpWidth, ohlcWidth, tickSize);
    } else {
      this.pro.renderCandleMode(ctx, this.layoutEngine, metrics, this.colors, lod, footprintWidth);
    }
    void params;

    // Drag-lite mode — while the user is actively panning / zooming
    // the chart, skip the heaviest non-essential passes. Each one
    // iterates ALL candles (not just visible) and burns 1-3 ms per
    // frame; with 10+ passes we'd blow the 16.6 ms budget on a busy
    // chart. Pan responsiveness > overlay completeness for the few
    // milliseconds the gesture lasts. On mouseup the next render
    // restores everything.
    const isInteracting = interaction.isDragging;

    // Profile caches (shared by delta + volume profile + session header).
    // Skipped during drag because both profile + session header below
    // are skipped — no point computing inputs no one consumes.
    const profileCaches = isInteracting
      ? null
      : this.pro.getProfileCaches(this.candles, metrics);

    // Volume profile overlay — Senzoukria custom palette:
    //   POC = violet, VAH = white, VAL = green, VA bars = green,
    //   outside-VA bars = white (semi-transparent). Green = #7ed321
    //   (brand lime, matches the website hero gradient).
    if (
      !isInteracting &&
      this.features.showVolumeProfile &&
      this.candles.length > 0
    ) {
      this.pro.renderVolumeProfileOverlay(
        ctx, this.layoutEngine, metrics, this.candles, tickSize,
        this.features.volumeProfilePocColor || '#a855f7',
        '#ffffff',                                        // VAH white
        '#7ed321',                                        // VAL green
        this.features.volumeProfileColor || '#7ed321',    // VA bars green
        this.features.volumeProfileOutsideColor || 'rgba(255, 255, 255, 0.65)', // outside white
      );
    }

    // VWAP indicator — session-anchored, computed across ALL candles
    // in this.candles (not just visibleCandles) so the line is
    // continuous through pan/zoom. Toggled from the IndicatorsButton.
    if (!isInteracting && this.settings.showVwapIndicator) {
      this.renderVwapIndicator(ctx, metrics, width);
    }

    // Price scale
    this.pro.renderPriceScale(
      ctx, this.layoutEngine, metrics, this.colors, this.fonts, tickSize, false, width,
    );

    // Current price line — horizontal dashed line at the close of the most
    // recent bar, with a label pinned to the right axis. Uses the pro
    // renderer's existing implementation so the visual stays consistent
    // with the website footprint.
    {
      const lastCandle = this.candles[this.candles.length - 1];
      const currentPrice = lastCandle?.close ?? 0;
      if (currentPrice > 0) {
        this.pro.renderCurrentPriceLine(
          ctx, this.layoutEngine, metrics, this.colors, this.fonts,
          currentPrice, width, tickSize,
        );
      }
    }

    // Indicators (translated from desktop shape) — skipped during
    // pan/zoom: they iterate per-candle metrics and add noticeable
    // per-frame cost. The user reads them after the gesture, not
    // while panning.
    if (!isInteracting && isFootprintMode && metrics.visibleCandles.length > 0) {
      const proInd = indicatorsToProShape(this.indicators);
      if (this.features.showStackedImbalances && proInd.stackedImbalances.length > 0) {
        this.pro.renderStackedImbalances(
          ctx, this.layoutEngine, metrics, proInd.stackedImbalances, rowH, fpWidth, ohlcWidth, this.features.showOHLC,
        );
      }
      if (this.features.showNakedPOC && proInd.nakedPOCs.length > 0) {
        this.pro.renderNakedPOCs(
          ctx, this.layoutEngine, metrics, proInd.nakedPOCs, this.features.nakedPOCColor || '#fbbf24', width,
        );
      }
      if (this.features.showUnfinishedAuctions && proInd.unfinishedAuctions.length > 0) {
        this.pro.renderUnfinishedAuctions(
          ctx, this.layoutEngine, metrics, proInd.unfinishedAuctions, width,
        );
      }
    }

    // Bar-delta label — one number per visible candle, sat just
    // above the bar's high price. Skipped during pan to save text
    // ops (each label is a ctx.fillText).
    if (!isInteracting && this.settings.showBarDelta && metrics.visibleCandles.length > 0) {
      this.renderBarDeltaLabels(ctx, metrics, fpWidth, ohlcWidth);
    }

    // Cluster Statistic panel — sits between the footprint area and
    // the time axis. The layout engine's footerHeight was bumped in
    // setSettings() to make room, so the chart cells don't bleed
    // into this strip.
    if (!isInteracting && this.settings.showClusterStat) {
      const panelH = this.clusterStatPanelHeight();
      const panelY = height - this.layoutCfg.timeAxisHeight - panelH;
      const tz = this.settings.timezone;
      const timeFmt = tzFormatter(tz, false);
      this.pro.renderClusterStatPanel(
        ctx,
        this.layoutEngine,
        metrics,
        this.features,
        this.colors,
        width - this.layoutCfg.priceAxisWidth,
        panelY,
        ohlcWidth,
        fpWidth,
        PRO_DEFAULT_CLUSTER_STAT_CONFIG,
        (ts) => timeFmt.format(ts * 1000),
      );
    }

    // Time axis at the bottom (HH:MM labels per visible candle).
    this.renderTimeAxis(ctx, metrics, width, height);

    // Session header — depends on profileCaches which we skipped
    // during drag, so this is also skipped while panning.
    if (
      !isInteracting &&
      isFootprintMode &&
      metrics.visibleCandles.length > 0 &&
      profileCaches
    ) {
      this.pro.renderSessionHeader(ctx, metrics, profileCaches, this.colors, width);
    }

    // Trade drawings (LONG / SHORT positions) — drawn on top of bars
    // but below the crosshair so the user's pointer reading stays
    // visible over any overlay rectangle.
    this.renderTradeDrawings(ctx, metrics, width);
    this.renderLineDrawings(ctx, metrics, width);

    // Crosshair — drawn LAST so it overlays every chart layer. Clipped
    // to the chart area (excludes price axis on the right) so the
    // dashed lines never bleed into the axis label background. Skipped
    // while the user is panning so they don't get a flashing line
    // chasing the drag.
    if (
      this.features.showCrosshair &&
      !interaction.isDragging &&
      interaction.hoverX !== null &&
      interaction.hoverY !== null
    ) {
      const x = interaction.hoverX;
      const y = interaction.hoverY;
      const chartRight = width - this.layoutCfg.priceAxisWidth;
      const chartTop = metrics.footprintAreaY;
      const chartBottom = metrics.footprintAreaY + metrics.footprintAreaHeight;
      // Navigable Y includes the cluster-stat panel; the vertical
      // crosshair line spans it so the user gets a column reference
      // while hovering the stat rows. Horizontal line + price label
      // stay scoped to the chart area.
      const navBottom = height - this.layoutCfg.timeAxisHeight;
      const xSnap = Math.round(x) + 0.5;
      const ySnap = Math.round(y) + 0.5;
      const inXRange = x >= 0 && x <= chartRight;
      const inYRange = y >= chartTop && y <= navBottom;
      const inChart = inXRange && inYRange && y <= chartBottom;
      const inClusterPanel = inXRange && y > chartBottom && y <= navBottom;
      if (inChart || inClusterPanel) {
        const crossColor = hexToRgba(
          this.settings.crosshairColor,
          this.settings.crosshairOpacity,
        );
        const crossDash = crosshairStyleToDash(this.settings.crosshairStyle);
        const crossWidth = Math.max(1, this.settings.crosshairWidth);
        ctx.save();
        ctx.setLineDash(crossDash);
        ctx.lineWidth = crossWidth;
        ctx.strokeStyle = crossColor;
        // Vertical line — extends through the cluster stat panel.
        ctx.beginPath();
        ctx.moveTo(xSnap, chartTop);
        ctx.lineTo(xSnap, navBottom);
        ctx.stroke();
        // Horizontal line — only inside the chart area.
        if (inChart) {
          ctx.beginPath();
          ctx.moveTo(0, ySnap);
          ctx.lineTo(chartRight, ySnap);
          ctx.stroke();
        }
        ctx.restore();

        this.renderCrosshairAxisLabels(
          ctx,
          metrics,
          width,
          height,
          x,
          y,
          inChart,
        );
      }
    }
  }

  /** Draw the two crosshair readout boxes (price on right, time on
   *  bottom) at the cursor position. White-on-black chrome to match
   *  the current-price label affordance already on the price axis. */
  private renderCrosshairAxisLabels(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    width: number,
    height: number,
    x: number,
    y: number,
    showPriceLabel: boolean,
  ): void {
    const layout = this.layoutEngine;
    const chartRight = width - this.layoutCfg.priceAxisWidth;
    const priceAxisW = this.layoutCfg.priceAxisWidth;
    const timeAxisH = this.layoutCfg.timeAxisHeight;
    const timeAxisY = height - timeAxisH;

    // Shared chrome — translucent dark fill + hairline white outline.
    // Reads as a soft "glass" pill instead of the previous solid-
    // white block, so it doesn't over-power the axis underneath
    // while still being readable against any cell colour. Inner
    // shadow strip at the top gives a subtle highlight without
    // bringing back the heavy white background.
    const BG = "rgba(18, 18, 22, 0.88)";
    const BORDER = "rgba(255, 255, 255, 0.55)";
    const TEXT = "#ffffff";

    // ── Price label (right axis) — skipped when cursor is in the
    // cluster panel area (Y has no price meaning there).
    if (showPriceLabel) {
    const rawPrice = layout.yToPrice(y, metrics);
    // Authoritative tick grid: symbol catalog override wins over the
    // detected gap-heuristic. Without this the raw f64 price under
    // the cursor (21345.327…) shows up verbatim in the label, which
    // doesn't match any cell row. MNQ → 0.25, MBT/BTC → 5, etc.
    const tickGrid =
      this.settings.tickSizeOverride !== null &&
      this.settings.tickSizeOverride > 0
        ? this.settings.tickSizeOverride
        : this.detectedTickSize ?? Math.pow(10, -this.priceDecimals);
    const price =
      tickGrid > 0 ? Math.round(rawPrice / tickGrid) * tickGrid : rawPrice;
    const priceText = price.toFixed(this.priceDecimals);
    ctx.save();
    ctx.font = `bold ${this.fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const priceLabelH = 18;
    const priceLabelY = Math.round(y - priceLabelH / 2);
    // Box — full price-axis width so it covers any tick text under it.
    ctx.fillStyle = BG;
    ctx.fillRect(chartRight, priceLabelY, priceAxisW, priceLabelH);
    // Triangle pointer pointing back into the chart at exactly the
    // cursor's Y (half-pixel snapped so the tip is crisp).
    ctx.beginPath();
    ctx.moveTo(chartRight - 4, Math.round(y) + 0.5);
    ctx.lineTo(chartRight, priceLabelY);
    ctx.lineTo(chartRight, priceLabelY + priceLabelH);
    ctx.closePath();
    ctx.fillStyle = BG;
    ctx.fill();
    // Outline border — drawn AFTER the fill so it sits crisply on
    // top of both the box and the triangle. We trace the combined
    // box+arrow contour as a single path so the seam between them
    // doesn't show. Half-pixel snap keeps the 1 px stroke sharp.
    ctx.lineWidth = 1;
    ctx.strokeStyle = BORDER;
    const tipY = Math.round(y) + 0.5;
    const rectTop = priceLabelY + 0.5;
    const rectBot = priceLabelY + priceLabelH - 0.5;
    const rectRight = chartRight + priceAxisW - 0.5;
    ctx.beginPath();
    ctx.moveTo(chartRight - 4, tipY);
    ctx.lineTo(chartRight, rectTop);
    ctx.lineTo(rectRight, rectTop);
    ctx.lineTo(rectRight, rectBot);
    ctx.lineTo(chartRight, rectBot);
    ctx.lineTo(chartRight - 4, tipY);
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(priceText, width - 4, y);
    ctx.restore();
    } // end showPriceLabel

    // ── Time label (bottom axis) ───────────────────────────────────────
    const timeSec = layout.xToTime(x, metrics);
    // Match the time axis's own format: include seconds only when
    // the bar period is sub-minute (matches what the user already
    // sees in the row of axis labels).
    const vc = metrics.visibleCandles;
    const period = vc.length > 1 ? vc[1].time - vc[0].time : 60;
    const withSeconds = period < 60;
    const timeFmt = tzFormatter(this.settings.timezone, withSeconds);
    const timeText = timeFmt.format(timeSec * 1000);
    ctx.save();
    ctx.font = `bold ${this.fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tm = ctx.measureText(timeText);
    const padX = 7;
    const timeLabelW = Math.max(52, Math.ceil(tm.width) + padX * 2);
    let timeLabelX = Math.round(x - timeLabelW / 2);
    // Clamp inside the chart area so the box never overflows the
    // canvas (left edge) or the price axis (right edge).
    if (timeLabelX < 0) timeLabelX = 0;
    if (timeLabelX + timeLabelW > chartRight)
      timeLabelX = chartRight - timeLabelW;
    ctx.fillStyle = BG;
    ctx.fillRect(timeLabelX, timeAxisY, timeLabelW, timeAxisH);
    // Triangle pointer pointing back up into the chart at exactly
    // the cursor's X — only drawn when the tip would land over the
    // box (clamping near the edges pushes the box away from the
    // cursor; we'd otherwise get an arrow floating in space).
    const tipX = Math.round(x) + 0.5;
    const tipWithinBox =
      tipX >= timeLabelX + 2 && tipX <= timeLabelX + timeLabelW - 2;
    if (tipWithinBox) {
      ctx.beginPath();
      ctx.moveTo(tipX, timeAxisY - 4);
      ctx.lineTo(timeLabelX, timeAxisY);
      ctx.lineTo(timeLabelX + timeLabelW, timeAxisY);
      ctx.closePath();
      ctx.fillStyle = BG;
      ctx.fill();
    }
    // Outline border — same single-path trick as the price label,
    // routed around the triangle when present.
    ctx.lineWidth = 1;
    ctx.strokeStyle = BORDER;
    const tLeft = timeLabelX + 0.5;
    const tRight = timeLabelX + timeLabelW - 0.5;
    const tTop = timeAxisY + 0.5;
    const tBot = timeAxisY + timeAxisH - 0.5;
    ctx.beginPath();
    if (tipWithinBox) {
      ctx.moveTo(tLeft, tBot);
      ctx.lineTo(tLeft, tTop);
      ctx.lineTo(tipX, timeAxisY - 4);
      ctx.lineTo(tRight, tTop);
      ctx.lineTo(tRight, tBot);
      ctx.closePath();
    } else {
      ctx.rect(tLeft, tTop, tRight - tLeft, tBot - tTop);
    }
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(
      timeText,
      timeLabelX + timeLabelW / 2,
      timeAxisY + timeAxisH / 2,
    );
    ctx.restore();
  }

  // ── Trade drawings (LONG / SHORT positions) ─────────────────────────────
  private renderTradeDrawings(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    width: number,
  ): void {
    if (this.tradeDrawings.length === 0) return;
    const symbol = this.currentSymbol;
    if (!symbol) return;
    const layout = this.layoutEngine;
    const chartRight = width - this.layoutCfg.priceAxisWidth;
    const chartTop = metrics.footprintAreaY;
    const chartBottom = metrics.footprintAreaY + metrics.footprintAreaHeight;

    // Two-layer fill: a faint background marks the full zone (the
    // user always sees where target / stop are), a brighter overlay
    // marks how far price actually reached *within the drawing's
    // time window* (entryTimeSec → endTimeSec). The reward overlay
    // grows from the entry line up to the highest price reached
    // inside the window (clamped to target); the risk overlay grows
    // down to the lowest price reached (clamped to stop). For
    // SHORTs the directions flip.
    const ZONE_BG_ALPHA = 0.06;
    const ZONE_FILL_ALPHA = 0.28;
    // Senzoukria theme: only green + white. The risk side uses white
    // (slightly bumped alpha — white reads dimmer than saturated red
    // at the same alpha) instead of the previous #ff4757 red.
    const RISK_RGB = "255, 255, 255";
    const RISK_BG_ALPHA = 0.04;
    const RISK_FILL_ALPHA = 0.20;
    const REWARD_RGB = "126, 211, 33";
    const RISK_STROKE = "rgba(255, 255, 255, 0.85)";
    const REWARD_STROKE = "rgba(126, 211, 33, 0.85)";
    const ENTRY_STROKE = "rgba(255, 255, 255, 0.85)";

    // Bar spacing fallback used to size legacy drawings (persisted
    // before `endTimeSec` existed) — derived from the live visible
    // candles so the synthetic end-time is on the same TF the user
    // is currently looking at.
    const fallbackSpacing =
      metrics.visibleCandles.length >= 2
        ? metrics.visibleCandles[1].time - metrics.visibleCandles[0].time
        : 60;

    for (const d of this.tradeDrawings) {
      if (d.symbol !== symbol) continue;
      // Per-drawing opacity multiplier — defaults to 1, clamped [0, 1.5].
      const op = Math.max(0, Math.min(1.5, d.zoneOpacity ?? 1));

      const entryX = layout.timeToX(d.entryTimeSec, metrics);
      const endTimeSec =
        d.endTimeSec ?? defaultEndTimeSec(d.entryTimeSec, fallbackSpacing);
      const endXRaw = layout.timeToX(endTimeSec, metrics);
      // Cap the right edge at the price axis so the drawing never
      // bleeds onto the axis labels — the visible bound, not the
      // logical end time. Also ensure the visible width is non-zero
      // so the rect helpers don't degenerate.
      const endX = Math.min(chartRight, endXRaw);

      const entryY = layout.priceToY(d.entryPrice, metrics);
      const stopY = layout.priceToY(d.stopPrice, metrics);
      const targetY = layout.priceToY(d.targetPrice, metrics);

      // Clamp the left edge so a drawing whose entry has scrolled off
      // the left edge still renders its zones flush with the chart.
      const xLeft = Math.max(0, entryX);
      const zoneW = Math.max(0, endX - xLeft);
      if (zoneW <= 0) continue;

      // Skip drawings whose entry is off-screen to the right entirely —
      // could happen with a stale persisted drawing on a different
      // symbol's timeframe.
      if (entryX > chartRight + 80) continue;

      ctx.save();
      // Clip vertical fills to the chart band so a wildly mis-priced
      // drawing doesn't fill the time axis or price scale.
      ctx.beginPath();
      ctx.rect(xLeft, chartTop, zoneW, chartBottom - chartTop);
      ctx.clip();

      const isLong = d.type === "LONG";

      // ── Layer A: faint full-zone background, so the user always
      //    sees the bounds of risk / reward even before any price
      //    action has touched the drawing. Risk uses a lower alpha
      //    because white background reads heavier than the green
      //    background at equal opacity.
      const riskTop = Math.min(entryY, stopY);
      const riskH = Math.abs(entryY - stopY);
      ctx.fillStyle = `rgba(${RISK_RGB}, ${RISK_BG_ALPHA * op})`;
      ctx.fillRect(xLeft, riskTop, zoneW, riskH);

      const rewardTop = Math.min(entryY, targetY);
      const rewardH = Math.abs(entryY - targetY);
      ctx.fillStyle = `rgba(${REWARD_RGB}, ${ZONE_BG_ALPHA * op})`;
      ctx.fillRect(xLeft, rewardTop, zoneW, rewardH);

      // ── Layer B: progress overlay — ONLY ONE side fills.
      //   Priority order:
      //   1. Stop wick touched the stop level → trade ended on stop,
      //      fill the whole risk zone (white).
      //   2. Target wick touched the target level → trade hit target,
      //      fill the whole reward zone (green).
      //   3. Otherwise → fall back to the last-close direction, with
      //      the fill extending up to the max excursion in that
      //      direction.
      //   Stop wins over target when both happened in the window:
      //   pessimistic convention (we can't recover intra-candle order
      //   from the bars, so assume the protective stop fired first).
      let maxHigh = -Infinity;
      let minLow = Infinity;
      let lastCloseInWindow: number | null = null;
      let lastTimeInWindow = -Infinity;
      for (const c of metrics.visibleCandles) {
        // A candle is "in window" when its period overlaps the drawing's
        // [entryTimeSec, endTimeSec) range. Using `c.time + period >
        // entryTimeSec` (instead of `c.time >= entryTimeSec`) is what
        // makes the candle CONTAINING the entry click count — the user
        // typically clicks somewhere inside a candle, so the candle's
        // start time is < entryTimeSec but its period straddles it.
        if (c.time + fallbackSpacing <= d.entryTimeSec || c.time >= endTimeSec) continue;
        if (c.high > maxHigh) maxHigh = c.high;
        if (c.low < minLow) minLow = c.low;
        if (c.time > lastTimeInWindow) {
          lastTimeInWindow = c.time;
          lastCloseInWindow = c.close;
        }
      }

      const hasWindowData = isFinite(maxHigh) && isFinite(minLow);
      const stopHit = hasWindowData
        ? isLong
          ? minLow <= d.stopPrice
          : maxHigh >= d.stopPrice
        : false;
      const targetHit = hasWindowData
        ? isLong
          ? maxHigh >= d.targetPrice
          : minLow <= d.targetPrice
        : false;

      let fillSide: "reward" | "risk" | null = null;
      let fillReachedPrice: number | null = null;

      if (stopHit) {
        fillSide = "risk";
        fillReachedPrice = d.stopPrice;
      } else if (targetHit) {
        fillSide = "reward";
        fillReachedPrice = d.targetPrice;
      } else if (lastCloseInWindow !== null) {
        const closeAboveEntry = lastCloseInWindow > d.entryPrice;
        const closeBelowEntry = lastCloseInWindow < d.entryPrice;
        const isInReward =
          (isLong && closeAboveEntry) || (!isLong && closeBelowEntry);
        const isInRisk =
          (isLong && closeBelowEntry) || (!isLong && closeAboveEntry);
        if (isInReward) {
          fillSide = "reward";
          const reached = isLong ? maxHigh : minLow;
          fillReachedPrice = isLong
            ? Math.min(reached, d.targetPrice)
            : Math.max(reached, d.targetPrice);
        } else if (isInRisk) {
          fillSide = "risk";
          const reached = isLong ? minLow : maxHigh;
          fillReachedPrice = isLong
            ? Math.max(reached, d.stopPrice)
            : Math.min(reached, d.stopPrice);
        }
      }

      if (fillSide !== null && fillReachedPrice !== null) {
        const reachedY = layout.priceToY(fillReachedPrice, metrics);
        const top = Math.min(entryY, reachedY);
        const h = Math.abs(entryY - reachedY);
        if (h > 0) {
          const rgb = fillSide === "reward" ? REWARD_RGB : RISK_RGB;
          const alpha =
            (fillSide === "reward" ? ZONE_FILL_ALPHA : RISK_FILL_ALPHA) * op;
          ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
          ctx.fillRect(xLeft, top, zoneW, h);

          // ── Dashed direction arrow ───────────────────────────────
          // Starts at the LEFT end of the entry line (the ML handle
          // position) so it visibly "leaves" the entry point. Ends
          // either:
          //   • at the exact candle that hit target / stop, on the
          //     target / stop level (so the user sees where the
          //     trade resolved), or
          //   • at the first candle past the drawing's right edge,
          //     on the reached excursion price (so the arrow points
          //     at "this is where time ran out"), or
          //   • at the right edge of the drawing on the reached
          //     price if no candle has crossed the boundary yet
          //     (drawing still in progress).
          let arrowEndX: number;
          let arrowEndY: number;
          if (stopHit || targetHit) {
            // Find the FIRST candle in window that touched the
            // resolved level. Stop wins over target — matches the
            // pessimistic priority used for the fill side.
            const resolvedPrice = stopHit ? d.stopPrice : d.targetPrice;
            let hitTime: number | null = null;
            for (const c of metrics.visibleCandles) {
              // Same overlap rule as the scan above so the entry
              // candle is considered "in window".
              if (
                c.time + fallbackSpacing <= d.entryTimeSec ||
                c.time >= endTimeSec
              )
                continue;
              const touched = stopHit
                ? isLong
                  ? c.low <= d.stopPrice
                  : c.high >= d.stopPrice
                : isLong
                  ? c.high >= d.targetPrice
                  : c.low <= d.targetPrice;
              if (touched) {
                hitTime = c.time;
                break;
              }
            }
            arrowEndX =
              hitTime !== null
                ? layout.timeToX(hitTime, metrics) +
                  layout.getEffectiveFootprintWidth() / 2
                : endX;
            arrowEndY = layout.priceToY(resolvedPrice, metrics);
          } else {
            // No target / stop hit yet — the trade is still "live"
            // inside the drawing's window. Track the LATEST candle
            // still in window so the arrow visibly chases price
            // tick-by-tick (close-based, so it moves continuously
            // as the live bar updates). When the window has been
            // fully consumed (no candle currently inside it, the
            // user dragged endTimeSec into the past), we fall back
            // to the first bar past endTimeSec — the historical
            // "this is where time ran out" semantic.
            let liveTime: number | null = null;
            let liveClose: number | null = null;
            for (const c of metrics.visibleCandles) {
              if (
                c.time + fallbackSpacing <= d.entryTimeSec ||
                c.time >= endTimeSec
              )
                continue;
              if (liveTime === null || c.time > liveTime) {
                liveTime = c.time;
                liveClose = c.close;
              }
            }
            if (liveTime !== null && liveClose !== null) {
              arrowEndX =
                layout.timeToX(liveTime, metrics) +
                layout.getEffectiveFootprintWidth() / 2;
              arrowEndY = layout.priceToY(liveClose, metrics);
            } else {
              // No candles in window — fall back to the historical
              // "time ran out" arrow at the first bar past the
              // window, at the reached excursion price.
              let afterTime: number | null = null;
              for (const c of metrics.visibleCandles) {
                if (c.time >= endTimeSec) {
                  afterTime = c.time;
                  break;
                }
              }
              arrowEndX =
                afterTime !== null
                  ? layout.timeToX(afterTime, metrics) +
                    layout.getEffectiveFootprintWidth() / 2
                  : endX;
              arrowEndY = reachedY;
            }
          }

          const arrowStartX = xLeft;
          const arrowStartY = entryY;
          const arrowColor =
            fillSide === "reward" ? REWARD_STROKE : RISK_STROKE;
          ctx.save();
          ctx.strokeStyle = arrowColor;
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          // Dashed shaft from (xLeft, entryY) to the resolved tip.
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(arrowStartX, arrowStartY);
          ctx.lineTo(arrowEndX, arrowEndY);
          ctx.stroke();
          // Solid chevron at the tip, oriented along the arrow
          // direction. Wings sit back along -u from the tip then
          // splay ±perpendicular.
          const dx = arrowEndX - arrowStartX;
          const dy = arrowEndY - arrowStartY;
          const len = Math.hypot(dx, dy);
          if (len > 0.5) {
            const arrowSize = 7;
            const ux = dx / len;
            const uy = dy / len;
            const px = -uy;
            const py = ux;
            const backX = arrowEndX - ux * arrowSize;
            const backY = arrowEndY - uy * arrowSize;
            const wingHalf = arrowSize * 0.55;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(backX + px * wingHalf, backY + py * wingHalf);
            ctx.lineTo(arrowEndX, arrowEndY);
            ctx.lineTo(backX - px * wingHalf, backY - py * wingHalf);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Entry line — solid, anchored at entryX so the user sees the
      // moment the position was opened. The stop / target lines are
      // intentionally not drawn: the coloured risk + reward zones
      // already mark those levels and the dashed lines were visual
      // noise. The corner / mid handles handle the resize.
      ctx.strokeStyle = ENTRY_STROKE;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([]);
      const eY = Math.round(entryY) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xLeft, eY);
      ctx.lineTo(endX, eY);
      ctx.stroke();

      ctx.restore();

      // Labels — drawn outside the clip so they can overlap into the
      // small gap before the price axis without being chopped.
      const rr = computeRR(d);
      const rrStr = isFinite(rr) ? `${rr.toFixed(2)} : 1` : "∞ : 1";
      const stopDelta = (d.stopPrice - d.entryPrice).toFixed(2);
      const targetDelta = (d.targetPrice - d.entryPrice).toFixed(2);
      const fmt = (p: number) => p.toFixed(2);
      const labels = [
        { y: entryY, text: `Entry  ${fmt(d.entryPrice)}`, color: ENTRY_STROKE },
        {
          y: targetY,
          text: `TP     ${fmt(d.targetPrice)}  (${targetDelta} pts)`,
          color: REWARD_STROKE,
        },
        {
          y: stopY,
          text: `SL     ${fmt(d.stopPrice)}  (${stopDelta} pts)`,
          color: RISK_STROKE,
        },
        { y: entryY + 14, text: `R:R    ${rrStr}`, color: ENTRY_STROKE },
      ];
      ctx.save();
      ctx.font = '11px "Consolas", "Monaco", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const l of labels) {
        if (l.y < chartTop - 2 || l.y > chartBottom + 2) continue;
        const tm = ctx.measureText(l.text);
        const padX = 4;
        const boxW = tm.width + padX * 2;
        const boxH = 14;
        const boxX = chartRight - boxW - 4;
        const boxY = Math.round(l.y - boxH / 2) + 0.5;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 0.5, boxY, boxW - 1, boxH);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, chartRight - 4 - padX, l.y);
      }
      ctx.restore();

      // Selection-gated affordances: delete button + resize handles
      // only render when this drawing is the currently selected one.
      // Click anywhere else on the chart → deselect → clean render.
      if (this.selectedDrawingId === d.id) {
        // [×] delete button — to the left of the Entry label, vertically
        // aligned on the entry line. Red background + white × so it's
        // unmistakable as a delete affordance. Hit-tested in the canvas.
        if (entryY >= chartTop && entryY <= chartBottom) {
          const del = getTradeDrawingDeleteRect(entryY, chartRight);
          ctx.save();
          ctx.fillStyle = "rgba(255, 71, 87, 0.85)";
          ctx.fillRect(del.x, del.y, del.w, del.h);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 1.4;
          ctx.lineCap = "round";
          const pad = 3.5;
          ctx.beginPath();
          ctx.moveTo(del.x + pad, del.y + pad);
          ctx.lineTo(del.x + del.w - pad, del.y + del.h - pad);
          ctx.moveTo(del.x + del.w - pad, del.y + pad);
          ctx.lineTo(del.x + pad, del.y + del.h - pad);
          ctx.stroke();
          ctx.restore();
        }

        // Resize handles — modern rounded grips: a soft white halo
        // ring (subtle shadow), a filled white disc, and a dark inner
        // ring for contrast against bright zones. Drawn LAST so nothing
        // overlaps them and the user always has a clean grab target.
        const handles = getTradeDrawingHandles(d, layout, metrics, chartRight);
        const radius = DRAWING_HANDLE_SIZE / 2;
        ctx.save();
        for (const h of handles) {
          if (h.y < chartTop - radius || h.y > chartBottom + radius) continue;
          const cx = h.x;
          const cy = h.y;
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.10)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(15, 18, 24, 0.85)";
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // ── Line drawings (h-line / h-ray / trend) ──────────────────────────────
  private renderLineDrawings(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    width: number,
  ): void {
    if (this.lineDrawings.length === 0) return;
    const symbol = this.currentSymbol;
    if (!symbol) return;
    const layout = this.layoutEngine;
    const chartRight = width - this.layoutCfg.priceAxisWidth;
    const chartTop = metrics.footprintAreaY;
    const chartBottom = metrics.footprintAreaY + metrics.footprintAreaHeight;
    const STROKE = "rgba(126, 211, 33, 0.95)"; // brand green
    const HANDLE_FILL = "#ffffff";
    const HANDLE_STROKE = "rgba(15, 18, 24, 0.85)";
    const radius = DRAWING_HANDLE_SIZE / 2;

    for (const d of this.lineDrawings) {
      if (d.symbol !== symbol) continue;
      // Handles only show on the selected drawing; the shape itself
      // always renders (so user always sees what they drew).
      const isSelected = this.selectedDrawingId === d.id;

      // Resolve per-drawing style overrides with brand fallbacks.
      // `kind === "rect"` reads borderColor / borderWidth instead
      // because its style props are named differently in the type.
      const styleColor =
        d.kind === "rect"
          ? d.borderColor ?? STROKE
          : (d as { color?: string }).color ?? STROKE;
      const styleWidth =
        d.kind === "rect"
          ? d.borderWidth ?? 1.5
          : (d as { lineWidth?: number }).lineWidth ?? 1.5;
      const styleDash = lineStyleToDash(
        (d as { lineStyle?: import("./tradeDrawings").LineStyle }).lineStyle,
      );

      ctx.save();
      ctx.strokeStyle = styleColor;
      ctx.lineWidth = styleWidth;
      ctx.setLineDash(styleDash);

      if (d.kind === "h-line") {
        const y = layout.priceToY(d.price, metrics);
        if (y < chartTop - 5 || y > chartBottom + 5) {
          ctx.restore();
          continue;
        }
        const ySnap = Math.round(y) + 0.5;
        // Zone fill — used by the sim-position SL / TP lines to
        // highlight the loss / profit region between this line's
        // price and `fillToPrice`. Drawn BEFORE the line stroke so
        // the line sits crisply on top of its zone.
        if (
          d.fillToPrice !== undefined &&
          d.fillColor &&
          Number.isFinite(d.fillToPrice)
        ) {
          const yOther = layout.priceToY(d.fillToPrice, metrics);
          const yTop = Math.min(y, yOther);
          const yBot = Math.max(y, yOther);
          const clipTop = Math.max(yTop, chartTop);
          const clipBot = Math.min(yBot, chartBottom);
          if (clipBot > clipTop) {
            ctx.save();
            ctx.fillStyle = d.fillColor;
            ctx.fillRect(0, clipTop, chartRight, clipBot - clipTop);
            ctx.restore();
          }
        }
        // Alert h-lines render in amber + dashed + bell glyph
        // unconditionally — the alert affordance ALWAYS wins over
        // the user's color pick so a configured alert can't be
        // accidentally camouflaged as a plain S/R level.
        const lineStroke = d.isAlert
          ? "rgba(251, 191, 36, 0.95)"
          : styleColor;
        ctx.strokeStyle = lineStroke;
        if (d.isAlert) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, ySnap);
        ctx.lineTo(chartRight, ySnap);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isSelected) {
          drawCircleHandle(ctx, chartRight / 2, y, radius, HANDLE_FILL, HANDLE_STROKE);
        }
        drawPriceLabel(ctx, chartRight, y, d.price, lineStroke);
        // Center-of-line pill — used by the sim-position overlay to
        // surface "entry · P&L" on the live position line. Skipped
        // for plain user-drawn h-lines (no centerLabel set). Pill
        // sits at the chart horizontal midpoint so it stays visible
        // regardless of pan/zoom along the time axis.
        if (d.centerLabel) {
          const txt = d.centerLabel;
          ctx.save();
          ctx.font = `bold 11px "Consolas", "Monaco", monospace`;
          const padX = 8;
          const m = ctx.measureText(txt);
          const pillW = Math.ceil(m.width) + padX * 2;
          const pillH = 18;
          const cx = chartRight / 2;
          const pillX = Math.round(cx - pillW / 2);
          const pillY = Math.round(y - pillH / 2);
          ctx.fillStyle = "rgba(15, 17, 21, 0.92)";
          ctx.fillRect(pillX, pillY, pillW, pillH);
          ctx.lineWidth = 1;
          ctx.strokeStyle = lineStroke;
          ctx.strokeRect(pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1);
          ctx.fillStyle = lineStroke;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, cx, y);
          ctx.restore();
          // Restore default text alignment for downstream draws.
          ctx.textAlign = "start";
          ctx.textBaseline = "alphabetic";
        }
        // Manual-close [×] button on the sim-position entry line.
        // Always rendered (no selection gate) — closing a live
        // position is a primary action; the user shouldn't have to
        // select the line first. Hit-tested in FootprintCanvas.
        if (d.id === POSITION_ENTRY_LINE_ID && y >= chartTop && y <= chartBottom) {
          const cb = getPositionEntryCloseRect(y, chartRight);
          ctx.save();
          // Subtle outer glow so the button reads as clickable even
          // against bright candle bodies.
          ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
          ctx.shadowBlur = 4;
          ctx.fillStyle = "rgba(239, 68, 68, 0.92)"; // red-500
          ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
          ctx.shadowBlur = 0;
          // Thin light border to lift it off the position-line zone fill.
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 1;
          ctx.strokeRect(cb.x + 0.5, cb.y + 0.5, cb.w - 1, cb.h - 1);
          // White × glyph.
          ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
          ctx.lineWidth = 1.6;
          ctx.lineCap = "round";
          const pad = 4;
          ctx.beginPath();
          ctx.moveTo(cb.x + pad, cb.y + pad);
          ctx.lineTo(cb.x + cb.w - pad, cb.y + cb.h - pad);
          ctx.moveTo(cb.x + cb.w - pad, cb.y + pad);
          ctx.lineTo(cb.x + pad, cb.y + cb.h - pad);
          ctx.stroke();
          ctx.restore();
        }
        if (d.isAlert) {
          // Small bell glyph just left of the price label so the
          // user can spot an armed alert at a glance, even when
          // several h-lines stack near the same price.
          const bellX = chartRight - 96;
          const bellY = y;
          ctx.save();
          ctx.strokeStyle = lineStroke;
          ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
          ctx.lineWidth = 1.4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const r = 5;
          ctx.beginPath();
          ctx.arc(bellX, bellY, r + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(bellX - 3.5, bellY - 1);
          ctx.lineTo(bellX - 3.5, bellY + 1);
          ctx.lineTo(bellX - 4.5, bellY + 2.5);
          ctx.lineTo(bellX + 4.5, bellY + 2.5);
          ctx.lineTo(bellX + 3.5, bellY + 1);
          ctx.lineTo(bellX + 3.5, bellY - 1);
          ctx.arc(bellX, bellY - 1, 3.5, 0, Math.PI, true);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(bellX, bellY + 4.2, 0.9, 0, Math.PI * 2);
          ctx.fillStyle = lineStroke;
          ctx.fill();
          ctx.restore();
        }
      } else if (d.kind === "h-ray") {
        const xStart = layout.timeToX(d.startTimeSec, metrics);
        const y = layout.priceToY(d.price, metrics);
        if (y < chartTop - 5 || y > chartBottom + 5) {
          ctx.restore();
          continue;
        }
        const ySnap = Math.round(y) + 0.5;
        // h-ray default is "extend right only". The properties panel
        // can flip either flag — `extendLeft: true` mirrors the ray
        // leftwards (= full h-line); `extendRight: false` turns the
        // shape into a marker dot at the origin.
        const extendRight = d.extendRight !== false;
        const extendLeft = d.extendLeft === true;
        const xFrom = extendLeft ? 0 : Math.max(0, xStart);
        const xTo = extendRight ? chartRight : xStart;
        if (xTo > xFrom) {
          ctx.beginPath();
          ctx.moveTo(xFrom, ySnap);
          ctx.lineTo(xTo, ySnap);
          ctx.stroke();
        }
        if (isSelected) {
          drawCircleHandle(ctx, xStart, y, radius, HANDLE_FILL, HANDLE_STROKE);
        }
        drawPriceLabel(ctx, chartRight, y, d.price, styleColor);
      } else if (d.kind === "rect") {
        // Anchored corners come from the user's drag. Extension flags
        // project the band leftwards (to x=0) and/or rightwards (to
        // chartRight) — turning a bounded rectangle into a
        // supply/demand zone that keeps marking the price band
        // forever.
        const xLAnchor = layout.timeToX(d.startTimeSec, metrics);
        const xRAnchor = layout.timeToX(d.endTimeSec, metrics);
        const xL = d.extendLeft ? 0 : xLAnchor;
        const xR = d.extendRight ? chartRight : xRAnchor;
        const yT = layout.priceToY(d.topPrice, metrics);
        const yB = layout.priceToY(d.bottomPrice, metrics);
        const w = xR - xL;
        const h = yB - yT;
        // Resolve fill: prefer explicit fillOpacity over the alpha
        // encoded in fillColor (legacy rects stored an rgba string).
        let rectFill: string;
        if (d.fillOpacity !== undefined) {
          const hue = hexFromRgbaIfPossible(
            d.fillColor ?? "rgba(126, 211, 33, 0.10)",
          );
          rectFill = hexToRgba(hue, d.fillOpacity);
        } else {
          rectFill = d.fillColor ?? "rgba(126, 211, 33, 0.10)";
        }
        ctx.fillStyle = rectFill;
        ctx.fillRect(xL, yT, w, h);
        // Border colour + width already pulled into styleColor /
        // styleWidth at the top of the loop, ctx state is already set.
        ctx.strokeRect(
          Math.round(xL) + 0.5,
          Math.round(yT) + 0.5,
          Math.round(w),
          Math.round(h),
        );
        if (isSelected) {
          // Selection handles stay on the ANCHORED corners (not the
          // extended edges) so the user can still drag the rect to
          // resize even when extension is on. Dragging the right
          // handle of an extend-right rect modifies endTimeSec; the
          // visible right edge keeps going to chartRight either way.
          const xMid = (xLAnchor + xRAnchor) / 2;
          const yMid = (yT + yB) / 2;
          for (const [hx, hy] of [
            [xLAnchor, yT],
            [xRAnchor, yT],
            [xLAnchor, yB],
            [xRAnchor, yB],
            [xMid, yT],
            [xMid, yB],
            [xLAnchor, yMid],
            [xRAnchor, yMid],
          ] as const) {
            drawCircleHandle(ctx, hx, hy, radius, HANDLE_FILL, HANDLE_STROKE);
          }
        }
      } else if (d.kind === "trend") {
        const x1 = layout.timeToX(d.startTimeSec, metrics);
        const y1 = layout.priceToY(d.startPrice, metrics);
        const x2 = layout.timeToX(d.endTimeSec, metrics);
        const y2 = layout.priceToY(d.endPrice, metrics);
        // Extension flags project the line beyond its anchored
        // endpoints to the chart edges using the same slope. Handles
        // stay on the anchored (x1,y1) / (x2,y2) so the user can
        // still grab + drag them when extension is on.
        let xA = x1, yA = y1, xB = x2, yB = y2;
        if (d.extendLeft || d.extendRight) {
          const dx = x2 - x1;
          const slope = dx !== 0 ? (y2 - y1) / dx : 0;
          if (d.extendLeft) {
            xA = 0;
            yA = dx !== 0 ? y1 + slope * (xA - x1) : y1;
          }
          if (d.extendRight) {
            xB = chartRight;
            yB = dx !== 0 ? y1 + slope * (xB - x1) : y2;
          }
        }
        ctx.beginPath();
        ctx.moveTo(xA, yA);
        ctx.lineTo(xB, yB);
        ctx.stroke();
        if (isSelected) {
          drawCircleHandle(ctx, x1, y1, radius, HANDLE_FILL, HANDLE_STROKE);
          drawCircleHandle(ctx, x2, y2, radius, HANDLE_FILL, HANDLE_STROKE);
        }
        // Slope label at the midpoint (price delta + bars).
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dPrice = d.endPrice - d.startPrice;
        const slopeStr = `${dPrice >= 0 ? "+" : ""}${dPrice.toFixed(2)}`;
        ctx.save();
        ctx.font = '11px "Consolas", "Monaco", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        const tw = ctx.measureText(slopeStr).width;
        const pad = 3;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(mx + 8, my - 14, tw + pad * 2, 14);
        ctx.fillStyle = styleColor;
        ctx.fillText(slopeStr, mx + 8 + pad, my - 2);
        ctx.restore();
      } else if (d.kind === "ruler") {
        // Measure segment — same geometry as trend, but rendered
        // with end-cap "T" markers (like a ruler's mm ticks) and a
        // stats badge at the midpoint summarising the delta in
        // price / % / bars / time.
        const x1 = layout.timeToX(d.startTimeSec, metrics);
        const y1 = layout.priceToY(d.startPrice, metrics);
        const x2 = layout.timeToX(d.endTimeSec, metrics);
        const y2 = layout.priceToY(d.endPrice, metrics);
        ctx.save();
        ctx.strokeStyle = styleColor;
        ctx.lineWidth = styleWidth;
        // Ruler defaults to dashed (visual marker for "this is a
        // measurement, not a real level") when the user hasn't
        // picked an explicit style yet.
        ctx.setLineDash(
          d.lineStyle ? lineStyleToDash(d.lineStyle) : [4, 3],
        );
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        // End-caps perpendicular to the segment (5 px arms).
        const segLen = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (y2 - y1) / segLen;
        const ny = -(x2 - x1) / segLen;
        const capLen = 5;
        for (const [cx, cy] of [
          [x1, y1],
          [x2, y2],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(cx + nx * capLen, cy + ny * capLen);
          ctx.lineTo(cx - nx * capLen, cy - ny * capLen);
          ctx.stroke();
        }
        ctx.restore();
        if (isSelected) {
          drawCircleHandle(ctx, x1, y1, radius, HANDLE_FILL, HANDLE_STROKE);
          drawCircleHandle(ctx, x2, y2, radius, HANDLE_FILL, HANDLE_STROKE);
        }
        // Stats badge at the midpoint — price Δ + % + bars + time.
        // Uses the visible bar spacing as a denominator for the bar
        // count so the read makes sense on whatever TF is loaded.
        const vc = metrics.visibleCandles;
        const spacing = vc.length >= 2 ? vc[1].time - vc[0].time : 60;
        const dPriceR = d.endPrice - d.startPrice;
        const pctR =
          d.startPrice !== 0 ? (dPriceR / d.startPrice) * 100 : 0;
        const dtSec = Math.abs(d.endTimeSec - d.startTimeSec);
        const bars = spacing > 0 ? Math.round(dtSec / spacing) : 0;
        const timeStr =
          dtSec >= 86400
            ? `${(dtSec / 86400).toFixed(1)}d`
            : dtSec >= 3600
              ? `${(dtSec / 3600).toFixed(1)}h`
              : dtSec >= 60
                ? `${Math.round(dtSec / 60)}m`
                : `${Math.round(dtSec)}s`;
        const priceStr = `${dPriceR >= 0 ? "+" : ""}${dPriceR.toFixed(2)}`;
        const pctStr = `${pctR >= 0 ? "+" : ""}${pctR.toFixed(2)}%`;
        const barStr = `${bars} bar${bars === 1 ? "" : "s"}`;
        const lines = [priceStr, pctStr, `${barStr} · ${timeStr}`];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.save();
        ctx.font = 'bold 11px "Consolas", "Monaco", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const lineH = 14;
        const padX = 6;
        const padY = 4;
        const maxW = Math.max(...lines.map((s) => ctx.measureText(s).width));
        const boxW = maxW + padX * 2;
        const boxH = lines.length * lineH + padY * 2;
        const boxX = Math.round(mx + 10);
        const boxY = Math.round(my - boxH / 2);
        ctx.fillStyle = "rgba(18, 18, 22, 0.92)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
        ctx.fillStyle =
          dPriceR >= 0
            ? this.colors.candleUpBody
            : this.colors.candleDownBody;
        ctx.fillText(lines[0], boxX + padX, boxY + padY);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillText(lines[1], boxX + padX, boxY + padY + lineH);
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.font = '10px "Consolas", "Monaco", monospace';
        ctx.fillText(lines[2], boxX + padX, boxY + padY + lineH * 2);
        ctx.restore();
      } else if (d.kind === "text") {
        // Text annotation — anchored pill. Empty content suppresses
        // the visual entirely (the inline editor handles its own
        // overlay until the user commits). Selected state draws a
        // single handle at the anchor for moving the text.
        if (!d.content || d.content.trim().length === 0) {
          // Anchor dot only — gives the editor's overlay a target.
          if (isSelected) {
            const ax = layout.timeToX(d.timeSec, metrics);
            const ay = layout.priceToY(d.price, metrics);
            drawCircleHandle(ctx, ax, ay, radius, HANDLE_FILL, HANDLE_STROKE);
          }
        } else {
          const ax = layout.timeToX(d.timeSec, metrics);
          const ay = layout.priceToY(d.price, metrics);
          ctx.save();
          // Build the canvas font string from the user-picked
          // size + weight + slant. Falls back to 12 px regular so
          // existing drawings keep their original look.
          const fSize = Math.max(8, Math.min(64, d.fontSize ?? 12));
          const fWeight = d.bold ? "700" : "400";
          const fSlant = d.italic ? "italic " : "";
          ctx.font = `${fSlant}${fWeight} ${fSize}px var(--font-sans, -apple-system, "Segoe UI", system-ui, sans-serif)`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          const padX = Math.max(7, Math.round(fSize * 0.5));
          const padY = Math.max(4, Math.round(fSize * 0.3));
          const tw = ctx.measureText(d.content).width;
          const boxW = tw + padX * 2;
          const boxH = fSize + padY * 2 + 2;
          const boxX = Math.round(ax + 8);
          const boxY = Math.round(ay - boxH / 2);
          ctx.fillStyle = d.bgColor ?? "rgba(18, 18, 22, 0.92)";
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.strokeStyle = isSelected
            ? STROKE
            : "rgba(255, 255, 255, 0.40)";
          ctx.lineWidth = 1;
          ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
          ctx.fillStyle = d.color ?? "#ffffff";
          ctx.fillText(d.content, boxX + padX, boxY + padY);
          // Anchor leader — short line connecting the anchor dot to
          // the text box. Keeps the (time, price) origin clear when
          // the user pans away from the text.
          ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(boxX, boxY + boxH / 2);
          ctx.stroke();
          ctx.restore();
          if (isSelected) {
            drawCircleHandle(ctx, ax, ay, radius, HANDLE_FILL, HANDLE_STROKE);
          }
        }
      }
      ctx.restore();
    }
  }

  // ── VWAP session bucketing (helpers) ────────────────────────────────────
  // Map an epoch (seconds, UTC) to the CME futures "session day" it
  // belongs to. CME Globex closes at 16:00 CT and reopens at 17:00
  // CT the same calendar day — so a bar timestamped 16:30 CT
  // belongs to the SAME session as 09:00 CT (continuous), while a
  // bar at 17:30 CT starts the NEXT session. Concretely: anything
  // strictly < 17:00 CT is bucketed with the previous calendar day.
  // Returns a stable string key ("YYYY-MM-DD"). Intl handles DST
  // automatically — no manual offset bookkeeping.
  private sessionDayKeyCT(epochSec: number): string {
    if (!this.chicagoTimeFmt) {
      this.chicagoTimeFmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      });
    }
    const parts = this.chicagoTimeFmt.formatToParts(epochSec * 1000);
    let y = "1970", m = "01", d = "01", h = "00";
    for (const p of parts) {
      if (p.type === "year") y = p.value;
      else if (p.type === "month") m = p.value;
      else if (p.type === "day") d = p.value;
      else if (p.type === "hour") h = p.value;
    }
    // Some engines emit "24" for midnight when hour12=false — normalise.
    const hour = parseInt(h, 10) % 24;
    if (hour < 17) {
      // Shift one calendar day back: this candle belongs to the
      // session that opened YESTERDAY at 17:00 CT.
      const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    }
    return `${y}-${m}-${d}`;
  }

  // Walk this.candles once, computing the per-candle running VWAP
  // bucketed by CME session day. Result lands in vwapByTimeCache.
  private rebuildVwapCache(): void {
    this.vwapByTimeCache.clear();
    let cumTPV = 0;
    let cumVol = 0;
    let currentSession: string | null = null;
    for (const c of this.candles) {
      const session = this.sessionDayKeyCT(c.time);
      if (session !== currentSession) {
        cumTPV = 0;
        cumVol = 0;
        currentSession = session;
      }
      const typical = (c.high + c.low + c.close) / 3;
      const vol = c.totalVolume || 0;
      cumTPV += typical * vol;
      cumVol += vol;
      this.vwapByTimeCache.set(c.time, cumVol > 0 ? cumTPV / cumVol : typical);
    }
  }

  // ── VWAP indicator ──────────────────────────────────────────────────────
  // Daily VWAP anchored on the CME futures session reset (17:00
  // Chicago Time). Accumulates Σ(typical × vol) and Σ(vol) inside
  // each session, then resets at the next 17:00 CT crossing — so
  // each trading day gets its own line, the convention every CME
  // futures platform (ATAS, Sierra, TradingView's "Anchored VWAP /
  // Session") uses.
  //
  // Typical price = (high + low + close) / 3 (standard VWAP).
  // DST is handled implicitly by Intl.DateTimeFormat with
  // timeZone: "America/Chicago" — the JS engine maps each UTC
  // instant to the correct local hour without any manual offset.
  //
  // Per-candle vwap is cached by `this.candles` reference. Every
  // setBars() builds a fresh array, so a reference compare is
  // enough to invalidate. Avoids paying for the Intl formatting
  // pass on every pan/zoom redraw (cache hit ratio = ~99%).
  private renderVwapIndicator(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    width: number,
  ): void {
    if (this.candles.length === 0) return;
    if (metrics.visibleCandles.length === 0) return;
    const layout = this.layoutEngine;
    const chartRight = width - this.layoutCfg.priceAxisWidth;
    const chartTop = metrics.footprintAreaY;
    const chartBottom = chartTop + metrics.footprintAreaHeight;

    if (this.vwapCacheCandles !== this.candles) {
      this.rebuildVwapCache();
      this.vwapCacheCandles = this.candles;
    }
    const vwapByTime = this.vwapByTimeCache;

    // Second pass — build screen-space points for the visible candles.
    const pts: { x: number; y: number }[] = [];
    let lastVwap: number | null = null;
    for (const vc of metrics.visibleCandles) {
      const v = vwapByTime.get(vc.time);
      if (v === undefined) continue;
      const x = layout.timeToX(vc.time, metrics);
      if (x > chartRight + 1) continue;
      const y = layout.priceToY(v, metrics);
      pts.push({ x, y });
      lastVwap = v;
    }
    if (pts.length < 2) return;

    const STROKE = "#7ed321"; // Senzoukria green
    // Soft glow underneath the main line for legibility against the
    // bright footprint cells.
    ctx.save();
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 4.5;
    ctx.globalAlpha = 0.18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();

    // Main line.
    ctx.save();
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();

    // Right-edge price label pinned to the latest VWAP — same
    // shape as the entry/stop/target labels so the chrome stays
    // consistent across indicator/drawing affordances.
    if (lastVwap !== null) {
      const last = pts[pts.length - 1];
      if (last.y >= chartTop - 2 && last.y <= chartBottom + 2) {
        const text = `VWAP ${lastVwap.toFixed(2)}`;
        ctx.save();
        ctx.font = '11px "Consolas", "Monaco", monospace';
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const tm = ctx.measureText(text);
        const padX = 4;
        const boxW = tm.width + padX * 2;
        const boxH = 14;
        const boxX = chartRight - boxW - 4;
        const boxY = Math.round(last.y - boxH / 2) + 0.5;
        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 0.5, boxY, boxW - 1, boxH);
        ctx.fillStyle = STROKE;
        ctx.fillText(text, chartRight - 4 - padX, last.y);
        ctx.restore();
      }
    }
  }

  // ── Senzoukria custom footprint cells ───────────────────────────────────
  // Design spec (user-driven, P1.7):
  //   • Outline rectangulaire grise par bougie
  //   • Barre verticale gauche, vert si close>open (bullish), rouge sinon
  //   • Par niveau de prix : "BID  x  ASK", `x` central, jauges centrifuges
  //     (rouge bid → gauche, vert ask → droite) bornées à la half-width.
  private renderSenzoukriaCells(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    _rowH: number,
    fpWidth: number,
    ohlcWidth: number,
    tickSize: number,
  ): void {
    const visible = metrics.visibleCandles;
    if (visible.length === 0) return;

    // Pull every colour from `this.colors`, which the settings
    // pipeline keeps in sync with the user's modal picks. The
    // state bar reuses the candle BODY colour (not a separate
    // "state" hue) so the cell colour and the candle-mode colour
    // are always identical — no chance of "is this bar bullish or
    // bearish?" confusion when switching modes.
    const STATE_BAR_W = Math.max(2, Math.round(ohlcWidth * 0.45));
    const BULLISH = this.colors.candleUpBody;
    const BEARISH = this.colors.candleDownBody;
    const BID_GAUGE = hexToRgba(this.colors.bidColor, 0.22);
    const ASK_GAUGE = hexToRgba(this.colors.askColor, 0.34);
    const ZERO_GAUGE = "rgba(255, 255, 255, 0.04)";
    const BID_TEXT = this.colors.bidTextColor;
    const ASK_TEXT = this.colors.askTextColor;
    const ZERO_TEXT = "rgba(255, 255, 255, 0.30)";

    ctx.font = `${this.fonts.volumeFontBold ? 'bold ' : ''}${this.fonts.volumeFontSize}px ${this.fonts.volumeFont}`;
    ctx.textBaseline = 'middle';

    // Effective pixel-per-tick spacing: derives from layout's priceToY so it
    // always matches the visible price-axis resolution. We use this as the
    // actual row height so adjacent rows never overlap, regardless of zoom.
    const yAtTop = this.layoutEngine.priceToY(metrics.visiblePriceMax, metrics);
    const yAtBot = this.layoutEngine.priceToY(metrics.visiblePriceMin, metrics);
    const totalTicks = Math.max(1, Math.round((metrics.visiblePriceMax - metrics.visiblePriceMin) / tickSize));
    const pixelsPerTick = Math.abs(yAtBot - yAtTop) / totalTicks;
    const effRowH = Math.max(1, pixelsPerTick);
    const showText = effRowH >= this.fonts.volumeFontSize + 1;

    for (let i = 0; i < visible.length; i++) {
      const candle = visible[i];
      const fpX = this.layoutEngine.getFootprintX(i, metrics);
      const cellsX = fpX + STATE_BAR_W;
      const cellsW = fpWidth - STATE_BAR_W;
      if (cellsW <= 4) continue;
      const halfW = cellsW / 2;
      const centerX = cellsX + halfW;

      // Candle geometry from price extents (anchored to actual high/low ticks).
      const yHigh = this.layoutEngine.priceToY(candle.high, metrics);
      const yLow = this.layoutEngine.priceToY(candle.low, metrics);
      const top = Math.min(yHigh, yLow) - effRowH / 2;
      const bottom = Math.max(yHigh, yLow) + effRowH / 2;
      const candleH = Math.max(effRowH, bottom - top);

      // Max level volume across all ticks (only existing levels matter; gaps are 0×0).
      let maxLevelVol = 0;
      candle.levels.forEach((lv) => {
        if (lv.bidVolume > maxLevelVol) maxLevelVol = lv.bidVolume;
        if (lv.askVolume > maxLevelVol) maxLevelVol = lv.askVolume;
      });
      const scale = maxLevelVol > 0 ? halfW / maxLevelVol : 0;

      // Iterate every tick from low to high so gaps render as `0 x 0`.
      // Snap bounds to tick grid to avoid floating-point drift.
      const lowSnap = Math.round(candle.low / tickSize) * tickSize;
      const highSnap = Math.round(candle.high / tickSize) * tickSize;
      // Viewport pre-cull — clamp the iteration range to the prices
      // actually on screen so vertical pan/zoom of a tall bar (e.g.
      // session range = 100+ ticks) doesn't burn fillRect/fillText
      // on rows that will never be visible. priceToY + the if-continue
      // guard below already skipped THESE pixels, but we still paid
      // the cost of the layout call and the levels.get() lookup.
      const visMin = metrics.visiblePriceMin - tickSize;
      const visMax = metrics.visiblePriceMax + tickSize;
      const startPrice = Math.max(lowSnap, visMin);
      const endPrice = Math.min(highSnap, visMax);
      if (startPrice > endPrice) continue;
      const startT = Math.max(0, Math.round((startPrice - lowSnap) / tickSize));
      const endT = Math.max(startT, Math.round((endPrice - lowSnap) / tickSize));

      for (let t = startT; t <= endT; t++) {
        const price = lowSnap + t * tickSize;
        const lv = candle.levels.get(price) ?? candle.levels.get(Number(price.toFixed(10)));
        const bidV = lv?.bidVolume ?? 0;
        const askV = lv?.askVolume ?? 0;

        const y = this.layoutEngine.priceToY(price, metrics);
        if (y < metrics.footprintAreaY - effRowH || y > metrics.footprintAreaY + metrics.footprintAreaHeight + effRowH) continue;
        const rowTop = y - effRowH / 2;
        const rowDrawH = Math.max(1, effRowH - 1);

        // Bid gauge (red, from center toward left)
        if (bidV > 0 && scale > 0) {
          const w = Math.min(halfW, bidV * scale);
          ctx.fillStyle = BID_GAUGE;
          ctx.fillRect(centerX - w, rowTop, w, rowDrawH);
        } else {
          ctx.fillStyle = ZERO_GAUGE;
          ctx.fillRect(centerX - halfW, rowTop, halfW, rowDrawH);
        }
        // Ask gauge (green, from center toward right)
        if (askV > 0 && scale > 0) {
          const w = Math.min(halfW, askV * scale);
          ctx.fillStyle = ASK_GAUGE;
          ctx.fillRect(centerX, rowTop, w, rowDrawH);
        } else {
          ctx.fillStyle = ZERO_GAUGE;
          ctx.fillRect(centerX, rowTop, halfW, rowDrawH);
        }

        // Texts: only when row tall enough to be readable AND there's
        // actual volume on this row. Drawing "0 x 0" on every empty
        // tick of a tall bar is 3 fillText calls per row — by far the
        // dominant cost on screens with 50+ visible ticks per bar.
        // The gauge background already conveys "empty" visually.
        if (!showText) continue;
        if (bidV === 0 && askV === 0) continue;
        const yMid = y;
        if (bidV > 0) {
          ctx.fillStyle = BID_TEXT;
          ctx.textAlign = 'right';
          ctx.fillText(formatVol(bidV), centerX - 6, yMid);
        } else {
          ctx.fillStyle = ZERO_TEXT;
          ctx.textAlign = 'right';
          ctx.fillText('0', centerX - 6, yMid);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'center';
        ctx.fillText('x', centerX, yMid);
        if (askV > 0) {
          ctx.fillStyle = ASK_TEXT;
          ctx.textAlign = 'left';
          ctx.fillText(formatVol(askV), centerX + 6, yMid);
        } else {
          ctx.fillStyle = ZERO_TEXT;
          ctx.textAlign = 'left';
          ctx.fillText('0', centerX + 6, yMid);
        }
      }

      // State bar (vertical, left side) — same colour as the candle
      // body so footprint mode and candle mode stay visually
      // identical for each direction.
      const isBullish = candle.close >= candle.open;
      ctx.fillStyle = isBullish ? BULLISH : BEARISH;
      ctx.fillRect(fpX, top, STATE_BAR_W, candleH);

      // Outline rectangle (around the whole candle including state
      // bar). Uses the user-picked candle border colour but at a
      // fixed low alpha so the box stays subtle — otherwise a
      // saturated border colour would compete with the cells.
      const borderHex = isBullish
        ? this.colors.candleUpBorder
        : this.colors.candleDownBorder;
      ctx.strokeStyle = hexToRgba(borderHex, 0.30);
      ctx.lineWidth = 1;
      ctx.strokeRect(fpX + 0.5, top + 0.5, fpWidth - 1, candleH - 1);
    }
  }

  // ── Time axis ───────────────────────────────────────────────────────────
  // Renders HH:MM labels at the bottom, one per visible candle (skipping a
  // step when bars get too narrow so labels never overlap). Sits in the
  // `timeAxisHeight` band reserved by the layout config.
  private renderTimeAxis(
    ctx: CanvasRenderingContext2D,
    metrics: import("../orderflow/FootprintLayoutEngine").LayoutMetrics,
    width: number,
    height: number,
  ): void {
    const axisH = this.layoutCfg.timeAxisHeight;
    const axisY = height - axisH;
    const axisRight = width - this.layoutCfg.priceAxisWidth;

    // Background strip — visibly distinct from the chart area so the
    // axis is unmistakable. The user couldn't see it earlier with a
    // 2.5% tint; bumped to a slight grey-on-noir + bright top border.
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, axisY, axisRight, axisH);

    // Top border line — clearly delimits the axis from the chart area.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY + 0.5);
    ctx.lineTo(axisRight, axisY + 0.5);
    ctx.stroke();

    const visible = metrics.visibleCandles;
    if (visible.length === 0) return;

    // Compute one label per candle, skipping when too dense.
    const fpW = this.layoutEngine.getEffectiveFootprintWidth();
    const minLabelGap = 56;
    const stride = Math.max(1, Math.ceil(minLabelGap / fpW));

    ctx.font = `${this.fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
    ctx.fillStyle = this.colors.textSecondary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = axisY + axisH / 2;

    const period = visible.length > 1 ? visible[1].time - visible[0].time : 60;
    const withSeconds = period < 60;
    const fmt = tzFormatter(this.settings.timezone, withSeconds);
    const dateFmt = tzDateFormatter(this.settings.timezone);

    // Track the previous label's date so we can spot day boundaries.
    // When the date changes between two consecutive labels, we (a) add
    // a vertical separator across the whole chart to make the day
    // change visually unmistakable, and (b) prepend the date to the
    // label so "08:19" doesn't look like a chronological glitch when
    // it follows "16:28" from the previous day.
    let prevDateStr: string | null = null;
    for (let i = 0; i < visible.length; i += stride) {
      const candle = visible[i];
      const x = this.layoutEngine.getFootprintX(i, metrics) + fpW / 2;
      if (x < 0 || x > axisRight) continue;
      const d = new Date(candle.time * 1000);
      const dateStr = dateFmt.format(d);
      const dayChanged = prevDateStr !== null && dateStr !== prevDateStr;
      if (dayChanged) {
        // Vertical separator — drawn ABOVE the axis (the axis itself
        // has its own background). Subtle so it doesn't compete with
        // the grid.
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, axisY);
        ctx.stroke();
        ctx.restore();
      }
      const label =
        dayChanged || prevDateStr === null
          ? `${dateStr} ${fmt.format(d)}`
          : fmt.format(d);
      ctx.fillText(label, x, labelY);
      prevDateStr = dateStr;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private applySize(width: number, height: number): void {
    // Honour the DPR cap set in the constructor — re-reading
    // `window.devicePixelRatio` here would bypass it on every
    // resize and push 4-9× pixel work on high-DPI screens.
    const MAX_DPR = 1.5;
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.cssWidth = width;
    this.cssHeight = height;
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layoutEngine?.setContainerSize(width, height);
  }
}
