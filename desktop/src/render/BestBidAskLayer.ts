import type Regl from "regl";
import type { GridSystem } from "../core";
import type { BBOHistoryBuffer } from "../core";
import type { Layer } from "./Layer";
import type { RenderTransform } from "./RenderTransform";

// REFONTE-7/P3.5 Fix 3 — Best Bid / Best Ask en staircase Bookmap-style.
//
// Au lieu de 2 lignes horizontales au prix courant (= snapshot instantané,
// approche P2/P3), on dessine 2 traces qui suivent l'historique des best
// bid/ask sur l'axe temps. Chaque snap = un point ; on relie en staircase
// strict (segment horizontal entre snaps + segment vertical au tick) =
// convention Bookmap/ATAS, honnête (chaque pixel correspond à un snap réel).
//
// Always-dirty pour fluidité 60 Hz (la trace évolue continûment avec les
// nouveaux snaps + le pan).
//
// Coords via transform partagée (priceToY + timeToX), donc bouge avec pan.
// Lerp interpolation supprimée : la staircase montre la VRAIE chronologie,
// pas une moyenne mobile.

export type BestBidAskData = BBOHistoryBuffer | null;

const DEFAULT_BID_COLOR = "#00e676";
const DEFAULT_ASK_COLOR = "#ff3d71";
const LABEL_BG = "#141414";
const LINE_WIDTH = 2;
const HALO_BLUR = 4;
const LABEL_PADDING_X = 6;
const LABEL_HEIGHT = 18;
const LABEL_FONT =
  '12px "Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const LABEL_RIGHT_GAP = 4;
const LABEL_CACHE_MAX = 256;
const SCRATCH_CAPACITY = 50_000;

function readCssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function getCachedLabel(price: number, cache: Map<number, string>): string {
  const rounded = Math.round(price * 100) / 100;
  const cached = cache.get(rounded);
  if (cached !== undefined) return cached;
  if (cache.size >= LABEL_CACHE_MAX) cache.clear();
  const label = rounded.toFixed(2);
  cache.set(rounded, label);
  return label;
}

export class BestBidAskLayer implements Layer<BestBidAskData> {
  // Always-dirty : update appelé chaque frame (60 Hz).
  get dirty(): boolean {
    return true;
  }
  set dirty(_v: boolean) {
    void _v;
  }

  private ctx: CanvasRenderingContext2D | null = null;
  private transform: RenderTransform | null = null;
  private currentBuffer: BBOHistoryBuffer | null = null;
  private bidColor = DEFAULT_BID_COLOR;
  private askColor = DEFAULT_ASK_COLOR;
  // Scratch pré-alloué pour visibleEntries (zero-alloc per frame).
  private readonly scratch = new Float32Array(SCRATCH_CAPACITY * 3);
  // Cache labels par prix arrondi au cent.
  private readonly bidLabelCache = new Map<number, string>();
  private readonly askLabelCache = new Map<number, string>();

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
    transform?: RenderTransform,
  ): void {
    if (!overlayCtx) {
      throw new Error(
        "BestBidAskLayer: requires overlayCtx (passez overlayCanvas à HeatmapEngineSpec)",
      );
    }
    if (!transform) {
      throw new Error(
        "BestBidAskLayer: requires transform (REFONTE-7/P3 — passez via engine.addLayer)",
      );
    }
    this.ctx = overlayCtx;
    this.transform = transform;
    this.bidColor = readCssColor("--bid", DEFAULT_BID_COLOR);
    this.askColor = readCssColor("--ask", DEFAULT_ASK_COLOR);
  }

  update(_grid: GridSystem, data: BestBidAskData): void {
    this.currentBuffer = data;
  }

  draw(): void {
    const ctx = this.ctx;
    const tr = this.transform;
    const buffer = this.currentBuffer;
    if (!ctx || !tr || !buffer) return;
    if (tr.canvasWidth === 0 || tr.canvasHeight === 0) return;
    if (buffer.count() === 0) return;

    const lineEndX = tr.canvasWidth - tr.axisYWidthPx;
    const lineBottomY = tr.canvasHeight - tr.axisXHeightPx;
    const tMin = tr.getDisplayTimeMin();
    const tMax = tr.getDisplayTimeMax();

    const n = buffer.visibleEntries(tMin, tMax, this.scratch);
    if (n < 1) {
      // Aucun snap dans la fenêtre visible. Si on a des entries plus
      // récentes (au-delà de tMax), on ne dessine rien (l'utilisateur a
      // pan vers le futur — pas de data future, OK).
      this.drawLatestLabels(ctx, tr, buffer, lineEndX);
      return;
    }

    // === BID staircase ===
    this.drawStaircase(
      ctx,
      tr,
      n,
      1, // offset bid dans scratch [ts, bid, ask]
      this.bidColor,
      lineEndX,
      lineBottomY,
    );
    // === ASK staircase ===
    this.drawStaircase(
      ctx,
      tr,
      n,
      2, // offset ask
      this.askColor,
      lineEndX,
      lineBottomY,
    );

    // Reset shadow pour ne pas polluer les layers suivantes.
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // Labels prix au DERNIER snap (= prix courant le plus à droite visible).
    this.drawLatestLabels(ctx, tr, buffer, lineEndX);
  }

  private drawStaircase(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    n: number,
    fieldOffset: 1 | 2, // 1 = bid, 2 = ask
    color: string,
    lineEndX: number,
    lineBottomY: number,
  ): void {
    ctx.shadowColor = color;
    ctx.shadowBlur = HALO_BLUR;
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.beginPath();

    let prevY = 0;
    let started = false;
    for (let i = 0; i < n; i++) {
      const ts = this.scratch[i * 3];
      const price = this.scratch[i * 3 + fieldOffset];
      const x = tr.timeToX(ts);
      const y = tr.priceToY(price);
      // Clip horizontal au lineEndX (avant axe Y).
      const clippedX = Math.min(x, lineEndX);
      // Clip vertical à la zone heatmap (avant axe X).
      const clippedY = Math.max(0, Math.min(y, lineBottomY));
      if (!started) {
        ctx.moveTo(clippedX, clippedY);
        prevY = clippedY;
        started = true;
        continue;
      }
      // Staircase strict : horizontal au prix précédent jusqu'à x du nouveau
      // point, puis vertical au nouveau prix.
      ctx.lineTo(clippedX, prevY);
      ctx.lineTo(clippedX, clippedY);
      prevY = clippedY;
    }
    // Étendre la dernière marche jusqu'au bord droit visible (= prix courant
    // continue jusqu'à "now").
    const lastTs = this.scratch[(n - 1) * 3];
    const lastX = tr.timeToX(lastTs);
    if (started && lastX < lineEndX) {
      ctx.lineTo(lineEndX, prevY);
    }
    ctx.stroke();
  }

  private drawLatestLabels(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    buffer: BBOHistoryBuffer,
    lineEndX: number,
  ): void {
    const latest = buffer.latest();
    if (!latest) return;
    const yBid = tr.priceToY(latest.bestBid);
    const yAsk = tr.priceToY(latest.bestAsk);
    const lineBottomY = tr.canvasHeight - tr.axisXHeightPx;
    if (yBid >= 0 && yBid <= lineBottomY) {
      this.drawLabel(
        ctx,
        yBid,
        lineEndX,
        latest.bestBid,
        this.bidColor,
        this.bidLabelCache,
      );
    }
    if (yAsk >= 0 && yAsk <= lineBottomY) {
      this.drawLabel(
        ctx,
        yAsk,
        lineEndX,
        latest.bestAsk,
        this.askColor,
        this.askLabelCache,
      );
    }
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    y: number,
    lineEndX: number,
    price: number,
    color: string,
    cache: Map<number, string>,
  ): void {
    const yPx = Math.floor(y);
    const label = getCachedLabel(price, cache);
    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const metrics = ctx.measureText(label);
    const labelWidth = metrics.width + LABEL_PADDING_X * 2;
    const labelX = lineEndX - labelWidth - LABEL_RIGHT_GAP;
    if (labelX < 0) return;
    ctx.fillStyle = LABEL_BG;
    ctx.fillRect(labelX, yPx - LABEL_HEIGHT / 2, labelWidth, LABEL_HEIGHT);
    ctx.fillStyle = color;
    ctx.fillText(label, labelX + LABEL_PADDING_X, yPx);
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op : recompute à chaque draw via transform.
  }

  destroy(): void {
    this.ctx = null;
    this.transform = null;
    this.currentBuffer = null;
    this.bidLabelCache.clear();
    this.askLabelCache.clear();
  }
}
