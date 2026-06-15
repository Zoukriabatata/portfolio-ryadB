// REFONTE-7/P3 — ViewportController nav 360°.
//
// Architecture (Option C) :
//  - PAN (drag) = matrice display non-destructive. Modifie engine.setPan(x,y),
//    pas le viewport. Les bulles + heatmap + best bid/ask + key levels +
//    crosshair se déplacent ENSEMBLE via les helpers transform / uniform uPan.
//    Au mouseup, COMMIT : recentrer le viewport sur la position visible
//    courante + setViewport + resetPan(). Le re-bin déclenché est imperceptible
//    (la zone visible reste pile au même endroit pixel-near).
//  - ZOOM (wheel) = destructif. Modifie viewport directement, cursor-anchored.
//    Re-bin immediate via setViewport. Smear acceptable (action ponctuelle).
//  - MIDDLE button = reset matrice + recentrer viewport sur best bid/ask.
//  - SPACE (canvas focus) = toggle follow.
//  - Drag sur AxesLayer (bandeau Y / X) = zoom axe correspondant.
//
// Pas de Date.now/performance.now (event-driven ou tick-driven via setInterval
// externe). Localisation `src/dev/` = hors scope ESLint refonte mais on
// respecte la convention.

import type { HeatmapEngine } from "../render/HeatmapEngine";

export interface ViewportControllerOptions {
  canvas: HTMLCanvasElement;
  initialPriceMin: number;
  initialPriceMax: number;
  tickSize: number;
  // REFONTE-7/P3 : engine pour push pan + setViewport au commit. Remplace
  // le ancien onViewportChange (qui restait callback-based).
  engine: HeatmapEngine;
  getCurrentPrice: () => number | null;
}

const ZOOM_FACTOR = 1.1;
const ZOOM_FACTOR_INV = 1 / ZOOM_FACTOR;
// Re-centre once price drifts past 10% of the visible range from centre
// (was 25% — the view followed too loosely / felt desynced from price).
const DEADBAND_RATIO = 0.1;
const MIN_RANGE_TICKS = 20;
const MIN_TIME_RANGE_MS = 5_000; // 5 sec min sur l'axe X

// Pure helper exporté pour test : zoom cursor-anchored sur un range 1D.
// Garantit que la valeur sous le curseur (= cursorWorld) reste à la même
// position curseur après zoom. factor > 1 = zoom out (range élargi),
// factor < 1 = zoom in.
export function zoomRangeAroundCursor(
  rangeMin: number,
  rangeMax: number,
  cursorWorld: number,
  factor: number,
): { min: number; max: number } {
  const newMin = cursorWorld - (cursorWorld - rangeMin) * factor;
  const newMax = cursorWorld + (rangeMax - cursorWorld) * factor;
  return { min: newMin, max: newMax };
}

// Pure helper : convert pixel Y → price avec viewport + pan + canvasH.
// Equivalent de RenderTransform.yToPrice mais pure (testable sans engine).
export function pixelYToPrice(
  y: number,
  panY: number,
  canvasH: number,
  priceMin: number,
  priceMax: number,
): number {
  if (canvasH <= 0) return priceMax;
  const range = priceMax - priceMin;
  return priceMax - ((y - panY) / canvasH) * range;
}

// Modes de drag, déterminés au mousedown selon la zone du curseur :
//  - pan : zone heatmap, déplace matrice X+Y
//  - zoom-y : bandeau Y droite, drag vertical zoom Y (modifie viewport directement)
//  - zoom-x : bandeau X bas, drag horizontal zoom X
//  - none : pas en drag
type DragMode = "none" | "pan" | "zoom-y" | "zoom-x";

const AXIS_DRAG_SENSITIVITY = 0.005; // dy 200px → zoom factor ~e^1 = 2.7×

export class ViewportController {
  private readonly canvas: HTMLCanvasElement;
  private readonly engine: HeatmapEngine;
  private priceMin: number;
  private priceMax: number;
  private readonly initialPriceMin: number;
  private readonly initialPriceMax: number;
  private readonly tickSize: number;
  private readonly getCurrentPrice: () => number | null;
  private autoFollow = true;
  // Drag state.
  private dragMode: DragMode = "none";
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;
  private dragStartPriceMin = 0;
  private dragStartPriceMax = 0;
  private dragStartTimeMin = 0;
  private dragStartTimeMax = 0;

  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseUp: () => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onDblClick: (e: MouseEvent) => void;

  constructor(opts: ViewportControllerOptions) {
    this.canvas = opts.canvas;
    this.engine = opts.engine;
    this.priceMin = opts.initialPriceMin;
    this.priceMax = opts.initialPriceMax;
    this.initialPriceMin = opts.initialPriceMin;
    this.initialPriceMax = opts.initialPriceMax;
    this.tickSize = opts.tickSize;
    this.getCurrentPrice = opts.getCurrentPrice;

    // ============================================================
    // WHEEL — zoom destructif cursor-anchored (modifie viewport).
    // Shift = Y only, Ctrl = X only, sinon X+Y combiné.
    // ============================================================
    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Auto-follow stays locked ON — zoom adjusts the range, follow keeps it
      // centred on price. (Previously a wheel event unlocked the view.)
      const factor = e.deltaY > 0 ? ZOOM_FACTOR : ZOOM_FACTOR_INV;
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const mxBuffer = (e.clientX - rect.left) * dpr;
      const myBuffer = (e.clientY - rect.top) * dpr;

      // Y axis (price) : zoom si pas Ctrl.
      if (!e.ctrlKey) {
        const cursorPrice = this.engine.yToPrice(myBuffer);
        const z = zoomRangeAroundCursor(
          this.priceMin,
          this.priceMax,
          cursorPrice,
          factor,
        );
        // Min range floor.
        const minRange = this.tickSize * MIN_RANGE_TICKS;
        if (z.max - z.min >= minRange) {
          this.priceMin = z.min;
          this.priceMax = z.max;
        }
      }

      // X axis (time) : zoom si pas Shift.
      if (!e.shiftKey) {
        const cursorTime = this.engine.xToTime(mxBuffer);
        // Récupère le viewport temporel actuel via les bornes effectives.
        // (engine.timeToX(t) inverse : t à mxBuffer = cursorTime).
        // On récupère timeMin/Max via deux appels xToTime aux bords.
        const tMinNow = this.engine.xToTime(0);
        const tMaxNow = this.engine.xToTime(this.engine.canvasWidth);
        const z = zoomRangeAroundCursor(tMinNow, tMaxNow, cursorTime, factor);
        const newRange = z.max - z.min;
        if (newRange >= MIN_TIME_RANGE_MS) {
          this.commitViewport({
            timeMin: z.min,
            timeMax: z.max,
          });
          // commitViewport applique setViewport directement, pas besoin d'à
          // côté.
          return;
        }
      }
      // Si seulement Y a changé (ou Y et pas X), commit Y.
      this.commitViewport({});
    };

    // ============================================================
    // MOUSE DOWN — détermine le mode selon la zone (heatmap / axe Y / axe X).
    // Middle button = reset complet.
    // ============================================================
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        this.engine.resetPan();
        // Reset viewport au range initial.
        this.priceMin = this.initialPriceMin;
        this.priceMax = this.initialPriceMax;
        this.commitViewport({ timeMin: undefined, timeMax: undefined });
        this.autoFollow = true;
        this.tickAutoFollow();
        return;
      }
      if (e.button !== 0) return;
      // Auto-follow stays locked ON — a drag no longer unlocks the view.
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const xBuffer = (e.clientX - rect.left) * dpr;
      const yBuffer = (e.clientY - rect.top) * dpr;
      this.dragStartX = xBuffer;
      this.dragStartY = yBuffer;
      this.dragMode = this.zoneAt(xBuffer, yBuffer);
      if (this.dragMode === "pan") {
        this.dragStartPanX = this.engine.panX;
        this.dragStartPanY = this.engine.panY;
      } else if (this.dragMode === "zoom-y") {
        this.dragStartPriceMin = this.priceMin;
        this.dragStartPriceMax = this.priceMax;
      } else if (this.dragMode === "zoom-x") {
        this.dragStartTimeMin = this.engine.xToTime(0);
        this.dragStartTimeMax = this.engine.xToTime(this.engine.canvasWidth);
      }
    };

    // ============================================================
    // MOUSE MOVE — selon dragMode : pan matrice / zoom Y / zoom X.
    // Aussi : update cursor hover (ns-resize / ew-resize / default).
    // ============================================================
    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const xBuffer = (e.clientX - rect.left) * dpr;
      const yBuffer = (e.clientY - rect.top) * dpr;

      // Cursor hover (uniquement si pas en drag actif).
      if (this.dragMode === "none") {
        const zone = this.zoneAt(xBuffer, yBuffer);
        if (zone === "zoom-y") this.canvas.style.cursor = "ns-resize";
        else if (zone === "zoom-x") this.canvas.style.cursor = "ew-resize";
        else this.canvas.style.cursor = "";
        return;
      }

      if (this.dragMode === "pan") {
        const dx = xBuffer - this.dragStartX;
        const dy = yBuffer - this.dragStartY;
        this.engine.setPan(this.dragStartPanX + dx, this.dragStartPanY + dy);
      } else if (this.dragMode === "zoom-y") {
        // Drag down sur axe Y = zoom out (range × e^k), drag up = zoom in.
        const dy = yBuffer - this.dragStartY;
        const factor = Math.exp(dy * AXIS_DRAG_SENSITIVITY);
        const oldRange = this.dragStartPriceMax - this.dragStartPriceMin;
        const oldMid = (this.dragStartPriceMin + this.dragStartPriceMax) / 2;
        const newRange = Math.max(this.tickSize * MIN_RANGE_TICKS, oldRange * factor);
        this.priceMin = oldMid - newRange / 2;
        this.priceMax = oldMid + newRange / 2;
        this.commitViewport({});
      } else if (this.dragMode === "zoom-x") {
        const dx = xBuffer - this.dragStartX;
        const factor = Math.exp(dx * AXIS_DRAG_SENSITIVITY);
        const oldRange = this.dragStartTimeMax - this.dragStartTimeMin;
        const oldMid = (this.dragStartTimeMin + this.dragStartTimeMax) / 2;
        const newRange = Math.max(MIN_TIME_RANGE_MS, oldRange * factor);
        this.commitViewport({
          timeMin: oldMid - newRange / 2,
          timeMax: oldMid + newRange / 2,
        });
      }
    };

    // ============================================================
    // MOUSE UP — selon dragMode : commit pan ou rien (zoom déjà committé).
    // ============================================================
    this.onMouseUp = () => {
      const wasMode = this.dragMode;
      this.dragMode = "none";
      if (wasMode !== "pan") return;
      // Pas de commit si pan négligeable (< 1 pixel).
      if (Math.abs(this.engine.panX) < 1 && Math.abs(this.engine.panY) < 1) {
        return;
      }
      // Recalcule le nouveau viewport centré sur la zone visible courante.
      const newPriceCenter = this.engine.yToPrice(this.engine.canvasHeight / 2);
      const range = this.priceMax - this.priceMin;
      this.priceMin = newPriceCenter - range / 2;
      this.priceMax = newPriceCenter + range / 2;
      const newTimeCenter = this.engine.xToTime(this.engine.canvasWidth / 2);
      const tMinNow = this.engine.xToTime(0);
      const tMaxNow = this.engine.xToTime(this.engine.canvasWidth);
      const tRange = tMaxNow - tMinNow;
      const newTimeMin = newTimeCenter - tRange / 2;
      const newTimeMax = newTimeCenter + tRange / 2;
      this.engine.resetPan();
      this.commitViewport({
        timeMin: newTimeMin,
        timeMax: newTimeMax,
      });
    };

    // ============================================================
    // DOUBLE CLICK — reset axe correspondant.
    // ============================================================
    this.onDblClick = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const xBuffer = (e.clientX - rect.left) * dpr;
      const yBuffer = (e.clientY - rect.top) * dpr;
      const zone = this.zoneAt(xBuffer, yBuffer);
      if (zone === "zoom-y") {
        // Reset Y : range initial centré sur best bid/ask (ou mid actuel).
        const cp = this.getCurrentPrice() ??
          (this.priceMin + this.priceMax) / 2;
        const initialRange = this.initialPriceMax - this.initialPriceMin;
        this.priceMin = cp - initialRange / 2;
        this.priceMax = cp + initialRange / 2;
        this.commitViewport({});
      } else if (zone === "zoom-x") {
        // Reset X : timeMin/Max undefined → engine retombe sur [now-5min, now].
        this.commitViewport({ timeMin: undefined, timeMax: undefined });
      }
    };

    // ============================================================
    // KEY DOWN — Space toggle follow.
    // ============================================================
    this.onKeyDown = (e: KeyboardEvent) => {
      // Auto-follow is permanently locked ON — Space no longer toggles it
      // (still swallow the key so the page doesn't scroll).
      if (e.code === "Space") e.preventDefault();
    };

    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("dblclick", this.onDblClick);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    // Tabindex requis sur canvas pour recevoir les événements clavier.
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("keydown", this.onKeyDown);
  }

  // Détermine la zone correspondant aux coords drawing buffer pixel.
  private zoneAt(xBuffer: number, yBuffer: number): DragMode {
    const W = this.engine.canvasWidth;
    const H = this.engine.canvasHeight;
    const axisW = this.engine.axisYWidthPx;
    const axisH = this.engine.axisXHeightPx;
    if (xBuffer >= W - axisW && yBuffer < H - axisH) return "zoom-y";
    if (yBuffer >= H - axisH && xBuffer < W - axisW) return "zoom-x";
    return "pan";
  }

  // REFONTE-7/P3.5 Fix 2 — pousse au DISPLAY viewport (= ce qui est visible).
  // L'engine décide en interne si re-bin du dataViewport est nécessaire
  // (sortie de marge 1.6×). Pendant pan/zoom léger, displayViewport reste
  // dans la marge data → pas de re-bin = pas de smear visible.
  private commitViewport(extra: { timeMin?: number; timeMax?: number }): void {
    this.engine.setDisplayViewport({
      priceMin: this.priceMin,
      priceMax: this.priceMax,
      timeMin: extra.timeMin,
      timeMax: extra.timeMax,
    });
  }

  setAutoFollow(enabled: boolean): void {
    this.autoFollow = enabled;
  }

  isAutoFollowEnabled(): boolean {
    return this.autoFollow;
  }

  // Hysteresis ±25 % strict, recentrage en saut atomique (pas de smooth).
  tickAutoFollow(): void {
    if (!this.autoFollow) return;
    const cp = this.getCurrentPrice();
    if (cp == null || !Number.isFinite(cp)) return;
    const range = this.priceMax - this.priceMin;
    const mid = (this.priceMin + this.priceMax) / 2;
    const deadband = range * DEADBAND_RATIO;
    if (Math.abs(cp - mid) > deadband) {
      this.priceMin = cp - range / 2;
      this.priceMax = cp + range / 2;
      this.commitViewport({});
    }
  }

  getViewport(): { priceMin: number; priceMax: number } {
    return { priceMin: this.priceMin, priceMax: this.priceMax };
  }

  // REFONTE-5 : permet à un caller externe (HeatmapLive auto-init) de set
  // le viewport tout en synchronisant l'état interne du controller. Sans
  // cette méthode, un appel direct à engine.setViewport laisse le controller
  // avec sa valeur initiale hardcoded → auto-follow et drag/wheel seraient
  // calculés depuis l'ancien viewport.
  applyExternalViewport(priceMin: number, priceMax: number): void {
    this.priceMin = priceMin;
    this.priceMax = priceMax;
    this.commitViewport({});
  }

  dispose(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("dblclick", this.onDblClick);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
  }
}
