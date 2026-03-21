/**
 * FOOTPRINT LAYOUT ENGINE
 *
 * Gère le layout fixe des footprints institutional style
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
  volumeProfileWidth: number;   // Largeur du volume profile (default: 50)
  rowHeight: number;            // Hauteur d'une ligne de prix (default: 18)
  candleGap: number;            // Gap between candles for readability (default: 2)

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
  showVolumeProfile: boolean;
  deltaProfilePosition: 'left' | 'right';
}

export interface ViewportState {
  scrollX: number;              // Scroll horizontal en pixels
  scrollIndex: number;          // Index du premier footprint visible
  scrollY: number;              // Scroll vertical en pixels (offset prix)
  zoom: number;                 // Niveau de zoom (0.5 - 2.0)
  zoomY: number;                // Zoom vertical (échelle de prix)
  visibleCount: number;         // Nombre de footprints visibles
  // Fixed price range for free panning (when not auto-fitting)
  fixedPriceMin: number | null;
  fixedPriceMax: number | null;
  isPanning: boolean;           // True when user is actively dragging
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
  footprintWidth: 70,      // Réduit pour afficher plus de bougies
  ohlcWidth: 10,           // Réduit proportionnellement
  deltaProfileWidth: 35,
  volumeProfileWidth: 30,  // Session volume profile width (compact, ATAS-style)
  rowHeight: 13,           // Compact like ATAS — denser rows
  candleGap: 3,            // Gap between candles for readability

  maxVisibleFootprints: 100, // Augmenté pour permettre beaucoup de bougies en dézoomant
  maxPriceLevels: 200,

  headerHeight: 0,
  footerHeight: 90, // Cluster Static (5 rows * 16px + padding)
  leftPadding: 5,
  rightPadding: 60, // Pour l'échelle de prix

  showOHLC: true,
  showDeltaProfile: true,
  showVolumeProfile: true,
  deltaProfilePosition: 'right',
};

// ============ LAYOUT ENGINE ============

export class FootprintLayoutEngine {
  private config: LayoutConfig;
  private viewport: ViewportState;
  private containerWidth: number = 0;
  private containerHeight: number = 0;

  // Momentum scrolling
  private velocityX: number = 0;
  private velocityY: number = 0;
  private momentumAnimationId: number | null = null;
  private lastPanTime: number = 0;
  private readonly FRICTION = 0.92; // Damping factor (higher = more slide)
  private readonly MIN_VELOCITY = 0.5; // Stop threshold

  constructor(config: Partial<LayoutConfig> = {}) {
    this.config = { ...DEFAULT_LAYOUT_CONFIG, ...config };
    this.viewport = {
      scrollX: 0,
      scrollIndex: 0,
      scrollY: 0,
      zoom: 1,
      zoomY: 1.8,
      visibleCount: this.config.maxVisibleFootprints,
      fixedPriceMin: null,
      fixedPriceMax: null,
      isPanning: false,
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
   * Largeur effective d'un footprint (avec OHLC et delta profile + gap)
   */
  getEffectiveFootprintWidth(): number {
    let width = this.config.footprintWidth * this.viewport.zoom;

    if (this.config.showOHLC) {
      width += this.config.ohlcWidth * this.viewport.zoom;
    }

    // Add gap between candles
    width += this.config.candleGap;

    return Math.round(width);
  }

  /**
   * Get just the candle width without the gap (for rendering)
   */
  getCandleWidth(): number {
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

    if (this.config.showVolumeProfile) {
      width -= this.config.volumeProfileWidth;
    }

    return Math.max(100, width);
  }

  /**
   * Scroll horizontal - FREE movement (no constraints)
   * Negative scrollX = see future/newer candles
   * Positive scrollX = see past/older candles
   */
  scroll(deltaPixels: number): void {
    const effectiveWidth = this.getEffectiveFootprintWidth();
    // FREE movement - no Math.max constraint
    this.viewport.scrollX = this.viewport.scrollX + deltaPixels;
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
   * Scroll vertical (prix)
   */
  scrollVertical(deltaPixels: number): void {
    this.viewport.scrollY += deltaPixels;
  }

  /**
   * Start panning - locks the price range for diagonal movement
   * Call this when user starts dragging
   */
  startPan(currentMetrics: LayoutMetrics | null): void {
    this.viewport.isPanning = true;
    // Lock the current price range so Y axis doesn't auto-fit during pan
    if (currentMetrics && this.viewport.fixedPriceMin === null) {
      this.viewport.fixedPriceMin = currentMetrics.visiblePriceMin;
      this.viewport.fixedPriceMax = currentMetrics.visiblePriceMax;
    }
  }

  /**
   * End panning - can optionally unlock price range
   * Call this when user stops dragging
   */
  endPan(unlockPriceRange: boolean = false): void {
    this.viewport.isPanning = false;
    if (unlockPriceRange) {
      this.viewport.fixedPriceMin = null;
      this.viewport.fixedPriceMax = null;
      this.viewport.scrollY = 0;
    }
  }

  /**
   * Reset to auto-fit mode (unlock price range)
   */
  resetPriceRange(): void {
    this.viewport.fixedPriceMin = null;
    this.viewport.fixedPriceMax = null;
    this.viewport.scrollY = 0;
  }

  /**
   * Pan (drag) - Professional natural behavior
   *
   * Mental model:
   * - Drag RIGHT → See PAST (older candles) - grab content
   * - Drag LEFT  → See FUTURE (newer candles)
   * - Drag DOWN  → See LOWER prices - natural scroll
   * - Drag UP    → See HIGHER prices - natural scroll
   */
  pan(deltaX: number, deltaY: number): void {
    const now = performance.now();
    const dt = this.lastPanTime ? (now - this.lastPanTime) / 16.67 : 1;
    this.lastPanTime = now;

    // Stop any ongoing momentum animation
    this.stopMomentum();

    // Track velocity for momentum (smoothed for stability)
    const smoothing = 0.4;
    this.velocityX = this.velocityX * (1 - smoothing) + (deltaX / Math.max(dt, 0.5)) * smoothing;
    this.velocityY = this.velocityY * (1 - smoothing) + (deltaY / Math.max(dt, 0.5)) * smoothing;

    // Apply pan with 1:1 ratio (professional feel)
    // Horizontal: drag right = scroll into history (older candles)
    this.scroll(deltaX);
    // Vertical: drag down = see lower prices (natural)
    this.scrollVertical(deltaY);
  }

  /**
   * Start momentum scrolling after drag ends
   */
  startMomentum(): void {
    // Only start if there's significant velocity
    if (Math.abs(this.velocityX) < this.MIN_VELOCITY && Math.abs(this.velocityY) < this.MIN_VELOCITY) {
      this.velocityX = 0;
      this.velocityY = 0;
      return;
    }

    const animate = () => {
      // Apply friction
      this.velocityX *= this.FRICTION;
      this.velocityY *= this.FRICTION;

      // Apply velocity (same sign logic as pan())
      if (Math.abs(this.velocityX) > this.MIN_VELOCITY) {
        this.scroll(this.velocityX);
      }
      if (Math.abs(this.velocityY) > this.MIN_VELOCITY) {
        this.scrollVertical(this.velocityY);
      }

      // Continue animation if still moving
      if (Math.abs(this.velocityX) > this.MIN_VELOCITY || Math.abs(this.velocityY) > this.MIN_VELOCITY) {
        this.momentumAnimationId = requestAnimationFrame(animate);
      } else {
        this.velocityX = 0;
        this.velocityY = 0;
        this.momentumAnimationId = null;
      }
    };

    this.momentumAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Stop momentum scrolling
   */
  stopMomentum(): void {
    if (this.momentumAnimationId !== null) {
      cancelAnimationFrame(this.momentumAnimationId);
      this.momentumAnimationId = null;
    }
    this.lastPanTime = 0;
  }

  /**
   * Check if momentum is active
   */
  isMomentumActive(): boolean {
    return this.momentumAnimationId !== null;
  }

  /**
   * Reset scroll - Returns to default view
   *
   * Default view (institutional style):
   * - scrollIndex = 0 means "show the latest candles"
   * - The rightmost candle is the most recent
   * - Viewport is filled with N candles (N = viewport capacity)
   */
  resetScroll(): void {
    this.viewport.scrollX = 0;
    this.viewport.scrollIndex = 0;  // 0 = no scroll = latest candles visible
    this.viewport.scrollY = 0;
    // Reset to auto-fit mode
    this.viewport.fixedPriceMin = null;
    this.viewport.fixedPriceMax = null;
  }

  /**
   * Set scroll position directly (for drag panning)
   */
  setScroll(scrollX: number, scrollY: number): void {
    this.viewport.scrollX = scrollX;
    this.viewport.scrollY = scrollY;
    // Convert scrollX to scrollIndex for candle navigation
    const fpWidth = this.getEffectiveFootprintWidth();
    this.viewport.scrollIndex = Math.floor(scrollX / fpWidth);
  }

  /**
   * Reset to optimal view for a given number of candles
   * This ensures no empty space and proper centering
   */
  resetToOptimalView(totalCandles: number): void {
    this.viewport.scrollX = 0;
    this.viewport.scrollIndex = 0;
    this.viewport.scrollY = 0;
    this.viewport.zoom = 1;
    this.viewport.zoomY = 1.8;
    // Reset to auto-fit mode
    this.viewport.fixedPriceMin = null;
    this.viewport.fixedPriceMax = null;
    this.viewport.isPanning = false;

    // Recalculate visible count based on current container size
    this.recalculateVisibleCount();
  }

  /**
   * Zoom horizontal
   * Min: 0.1 (very zoomed out, many candles)
   * Max: 10.0 (very zoomed in, few candles, detailed)
   */
  setZoom(zoom: number): void {
    this.viewport.zoom = Math.max(0.1, Math.min(10.0, zoom));
    this.recalculateVisibleCount();
  }

  /**
   * Zoom vertical (échelle de prix)
   * Min: 0.05 (very compressed price scale)
   * Max: 50.0 (very expanded price scale for detailed view)
   */
  setZoomY(zoomY: number): void {
    this.viewport.zoomY = Math.max(0.05, Math.min(50.0, zoomY));
  }

  /**
   * Zoom uniforme (horizontal + vertical)
   */
  zoomAt(delta: number, _centerX?: number, _centerY?: number): void {
    const factor = delta > 0 ? 1.1 : 1 / 1.1;
    this.setZoom(this.viewport.zoom * factor);
    this.setZoomY(this.viewport.zoomY * factor);
  }

  /**
   * Zoom horizontal seulement
   */
  zoomHorizontal(delta: number): void {
    const factor = delta > 0 ? 1.12 : 1 / 1.12;
    this.setZoom(this.viewport.zoom * factor);
  }

  /**
   * Zoom vertical seulement
   */
  zoomVertical(delta: number): void {
    const factor = delta > 0 ? 1.12 : 1 / 1.12;
    this.setZoomY(this.viewport.zoomY * factor);
  }

  /**
   * Reset zoom
   */
  resetZoom(): void {
    this.viewport.zoom = 1;
    this.viewport.zoomY = 1;
    this.recalculateVisibleCount();
  }

  /**
   * Calcule les métriques de layout pour un ensemble de bougies
   *
   * ARCHITECTURE (institutional style):
   * - Viewport is INDEX-based, not time-based
   * - Candles have FIXED width (zoom-adjusted)
   * - NO empty space: viewport always filled with existing candles
   * - Right-anchored: newest candle at right edge
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

    // Calcul des bougies visibles basé sur le zoom actuel
    const effectiveWidth = this.getEffectiveFootprintWidth();

    // Combien de bougies PEUVENT tenir dans la zone visible
    const viewportCapacity = Math.floor(footprintAreaWidth / Math.max(1, effectiveWidth));

    const totalCandles = candles.length;
    const scrollOffset = this.viewport.scrollIndex;

    // CRITICAL: Index-based viewport calculation
    // endIndex = dernière bougie visible (la plus récente visible)
    // Clamp scrollOffset to valid range
    const maxScrollOffset = Math.max(0, totalCandles - 1);
    const clampedScrollOffset = Math.min(scrollOffset, maxScrollOffset);

    const visibleEndIndex = Math.max(0, totalCandles - clampedScrollOffset);

    // Combien de bougies afficher: min(capacité viewport, bougies disponibles)
    const candlesToShow = Math.min(viewportCapacity, visibleEndIndex);

    const visibleStartIndex = Math.max(0, visibleEndIndex - candlesToShow);
    const visibleCandles = candles.slice(visibleStartIndex, visibleEndIndex);

    // Range de prix - use fixed range if available (for diagonal panning)
    let priceMin: number;
    let priceMax: number;

    if (this.viewport.fixedPriceMin !== null && this.viewport.fixedPriceMax !== null) {
      // Use locked price range for smooth diagonal panning
      priceMin = this.viewport.fixedPriceMin;
      priceMax = this.viewport.fixedPriceMax;
    } else {
      // Auto-fit to visible candles
      priceMin = Infinity;
      priceMax = -Infinity;

      visibleCandles.forEach(candle => {
        candle.levels.forEach((_, price) => {
          priceMin = Math.min(priceMin, price);
          priceMax = Math.max(priceMax, price);
        });
        priceMin = Math.min(priceMin, candle.low);
        priceMax = Math.max(priceMax, candle.high);
      });

      // Padding prix - PROFESSIONAL: More padding for better vertical scrolling
      // This allows zooming and panning beyond visible data range
      const pricePadding = tickSize * 5;
      priceMin = Math.floor(priceMin / tickSize) * tickSize - pricePadding;
      priceMax = Math.ceil(priceMax / tickSize) * tickSize + pricePadding;
    }

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
   * Convertit un prix en coordonnée Y (avec scroll et zoom vertical)
   */
  priceToY(price: number, metrics: LayoutMetrics): number {
    if (metrics.priceRange === 0) return metrics.footprintAreaY + metrics.footprintAreaHeight / 2;

    // Appliquer le zoom vertical au range de prix
    const effectiveRange = metrics.priceRange / this.viewport.zoomY;
    const centerPrice = (metrics.visiblePriceMax + metrics.visiblePriceMin) / 2;
    const adjustedMax = centerPrice + effectiveRange / 2;

    const ratio = (adjustedMax - price) / effectiveRange;
    return metrics.footprintAreaY + ratio * metrics.footprintAreaHeight + this.viewport.scrollY;
  }

  /**
   * Convertit une coordonnée Y en prix (avec scroll et zoom vertical)
   */
  yToPrice(y: number, metrics: LayoutMetrics): number {
    const effectiveRange = metrics.priceRange / this.viewport.zoomY;
    const centerPrice = (metrics.visiblePriceMax + metrics.visiblePriceMin) / 2;
    const adjustedMax = centerPrice + effectiveRange / 2;

    const adjustedY = y - this.viewport.scrollY;
    const ratio = (adjustedY - metrics.footprintAreaY) / metrics.footprintAreaHeight;
    return adjustedMax - ratio * effectiveRange;
  }

  /**
   * Calcule la position X d'un footprint par index
   *
   * CRITICAL FIX: Fill viewport completely, no empty space
   *
   * Logic:
   * - Candles are RIGHT-aligned (newest at right edge)
   * - Viewport is FILLED with as many candles as fit
   * - If fewer candles than viewport capacity: LEFT-align (no right padding)
   */
  getFootprintX(visibleIndex: number, metrics: LayoutMetrics): number {
    const effectiveWidth = this.getEffectiveFootprintWidth();
    const candleCount = metrics.visibleCandles.length;
    const viewportCapacity = Math.floor(metrics.footprintAreaWidth / Math.max(1, effectiveWidth));

    if (candleCount === 0) {
      return metrics.footprintAreaX;
    }

    // Case 1: More data than viewport can show -> RIGHT-align (standard case)
    // Case 2: Less data than viewport capacity -> LEFT-align (no empty space on left)
    if (candleCount >= viewportCapacity) {
      // Right-aligned: last candle touches right edge
      const totalWidth = candleCount * effectiveWidth;
      const startX = metrics.footprintAreaX + metrics.footprintAreaWidth - totalWidth;
      return startX + visibleIndex * effectiveWidth;
    } else {
      // Left-aligned: first candle starts at left edge (no empty space)
      return metrics.footprintAreaX + visibleIndex * effectiveWidth;
    }
  }

  /**
   * Retourne la largeur effective d'un footprint basée sur le zoom
   */
  getDynamicFootprintWidth(_metrics: LayoutMetrics): number {
    return this.getEffectiveFootprintWidth();
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
    const volumeProfileOffset = this.config.showVolumeProfile ? this.config.volumeProfileWidth : 0;

    if (this.config.deltaProfilePosition === 'right') {
      return {
        x: this.containerWidth - this.config.rightPadding - width - volumeProfileOffset,
        width,
      };
    } else {
      return {
        x: this.config.leftPadding,
        width,
      };
    }
  }

  /**
   * Calcule la position du volume profile (session profile)
   * Always positioned between delta profile and price scale
   */
  getVolumeProfilePosition(metrics: LayoutMetrics): { x: number; width: number } {
    const width = this.config.volumeProfileWidth;

    return {
      x: this.containerWidth - this.config.rightPadding - width,
      width,
    };
  }

  // ============ TIME/X CONVERSION ============

  /**
   * Convert a time (Unix timestamp seconds) to X coordinate
   * Supports interpolated times for sub-candle precision (needed for drawing tools)
   */
  timeToX(time: number, metrics: LayoutMetrics): number {
    const { visibleCandles } = metrics;
    if (visibleCandles.length === 0) {
      return metrics.footprintAreaX + metrics.footprintAreaWidth / 2;
    }

    const effectiveWidth = this.getEffectiveFootprintWidth();
    const timePerCandle = visibleCandles.length > 1
      ? visibleCandles[1].time - visibleCandles[0].time
      : 60;

    // Check if time is before first candle
    const firstTime = visibleCandles[0].time;
    if (time < firstTime) {
      const firstX = this.getFootprintX(0, metrics);
      const timeOffset = firstTime - time;
      const xOffset = (timeOffset / timePerCandle) * effectiveWidth;
      return firstX - xOffset;
    }

    // Check if time is after last candle
    const lastIndex = visibleCandles.length - 1;
    const lastTime = visibleCandles[lastIndex].time;
    if (time >= lastTime + timePerCandle) {
      const lastX = this.getFootprintX(lastIndex, metrics);
      const timeOffset = time - lastTime;
      const xOffset = (timeOffset / timePerCandle) * effectiveWidth;
      return lastX + xOffset;
    }

    // Find the candle that contains this time and interpolate
    for (let i = 0; i < visibleCandles.length; i++) {
      const candleTime = visibleCandles[i].time;
      if (time >= candleTime && time < candleTime + timePerCandle) {
        const footprintX = this.getFootprintX(i, metrics);
        const fraction = (time - candleTime) / timePerCandle;
        return footprintX + fraction * effectiveWidth;
      }
    }

    // Fallback: find closest candle
    let closestIndex = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < visibleCandles.length; i++) {
      const diff = Math.abs(visibleCandles[i].time - time);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    return this.getFootprintX(closestIndex, metrics) + effectiveWidth / 2;
  }

  /**
   * Convert X coordinate to time (Unix timestamp seconds)
   * Returns interpolated time for sub-candle precision (needed for drawing tools)
   */
  xToTime(x: number, metrics: LayoutMetrics): number {
    const { visibleCandles } = metrics;
    if (visibleCandles.length === 0) {
      return Date.now() / 1000;
    }

    const effectiveWidth = this.getEffectiveFootprintWidth();
    const timePerCandle = visibleCandles.length > 1
      ? visibleCandles[1].time - visibleCandles[0].time
      : 60; // Default 1 minute

    // Find which candle index this X falls into
    for (let i = 0; i < visibleCandles.length; i++) {
      const footprintX = this.getFootprintX(i, metrics);
      if (x >= footprintX && x < footprintX + effectiveWidth) {
        // Interpolate within the candle for sub-candle precision
        const fraction = (x - footprintX) / effectiveWidth;
        return visibleCandles[i].time + fraction * timePerCandle;
      }
    }

    // If X is before first candle, extrapolate backwards
    const firstX = this.getFootprintX(0, metrics);
    if (x < firstX) {
      const distance = firstX - x;
      const timeOffset = (distance / effectiveWidth) * timePerCandle;
      return visibleCandles[0].time - timeOffset;
    }

    // If X is after last candle, extrapolate forwards
    const lastIndex = visibleCandles.length - 1;
    const lastX = this.getFootprintX(lastIndex, metrics);
    if (x >= lastX) {
      const distance = x - lastX;
      const timeOffset = (distance / effectiveWidth) * timePerCandle;
      return visibleCandles[lastIndex].time + timeOffset;
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

  getZoomY(): number {
    return this.viewport.zoomY;
  }

  getVisibleCount(): number {
    return this.viewport.visibleCount;
  }

  getScrollY(): number {
    return this.viewport.scrollY;
  }

  // ============ INTELLIGENT PRICE ZOOM ============

  /**
   * Calculate optimal price precision (decimal places) based on zoom level and tick size
   *
   * Higher zoomY = more detail = more decimals
   * Lower zoomY = less detail = rounded prices
   */
  getPricePrecision(tickSize: number, baseDecimals: number = 2): number {
    const zoomY = this.viewport.zoomY;

    // Determine base precision from tick size
    let tickDecimals = 0;
    if (tickSize < 1) {
      // For fractional tick sizes (0.25, 0.5, etc), count decimals
      const str = tickSize.toString();
      const decIndex = str.indexOf('.');
      if (decIndex >= 0) {
        tickDecimals = str.length - decIndex - 1;
      }
    }

    const minDecimals = Math.max(tickDecimals, baseDecimals);

    // Scale precision based on zoom level
    // zoomY < 0.5: very zoomed out → fewer decimals (rounded)
    // zoomY 0.5-2: normal → standard decimals
    // zoomY > 2: zoomed in → more decimals
    // zoomY > 5: very zoomed in → maximum detail

    if (zoomY < 0.3) {
      return Math.max(0, minDecimals - 2); // Very rounded
    } else if (zoomY < 0.7) {
      return Math.max(0, minDecimals - 1); // Rounded
    } else if (zoomY < 2) {
      return minDecimals; // Normal
    } else if (zoomY < 5) {
      return minDecimals + 1; // More detail
    } else {
      return minDecimals + 2; // Maximum detail
    }
  }

  /**
   * Calculate optimal grid step for price labels based on zoom level and price range
   *
   * Returns a "nice" round number for grid spacing
   */
  getOptimalGridStep(tickSize: number, priceRange: number): number {
    const zoomY = this.viewport.zoomY;

    // Target: approximately 8-15 grid lines visible
    // Adjust based on zoom level
    const targetLines = zoomY < 0.5 ? 6 : zoomY < 2 ? 10 : zoomY < 5 ? 15 : 20;

    // Calculate ideal step
    const idealStep = priceRange / (targetLines * zoomY);

    // Round to nice values based on tick size
    const niceMultiples = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

    // Find the smallest nice multiple that gives reasonable spacing
    let step = tickSize;
    for (const mult of niceMultiples) {
      const candidate = tickSize * mult;
      if (candidate >= idealStep) {
        step = candidate;
        break;
      }
      step = candidate;
    }

    // Ensure minimum of 1 tick
    return Math.max(tickSize, step);
  }

  /**
   * Format price with intelligent precision based on current zoom level
   */
  formatPriceWithZoom(price: number, tickSize: number, isCME: boolean = false): string {
    const precision = this.getPricePrecision(tickSize, isCME ? 2 : 2);

    // For very zoomed out views, use abbreviated format for large numbers
    if (this.viewport.zoomY < 0.3 && Math.abs(price) >= 1000) {
      if (Math.abs(price) >= 1000000) {
        return (price / 1000000).toFixed(1) + 'M';
      } else if (Math.abs(price) >= 10000) {
        return (price / 1000).toFixed(0) + 'K';
      }
    }

    // Standard formatting with dynamic precision
    const formatted = price.toFixed(precision);

    // Add thousand separators for readability
    if (Math.abs(price) >= 1000 && precision <= 2) {
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    }

    return formatted;
  }

  /**
   * Get visible price levels for grid rendering with intelligent spacing
   *
   * FIXED: Now properly extends beyond visible candle data when zoomed in
   * The price scale should show ALL prices that fit in the viewport, not just
   * prices within the candle data range.
   */
  getVisiblePriceLevels(metrics: LayoutMetrics, tickSize: number): number[] {
    const gridStep = this.getOptimalGridStep(tickSize, metrics.priceRange);
    const levels: number[] = [];

    // Apply zoom to effective range - this is the VISUAL range shown on screen
    const effectiveRange = metrics.priceRange / this.viewport.zoomY;
    const centerPrice = (metrics.visiblePriceMax + metrics.visiblePriceMin) / 2;

    // Apply scrollY offset to shift the center price
    // scrollY > 0 means user dragged down = see lower prices = shift center down
    const pricePerPixel = effectiveRange / metrics.footprintAreaHeight;
    const scrollPriceOffset = this.viewport.scrollY * pricePerPixel;
    const adjustedCenter = centerPrice - scrollPriceOffset;

    // Extended range: add extra padding to ensure we see prices beyond data
    // This is the key fix: extend by 50% on each side to allow scrolling beyond data
    // PROFESSIONAL: allow full vertical panning
    const extensionFactor = 2.0; // 100% total extension (50% each direction)
    const extendedRange = effectiveRange * extensionFactor;

    const adjustedMin = adjustedCenter - extendedRange / 2;
    const adjustedMax = adjustedCenter + extendedRange / 2;

    // Start from a rounded price level
    const startPrice = Math.floor(adjustedMin / gridStep) * gridStep;

    for (let price = startPrice; price <= adjustedMax + gridStep; price += gridStep) {
      // Include all levels within the extended range
      levels.push(price);
    }

    return levels;
  }

  /**
   * Get zoom level description for UI feedback
   */
  getZoomLevelDescription(): string {
    const zoomY = this.viewport.zoomY;

    if (zoomY < 0.2) return 'Macro';
    if (zoomY < 0.5) return 'Overview';
    if (zoomY < 1.5) return 'Normal';
    if (zoomY < 3) return 'Detail';
    if (zoomY < 8) return 'Precision';
    return 'Ultra';
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
