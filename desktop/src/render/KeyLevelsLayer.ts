import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { RenderTransform } from "./RenderTransform";

// 4 lignes horizontales (POC / VAH / VAL / VWAP) rendered en canvas 2D
// overlay (PAS regl). Trivial à dessiner, font monospace native, texte
// tabular, performance non-critique (4 lignes + 4 labels à 60 FPS).
//
// Z-index DOM responsabilité du caller (HeatmapLive) : overlay canvas
// au-dessus du canvas regl, pointer-events: none pour laisser passer
// wheel/drag au regl du dessous.

export interface KeyLevelsData {
  poc: number | null;
  vah: number | null;
  val: number | null;
  vwap: number | null;
}

// REFONTE-7/P1 : palette Senzoukria (vert/blanc).
// Variantes nuancées pour distinguer POC (vert plein) / VAH/VAL
// (vert dim) / VWAP (blanc) sans introduire de couleur hors brand.
const DEFAULT_POC_COLOR = "#00e676";
const DEFAULT_VA_COLOR = "#1f4d2e";
const DEFAULT_VWAP_COLOR = "#ffffff";

function readCssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export class KeyLevelsLayer implements Layer<KeyLevelsData> {
  public dirty = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentData: KeyLevelsData | null = null;
  // REFONTE-7/P3 — projection partagée (applique pan + viewport courant).
  private transform: RenderTransform | null = null;
  private colorPoc = DEFAULT_POC_COLOR;
  private colorVa = DEFAULT_VA_COLOR;
  private colorVwap = DEFAULT_VWAP_COLOR;

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
    transform?: RenderTransform,
  ): void {
    if (!overlayCtx) {
      throw new Error(
        "KeyLevelsLayer: requires overlayCtx (passez overlayCanvas à HeatmapEngineSpec)",
      );
    }
    if (!transform) {
      throw new Error(
        "KeyLevelsLayer: requires transform (REFONTE-7/P3 — passez via engine.addLayer)",
      );
    }
    this.ctx = overlayCtx;
    this.transform = transform;
    this.colorPoc = readCssColor("--level-poc", DEFAULT_POC_COLOR);
    this.colorVa = readCssColor("--level-va", DEFAULT_VA_COLOR);
    this.colorVwap = readCssColor("--level-vwap", DEFAULT_VWAP_COLOR);
  }

  update(_grid: GridSystem, data: KeyLevelsData): void {
    // REFONTE-7/P3 : grid n'est plus utilisé dans draw (la projection passe
    // par transform.priceToY qui lit le viewport courant de l'engine).
    this.currentData = data;
  }

  draw(): void {
    const ctx = this.ctx;
    const tr = this.transform;
    if (!ctx || !tr) return;
    if (tr.canvasWidth === 0 || tr.canvasHeight === 0) return;
    // REFONTE-4c : pas de clearRect ici. L'engine clear l'overlay une fois
    // par frame avant les draws des overlay layers.

    const data = this.currentData;
    if (!data) return;

    // REFONTE-7/P3 : tronquage à l'AxesLayer Y (= 80 px à droite par
    // default). Bornage vertical à la zone heatmap (= height - axisXHeightPx).
    const lineEndX = tr.canvasWidth - tr.axisYWidthPx;
    const lineBottomY = tr.canvasHeight - tr.axisXHeightPx;

    const drawLine = (
      price: number | null,
      color: string,
      label: string,
    ): void => {
      if (price == null || !Number.isFinite(price)) return;
      // REFONTE-7/P3 : utilise transform.priceToY (applique pan).
      const y = tr.priceToY(price);
      if (y < 0 || y > lineBottomY) return;
      // Ligne pleine, tronquée au bord du panel droit.
      ctx.fillStyle = color;
      ctx.fillRect(0, Math.floor(y) - 0.5, lineEndX, 1);
      // REFONTE-4c : label right-aligned juste à gauche du panel
      // (convention pro Bookmap/ATAS).
      const labelText = `${label} ${price.toFixed(2)}`;
      ctx.font =
        '13px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = "bottom";
      const metrics = ctx.measureText(labelText);
      const labelX = lineEndX - metrics.width - 8;
      // REFONTE-7/P1 : background label aligné sur --bg-surface.
      ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
      ctx.fillRect(labelX - 4, y - 18, metrics.width + 8, 18);
      ctx.fillStyle = color;
      ctx.fillText(labelText, labelX, y - 4);
    };

    drawLine(data.poc, this.colorPoc, "POC");
    drawLine(data.vah, this.colorVa, "VAH");
    drawLine(data.val, this.colorVa, "VAL");
    drawLine(data.vwap, this.colorVwap, "VWAP");
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op : draw recompute prix → Y avec le grid courant passé à update.
  }

  destroy(): void {
    if (this.ctx) {
      try {
        const c = this.ctx.canvas;
        this.ctx.clearRect(0, 0, c.width, c.height);
      } catch {
        // canvas peut avoir été détaché du DOM avant destroy
      }
    }
    this.ctx = null;
    this.currentData = null;
    this.transform = null;
  }
}
