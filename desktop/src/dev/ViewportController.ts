// Viewport controller pour la harness REFONTE-4a.
// - Wheel : zoom prix autour du centre courant (factor ±10 %).
// - Drag vertical : pan prix.
// - Auto-follow : recentre quand current_price sort de la deadband ±25 %.
//
// Toute interaction manuelle (wheel/drag) désactive l'auto-follow. Le toggle
// se fait via setAutoFollow(true) (ex. clic sur un bouton "lock").
//
// Pas de Date.now/performance.now (tout est event-driven ou tick-driven via
// setInterval externe). Localisation `src/dev/` = hors scope ESLint refonte
// mais on respecte la convention quand même.

export interface ViewportControllerOptions {
  canvas: HTMLCanvasElement;
  initialPriceMin: number;
  initialPriceMax: number;
  tickSize: number;
  onViewportChange: (priceMin: number, priceMax: number) => void;
  getCurrentPrice: () => number | null;
}

const ZOOM_FACTOR_OUT = 1.1;
const ZOOM_FACTOR_IN = 1 / ZOOM_FACTOR_OUT;
const DEADBAND_RATIO = 0.25;
const MIN_RANGE_TICKS = 20;

export class ViewportController {
  private readonly canvas: HTMLCanvasElement;
  private priceMin: number;
  private priceMax: number;
  private readonly tickSize: number;
  private readonly onViewportChange: (a: number, b: number) => void;
  private readonly getCurrentPrice: () => number | null;
  private autoFollow = true;
  private isDragging = false;
  private dragStartY = 0;
  private dragStartPriceMin = 0;
  private dragStartPriceMax = 0;

  private readonly onWheel: (e: WheelEvent) => void;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseUp: () => void;

  constructor(opts: ViewportControllerOptions) {
    this.canvas = opts.canvas;
    this.priceMin = opts.initialPriceMin;
    this.priceMax = opts.initialPriceMax;
    this.tickSize = opts.tickSize;
    this.onViewportChange = opts.onViewportChange;
    this.getCurrentPrice = opts.getCurrentPrice;

    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.autoFollow = false;
      const factor = e.deltaY > 0 ? ZOOM_FACTOR_OUT : ZOOM_FACTOR_IN;
      const oldRange = this.priceMax - this.priceMin;
      const mid = (this.priceMin + this.priceMax) / 2;
      const newRange = Math.max(
        this.tickSize * MIN_RANGE_TICKS,
        oldRange * factor,
      );
      this.priceMin = mid - newRange / 2;
      this.priceMax = mid + newRange / 2;
      this.onViewportChange(this.priceMin, this.priceMax);
    };

    this.onMouseDown = (e: MouseEvent) => {
      this.autoFollow = false;
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartPriceMin = this.priceMin;
      this.dragStartPriceMax = this.priceMax;
    };

    this.onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const rect = this.canvas.getBoundingClientRect();
      if (rect.height <= 0) return;
      const deltaY = e.clientY - this.dragStartY;
      const range = this.dragStartPriceMax - this.dragStartPriceMin;
      // Drag DOWN (deltaY > 0) → viewport shift DOWN (lower prices visible).
      const deltaPrice = -(deltaY / rect.height) * range;
      this.priceMin = this.dragStartPriceMin + deltaPrice;
      this.priceMax = this.dragStartPriceMax + deltaPrice;
      this.onViewportChange(this.priceMin, this.priceMax);
    };

    this.onMouseUp = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
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
      this.onViewportChange(this.priceMin, this.priceMax);
    }
  }

  getViewport(): { priceMin: number; priceMax: number } {
    return { priceMin: this.priceMin, priceMax: this.priceMax };
  }

  // REFONTE-5 : permet à un caller externe (HeatmapLive auto-init) de set
  // le viewport tout en synchronisant l'état interne du controller. Sans
  // cette méthode, un appel direct à engine.setViewport laisse le controller
  // avec sa valeur initiale hardcoded → auto-follow et drag/wheel seraient
  // calculés depuis l'ancien viewport. Pas de récursion : onViewportChange
  // est défini par le caller, ne doit pas appeler applyExternalViewport.
  applyExternalViewport(priceMin: number, priceMax: number): void {
    this.priceMin = priceMin;
    this.priceMax = priceMax;
    this.onViewportChange(priceMin, priceMax);
  }

  dispose(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }
}
