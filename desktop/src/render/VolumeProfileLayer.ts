import type Regl from "regl";
import type { GridSystem } from "../core";
import { VOLUME_PROFILE_WIDTH_PX } from "../core";
import type { Layer } from "./Layer";

// Histogramme volume cumulé sur la fenêtre courante, panel à droite du
// canvas (80 px). Barres horizontales partant du panel vers la gauche,
// longueur ∝ volume / volume_max. Couleur selon position vs POC + VA :
//   POC      → --level-poc (jaune saturé)
//   in VA    → --level-va  (violet)
//   hors VA  → --vp-neutral (gris froid)
//
// Canvas 2D sur le MÊME overlayCtx que KeyLevelsLayer. L'engine clear
// l'overlay une fois par frame avant les draws (cf. REFONTE-4c contrat
// `Layer.draw()`). Cette layer NE clear PAS.

export interface VolumeProfileData {
  volumes: Readonly<Float32Array>;
  pocIdx: number; // -1 si pas de POC
  valIdx: number; // -1 si pas de value area
  vahIdx: number;
}

const DEFAULT_POC_COLOR = "#fde047";
const DEFAULT_VA_COLOR = "#c084fc";
const DEFAULT_NEUTRAL_COLOR = "#5d6b7e";

const PADDING_LEFT = 2;
const PADDING_RIGHT = 4;

// Pure helper, exporté pour test unitaire. Classifie un bar selon sa
// position vs POC + value area. Stable, deterministe, no DOM.
export function classifyVolumeBar(
  priceIndex: number,
  pocIdx: number,
  valIdx: number,
  vahIdx: number,
): "poc" | "va" | "neutral" {
  if (priceIndex === pocIdx && pocIdx >= 0) return "poc";
  if (
    valIdx >= 0 &&
    vahIdx >= 0 &&
    priceIndex >= valIdx &&
    priceIndex <= vahIdx
  ) {
    return "va";
  }
  return "neutral";
}

function readCssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export class VolumeProfileLayer implements Layer<VolumeProfileData> {
  public dirty = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentGrid: GridSystem | null = null;
  private currentData: VolumeProfileData | null = null;
  private colorPoc = DEFAULT_POC_COLOR;
  private colorVa = DEFAULT_VA_COLOR;
  private colorNeutral = DEFAULT_NEUTRAL_COLOR;

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
  ): void {
    if (!overlayCtx) {
      throw new Error(
        "VolumeProfileLayer: requires overlayCtx (passez overlayCanvas à HeatmapEngineSpec)",
      );
    }
    this.ctx = overlayCtx;
    this.colorPoc = readCssColor("--level-poc", DEFAULT_POC_COLOR);
    this.colorVa = readCssColor("--level-va", DEFAULT_VA_COLOR);
    this.colorNeutral = readCssColor("--vp-neutral", DEFAULT_NEUTRAL_COLOR);
  }

  update(grid: GridSystem, data: VolumeProfileData): void {
    this.currentGrid = grid;
    this.currentData = data;
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = ctx.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;
    // PAS de clearRect : l'engine s'en charge (cf. REFONTE-4c).

    const data = this.currentData;
    if (!this.currentGrid || !data) return;
    const { volumes, pocIdx, valIdx, vahIdx } = data;
    if (volumes.length === 0) return;

    let max = 0;
    for (let i = 0; i < volumes.length; i++) {
      if (volumes[i] > max) max = volumes[i];
    }
    if (max <= 0) return;

    const panelLeft = canvas.width - VOLUME_PROFILE_WIDTH_PX;
    const maxBarLen = VOLUME_PROFILE_WIDTH_PX - PADDING_LEFT - PADDING_RIGHT;
    const barHeight = canvas.height / volumes.length;
    const barFillH = Math.max(1, barHeight - 0.5);

    for (let i = 0; i < volumes.length; i++) {
      const vol = volumes[i];
      if (vol <= 0) continue;
      const barLen = (vol / max) * maxBarLen;
      // priceIndex 0 = priceMin (bas du canvas), priceLevels-1 = priceMax (haut).
      const yTop = canvas.height - (i + 1) * barHeight;
      const klass = classifyVolumeBar(i, pocIdx, valIdx, vahIdx);
      ctx.fillStyle =
        klass === "poc"
          ? this.colorPoc
          : klass === "va"
            ? this.colorVa
            : this.colorNeutral;
      ctx.fillRect(panelLeft + PADDING_LEFT, yTop, barLen, barFillH);
    }
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op : recompute à update.
  }

  destroy(): void {
    this.ctx = null;
    this.currentGrid = null;
    this.currentData = null;
  }
}
