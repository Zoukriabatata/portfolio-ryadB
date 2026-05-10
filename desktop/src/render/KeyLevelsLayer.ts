import type Regl from "regl";
import type { GridSystem } from "../core";
import { VOLUME_PROFILE_WIDTH_PX } from "../core";
import type { Layer } from "./Layer";

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

const DEFAULT_POC_COLOR = "#fde047";
const DEFAULT_VA_COLOR = "#c084fc";
const DEFAULT_VWAP_COLOR = "#60a5fa";

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
  private currentGrid: GridSystem | null = null;
  private currentData: KeyLevelsData | null = null;
  private colorPoc = DEFAULT_POC_COLOR;
  private colorVa = DEFAULT_VA_COLOR;
  private colorVwap = DEFAULT_VWAP_COLOR;

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
  ): void {
    if (!overlayCtx) {
      throw new Error(
        "KeyLevelsLayer: requires overlayCtx (passez overlayCanvas à HeatmapEngineSpec)",
      );
    }
    this.ctx = overlayCtx;
    this.colorPoc = readCssColor("--level-poc", DEFAULT_POC_COLOR);
    this.colorVa = readCssColor("--level-va", DEFAULT_VA_COLOR);
    this.colorVwap = readCssColor("--level-vwap", DEFAULT_VWAP_COLOR);
  }

  update(grid: GridSystem, data: KeyLevelsData): void {
    this.currentGrid = grid;
    this.currentData = data;
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = ctx.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    // REFONTE-4c : pas de clearRect ici. L'engine clear l'overlay une fois
    // par frame avant les draws des overlay layers.

    const grid = this.currentGrid;
    const data = this.currentData;
    if (!grid || !data) return;

    const range = grid.priceMax - grid.priceMin;
    if (range <= 0) return;

    // REFONTE-4c : tronquage des lignes au panel VolumeProfile (à droite).
    const lineEndX = canvas.width - VOLUME_PROFILE_WIDTH_PX;

    const drawLine = (
      price: number | null,
      color: string,
      label: string,
    ): void => {
      if (price == null || !Number.isFinite(price)) return;
      if (price < grid.priceMin || price > grid.priceMax) return;
      const y = ((grid.priceMax - price) / range) * canvas.height;
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
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
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
    this.currentGrid = null;
    this.currentData = null;
  }
}
