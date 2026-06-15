import type Regl from "regl";
import type { GridSystem } from "../core";
import type { BBOHistoryBuffer } from "../core";
import type { Layer } from "./Layer";
import type { RenderTransform } from "./RenderTransform";

// REFONTE-7/P3.5.1 Fix 3 (Option C) — Best Bid / Best Ask en hybride :
//
// 3 couches visuelles superposées :
//  1. STAIRCASE BACKGROUND : trace 1 px opacity 0.5 sur tout l'historique
//     visible (= contexte long-terme).
//  2. LIVE TRAIL : 10 derniers segments staircase 1.5 px avec alpha
//     dégressive (oldest 0.5 → newest 1.0). Donne le mouvement vivant.
//  3. LIVE DOT : disque 4 px proéminent au prix courant (dernier snap).
//     Tracker visible qui suit le mouvement frame par frame.
//
// Lignes NETTES — pas de halo (shadowBlur=0). Le user a clarifié : la
// visibilité passe par le dot proéminent + trail dynamique, pas un glow.
//
// Labels prix : 2 emplacements
//  - Sur le dot courant (au-dessus, fond sombre) — voir le prix au tracker
//  - À droite avant l'axe Y (background label) — référence statique

export type BestBidAskData = BBOHistoryBuffer | null;

const DEFAULT_BID_COLOR = "#00e676";
const DEFAULT_ASK_COLOR = "#ff3d71";
const LABEL_BG = "#141414";
const DOT_RADIUS = 4;
const LABEL_PADDING_X = 6;
const LABEL_HEIGHT = 18;
const LABEL_FONT =
  '12px "Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const LABEL_RIGHT_GAP = 4;
const LABEL_DOT_GAP = 8;
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

// Pure helper exporté pour tests : parse "#rrggbb" → {r, g, b} ∈ [0, 255].
export function parseHexRGB(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 6) {
    return { r: 0, g: 230, b: 118 }; // fallback brand-green
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: 0, g: 230, b: 118 };
  }
  return { r, g, b };
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
  private readonly scratch = new Float32Array(SCRATCH_CAPACITY * 3);
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

    // Pas de halo (lignes nettes).
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // The user asked to remove the pink/green best bid/ask STAIRCASE lines
    // (they cluttered the heatmap). We keep only a discreet marker of the
    // current bid/ask: the live dot + the price labels. No trail, no
    // full-history staircase.
    void n;

    // LIVE DOT — discreet marker at the current bid/ask.
    this.drawLiveDot(ctx, tr, buffer, lineEndX, lineBottomY);

    // Labels (dot + right edge).
    this.drawLatestLabels(ctx, tr, buffer, lineEndX, lineBottomY);
  }

  // Dot proéminent au prix courant. Disque 4 px aux couleurs marque,
  // alpha 1.0. C'est le tracker que l'œil suit.
  private drawLiveDot(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    buffer: BBOHistoryBuffer,
    lineEndX: number,
    lineBottomY: number,
  ): void {
    const latest = buffer.latest();
    if (!latest) return;
    const x = Math.min(tr.timeToX(latest.exchangeMs), lineEndX);
    const yBid = tr.priceToY(latest.bestBid);
    const yAsk = tr.priceToY(latest.bestAsk);
    if (yBid >= 0 && yBid <= lineBottomY) {
      ctx.fillStyle = this.bidColor;
      ctx.beginPath();
      ctx.arc(x, yBid, DOT_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (yAsk >= 0 && yAsk <= lineBottomY) {
      ctx.fillStyle = this.askColor;
      ctx.beginPath();
      ctx.arc(x, yAsk, DOT_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  private drawLatestLabels(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    buffer: BBOHistoryBuffer,
    lineEndX: number,
    lineBottomY: number,
  ): void {
    const latest = buffer.latest();
    if (!latest) return;
    const xDot = Math.min(tr.timeToX(latest.exchangeMs), lineEndX);
    const yBid = tr.priceToY(latest.bestBid);
    const yAsk = tr.priceToY(latest.bestAsk);
    // Label collé au dot courant (à gauche du dot, fond sombre).
    if (yBid >= 0 && yBid <= lineBottomY) {
      this.drawDotLabel(
        ctx,
        xDot,
        yBid,
        latest.bestBid,
        this.bidColor,
        this.bidLabelCache,
      );
      // Label de référence à droite avant l'axe Y.
      this.drawRightLabel(
        ctx,
        yBid,
        lineEndX,
        latest.bestBid,
        this.bidColor,
        this.bidLabelCache,
      );
    }
    if (yAsk >= 0 && yAsk <= lineBottomY) {
      this.drawDotLabel(
        ctx,
        xDot,
        yAsk,
        latest.bestAsk,
        this.askColor,
        this.askLabelCache,
      );
      this.drawRightLabel(
        ctx,
        yAsk,
        lineEndX,
        latest.bestAsk,
        this.askColor,
        this.askLabelCache,
      );
    }
  }

  // Label collé au dot courant. À droite du dot par défaut, flip à gauche
  // si trop proche du bord (lineEndX).
  private drawDotLabel(
    ctx: CanvasRenderingContext2D,
    xDot: number,
    y: number,
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
    let labelX = xDot + DOT_RADIUS + LABEL_DOT_GAP;
    // Si pas la place à droite, flip à gauche du dot.
    if (labelX + labelWidth > ctx.canvas.width) {
      labelX = xDot - DOT_RADIUS - LABEL_DOT_GAP - labelWidth;
    }
    if (labelX < 0) return;
    ctx.fillStyle = LABEL_BG;
    ctx.fillRect(labelX, yPx - LABEL_HEIGHT / 2, labelWidth, LABEL_HEIGHT);
    ctx.fillStyle = color;
    ctx.fillText(label, labelX + LABEL_PADDING_X, yPx);
  }

  // Label de référence statique à droite avant l'axe Y.
  private drawRightLabel(
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
