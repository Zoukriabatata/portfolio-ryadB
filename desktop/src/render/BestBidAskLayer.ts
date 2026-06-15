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
const STAIRCASE_BG_LINE = 1;
// Crisp, clearly-readable best bid/ask staircase (was 0.5 — read as a faint
// horizontal smear when the market was flat; the user wanted the line itself
// visible, not ghosted).
const STAIRCASE_BG_ALPHA = 0.85;
const TRAIL_LINE = 1.5;
const TRAIL_LENGTH = 12;
const TRAIL_ALPHA_MIN = 0.45;
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
  private bidRGB = { r: 0, g: 230, b: 118 };
  private askRGB = { r: 255, g: 61, b: 113 };
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
    this.bidRGB = parseHexRGB(this.bidColor);
    this.askRGB = parseHexRGB(this.askColor);
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

    if (n >= 2) {
      // 1. STAIRCASE BACKGROUND — historique long-terme, opacity 0.5.
      const trailStart = Math.max(0, n - TRAIL_LENGTH);
      this.drawStaircaseBackground(
        ctx,
        tr,
        0,
        trailStart, // jusqu'au début du trail (le trail draw le reste avec alpha)
        1,
        this.bidRGB,
        lineEndX,
        lineBottomY,
      );
      this.drawStaircaseBackground(
        ctx,
        tr,
        0,
        trailStart,
        2,
        this.askRGB,
        lineEndX,
        lineBottomY,
      );
      // 2. LIVE TRAIL — derniers TRAIL_LENGTH points, alpha dégressive.
      this.drawLiveTrail(
        ctx,
        tr,
        trailStart,
        n,
        1,
        this.bidRGB,
        lineEndX,
        lineBottomY,
      );
      this.drawLiveTrail(
        ctx,
        tr,
        trailStart,
        n,
        2,
        this.askRGB,
        lineEndX,
        lineBottomY,
      );
    }

    // 3. LIVE DOT — proéminent au prix courant.
    this.drawLiveDot(ctx, tr, buffer, lineEndX, lineBottomY);

    // Labels (dot + droite).
    this.drawLatestLabels(ctx, tr, buffer, lineEndX, lineBottomY);
  }

  // Background staircase : trace 1 px opacity 0.5 sur les n-trail premiers
  // snaps. Une seule stroke = perf OK.
  private drawStaircaseBackground(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    start: number,
    end: number,
    fieldOffset: 1 | 2,
    rgb: { r: number; g: number; b: number },
    lineEndX: number,
    lineBottomY: number,
  ): void {
    if (end - start < 2) return;
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${STAIRCASE_BG_ALPHA})`;
    ctx.lineWidth = STAIRCASE_BG_LINE;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.beginPath();
    let prevY = 0;
    let started = false;
    for (let i = start; i < end; i++) {
      const ts = this.scratch[i * 3];
      const price = this.scratch[i * 3 + fieldOffset];
      const x = Math.min(tr.timeToX(ts), lineEndX);
      const y = Math.max(0, Math.min(tr.priceToY(price), lineBottomY));
      if (!started) {
        ctx.moveTo(x, y);
        prevY = y;
        started = true;
        continue;
      }
      ctx.lineTo(x, prevY);
      ctx.lineTo(x, y);
      prevY = y;
    }
    ctx.stroke();
  }

  // Trail live : derniers TRAIL_LENGTH points, alpha dégressive du plus
  // ancien au plus récent. Une stroke par segment (12 segments max =
  // négligeable, allure dynamique).
  private drawLiveTrail(
    ctx: CanvasRenderingContext2D,
    tr: RenderTransform,
    start: number,
    end: number,
    fieldOffset: 1 | 2,
    rgb: { r: number; g: number; b: number },
    lineEndX: number,
    lineBottomY: number,
  ): void {
    if (end - start < 2) return;
    ctx.lineWidth = TRAIL_LINE;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    const span = end - 1 - start;
    if (span <= 0) return;
    for (let i = start; i < end - 1; i++) {
      const ts0 = this.scratch[i * 3];
      const p0 = this.scratch[i * 3 + fieldOffset];
      const ts1 = this.scratch[(i + 1) * 3];
      const p1 = this.scratch[(i + 1) * 3 + fieldOffset];
      const x0 = Math.min(tr.timeToX(ts0), lineEndX);
      const y0 = Math.max(0, Math.min(tr.priceToY(p0), lineBottomY));
      const x1 = Math.min(tr.timeToX(ts1), lineEndX);
      const y1 = Math.max(0, Math.min(tr.priceToY(p1), lineBottomY));
      // Alpha dégressive : oldest = TRAIL_ALPHA_MIN, newest = 1.0
      const t = (i - start) / span;
      const alpha = TRAIL_ALPHA_MIN + t * (1 - TRAIL_ALPHA_MIN);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0); // staircase horizontal
      ctx.lineTo(x1, y1); // staircase vertical
      ctx.stroke();
    }
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
