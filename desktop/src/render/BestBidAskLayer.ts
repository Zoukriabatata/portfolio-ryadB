import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { RenderTransform } from "./RenderTransform";

// REFONTE-7/P2 — Best Bid / Best Ask lines (style Bookmap / ATAS).
//
// Canvas 2D overlay, z=12 (au-dessus heatmap+bubbles, sous crosshair z=15).
// 2 lignes horizontales 2 px aux couleurs marque (--bid #00e676 / --ask
// #ff3d71) traversant la zone heatmap, halo subtil (shadowBlur=4) et label
// prix collé à droite (juste avant la zone réservée à l'axe Y / panel
// VolumeProfile, 80 px).
//
// Lerp 0.2 entre snaps : interpolation de bidDisplayed → bidTarget à chaque
// frame pour fluidité (pas de saut quand le top-of-book bouge d'un tick).
// Au premier mount (Number.isNaN check), on init bidDisplayed = bidTarget
// pour éviter la ligne qui slide depuis 0.
//
// Always-dirty : la layer override `dirty` en getter/setter pour forcer
// update() à chaque frame, garantissant que les targets sont vus dès
// qu'un nouveau snap arrive (pas attendre le bucket advance).
//
// Coords : priceToY local (formule triviale `((priceMax - price) / range) *
// canvasHeight`). TODO P3 : migrer vers la matrice partagée unique quand
// elle existera (cf. spec §5.3).

export interface BestBidAskData {
  bestBid: number | null;
  bestAsk: number | null;
}

const DEFAULT_BID_COLOR = "#00e676";
const DEFAULT_ASK_COLOR = "#ff3d71";
const LABEL_BG = "#141414";
const LERP_FACTOR = 0.2;
const LINE_HEIGHT = 2;
const HALO_BLUR = 4;
const LABEL_PADDING_X = 6;
const LABEL_HEIGHT = 18;
const LABEL_FONT =
  '12px "Inter", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const LABEL_RIGHT_GAP = 4;
const LABEL_CACHE_MAX = 256;

// Pure helper, exporté pour test unitaire. Step de lerp linéaire.
// `displayed = NaN` (premier frame, pas encore initialisé) → snap direct
// au target pour éviter la ligne qui slide depuis 0.
// `target = NaN` (pas de bid/ask reçu) → garde displayed inchangé.
export function lerpStep(
  displayed: number,
  target: number,
  factor: number,
): number {
  if (Number.isNaN(target)) return displayed;
  if (Number.isNaN(displayed)) return target;
  return displayed + (target - displayed) * factor;
}

function readCssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export class BestBidAskLayer implements Layer<BestBidAskData> {
  // Always-dirty : override pour que l'engine appelle update() chaque frame.
  // Le set est no-op (l'engine reset à false après update, on l'ignore).
  get dirty(): boolean {
    return true;
  }
  set dirty(_v: boolean) {
    // no-op : on garde l'invariant always-dirty pour le lerp continu.
    void _v;
  }

  private ctx: CanvasRenderingContext2D | null = null;
  private currentGrid: GridSystem | null = null;
  // REFONTE-7/P3 — projection partagée (pan + viewport). Migré depuis la
  // formule locale de P2 (TODO P3 résolu).
  private transform: RenderTransform | null = null;
  private bidColor = DEFAULT_BID_COLOR;
  private askColor = DEFAULT_ASK_COLOR;

  private bidTarget = NaN;
  private askTarget = NaN;
  private bidDisplayed = NaN;
  private askDisplayed = NaN;

  // Cache labels par prix arrondi au tick (BTC = 2 décimales).
  // Évite l'allocation `toFixed` à chaque frame. Bornage à 256 entrées
  // (≈ 26 USD de range au tick 0.1 → suffisant pour la fenêtre live).
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

  update(grid: GridSystem, data: BestBidAskData): void {
    this.currentGrid = grid;
    if (data.bestBid != null && Number.isFinite(data.bestBid)) {
      this.bidTarget = data.bestBid;
    } else {
      // bid disparu (carnet vide) → on cesse l'interpolation, mais on
      // garde la dernière position affichée pour éviter un flash.
      this.bidTarget = NaN;
    }
    if (data.bestAsk != null && Number.isFinite(data.bestAsk)) {
      this.askTarget = data.bestAsk;
    } else {
      this.askTarget = NaN;
    }
  }

  draw(): void {
    const ctx = this.ctx;
    const tr = this.transform;
    if (!ctx || !tr) return;
    if (tr.canvasWidth === 0 || tr.canvasHeight === 0) return;
    const grid = this.currentGrid;
    if (!grid) return;

    // Lerp à chaque frame pour fluidité (60 FPS) indépendamment de la
    // cadence des snaps. Snap direct si premier frame (NaN check).
    this.bidDisplayed = lerpStep(this.bidDisplayed, this.bidTarget, LERP_FACTOR);
    this.askDisplayed = lerpStep(this.askDisplayed, this.askTarget, LERP_FACTOR);

    // REFONTE-7/P3 : projection via transform partagée (applique pan
    // courant). Plus de calcul local. Bornage visuel : on dessine même si
    // hors viewport (pan peut amener bid/ask hors zone) — c'est OutOfBuffer
    // qui décide de griser ou pas.
    const lineEndX = tr.canvasWidth - tr.axisYWidthPx;
    const lineBottomY = tr.canvasHeight - tr.axisXHeightPx;

    if (!Number.isNaN(this.bidDisplayed)) {
      const y = tr.priceToY(this.bidDisplayed);
      if (y >= 0 && y <= lineBottomY) {
        this.drawLineWithLabel(
          ctx,
          y,
          lineEndX,
          this.bidDisplayed,
          this.bidColor,
          this.bidLabelCache,
        );
      }
    }
    if (!Number.isNaN(this.askDisplayed)) {
      const y = tr.priceToY(this.askDisplayed);
      if (y >= 0 && y <= lineBottomY) {
        this.drawLineWithLabel(
          ctx,
          y,
          lineEndX,
          this.askDisplayed,
          this.askColor,
          this.askLabelCache,
        );
      }
    }

    // Reset shadow pour ne pas polluer les layers suivantes (CrosshairLayer).
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  private drawLineWithLabel(
    ctx: CanvasRenderingContext2D,
    y: number,
    lineEndX: number,
    price: number,
    color: string,
    cache: Map<number, string>,
  ): void {
    // Ligne 2 px avec halo. Math.floor + 0.5 pour pixel-perfect (cf. spec
    // §3.2 anti subpixel blur).
    const yPx = Math.floor(y);
    ctx.shadowColor = color;
    ctx.shadowBlur = HALO_BLUR;
    ctx.fillStyle = color;
    ctx.fillRect(0, yPx - LINE_HEIGHT / 2, lineEndX, LINE_HEIGHT);
    // Reset shadow avant le label (sinon le label hérite du halo, illisible).
    ctx.shadowBlur = 0;

    // Label : récupère depuis cache (zero-alloc string si déjà rendu).
    const label = getCachedLabel(price, cache);

    ctx.font = LABEL_FONT;
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(label);
    const labelWidth = metrics.width + LABEL_PADDING_X * 2;
    const labelX = lineEndX - labelWidth - LABEL_RIGHT_GAP;
    if (labelX < 0) return; // canvas trop étroit, label hors-écran : skip

    ctx.fillStyle = LABEL_BG;
    ctx.fillRect(labelX, yPx - LABEL_HEIGHT / 2, labelWidth, LABEL_HEIGHT);
    ctx.fillStyle = color;
    ctx.fillText(label, labelX + LABEL_PADDING_X, yPx);
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op : recompute à chaque draw (priceToY dépend du grid courant
    // déjà mémorisé via update). Pas de buffer à réallouer.
  }

  destroy(): void {
    this.ctx = null;
    this.currentGrid = null;
    this.transform = null;
    this.bidLabelCache.clear();
    this.askLabelCache.clear();
  }
}

// Cache labels prix arrondi au cent (suffisant pour BTC tick 0.1, et
// label utilisateur en best-of-book ne demande pas plus que 2 décimales).
// Bornage à 256 entrées : suffisant pour ~26 USD de range autour du mid
// avant éviction. Évite la fuite mémoire si BTC drift de 1000 USD pendant
// la session.
function getCachedLabel(price: number, cache: Map<number, string>): string {
  const rounded = Math.round(price * 100) / 100;
  const cached = cache.get(rounded);
  if (cached !== undefined) return cached;
  if (cache.size >= LABEL_CACHE_MAX) cache.clear();
  const label = rounded.toFixed(2);
  cache.set(rounded, label);
  return label;
}
