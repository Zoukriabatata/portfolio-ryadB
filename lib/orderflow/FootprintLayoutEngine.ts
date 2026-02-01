/**
 * FOOTPRINT LAYOUT ENGINE
 *
 * Gère le layout fixe des footprints style ATAS/NinjaTrader
 *
 * Contraintes :
 * - Largeur fixe par footprint (80-100px)
 * - Hauteur alignée sur l'échelle de prix
 * - Nombre max de footprints visibles
 * - Scroll horizontal contrôlé
 */

import type { FootprintCandle } from './OrderflowEngine';

// ============ TYPES ============

export interface LayoutConfig {
  // Dimensions footprint
  footprintWidth: number;       // Largeur fixe d'un footprint (default: 90)
  ohlcWidth: number;            // Largeur de la bougie OHLC à gauche (default: 12)
  deltaProfileWidth: number;    // Largeur du delta profile (default: 40)
  rowHeight: number;            // Hauteur d'une ligne de prix (default: 18)

  // Limites
  maxVisibleFootprints: number; // Max footprints visibles (default: 25)
  maxPriceLevels: number;       // Max niveaux de prix rendus (default: 100)

  // Padding
  headerHeight: number;
  footerHeight: number;
  leftPadding: number;
  rightPadding: number;

  // Features
  showOHLC: boolean;
  showDeltaProfile: boolean;
  deltaProfilePosition: 'left' | 'right';
}

export interface ViewportState {
  scrollX: number;              // Scroll horizontal en pixels
  scrollIndex: number;          // Index du premier footprint visible
  zoom: number;                 // Niveau de zoom (0.5 - 2.0)
  visibleCount: number;         // Nombre de footprints visibles
}

export interface LayoutMetrics {
  // Dimensions calculées
  chartWidth: number;
  chartHeight: number;
  priceScaleWidth: number;
  timeScaleHeight: number;

  // Zone de rendu footprint
  footprintAreaX: number;
  footprintAreaY: number;
  footprintAreaWidth: number;
  footprintAreaHeight: number;

  // Prix visible
  visiblePriceMin: number;
  visiblePriceMax: number;
  priceRange: number;

  // Footprints visibles
  visibleStartIndex: number;
  visibleEndIndex: number;
  visibleCandles: FootprintCandle[];
}

export interface CellPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  price: number;
  candleIndex: number;
}

// ============ DEFAULT CONFIG ============

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  footprintWidth: 90,
  ohlcWidth: 14,
  deltaProfileWidth: 40,
  rowHeight: 18,

  maxVisibleFootprints: 25,
  maxPriceLevels: 100,

  headerHeight: 0,
  footerHeight: 45,
  leftPadding: 5,
  rightPadding: 60, // Pour l'échelle de prix

  showOHLC: true,
  showDeltaProfile: true,
  deltaProfilePosition: 'right',
};

// ============ LAYOUT ENGINE ============

export class FootprintLayoutEngine {
  private config: LayoutConfig;
  private viewport: ViewportState;
  private containerWidth: number = 0;
  private containerHeight: number = 0;

  constructor(config: Partial<LayoutConfig> = {}) {
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...config };
    this.viewport = {
      scrollX: 0,
      scrollIndex: 0,
      zoom: 1,
      visibleCount: this.config.maxVisibleFootprints,
    };
  }

  /**
   * Met à jour les dimensions du conteneur
   */
  setContainerSize(width: number, height: number): void {
    this.containerWidth = width;
    this.containerHeight = height;
    this.recalculateVisibleCount();
  }

  /**
   * Met à jour la configuration
   */
  setConfig(config: Partial<LayoutConfig>): void {
    this.config = { ...this.config, ...config };
    this.recalculateVisibleCount();
  }

  /**
   * Recalcule le nombre de footprints visibles
   */
  private recalculateVisibleCount(): void {
    const availableWidth = this.getFootprintAreaWidth();
    const effectiveWidth = this.getEffectiveFootprintWidth();
    const count = Math.floor(availableWidth / effectiveWidth);
    this.viewport.visibleCount = Math.min(count, this.config.maxVisibleFootprints);
  }

  /**
   * Largeur effective d'un footprint (avec OHLC et delta profile)
   */
  getEffectiveFootprintWidth(): number {
    let width = this.config.footprintWidth * this.viewport.zoom;

    if (this.config.showOHLC) {
      width += this.config.ohlcWidth * this.viewport.zoom;
    }

    return Math.round(width);
  }

  /**
   * Largeur de la zone footprint
   */
  getFootprintAreaWidth(): number {
    let width = this.containerWidth - this.config.leftPadding - this.config.rightPadding;

    if (this.config.showDeltaProfile) {
      width -= this.config.deltaProfileWidth;
    }

    return Math.max(100, width);
  }

  /**
   * Scroll horizontal
   */
  scroll(deltaPixels: number): void {
    const effectiveWidth = this.getEffectiveFootprintWidth();
    this.viewport.scrollX = Math.max(0, this.viewport.scrollX + deltaPixels);
    this.viewport.scrollIndex = Math.floor(this.viewport.scrollX / effectiveWidth);
  }

  /**
   * Scroll par nombre de bougies
   */
  scrollByCandles(count: number): void {
    const effectiveWidth = this.getEffectiveFootprintWidth();
    this.scroll(count * effectiveWidth);
  }

  /**
   * Reset scroll
   */
  resetScroll(): void {
    this.viewport.scrollX = 0;
    this.viewport.scrollIndex = 0;
  }

  /**
   * Zoom
   */
  setZoom(zoom: number): void {
    this.viewport.zoom = Math.max(0.5, Math.min(2.0, zoom));
    this.recalculateVisibleCount();
  }

  /**
   * Calcule les métriques de layout pour un ensemble de bougies
   */
  calculateMetrics(candles: FootprintCandle[], tickSize: number): LayoutMetrics {
    const chartWidth = this.containerWidth;
    const chartHeight = this.containerHeight;
    const { headerHeight, footerHeight, leftPadding, rightPadding } = this.config;

    // Zone footprint
    const footprintAreaX = leftPadding;
    const footprintAreaY = headerHeight;
    const footprintAreaWidth = this.getFootprintAreaWidth();
    const footprintAreaHeight = chartHeight - headerHeight - footerHeight;

    // Calcul des bougies visibles
    const effectiveWidth = this.getEffectiveFootprintWidth();
    const maxVisible = Math.min(
      this.viewport.visibleCount,
      Math.floor(footprintAreaWidth / effectiveWidth)
    );

    const totalCandles = candles.length;
    const scrollOffset = this.viewport.scrollIndex;

    // Indices visibles (alignés à droite, scroll vers la gauche)
    const visibleEndIndex = Math.max(0, totalCandles - scrollOffset);
    const visibleStartIndex = Math.max(0, visibleEndIndex - maxVisible);
    const visibleCandles = candles.slice(visibleStartIndex, visibleEndIndex);

    // Range de prix
    let priceMin = Infinity;
    let priceMax = -Infinity;

    visibleCandles.forEach(candle => {
      candle.levels.forEach((_, price) => {
        priceMin = Math.min(priceMin, price);
        priceMax = Math.max(priceMax, price);
      });
      priceMin = Math.min(priceMin, candle.low);
      priceMax = Math.max(priceMax, candle.high);
    });

    // Padding prix
    const pricePadding = tickSize * 3;
    priceMin = Math.floor(priceMin / tickSize) * tickSize - pricePadding;
    priceMax = Math.ceil(priceMax / tickSize) * tickSize + pricePadding;

    return {
      chartWidth,
      chartHeight,
      priceScaleWidth: rightPadding,
      timeScaleHeight: footerHeight,
      footprintAreaX,
      footprintAreaY,
      footprintAreaWidth,
      footprintAreaHeight,
      visiblePriceMin: priceMin,
      visiblePriceMax: priceMax,
      priceRange: priceMax - priceMin,
      visibleStartIndex,
      visibleEndIndex,
      visibleCandles,
    };
  }

  /**
   * Convertit un prix en coordonnée Y
   */
  priceToY(price: number, metrics: LayoutMetrics): number {
    if (metrics.priceRange === 0) return metrics.footprintAreaY + metrics.footprintAreaHeight / 2;

    const ratio = (metrics.visiblePriceMax - price) / metrics.priceRange;
    return metrics.footprintAreaY + ratio * metrics.footprintAreaHeight;
  }

  /**
   * Convertit une coordonnée Y en prix
   */
  yToPrice(y: number, metrics: LayoutMetrics): number {
    const ratio = (y - metrics.footprintAreaY) / metrics.footprintAreaHeight;
    return metrics.visiblePriceMax - ratio * metrics.priceRange;
  }

  /**
   * Calcule la position X d'un footprint par index
   */
  getFootprintX(visibleIndex: number, metrics: LayoutMetrics): number {
    const effectiveWidth = this.getEffectiveFootprintWidth();
    const totalWidth = metrics.visibleCandles.length * effectiveWidth;
    const startX = metrics.footprintAreaX + metrics.footprintAreaWidth - totalWidth;
    return startX + visibleIndex * effectiveWidth;
  }

  /**
   * Calcule la position d'une cellule footprint
   */
  getCellPosition(
    visibleIndex: number,
    price: number,
    metrics: LayoutMetrics
  ): CellPosition {
    const x = this.getFootprintX(visibleIndex, metrics);
    const y = this.priceToY(price, metrics);
    const rowH = this.config.rowHeight * this.viewport.zoom;

    return {
      x: x + (this.config.showOHLC ? this.config.ohlcWidth * this.viewport.zoom : 0),
      y: y - rowH / 2,
      width: this.config.footprintWidth * this.viewport.zoom,
      height: rowH,
      price,
      candleIndex: visibleIndex,
    };
  }

  /**
   * Calcule la position de la bougie OHLC
   */
  getOHLCPosition(visibleIndex: number, metrics: LayoutMetrics): { x: number; width: number } {
    const footprintX = this.getFootprintX(visibleIndex, metrics);
    return {
      x: footprintX,
      width: this.config.ohlcWidth * this.viewport.zoom,
    };
  }

  /**
   * Calcule la position du delta profile
   */
  getDeltaProfilePosition(metrics: LayoutMetrics): { x: number; width: number } {
    const width = this.config.deltaProfileWidth;

    if (this.config.deltaProfilePosition === 'right') {
      return {
        x: this.containerWidth - this.config.rightPadding - width,
        width,
      };
    } else {
      return {
        x: this.config.leftPadding,
        width,
      };
    }
  }

  // ============ TIME/X CONVERSION ============

  /**
   * Convert a time (Unix timestamp seconds) to X coordinate
   * Searches visible candles for matching time
   */
  timeToX(time: number, metrics: LayoutMetrics): number {
    const { visibleCandles } = metrics;
    if (visibleCandles.length === 0) {
      return metrics.footprintAreaX + metrics.footprintAreaWidth / 2;
    }

    // Find candle with closest time
    let closestIndex = 0;
    let closestDiff = Infinity;

    for (let i = 0; i < visibleCandles.length; i++) {
      const diff = Math.abs(visibleCandles[i].time - time);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    // Get X position for this candle
    const footprintX = this.getFootprintX(closestIndex, metrics);
    const effectiveWidth = this.getEffectiveFootprintWidth();

    // Return center X of the candle
    return footprintX + effectiveWidth / 2;
  }

  /**
   * Convert X coordinate to time (Unix timestamp seconds)
   * Returns the time of the candle at that X position
   */
  xToTime(x: number, metrics: LayoutMetrics): number {
    const { visibleCandles } = metrics;
    if (visibleCandles.length === 0) {
      return Date.now() / 1000;
    }

    const effectiveWidth = this.getEffectiveFootprintWidth();

    // Find which candle index this X falls into
    for (let i = 0; i < visibleCandles.length; i++) {
      const footprintX = this.getFootprintX(i, metrics);
      if (x >= footprintX && x < footprintX + effectiveWidth) {
        return visibleCandles[i].time;
      }
    }

    // If X is before first candle, return first candle time
    const firstX = this.getFootprintX(0, metrics);
    if (x < firstX) {
      // Extrapolate backwards based on timeframe
      const timePerCandle = visibleCandles.length > 1
        ? visibleCandles[1].time - visibleCandles[0].time
        : 60; // Default 1 minute
      const candlesBefore = Math.floor((firstX - x) / effectiveWidth);
      return visibleCandles[0].time - (candlesBefore + 1) * timePerCandle;
    }

    // If X is after last candle, return last candle time
    const lastIndex = visibleCandles.length - 1;
    const lastX = this.getFootprintX(lastIndex, metrics);
    if (x >= lastX + effectiveWidth) {
      // Extrapolate forwards
      const timePerCandle = visibleCandles.length > 1
        ? visibleCandles[lastIndex].time - visibleCandles[lastIndex - 1].time
        : 60;
      const candlesAfter = Math.floor((x - lastX - effectiveWidth) / effectiveWidth);
      return visibleCandles[lastIndex].time + (candlesAfter + 1) * timePerCandle;
    }

    // Default to last candle
    return visibleCandles[lastIndex].time;
  }

  /**
   * Find candle index at X coordinate
   */
  getCandleIndexAtX(x: number, metrics: LayoutMetrics): number {
    const effectiveWidth = this.getEffectiveFootprintWidth();

    for (let i = 0; i < metrics.visibleCandles.length; i++) {
      const footprintX = this.getFootprintX(i, metrics);
      if (x >= footprintX && x < footprintX + effectiveWidth) {
        return i;
      }
    }

    // Return -1 if not found
    return -1;
  }

  // ============ GETTERS ============

  getConfig(): LayoutConfig {
    return { ...this.config };
  }

  getViewport(): ViewportState {
    return { ...this.viewport };
  }

  getZoom(): number {
    return this.viewport.zoom;
  }

  getVisibleCount(): number {
    return this.viewport.visibleCount;
  }
}

// ============ SINGLETON ============

let layoutEngine: FootprintLayoutEngine | null = null;

export function getFootprintLayoutEngine(): FootprintLayoutEngine {
  if (!layoutEngine) {
    layoutEngine = new FootprintLayoutEngine();
  }
  return layoutEngine;
}

export function resetFootprintLayoutEngine(): void {
  layoutEngine = null;
}
