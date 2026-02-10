/**
 * CANVAS CHART ENGINE - Custom Chart Rendering
 *
 * Chart professionnel 100% custom sans dépendance externe
 * Style TradingView / ATAS
 */

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartTheme {
  background: string;
  gridLines: string;
  text: string;
  textMuted: string;
  candleUp: string;
  candleDown: string;
  candleBorderUp?: string;
  candleBorderDown?: string;
  wickUp: string;
  wickDown: string;
  volumeUp: string;
  volumeDown: string;
  crosshair: string;
  crosshairLabel: string;
  crosshairLabelBg: string;
  priceLineColor: string;
}

export interface CrosshairStyle {
  color: string;
  lineWidth: number;
  dashPattern: number[];
}

export interface ChartViewport {
  startIndex: number;
  endIndex: number;
  priceMin: number;
  priceMax: number;
}

export interface ChartDimensions {
  width: number;
  height: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  volumeHeight: number;
}

export interface CrosshairPosition {
  x: number;
  y: number;
  visible: boolean;
}

export interface CrosshairCandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  index: number;
}

const DEFAULT_THEME: ChartTheme = {
  background: '#0a0a0a',
  gridLines: '#1a1a1a',
  text: '#888888',
  textMuted: '#555555',
  candleUp: '#22c55e',
  candleDown: '#ef4444',
  wickUp: '#22c55e',
  wickDown: '#ef4444',
  volumeUp: 'rgba(34, 197, 94, 0.4)',
  volumeDown: 'rgba(239, 68, 68, 0.4)',
  crosshair: '#6b7280',
  crosshairLabel: '#ffffff',
  crosshairLabelBg: '#374151',
  priceLineColor: '#3b82f6',
};

export class CanvasChartEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private candles: ChartCandle[] = [];
  private theme: ChartTheme;
  private dimensions: ChartDimensions;
  private viewport: ChartViewport;
  private crosshair: CrosshairPosition = { x: 0, y: 0, visible: false };
  private isDragging = false;
  private isDraggingPriceAxis = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private lastPinchDistance = 0;
  private showVolume = true;
  private showGrid = true;
  private animationFrameId: number | null = null;
  private dpr = 1;
  private autoScalePrice = true; // Auto-scale price axis
  private userHasPanned = false; // Track if user has panned away from latest
  private crosshairStyle: CrosshairStyle = {
    color: '#6b7280',
    lineWidth: 1,
    dashPattern: [4, 4],
  };

  // Callbacks
  private onPriceChange?: (price: number) => void;
  private onCrosshairMove?: (time: number, price: number) => void;
  private onCrosshairCandleData?: (data: CrosshairCandleData | null) => void;

  constructor(canvas: HTMLCanvasElement, theme?: Partial<ChartTheme>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;

    this.theme = { ...DEFAULT_THEME, ...theme };
    this.dpr = window.devicePixelRatio || 1;

    this.dimensions = {
      width: canvas.width,
      height: canvas.height,
      priceAxisWidth: 80,
      timeAxisHeight: 30,
      volumeHeight: 60,
    };

    this.viewport = {
      startIndex: 0,
      endIndex: 100,
      priceMin: 0,
      priceMax: 100,
    };

    this.setupEventListeners();
  }

  // ============ PUBLIC API ============

  getViewport(): ChartViewport & { chartWidth: number; chartHeight: number } {
    // dimensions.width/height are already in CSS pixels (set in resize())
    const chartWidth = this.dimensions.width - this.dimensions.priceAxisWidth;
    const chartHeight = this.dimensions.height - this.dimensions.timeAxisHeight - (this.showVolume ? this.dimensions.volumeHeight : 0);
    return { ...this.viewport, chartWidth, chartHeight };
  }

  getCandles(): ChartCandle[] {
    return this.candles;
  }

  setCandles(candles: ChartCandle[]): void {
    // Filter out invalid candles (NaN, Infinity, or extreme outliers)
    this.candles = this.validateCandles(candles);
    if (this.candles.length > 0) {
      this.autoScalePrice = true;
      this.userHasPanned = false;
      this.fitToData();
    }
    this.render();
  }

  /**
   * Validate and filter candles to prevent rendering bugs
   * Uses strict validation to catch abnormal price jumps
   */
  private validateCandles(candles: ChartCandle[]): ChartCandle[] {
    if (candles.length === 0) return [];

    // First pass: filter out obviously invalid candles
    const validCandles = candles.filter(c => {
      // Check for NaN or Infinity
      if (!Number.isFinite(c.open) || !Number.isFinite(c.high) ||
          !Number.isFinite(c.low) || !Number.isFinite(c.close) ||
          !Number.isFinite(c.volume) || !Number.isFinite(c.time)) {
        return false;
      }
      // Check for negative or zero prices
      if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
        return false;
      }
      // Check OHLC consistency
      if (c.high < c.low || c.high < c.open || c.high < c.close ||
          c.low > c.open || c.low > c.close) {
        return false;
      }
      return true;
    });

    if (validCandles.length === 0) return [];

    // Sort by time to ensure proper order
    validCandles.sort((a, b) => a.time - b.time);

    // Calculate IQR (Interquartile Range) for robust outlier detection
    const prices = validCandles.map(c => c.close).sort((a, b) => a - b);
    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);
    const q1 = prices[q1Index];
    const q3 = prices[q3Index];
    const iqr = q3 - q1;
    const medianPrice = prices[Math.floor(prices.length / 2)];

    // Use IQR-based bounds (more robust than simple multiplier)
    // Allow 3x IQR range which is standard for outlier detection
    const lowerBound = Math.max(q1 - 3 * iqr, medianPrice * 0.5);
    const upperBound = q3 + 3 * iqr;

    // Also check for sudden jumps between consecutive candles
    const filteredCandles: ChartCandle[] = [];
    let lastValidPrice = medianPrice;

    for (let i = 0; i < validCandles.length; i++) {
      const c = validCandles[i];
      const maxPrice = Math.max(c.high, c.open, c.close);
      const minPrice = Math.min(c.low, c.open, c.close);

      // Check if within reasonable bounds
      if (maxPrice > upperBound || minPrice < lowerBound) {
        continue; // Skip outlier
      }

      // Check for sudden price jump (more than 50% change in one candle)
      const priceChange = Math.abs(c.close - lastValidPrice) / lastValidPrice;
      if (priceChange > 0.5 && filteredCandles.length > 0) {
        continue; // Skip abnormal jump
      }

      filteredCandles.push(c);
      lastValidPrice = c.close;
    }

    return filteredCandles;
  }

  updateCandle(candle: ChartCandle): void {
    // Validate the incoming candle
    if (!this.isValidCandle(candle)) {
      return;
    }

    if (this.candles.length === 0) {
      this.candles.push(candle);
    } else {
      const lastCandle = this.candles[this.candles.length - 1];
      if (lastCandle.time === candle.time) {
        this.candles[this.candles.length - 1] = candle;
      } else if (candle.time > lastCandle.time) {
        this.candles.push(candle);
        // Auto-scroll to show new candle (only if user hasn't panned away)
        if (!this.userHasPanned && this.viewport.endIndex >= this.candles.length - 1) {
          this.viewport.endIndex = this.candles.length;
          this.viewport.startIndex = Math.max(0, this.viewport.endIndex - this.getVisibleCandleCount());
        }
      }
    }

    if (this.autoScalePrice) {
      this.calculatePriceRange();
    }
    this.render();

    if (this.onPriceChange) {
      this.onPriceChange(candle.close);
    }
  }

  /**
   * Check if a single candle is valid
   */
  private isValidCandle(c: ChartCandle): boolean {
    // Check for NaN or Infinity
    if (!Number.isFinite(c.open) || !Number.isFinite(c.high) ||
        !Number.isFinite(c.low) || !Number.isFinite(c.close) ||
        !Number.isFinite(c.volume) || !Number.isFinite(c.time)) {
      return false;
    }
    // Check for negative prices
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      return false;
    }
    // Check OHLC consistency
    if (c.high < c.low || c.high < c.open || c.high < c.close ||
        c.low > c.open || c.low > c.close) {
      return false;
    }
    return true;
  }

  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    // Reset transform to avoid compounding — render() applies setTransform per frame
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.dimensions.width = width;
    this.dimensions.height = height;
    this.render();
  }

  setTheme(theme: Partial<ChartTheme>): void {
    this.theme = { ...this.theme, ...theme };
    this.render();
  }

  setShowVolume(show: boolean): void {
    this.showVolume = show;
    this.render();
  }

  setShowGrid(show: boolean): void {
    this.showGrid = show;
    this.render();
  }

  setOnPriceChange(callback: (price: number) => void): void {
    this.onPriceChange = callback;
  }

  setOnCrosshairMove(callback: (time: number, price: number) => void): void {
    this.onCrosshairMove = callback;
  }

  setOnCrosshairCandleData(callback: (data: CrosshairCandleData | null) => void): void {
    this.onCrosshairCandleData = callback;
  }

  setCrosshairStyle(style: Partial<CrosshairStyle>): void {
    this.crosshairStyle = { ...this.crosshairStyle, ...style };
    this.render();
  }

  fitToData(): void {
    this.userHasPanned = false;
    const visibleCount = this.getVisibleCandleCount();
    this.viewport.endIndex = this.candles.length;
    this.viewport.startIndex = Math.max(0, this.candles.length - visibleCount);
    this.calculatePriceRange();
    this.render();
  }

  zoomIn(): void {
    const center = (this.viewport.startIndex + this.viewport.endIndex) / 2;
    const range = this.viewport.endIndex - this.viewport.startIndex;
    const newRange = Math.max(10, range * 0.8);
    this.viewport.startIndex = Math.max(0, Math.floor(center - newRange / 2));
    this.viewport.endIndex = Math.min(this.candles.length, Math.ceil(center + newRange / 2));
    if (this.autoScalePrice) {
      this.calculatePriceRange();
    }
    this.render();
  }

  zoomOut(): void {
    const center = (this.viewport.startIndex + this.viewport.endIndex) / 2;
    const range = this.viewport.endIndex - this.viewport.startIndex;
    const newRange = Math.min(this.candles.length, range * 1.25);
    this.viewport.startIndex = Math.max(0, Math.floor(center - newRange / 2));
    this.viewport.endIndex = Math.min(this.candles.length, Math.ceil(center + newRange / 2));
    if (this.autoScalePrice) {
      this.calculatePriceRange();
    }
    this.render();
  }

  /**
   * Zoom X axis only (time)
   */
  zoomInX(): void {
    const center = (this.viewport.startIndex + this.viewport.endIndex) / 2;
    const range = this.viewport.endIndex - this.viewport.startIndex;
    const newRange = Math.max(10, range * 0.8);
    this.viewport.startIndex = Math.max(0, Math.floor(center - newRange / 2));
    this.viewport.endIndex = Math.min(this.candles.length, Math.ceil(center + newRange / 2));
    if (this.autoScalePrice) {
      this.calculatePriceRange();
    }
    this.render();
  }

  zoomOutX(): void {
    const center = (this.viewport.startIndex + this.viewport.endIndex) / 2;
    const range = this.viewport.endIndex - this.viewport.startIndex;
    const newRange = Math.min(this.candles.length, range * 1.25);
    this.viewport.startIndex = Math.max(0, Math.floor(center - newRange / 2));
    this.viewport.endIndex = Math.min(this.candles.length, Math.ceil(center + newRange / 2));
    if (this.autoScalePrice) {
      this.calculatePriceRange();
    }
    this.render();
  }

  /**
   * Zoom Y axis only (price) - more detail when zooming in
   */
  zoomInY(centerY?: number): void {
    this.autoScalePrice = false;
    const { priceMin, priceMax } = this.viewport;
    const priceRange = priceMax - priceMin;
    const newRange = priceRange * 0.8;

    // Calculate center price (from mouse position or middle)
    const chartHeight = this.getPriceChartHeight();
    const centerPrice = centerY !== undefined
      ? priceMax - (centerY / chartHeight) * priceRange
      : (priceMin + priceMax) / 2;

    this.viewport.priceMin = centerPrice - newRange / 2;
    this.viewport.priceMax = centerPrice + newRange / 2;
    this.render();
  }

  zoomOutY(centerY?: number): void {
    this.autoScalePrice = false;
    const { priceMin, priceMax } = this.viewport;
    const priceRange = priceMax - priceMin;
    const newRange = priceRange * 1.25;

    const chartHeight = this.getPriceChartHeight();
    const centerPrice = centerY !== undefined
      ? priceMax - (centerY / chartHeight) * priceRange
      : (priceMin + priceMax) / 2;

    this.viewport.priceMin = centerPrice - newRange / 2;
    this.viewport.priceMax = centerPrice + newRange / 2;
    this.render();
  }

  /**
   * Reset price scale to auto
   */
  resetPriceScale(): void {
    this.autoScalePrice = true;
    this.calculatePriceRange();
    this.render();
  }

  /**
   * Check if a point is on the price axis
   */
  private isOnPriceAxis(x: number): boolean {
    const { width, priceAxisWidth } = this.dimensions;
    return x >= width - priceAxisWidth;
  }

  destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
  }

  // ============ RENDERING ============

  render(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.ctx.save();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Clear
      this.ctx.fillStyle = this.theme.background;
      this.ctx.fillRect(0, 0, this.dimensions.width, this.dimensions.height);

      // Draw components
      if (this.showGrid) this.drawGrid();
      this.drawCandles();
      if (this.showVolume) this.drawVolume();
      this.drawPriceAxis();
      this.drawTimeAxis();
      this.drawCurrentPriceLine();
      if (this.crosshair.visible) this.drawCrosshair();

      this.ctx.restore();
    });
  }

  private drawGrid(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { priceMin, priceMax } = this.viewport;
    const chartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);
    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) return;

    // Calculate nice price step based on zoom level
    const niceStep = this.calculateNicePriceStep(priceRange);
    const subStep = niceStep / 4; // 4 sub-divisions

    // Sub-grid lines (lighter, dashed)
    this.ctx.strokeStyle = this.theme.gridLines;
    this.ctx.globalAlpha = 0.3;
    this.ctx.lineWidth = 0.5;
    this.ctx.setLineDash([2, 4]);

    const firstSubPrice = Math.ceil(priceMin / subStep) * subStep;
    for (let price = firstSubPrice; price <= priceMax; price += subStep) {
      // Skip major grid positions
      if (Math.abs(price % niceStep) < subStep * 0.1) continue;
      const y = ((priceMax - price) / priceRange) * chartHeight;
      if (y >= 0 && y <= chartHeight) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(chartWidth, y);
        this.ctx.stroke();
      }
    }
    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = 1;

    // Major grid lines
    this.ctx.strokeStyle = this.theme.gridLines;
    this.ctx.lineWidth = 1;

    const firstNicePrice = Math.ceil(priceMin / niceStep) * niceStep;
    for (let price = firstNicePrice; price <= priceMax; price += niceStep) {
      const y = ((priceMax - price) / priceRange) * chartHeight;
      if (y >= 0 && y <= chartHeight) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(chartWidth, y);
        this.ctx.stroke();
      }
    }

    // Volume separator line
    if (this.showVolume) {
      const sepY = chartHeight;
      this.ctx.strokeStyle = this.theme.gridLines;
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = 0.6;
      this.ctx.beginPath();
      this.ctx.moveTo(0, sepY);
      this.ctx.lineTo(chartWidth, sepY);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    }

    // Vertical lines
    const timeSteps = Math.floor(chartWidth / 100);
    for (let i = 0; i <= timeSteps; i++) {
      const x = (chartWidth / timeSteps) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, chartHeight + (this.showVolume ? volumeHeight : 0));
      this.ctx.stroke();
    }
  }

  /**
   * Calculate a "nice" price step for grid lines based on zoom level
   * Returns round numbers like 1, 2, 5, 10, 20, 50, 100, 500, 1000, etc.
   */
  private calculateNicePriceStep(priceRange: number): number {
    // Target ~6-8 grid lines
    const targetSteps = 6;
    const rawStep = priceRange / targetSteps;

    // Find the order of magnitude
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));

    // Normalize to 1-10 range
    const normalized = rawStep / magnitude;

    // Round to nice number
    let niceNormalized: number;
    if (normalized <= 1.5) {
      niceNormalized = 1;
    } else if (normalized <= 3) {
      niceNormalized = 2;
    } else if (normalized <= 7) {
      niceNormalized = 5;
    } else {
      niceNormalized = 10;
    }

    return niceNormalized * magnitude;
  }

  private drawCandles(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { startIndex, endIndex, priceMin, priceMax } = this.viewport;

    const chartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);
    const visibleCandles = endIndex - startIndex;
    const candleTotalWidth = chartWidth / visibleCandles;
    const candleBodyWidth = candleTotalWidth * 0.7;
    const candleOffset = candleTotalWidth * 0.15;

    const priceRange = priceMax - priceMin;
    if (priceRange === 0) return;

    const safeStart = Math.max(0, startIndex);
    for (let i = safeStart; i < endIndex && i < this.candles.length; i++) {
      const candle = this.candles[i];
      const x = (i - startIndex) * candleTotalWidth + candleOffset;
      const isUp = candle.close >= candle.open;

      // Calculate Y positions
      const highY = ((priceMax - candle.high) / priceRange) * chartHeight;
      const lowY = ((priceMax - candle.low) / priceRange) * chartHeight;
      const openY = ((priceMax - candle.open) / priceRange) * chartHeight;
      const closeY = ((priceMax - candle.close) / priceRange) * chartHeight;

      // Draw wick
      this.ctx.strokeStyle = isUp ? this.theme.wickUp : this.theme.wickDown;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      const wickX = x + candleBodyWidth / 2;
      this.ctx.moveTo(wickX, highY);
      this.ctx.lineTo(wickX, lowY);
      this.ctx.stroke();

      // Draw body
      this.ctx.fillStyle = isUp ? this.theme.candleUp : this.theme.candleDown;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      this.ctx.fillRect(x, bodyTop, candleBodyWidth, bodyHeight);

      // Draw border if specified
      const borderColor = isUp ? this.theme.candleBorderUp : this.theme.candleBorderDown;
      if (borderColor) {
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, bodyTop, candleBodyWidth, bodyHeight);
      }
    }
  }

  private drawVolume(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { startIndex, endIndex } = this.viewport;

    const chartWidth = width - priceAxisWidth;
    const chartTop = height - timeAxisHeight - volumeHeight;
    const visibleCandles = endIndex - startIndex;
    const candleTotalWidth = chartWidth / visibleCandles;
    const barWidth = candleTotalWidth * 0.7;
    const barOffset = candleTotalWidth * 0.15;

    // Find max volume in visible range (clamp to valid indices)
    const safeStart = Math.max(0, startIndex);
    let maxVolume = 0;
    for (let i = safeStart; i < endIndex && i < this.candles.length; i++) {
      maxVolume = Math.max(maxVolume, this.candles[i].volume);
    }
    if (maxVolume === 0) return;

    for (let i = safeStart; i < endIndex && i < this.candles.length; i++) {
      const candle = this.candles[i];
      const x = (i - startIndex) * candleTotalWidth + barOffset;
      const isUp = candle.close >= candle.open;

      const barHeight = (candle.volume / maxVolume) * (volumeHeight - 5);
      const y = chartTop + volumeHeight - barHeight;

      // Volume bars — use solid color (gradients are too expensive per-bar)
      this.ctx.fillStyle = isUp ? this.theme.volumeUp : this.theme.volumeDown;
      this.ctx.fillRect(x, y, barWidth, barHeight);
    }
  }

  private drawPriceAxis(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { priceMin, priceMax } = this.viewport;

    const chartHeight = height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);
    const axisX = width - priceAxisWidth;
    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) return;

    // Background
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(axisX, 0, priceAxisWidth, chartHeight);

    // Border
    this.ctx.strokeStyle = this.theme.gridLines;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(axisX, 0);
    this.ctx.lineTo(axisX, chartHeight);
    this.ctx.stroke();

    // Price labels at nice levels (matching grid)
    this.ctx.fillStyle = this.theme.text;
    this.ctx.font = '11px monospace';
    this.ctx.textAlign = 'left';

    const niceStep = this.calculateNicePriceStep(priceRange);
    const firstNicePrice = Math.ceil(priceMin / niceStep) * niceStep;

    for (let price = firstNicePrice; price <= priceMax; price += niceStep) {
      const y = ((priceMax - price) / priceRange) * chartHeight;
      if (y >= 10 && y <= chartHeight - 10) {
        this.ctx.fillText(this.formatPrice(price), axisX + 8, y + 4);
      }
    }
  }

  private drawTimeAxis(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { startIndex, endIndex } = this.viewport;

    const chartWidth = width - priceAxisWidth;
    const axisY = height - timeAxisHeight;

    // Background
    this.ctx.fillStyle = this.theme.background;
    this.ctx.fillRect(0, axisY, width, timeAxisHeight);

    // Border
    this.ctx.strokeStyle = this.theme.gridLines;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, axisY);
    this.ctx.lineTo(chartWidth, axisY);
    this.ctx.stroke();

    // Time labels
    this.ctx.fillStyle = this.theme.text;
    this.ctx.font = '10px monospace';
    this.ctx.textAlign = 'center';

    const visibleCandles = endIndex - startIndex;
    const labelInterval = Math.max(1, Math.floor(visibleCandles / 8));

    // Start from the first valid candle index, aligned to labelInterval
    const safeStart = Math.max(0, startIndex);
    const alignedStart = safeStart + ((labelInterval - ((safeStart - startIndex) % labelInterval)) % labelInterval);
    for (let i = alignedStart; i < endIndex && i < this.candles.length; i += labelInterval) {
      const candle = this.candles[i];
      const x = ((i - startIndex) / visibleCandles) * chartWidth;
      const timeStr = this.formatTime(candle.time);
      this.ctx.fillText(timeStr, x, axisY + 18);
    }
  }

  private drawCurrentPriceLine(): void {
    if (this.candles.length === 0) return;

    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { priceMin, priceMax } = this.viewport;

    const chartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);

    const currentPrice = this.candles[this.candles.length - 1].close;
    const priceRange = priceMax - priceMin;
    if (priceRange === 0) return;

    const y = ((priceMax - currentPrice) / priceRange) * chartHeight;

    // Don't draw if outside visible range
    if (y < 0 || y > chartHeight) return;

    // Dashed line
    this.ctx.strokeStyle = this.theme.priceLineColor;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(chartWidth, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Price label
    const isUp = this.candles.length > 1 && currentPrice >= this.candles[this.candles.length - 2].close;
    this.ctx.fillStyle = isUp ? this.theme.candleUp : this.theme.candleDown;
    this.ctx.fillRect(chartWidth, y - 10, priceAxisWidth, 20);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 11px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.formatPrice(currentPrice), chartWidth + 8, y + 4);
  }

  private drawCrosshair(): void {
    const { width, height, priceAxisWidth, timeAxisHeight, volumeHeight } = this.dimensions;
    const { priceMin, priceMax, startIndex, endIndex } = this.viewport;

    const chartWidth = width - priceAxisWidth;
    const chartHeight = height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);

    const { x, y } = this.crosshair;

    // Don't draw outside chart area
    if (x < 0 || x > chartWidth || y < 0 || y > chartHeight) return;

    // Crosshair lines - use customizable style
    this.ctx.strokeStyle = this.crosshairStyle.color;
    this.ctx.lineWidth = this.crosshairStyle.lineWidth;
    this.ctx.setLineDash(this.crosshairStyle.dashPattern);

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, chartHeight + (this.showVolume ? volumeHeight : 0));
    this.ctx.stroke();

    // Horizontal line
    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(chartWidth, y);
    this.ctx.stroke();

    this.ctx.setLineDash([]);

    // Price label
    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) return;
    const price = priceMax - (y / chartHeight) * priceRange;

    this.ctx.fillStyle = this.theme.crosshairLabelBg;
    this.ctx.fillRect(chartWidth, y - 10, priceAxisWidth, 20);
    this.ctx.fillStyle = this.theme.crosshairLabel;
    this.ctx.font = '11px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.formatPrice(price), chartWidth + 8, y + 4);

    // Time label + candle highlight
    const visibleCandles = endIndex - startIndex;
    const candleIndex = Math.floor((x / chartWidth) * visibleCandles) + startIndex;
    if (candleIndex >= 0 && candleIndex < this.candles.length) {
      const candle = this.candles[candleIndex];
      const timeStr = this.formatTime(candle.time);
      const labelWidth = timeStr.length * 7 + 10;

      const axisY = height - timeAxisHeight;
      this.ctx.fillStyle = this.theme.crosshairLabelBg;
      this.ctx.fillRect(x - labelWidth / 2, axisY, labelWidth, 20);
      this.ctx.fillStyle = this.theme.crosshairLabel;
      this.ctx.font = '10px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(timeStr, x, axisY + 14);

      // Highlight the hovered candle with a subtle glow
      const candleTotalWidth = chartWidth / visibleCandles;
      const candleX = (candleIndex - startIndex) * candleTotalWidth;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      this.ctx.fillRect(candleX, 0, candleTotalWidth, chartHeight);

      // Draw OHLCV info tooltip near crosshair
      this.drawCrosshairTooltip(candle, x, y, chartWidth, chartHeight);

      // Emit callbacks
      if (this.onCrosshairMove) {
        this.onCrosshairMove(candle.time, price);
      }
      if (this.onCrosshairCandleData) {
        const prevCandle = candleIndex > 0 ? this.candles[candleIndex - 1] : candle;
        const change = candle.close - prevCandle.close;
        const changePercent = prevCandle.close > 0 ? (change / prevCandle.close) * 100 : 0;
        this.onCrosshairCandleData({
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          change,
          changePercent,
          index: candleIndex,
        });
      }
    }
  }

  /**
   * Draw OHLCV tooltip near the crosshair position
   */
  private drawCrosshairTooltip(candle: ChartCandle, x: number, y: number, chartWidth: number, chartHeight: number): void {
    const isUp = candle.close >= candle.open;
    const tooltipW = 145;
    const tooltipH = 72;
    const pad = 8;

    // Position tooltip: prefer top-right of cursor, avoid overflow
    let tx = x + 14;
    let ty = y - tooltipH - 8;
    if (tx + tooltipW > chartWidth) tx = x - tooltipW - 14;
    if (ty < 0) ty = y + 14;
    if (ty + tooltipH > chartHeight) ty = chartHeight - tooltipH - 4;

    // Background with rounded corners
    this.ctx.fillStyle = 'rgba(15, 15, 20, 0.92)';
    this.ctx.beginPath();
    this.roundRect(tx, ty, tooltipW, tooltipH, 6);
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.roundRect(tx, ty, tooltipW, tooltipH, 6);
    this.ctx.stroke();

    // OHLCV data
    const lines = [
      { label: 'O', value: this.formatPrice(candle.open) },
      { label: 'H', value: this.formatPrice(candle.high) },
      { label: 'L', value: this.formatPrice(candle.low) },
      { label: 'C', value: this.formatPrice(candle.close) },
      { label: 'V', value: this.formatVolume(candle.volume) },
    ];

    const lineH = 12;
    const startY = ty + pad + 4;
    this.ctx.textAlign = 'left';

    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineH;
      // Label
      this.ctx.font = '9px monospace';
      this.ctx.fillStyle = 'rgba(255,255,255,0.35)';
      this.ctx.fillText(lines[i].label, tx + pad, ly);
      // Value
      this.ctx.font = '10px monospace';
      this.ctx.fillStyle = i === 4 ? 'rgba(255,255,255,0.6)' : (isUp ? this.theme.candleUp : this.theme.candleDown);
      this.ctx.fillText(lines[i].value, tx + pad + 16, ly);
    }
  }

  /**
   * Draw rounded rectangle path (helper)
   */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Format volume for display
   */
  private formatVolume(vol: number): string {
    if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
    if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
    if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
    return vol.toFixed(2);
  }

  // ============ HELPERS ============

  private getVisibleCandleCount(): number {
    const { width, priceAxisWidth } = this.dimensions;
    const chartWidth = width - priceAxisWidth;
    return Math.floor(chartWidth / 12); // ~12px per candle
  }

  private calculatePriceRange(): void {
    const { startIndex, endIndex } = this.viewport;

    if (this.candles.length === 0) return;

    // Clamp indices to valid candle data range (startIndex can be negative when panning into empty space)
    const safeStart = Math.max(0, startIndex);
    const safeEnd = Math.min(this.candles.length, endIndex);

    let min = Infinity;
    let max = -Infinity;

    for (let i = safeStart; i < safeEnd; i++) {
      const candle = this.candles[i];
      min = Math.min(min, candle.low);
      max = Math.max(max, candle.high);
    }

    if (min === Infinity || max === -Infinity) return;

    // Add padding
    const range = max - min;
    const padding = range * 0.05;
    this.viewport.priceMin = min - padding;
    this.viewport.priceMax = max + padding;
  }

  /**
   * Intelligent price formatting based on zoom level
   * - Zoomed out (large range): rounded prices, fewer decimals
   * - Zoomed in (small range): detailed prices, more decimals
   */
  private formatPrice(price: number): string {
    const { priceMin, priceMax } = this.viewport;
    const priceRange = priceMax - priceMin;

    // Determine decimals based on zoom level and price magnitude
    let decimals: number;

    if (price >= 10000) {
      // High prices (BTC, indices)
      if (priceRange > 5000) {
        decimals = 0; // Very zoomed out: 95000
      } else if (priceRange > 1000) {
        decimals = 0; // Zoomed out: 95000
      } else if (priceRange > 200) {
        decimals = 1; // Medium: 95000.5
      } else if (priceRange > 50) {
        decimals = 2; // Zoomed in: 95000.50
      } else {
        decimals = 2; // Very zoomed in: 95000.50
      }
    } else if (price >= 1000) {
      // Medium-high prices (ETH, stocks)
      if (priceRange > 500) {
        decimals = 0; // Very zoomed out: 3500
      } else if (priceRange > 100) {
        decimals = 1; // Zoomed out: 3500.5
      } else if (priceRange > 20) {
        decimals = 2; // Medium: 3500.50
      } else {
        decimals = 2; // Zoomed in: 3500.50
      }
    } else if (price >= 100) {
      // Medium prices (SOL, etc)
      if (priceRange > 50) {
        decimals = 1; // Zoomed out: 150.5
      } else if (priceRange > 10) {
        decimals = 2; // Medium: 150.50
      } else if (priceRange > 2) {
        decimals = 3; // Zoomed in: 150.500
      } else {
        decimals = 4; // Very zoomed in: 150.5000
      }
    } else if (price >= 1) {
      // Low prices (XRP, DOGE, etc)
      if (priceRange > 5) {
        decimals = 2; // Zoomed out: 0.50
      } else if (priceRange > 1) {
        decimals = 3; // Medium: 0.500
      } else if (priceRange > 0.1) {
        decimals = 4; // Zoomed in: 0.5000
      } else {
        decimals = 5; // Very zoomed in: 0.50000
      }
    } else if (price >= 0.01) {
      // Very low prices (SHIB, etc)
      if (priceRange > 0.1) {
        decimals = 4; // Zoomed out
      } else if (priceRange > 0.01) {
        decimals = 5; // Medium
      } else if (priceRange > 0.001) {
        decimals = 6; // Zoomed in
      } else {
        decimals = 8; // Very zoomed in
      }
    } else {
      // Micro prices
      if (priceRange > 0.001) {
        decimals = 6;
      } else if (priceRange > 0.0001) {
        decimals = 7;
      } else {
        decimals = 8; // Maximum precision
      }
    }

    return price.toFixed(decimals);
  }

  /**
   * Get the chart height for price calculations
   */
  private getPriceChartHeight(): number {
    const { height, timeAxisHeight, volumeHeight } = this.dimensions;
    return height - timeAxisHeight - (this.showVolume ? volumeHeight : 0);
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // ============ EVENT HANDLERS ============

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.handleDoubleClick);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
  }

  private handleDoubleClick = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Double-click on price axis resets to auto-scale
    if (this.isOnPriceAxis(x)) {
      this.resetPriceScale();
    } else {
      // Double-click on chart fits to data
      this.fitToData();
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on price axis
    if (this.isOnPriceAxis(x)) {
      this.isDraggingPriceAxis = true;
      this.lastDragY = e.clientY;
      this.canvas.style.cursor = 'ns-resize';
    } else {
      this.isDragging = true;
      this.lastDragX = e.clientX;
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDraggingPriceAxis) {
      // Zoom Y by dragging on price axis
      const deltaY = e.clientY - this.lastDragY;
      this.lastDragY = e.clientY;
      this.zoomYByDrag(deltaY);
    } else if (this.isDragging) {
      const deltaX = e.clientX - this.lastDragX;
      this.lastDragX = e.clientX;
      this.pan(deltaX);
    } else {
      // Update cursor based on position
      if (this.isOnPriceAxis(x)) {
        this.canvas.style.cursor = 'ns-resize';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
      this.crosshair = { x, y, visible: true };
      this.render();
    }
  };

  private handleMouseUp = (): void => {
    this.isDragging = false;
    this.isDraggingPriceAxis = false;
    this.canvas.style.cursor = 'crosshair';
  };

  private handleMouseLeave = (): void => {
    this.isDragging = false;
    this.isDraggingPriceAxis = false;
    this.crosshair.visible = false;
    this.canvas.style.cursor = 'crosshair';
    if (this.onCrosshairCandleData) this.onCrosshairCandleData(null);
    this.render();
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if on price axis - zoom Y only
    if (this.isOnPriceAxis(x)) {
      if (e.deltaY < 0) {
        this.zoomInY(y);
      } else {
        this.zoomOutY(y);
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // CTRL + scroll = zoom X only (time axis)
      if (e.deltaY < 0) {
        this.zoomInX();
      } else {
        this.zoomOutX();
      }
    } else {
      // Normal scroll = zoom both X and Y
      if (e.deltaY < 0) {
        this.zoomIn();
        if (!this.autoScalePrice) {
          this.zoomInY(y);
        }
      } else {
        this.zoomOut();
        if (!this.autoScalePrice) {
          this.zoomOutY(y);
        }
      }
    }
  };

  /**
   * Zoom Y axis by dragging on price axis
   */
  private zoomYByDrag(deltaY: number): void {
    this.autoScalePrice = false;
    const { priceMin, priceMax } = this.viewport;
    const priceRange = priceMax - priceMin;

    // Dragging down = zoom out (expand range), dragging up = zoom in (contract range)
    const zoomFactor = 1 + (deltaY * 0.005);
    const newRange = priceRange * zoomFactor;

    const centerPrice = (priceMin + priceMax) / 2;
    this.viewport.priceMin = centerPrice - newRange / 2;
    this.viewport.priceMax = centerPrice + newRange / 2;
    this.render();
  }

  private handleTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastDragX = e.touches[0].clientX;
    } else if (e.touches.length === 2) {
      this.lastPinchDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1 && this.isDragging) {
      const deltaX = e.touches[0].clientX - this.lastDragX;
      this.lastDragX = e.touches[0].clientX;
      this.pan(deltaX);
    } else if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

      if (this.lastPinchDistance > 0) {
        if (distance > this.lastPinchDistance * 1.05) {
          this.zoomIn();
        } else if (distance < this.lastPinchDistance * 0.95) {
          this.zoomOut();
        }
      }

      this.lastPinchDistance = distance;
    }
  };

  private handleTouchEnd = (): void => {
    this.isDragging = false;
    this.lastPinchDistance = 0;
  };

  private pan(deltaX: number): void {
    const { width, priceAxisWidth } = this.dimensions;
    const chartWidth = width - priceAxisWidth;
    const visibleCandles = this.viewport.endIndex - this.viewport.startIndex;
    const candlesPanned = Math.round((deltaX / chartWidth) * visibleCandles);

    if (candlesPanned === 0) return;

    // Allow panning beyond data: left margin (show empty past) and right margin (show empty future space)
    const rightMargin = Math.floor(visibleCandles * 0.5); // 50% of visible width as right margin
    const maxEndIndex = this.candles.length + rightMargin;

    const newStartIndex = Math.max(-rightMargin, this.viewport.startIndex - candlesPanned);
    const newEndIndex = Math.min(maxEndIndex, this.viewport.endIndex - candlesPanned);

    if (newStartIndex !== this.viewport.startIndex) {
      this.viewport.startIndex = newStartIndex;
      this.viewport.endIndex = newEndIndex;

      // Mark that user has panned away from latest
      if (this.viewport.endIndex < this.candles.length) {
        this.userHasPanned = true;
      }

      this.calculatePriceRange();
      this.render();
    }
  }
}
