import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { RenderTransform } from "./RenderTransform";

// REFONTE-7/P3 — AxesLayer : bandeau Y droite (prix) + bandeau X bas (temps).
//
// Canvas 2D overlay z=25 (au-dessus de tout : heatmap, bulles, key levels,
// crosshair, volume profile). Fonds opaques --bg-axis (#0f0f0f) qui MASQUENT
// le VolumeProfileLayer (acceptable — P5 toggle settings pour récupérer le
// VolumeProfile si demandé).
//
// Graduations adaptatives :
//  - Y (prix) : step ∈ {1, 2, 5} × 10^k pour ~8 graduations dans le range.
//  - X (temps) : steps standards {1s, 5s, 15s, 30s, 1m, 5m, 15m, 1h} pour ~6.
//
// Coords via transform.priceToY / transform.timeToX (applique pan).

const AXIS_BG = "#0f0f0f";
const AXIS_BORDER = "#1f1f1f";
const TICK_LINE = "#1f1f1f";
const TEXT_COLOR = "#9ca3af";
const TEXT_FONT =
  '11px "Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

const Y_TICK_TARGET = 8;
const X_TICK_TARGET = 6;

// Pure helpers exportés pour tests.
export function computePriceTickStep(range: number, target: number): number {
  if (range <= 0) return 1;
  const ideal = range / target;
  const exponent = Math.floor(Math.log10(ideal));
  const base = Math.pow(10, exponent);
  const fraction = ideal / base;
  let mantissa = 1;
  if (fraction >= 7.5) mantissa = 10;
  else if (fraction >= 3.5) mantissa = 5;
  else if (fraction >= 1.5) mantissa = 2;
  return mantissa * base;
}

const TIME_STEPS_MS = [
  1_000, 5_000, 15_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000,
];

export function computeTimeTickStep(rangeMs: number, target: number): number {
  if (rangeMs <= 0) return 1_000;
  const ideal = rangeMs / target;
  for (const s of TIME_STEPS_MS) {
    if (s >= ideal) return s;
  }
  return TIME_STEPS_MS[TIME_STEPS_MS.length - 1];
}

function formatTimeUTC(ms: number): string {
  const d = new Date(ms);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export class AxesLayer implements Layer<undefined> {
  public dirty = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private transform: RenderTransform | null = null;

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
    transform?: RenderTransform,
  ): void {
    if (!overlayCtx) {
      throw new Error("AxesLayer: requires overlayCtx");
    }
    if (!transform) {
      throw new Error("AxesLayer: requires transform (REFONTE-7/P3)");
    }
    this.ctx = overlayCtx;
    this.transform = transform;
  }

  update(_grid: GridSystem, _data: undefined): void {
    // No-op : draw lit transform à chaque frame.
  }

  draw(): void {
    const ctx = this.ctx;
    const tr = this.transform;
    if (!ctx || !tr) return;
    const W = tr.canvasWidth;
    const H = tr.canvasHeight;
    if (W === 0 || H === 0) return;
    const axisW = tr.axisYWidthPx;
    const axisH = tr.axisXHeightPx;

    // Bandeau Y (droite) — fond opaque.
    ctx.fillStyle = AXIS_BG;
    ctx.fillRect(W - axisW, 0, axisW, H);
    // Bandeau X (bas) — fond opaque (chevauche bandeau Y dans le coin).
    ctx.fillRect(0, H - axisH, W, axisH);
    // Bordures internes (séparation visuelle avec la zone heatmap).
    ctx.fillStyle = AXIS_BORDER;
    ctx.fillRect(W - axisW, 0, 1, H);
    ctx.fillRect(0, H - axisH, W, 1);

    // === Graduations Y (prix) ===
    const priceMin = tr.yToPrice(H - axisH); // bottom of heatmap zone
    const priceMax = tr.yToPrice(0); // top of heatmap zone
    const priceRange = priceMax - priceMin;
    if (priceRange > 0) {
      const step = computePriceTickStep(priceRange, Y_TICK_TARGET);
      const firstTick = Math.ceil(priceMin / step) * step;
      ctx.font = TEXT_FONT;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const textX = W - axisW + 8;
      for (let p = firstTick; p <= priceMax; p += step) {
        const y = tr.priceToY(p);
        if (y < 0 || y > H - axisH) continue;
        // Tick mark
        ctx.fillStyle = TICK_LINE;
        ctx.fillRect(W - axisW, Math.floor(y), 4, 1);
        // Label
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(p.toFixed(2), textX, y);
      }
    }

    // === Graduations X (temps) ===
    const timeMin = tr.xToTime(0);
    const timeMax = tr.xToTime(W - axisW);
    const timeRange = timeMax - timeMin;
    if (timeRange > 0) {
      const step = computeTimeTickStep(timeRange, X_TICK_TARGET);
      const firstTick = Math.ceil(timeMin / step) * step;
      ctx.font = TEXT_FONT;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      const textY = H - axisH + 8;
      for (let t = firstTick; t <= timeMax; t += step) {
        const x = tr.timeToX(t);
        if (x < 0 || x > W - axisW) continue;
        ctx.fillStyle = TICK_LINE;
        ctx.fillRect(Math.floor(x), H - axisH, 1, 4);
        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(formatTimeUTC(t), x, textY);
      }
    }
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op.
  }

  destroy(): void {
    this.ctx = null;
    this.transform = null;
  }
}
