import type Regl from "regl";
import type { GridSystem } from "../core";
import type { CrosshairData } from "./HeatmapEngine";
import type { Layer } from "./Layer";

// Crosshair tooltip (REFONTE-5). Canvas 2D sur l'overlay existant, z=15
// entre KeyLevels (z=10) et VolumeProfile (z=20). Lignes verticale +
// horizontale fines + tooltip box rectangulaire avec 4 lignes.
//
// Mousemove → engine.setCrosshair(x, y) → getCrosshairData() au tick
// suivant compute le lookup. Throttle natural via rAF (60 FPS = 16 ms
// latency = imperceptible).
//
// PAS de clearRect (l'engine clear l'overlay une fois par frame, contrat
// REFONTE-4c).

const TOOLTIP_W = 180;
const LINE_H = 18;
const LINES = 4;
const TOOLTIP_H = LINE_H * LINES + 12;

const DEFAULT_LINE_COLOR = "rgba(255, 255, 255, 0.3)";
const DEFAULT_TEXT_COLOR = "#e8eaf6";

function readCssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function formatTime(ms: number): string {
  // HH:MM:SS UTC. Constructeur Date avec ms explicite (pas Date.now()).
  const d = new Date(ms);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export class CrosshairLayer implements Layer<CrosshairData> {
  public dirty = false;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentData: CrosshairData | null = null;
  private colorLine = DEFAULT_LINE_COLOR;
  private colorText = DEFAULT_TEXT_COLOR;

  init(
    _regl: Regl.Regl,
    _grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
  ): void {
    if (!overlayCtx) {
      throw new Error("CrosshairLayer: requires overlayCtx");
    }
    this.ctx = overlayCtx;
    // Lecture CSS vars une fois à init (pas à chaque draw).
    this.colorText = readCssColor("--text-primary", DEFAULT_TEXT_COLOR);
    // Pas de var dédiée pour la ligne crosshair, on garde le default.
  }

  update(_grid: GridSystem, data: CrosshairData): void {
    this.currentData = data;
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const data = this.currentData;
    if (!data || !data.pos) return; // mouseleave → no-op
    const canvas = ctx.canvas;
    if (canvas.width === 0 || canvas.height === 0) return;

    const { x, y } = data.pos;

    // Lignes verticale + horizontale fines (1 px, alpha 30 %).
    ctx.fillStyle = this.colorLine;
    ctx.fillRect(Math.floor(x) - 0.5, 0, 1, canvas.height);
    ctx.fillRect(0, Math.floor(y) - 0.5, canvas.width, 1);

    // Tooltip box (uniquement si lookup disponible).
    if (!data.lookup) return;
    const lines = [
      `Price : ${data.lookup.price.toFixed(2)}`,
      `Time  : ${formatTime(data.lookup.timestampMs)}`,
      `Liq   : ${(data.lookup.liquidityIntensity * 100).toFixed(1)} %`,
      `Vol   : ${data.lookup.volume.toFixed(3)}`,
    ];

    // Position tooltip décalée 12 px haut-droite curseur.
    let tx = x + 12;
    let ty = y - TOOLTIP_H - 8;
    // Flip si trop proche du bord.
    if (tx + TOOLTIP_W > canvas.width) tx = x - TOOLTIP_W - 12;
    if (ty < 0) ty = y + 12;
    if (tx < 0) tx = 0;
    if (ty + TOOLTIP_H > canvas.height) ty = canvas.height - TOOLTIP_H;

    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(tx, ty, TOOLTIP_W, TOOLTIP_H);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.strokeRect(tx + 0.5, ty + 0.5, TOOLTIP_W - 1, TOOLTIP_H - 1);

    ctx.font =
      '12px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = "top";
    ctx.fillStyle = this.colorText;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], tx + 8, ty + 8 + i * LINE_H);
    }
  }

  onViewportChange(_grid: GridSystem): void {
    // No-op : recompute à chaque draw.
  }

  destroy(): void {
    this.ctx = null;
    this.currentData = null;
  }
}
