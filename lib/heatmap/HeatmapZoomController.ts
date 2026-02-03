/**
 * HEATMAP ZOOM CONTROLLER - Advanced
 *
 * Gère le zoom et le pan de la heatmap avec:
 * - Zoom intelligent: drag vers le HAUT = zoom IN, drag vers le BAS = zoom OUT
 * - Smooth zoom avec momentum
 * - Auto-center sur le prix actuel
 * - Zoom centré sur le curseur (wheel)
 * - Support double-click pour reset
 */

import type { PriceRange } from '@/types/heatmap';

export interface ZoomState {
  zoomLevel: number;
  priceOffset: number;
  isDragging: boolean;
  dragType: 'zoom' | 'pan' | null;
}

export interface ZoomConfig {
  minZoom: number;
  maxZoom: number;
  zoomSensitivity: number;
  panSensitivity: number;
  wheelZoomFactor: number;
  smoothing: boolean;
  smoothingFactor: number;
}

const DEFAULT_CONFIG: ZoomConfig = {
  minZoom: 0.3,
  maxZoom: 5.0,
  zoomSensitivity: 0.008,      // 0.8% par pixel
  panSensitivity: 1.0,
  wheelZoomFactor: 0.12,       // 12% par scroll
  smoothing: true,
  smoothingFactor: 0.15,
};

export class HeatmapZoomController {
  private zoomLevel: number = 1;
  private targetZoom: number = 1;
  private priceOffset: number = 0;
  private targetOffset: number = 0;
  private isDragging: boolean = false;
  private dragType: 'zoom' | 'pan' | null = null;
  private dragStartY: number = 0;
  private dragStartZoom: number = 1;
  private dragStartOffset: number = 0;

  // Configuration
  private config: ZoomConfig;

  // Auto-center
  private autoCenter: boolean = false;
  private lastCenterPrice: number = 0;

  // Animation
  private animationFrame: number | null = null;

  // Callbacks
  private onZoomChange?: (state: ZoomState) => void;

  constructor(onZoomChange?: (state: ZoomState) => void, config?: Partial<ZoomConfig>) {
    this.onZoomChange = onZoomChange;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Active/désactive l'auto-center
   */
  setAutoCenter(enabled: boolean): void {
    this.autoCenter = enabled;
    if (enabled) {
      this.priceOffset = 0;
      this.targetOffset = 0;
    }
  }

  /**
   * Met à jour le prix central pour l'auto-center
   */
  updateCenterPrice(price: number): void {
    if (this.autoCenter && !this.isDragging) {
      // Compense le mouvement du prix pour garder la vue stable
      const priceDelta = price - this.lastCenterPrice;
      if (Math.abs(priceDelta) > 0 && this.lastCenterPrice !== 0) {
        // Ne pas ajuster l'offset en mode auto-center
        // Le prix reste centré automatiquement
      }
    }
    this.lastCenterPrice = price;
  }

  /**
   * Démarre le drag pour zoom sur l'axe des prix
   */
  startPriceAxisDrag(y: number): void {
    this.isDragging = true;
    this.dragType = 'zoom';
    this.dragStartY = y;
    this.dragStartZoom = this.zoomLevel;
    this.stopAnimation();
    this.notifyChange();
  }

  /**
   * Met à jour le zoom pendant le drag
   * Drag UP = zoom IN, Drag DOWN = zoom OUT
   */
  updatePriceAxisDrag(y: number): void {
    if (!this.isDragging || this.dragType !== 'zoom') return;

    const delta = this.dragStartY - y; // Positif = drag vers le haut
    const zoomDelta = delta * this.config.zoomSensitivity;

    // Applique le zoom de manière exponentielle pour un feeling naturel
    const newZoom = this.dragStartZoom * Math.exp(zoomDelta);
    this.targetZoom = this.clampZoom(newZoom);

    if (this.config.smoothing) {
      this.startAnimation();
    } else {
      this.zoomLevel = this.targetZoom;
      this.notifyChange();
    }
  }

  /**
   * Démarre le pan sur le canvas principal
   */
  startPan(y: number): void {
    this.isDragging = true;
    this.dragType = 'pan';
    this.dragStartY = y;
    this.dragStartOffset = this.priceOffset;
    this.stopAnimation();
    this.notifyChange();
  }

  /**
   * Met à jour le pan pendant le drag
   */
  updatePan(y: number, pricePerPixel: number): void {
    if (!this.isDragging || this.dragType !== 'pan') return;

    const delta = y - this.dragStartY;
    this.targetOffset = this.dragStartOffset + delta * pricePerPixel * this.config.panSensitivity;

    // Désactive l'auto-center quand l'utilisateur pan manuellement
    if (Math.abs(delta) > 5) {
      this.autoCenter = false;
    }

    if (this.config.smoothing) {
      this.startAnimation();
    } else {
      this.priceOffset = this.targetOffset;
      this.notifyChange();
    }
  }

  /**
   * Termine le drag
   */
  endDrag(): void {
    this.isDragging = false;
    this.dragType = null;
    this.notifyChange();
  }

  /**
   * Zoom avec la molette de souris (centré sur le curseur)
   */
  handleWheel(
    deltaY: number,
    cursorY: number,
    priceAtCursor: number,
    canvasHeight: number,
    priceRange: PriceRange
  ): void {
    // Direction: scroll down = zoom out, scroll up = zoom in
    const direction = deltaY > 0 ? -1 : 1;
    const zoomFactor = 1 + direction * this.config.wheelZoomFactor;

    const oldZoom = this.zoomLevel;
    const newZoom = this.clampZoom(oldZoom * zoomFactor);

    if (newZoom === oldZoom) return;

    // Calcule l'ajustement d'offset pour garder le prix sous le curseur
    const priceRangeSize = priceRange.max - priceRange.min;
    const cursorRatio = 1 - cursorY / canvasHeight; // 0 = bas, 1 = haut
    const centerPrice = priceRange.min + priceRangeSize * 0.5;

    // L'offset doit compenser le changement de zoom pour que le prix reste sous le curseur
    const oldRange = priceRangeSize;
    const newRange = priceRangeSize * (oldZoom / newZoom);
    const rangeChange = newRange - oldRange;

    // Ajuste l'offset basé sur la position du curseur
    const offsetAdjustment = rangeChange * (cursorRatio - 0.5);

    this.targetZoom = newZoom;
    this.targetOffset = this.priceOffset - offsetAdjustment;

    // Désactive auto-center quand l'utilisateur zoom manuellement
    this.autoCenter = false;

    if (this.config.smoothing) {
      this.startAnimation();
    } else {
      this.zoomLevel = this.targetZoom;
      this.priceOffset = this.targetOffset;
      this.notifyChange();
    }
  }

  /**
   * Double-click pour réinitialiser la vue
   */
  handleDoubleClick(): void {
    this.targetZoom = 1;
    this.targetOffset = 0;
    this.autoCenter = true;

    if (this.config.smoothing) {
      this.startAnimation();
    } else {
      this.zoomLevel = 1;
      this.priceOffset = 0;
      this.notifyChange();
    }
  }

  /**
   * Zoom in/out par bouton
   */
  zoomIn(): void {
    this.targetZoom = this.clampZoom(this.zoomLevel * 1.25);
    this.startAnimation();
  }

  zoomOut(): void {
    this.targetZoom = this.clampZoom(this.zoomLevel / 1.25);
    this.startAnimation();
  }

  /**
   * Réinitialise le zoom et le pan
   */
  reset(): void {
    this.targetZoom = 1;
    this.targetOffset = 0;
    this.zoomLevel = 1;
    this.priceOffset = 0;
    this.isDragging = false;
    this.dragType = null;
    this.stopAnimation();
    this.notifyChange();
  }

  /**
   * Centre la vue sur un prix donné
   */
  centerOnPrice(price: number, currentCenterPrice: number): void {
    this.targetOffset = price - currentCenterPrice;
    this.autoCenter = false;

    if (this.config.smoothing) {
      this.startAnimation();
    } else {
      this.priceOffset = this.targetOffset;
      this.notifyChange();
    }
  }

  /**
   * Animation smooth
   */
  private startAnimation(): void {
    if (this.animationFrame) return;

    const animate = () => {
      const zoomDiff = this.targetZoom - this.zoomLevel;
      const offsetDiff = this.targetOffset - this.priceOffset;

      // Applique le smoothing
      this.zoomLevel += zoomDiff * this.config.smoothingFactor;
      this.priceOffset += offsetDiff * this.config.smoothingFactor;

      // Vérifie si on a atteint la cible
      const zoomDone = Math.abs(zoomDiff) < 0.001;
      const offsetDone = Math.abs(offsetDiff) < 0.01;

      if (zoomDone && offsetDone) {
        this.zoomLevel = this.targetZoom;
        this.priceOffset = this.targetOffset;
        this.stopAnimation();
      } else {
        this.animationFrame = requestAnimationFrame(animate);
      }

      this.notifyChange();
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Clamp le zoom dans les limites
   */
  private clampZoom(zoom: number): number {
    return Math.max(this.config.minZoom, Math.min(this.config.maxZoom, zoom));
  }

  /**
   * Calcule la plage de prix visible
   */
  getVisiblePriceRange(centerPrice: number, baseRange: number): PriceRange {
    const effectiveRange = baseRange / this.zoomLevel;
    const center = centerPrice + (this.autoCenter ? 0 : this.priceOffset);

    return {
      min: center - effectiveRange / 2,
      max: center + effectiveRange / 2,
    };
  }

  /**
   * Getters
   */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  getPriceOffset(): number {
    return this.autoCenter ? 0 : this.priceOffset;
  }

  getIsDragging(): boolean {
    return this.isDragging;
  }

  getDragType(): 'zoom' | 'pan' | null {
    return this.dragType;
  }

  isAutoCenter(): boolean {
    return this.autoCenter;
  }

  getState(): ZoomState {
    return {
      zoomLevel: this.zoomLevel,
      priceOffset: this.autoCenter ? 0 : this.priceOffset,
      isDragging: this.isDragging,
      dragType: this.dragType,
    };
  }

  /**
   * Setters
   */
  setZoomLevel(level: number): void {
    this.zoomLevel = this.clampZoom(level);
    this.targetZoom = this.zoomLevel;
    this.notifyChange();
  }

  setPriceOffset(offset: number): void {
    this.priceOffset = offset;
    this.targetOffset = offset;
    this.notifyChange();
  }

  /**
   * Met à jour la configuration
   */
  updateConfig(config: Partial<ZoomConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Notification du changement
   */
  private notifyChange(): void {
    this.onZoomChange?.(this.getState());
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAnimation();
  }
}
