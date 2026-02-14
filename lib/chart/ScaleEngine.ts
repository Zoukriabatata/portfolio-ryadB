/**
 * SCALE ENGINE - Professional Price & Time Scale Management
 *
 * Professional architecture
 * - Adaptive price scale with nice numbers
 * - Time scale with zoom at cursor
 * - Coordinate transformations
 */

// ============ TYPES ============

export interface ScaleConfig {
  canvasWidth: number;
  canvasHeight: number;
  priceAreaHeight: number;  // Height excluding time axis
  timeAreaWidth: number;    // Width excluding price axis
  priceAxisWidth: number;   // Width of price labels area
  timeAxisHeight: number;   // Height of time labels area
}

export interface PriceScaleState {
  visiblePriceMin: number;
  visiblePriceMax: number;
  tickSize: number;
  zoomLevel: number;  // 1.0 = default
}

export interface TimeScaleState {
  visibleTimeStart: number;  // Unix timestamp (seconds)
  visibleTimeEnd: number;
  candlePeriodSeconds: number;
  zoomLevel: number;  // 1.0 = default
}

export interface ScaleLabel {
  value: number;
  position: number;  // X or Y coordinate
  text: string;
  isMajor: boolean;
}

// ============ PRICE SCALE ENGINE ============

export class PriceScaleEngine {
  private state: PriceScaleState;
  private config: ScaleConfig;

  constructor(config: ScaleConfig, initialState?: Partial<PriceScaleState>) {
    this.config = config;
    this.state = {
      visiblePriceMin: initialState?.visiblePriceMin ?? 0,
      visiblePriceMax: initialState?.visiblePriceMax ?? 100,
      tickSize: initialState?.tickSize ?? 1,
      zoomLevel: initialState?.zoomLevel ?? 1,
    };
  }

  // ============ GETTERS ============

  get visiblePriceRange(): number {
    return this.state.visiblePriceMax - this.state.visiblePriceMin;
  }

  get pricePerPixel(): number {
    return this.visiblePriceRange / this.config.priceAreaHeight;
  }

  get centerPrice(): number {
    return (this.state.visiblePriceMax + this.state.visiblePriceMin) / 2;
  }

  getState(): PriceScaleState {
    return { ...this.state };
  }

  // ============ COORDINATE TRANSFORMS ============

  /**
   * Convert price to Y coordinate
   * Note: Y increases downward, price increases upward
   */
  priceToY(price: number): number {
    const ratio = (this.state.visiblePriceMax - price) / this.visiblePriceRange;
    return ratio * this.config.priceAreaHeight;
  }

  /**
   * Convert Y coordinate to price
   */
  yToPrice(y: number): number {
    const ratio = y / this.config.priceAreaHeight;
    return this.state.visiblePriceMax - (ratio * this.visiblePriceRange);
  }

  // ============ NAVIGATION ============

  /**
   * Pan by pixels (positive = scroll up = higher prices visible)
   */
  pan(deltaPixels: number): void {
    const deltaPrice = deltaPixels * this.pricePerPixel;
    this.state.visiblePriceMin += deltaPrice;
    this.state.visiblePriceMax += deltaPrice;
  }

  /**
   * Zoom centered on a specific price
   * factor > 1 = zoom in (less range visible)
   * factor < 1 = zoom out (more range visible)
   */
  zoomAtPrice(factor: number, targetPrice: number): void {
    const oldRange = this.visiblePriceRange;
    const newRange = oldRange / factor;

    // Clamp to reasonable bounds
    const minRange = this.state.tickSize * 10;
    const maxRange = this.state.tickSize * 5000;
    const clampedRange = Math.max(minRange, Math.min(maxRange, newRange));

    // Keep targetPrice at same screen position
    const targetRatio = (this.state.visiblePriceMax - targetPrice) / oldRange;
    this.state.visiblePriceMax = targetPrice + (clampedRange * targetRatio);
    this.state.visiblePriceMin = this.state.visiblePriceMax - clampedRange;

    this.state.zoomLevel *= factor;
  }

  /**
   * Set visible range directly
   */
  setVisibleRange(min: number, max: number): void {
    this.state.visiblePriceMin = min;
    this.state.visiblePriceMax = max;
  }

  /**
   * Auto-fit to data range with padding
   */
  autoFit(dataMin: number, dataMax: number, paddingPercent: number = 0.1): void {
    const range = dataMax - dataMin;
    const padding = range * paddingPercent;
    this.state.visiblePriceMin = dataMin - padding;
    this.state.visiblePriceMax = dataMax + padding;
  }

  // ============ LABELS ============

  /**
   * Generate price labels with adaptive step
   */
  generateLabels(minSpacing: number = 40): ScaleLabel[] {
    const step = this.computeNiceStep(minSpacing);
    const labels: ScaleLabel[] = [];

    // Start from first price that's a multiple of step
    const firstPrice = Math.ceil(this.state.visiblePriceMin / step) * step;

    for (let price = firstPrice; price <= this.state.visiblePriceMax; price += step) {
      const y = this.priceToY(price);

      // Check if this is a major label (rounder number)
      const majorStep = step * 5;
      const isMajor = Math.abs(price % majorStep) < this.state.tickSize * 0.01;

      labels.push({
        value: price,
        position: y,
        text: this.formatPrice(price),
        isMajor,
      });
    }

    return labels;
  }

  /**
   * Compute nice step for labels
   */
  private computeNiceStep(minSpacing: number): number {
    const maxLabels = Math.floor(this.config.priceAreaHeight / minSpacing);
    const idealStep = this.visiblePriceRange / maxLabels;

    // Nice numbers: 1, 2, 5, 10, 20, 25, 50, 100...
    const magnitude = Math.pow(10, Math.floor(Math.log10(idealStep)));
    const normalized = idealStep / magnitude;

    let nice: number;
    if (normalized < 1.5) nice = 1;
    else if (normalized < 3) nice = 2;
    else if (normalized < 7) nice = 5;
    else nice = 10;

    const result = nice * magnitude;

    // Ensure it's a multiple of tick size
    return Math.max(this.state.tickSize, Math.round(result / this.state.tickSize) * this.state.tickSize);
  }

  /**
   * Format price for display
   */
  private formatPrice(price: number): string {
    const decimals = this.state.tickSize < 1
      ? Math.ceil(-Math.log10(this.state.tickSize))
      : 0;

    return price.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // ============ CONFIG ============

  updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setTickSize(tickSize: number): void {
    this.state.tickSize = tickSize;
  }
}

// ============ TIME SCALE ENGINE ============

interface TimeStep {
  interval: number;
  format: string;
  majorInterval: number;
  majorFormat: string;
}

const TIME_STEPS: TimeStep[] = [
  { interval: 1, format: 'HH:mm:ss', majorInterval: 10, majorFormat: 'HH:mm:ss' },
  { interval: 5, format: 'HH:mm:ss', majorInterval: 30, majorFormat: 'HH:mm:ss' },
  { interval: 10, format: 'HH:mm:ss', majorInterval: 60, majorFormat: 'HH:mm' },
  { interval: 30, format: 'HH:mm:ss', majorInterval: 300, majorFormat: 'HH:mm' },
  { interval: 60, format: 'HH:mm', majorInterval: 900, majorFormat: 'HH:mm' },
  { interval: 300, format: 'HH:mm', majorInterval: 3600, majorFormat: 'HH:mm' },
  { interval: 900, format: 'HH:mm', majorInterval: 3600, majorFormat: 'HH:mm' },
  { interval: 1800, format: 'HH:mm', majorInterval: 7200, majorFormat: 'HH:mm' },
  { interval: 3600, format: 'HH:mm', majorInterval: 14400, majorFormat: 'dd MMM' },
  { interval: 14400, format: 'HH:mm', majorInterval: 86400, majorFormat: 'dd MMM' },
  { interval: 86400, format: 'dd MMM', majorInterval: 604800, majorFormat: 'dd MMM' },
];

export class TimeScaleEngine {
  private state: TimeScaleState;
  private config: ScaleConfig;
  private timezone: string = 'UTC';

  constructor(config: ScaleConfig, initialState?: Partial<TimeScaleState>) {
    this.config = config;
    this.state = {
      visibleTimeStart: initialState?.visibleTimeStart ?? Date.now() / 1000 - 3600,
      visibleTimeEnd: initialState?.visibleTimeEnd ?? Date.now() / 1000,
      candlePeriodSeconds: initialState?.candlePeriodSeconds ?? 60,
      zoomLevel: initialState?.zoomLevel ?? 1,
    };
  }

  // ============ GETTERS ============

  get visibleDuration(): number {
    return this.state.visibleTimeEnd - this.state.visibleTimeStart;
  }

  get pixelsPerSecond(): number {
    return this.config.timeAreaWidth / this.visibleDuration;
  }

  get visibleCandleCount(): number {
    return Math.ceil(this.visibleDuration / this.state.candlePeriodSeconds);
  }

  getState(): TimeScaleState {
    return { ...this.state };
  }

  // ============ COORDINATE TRANSFORMS ============

  /**
   * Convert time to X coordinate
   */
  timeToX(timestamp: number): number {
    const ratio = (timestamp - this.state.visibleTimeStart) / this.visibleDuration;
    return ratio * this.config.timeAreaWidth;
  }

  /**
   * Convert X coordinate to time
   */
  xToTime(x: number): number {
    const ratio = x / this.config.timeAreaWidth;
    return this.state.visibleTimeStart + (ratio * this.visibleDuration);
  }

  // ============ NAVIGATION ============

  /**
   * Pan by pixels (negative = earlier, positive = later)
   */
  pan(deltaPixels: number): void {
    const deltaTime = deltaPixels / this.pixelsPerSecond;
    this.state.visibleTimeStart -= deltaTime;
    this.state.visibleTimeEnd -= deltaTime;
  }

  /**
   * Zoom centered on a specific time
   */
  zoomAtTime(factor: number, targetTime: number): void {
    const oldDuration = this.visibleDuration;
    const newDuration = oldDuration / factor;

    // Clamp to reasonable bounds
    const minDuration = this.state.candlePeriodSeconds * 5;
    const maxDuration = this.state.candlePeriodSeconds * 500;
    const clampedDuration = Math.max(minDuration, Math.min(maxDuration, newDuration));

    // Keep targetTime at same screen position
    const targetRatio = (targetTime - this.state.visibleTimeStart) / oldDuration;
    this.state.visibleTimeStart = targetTime - (clampedDuration * targetRatio);
    this.state.visibleTimeEnd = this.state.visibleTimeStart + clampedDuration;

    this.state.zoomLevel *= factor;
  }

  /**
   * Scroll to show specific time
   */
  scrollToTime(timestamp: number, position: 'left' | 'center' | 'right' = 'right'): void {
    const duration = this.visibleDuration;

    switch (position) {
      case 'left':
        this.state.visibleTimeStart = timestamp;
        this.state.visibleTimeEnd = timestamp + duration;
        break;
      case 'center':
        this.state.visibleTimeStart = timestamp - duration / 2;
        this.state.visibleTimeEnd = timestamp + duration / 2;
        break;
      case 'right':
        this.state.visibleTimeEnd = timestamp + duration * 0.1;  // 10% padding
        this.state.visibleTimeStart = this.state.visibleTimeEnd - duration;
        break;
    }
  }

  /**
   * Set visible range directly
   */
  setVisibleRange(start: number, end: number): void {
    this.state.visibleTimeStart = start;
    this.state.visibleTimeEnd = end;
  }

  // ============ LABELS ============

  /**
   * Generate time labels with adaptive step
   */
  generateLabels(minSpacing: number = 80): ScaleLabel[] {
    const step = this.selectTimeStep(minSpacing);
    const labels: ScaleLabel[] = [];

    // Start from first time that's a multiple of step.interval
    const firstTime = Math.ceil(this.state.visibleTimeStart / step.interval) * step.interval;

    for (let time = firstTime; time <= this.state.visibleTimeEnd; time += step.interval) {
      const x = this.timeToX(time);
      const isMajor = time % step.majorInterval === 0;

      labels.push({
        value: time,
        position: x,
        text: this.formatTime(time, isMajor ? step.majorFormat : step.format),
        isMajor,
      });
    }

    return labels;
  }

  /**
   * Select appropriate time step
   */
  private selectTimeStep(minSpacing: number): TimeStep {
    const maxLabels = Math.floor(this.config.timeAreaWidth / minSpacing);
    const idealInterval = this.visibleDuration / maxLabels;

    for (const step of TIME_STEPS) {
      if (step.interval >= idealInterval) {
        return step;
      }
    }

    return TIME_STEPS[TIME_STEPS.length - 1];
  }

  /**
   * Format time for display
   */
  private formatTime(timestamp: number, format: string): string {
    const date = new Date(timestamp * 1000);

    // Apply timezone offset
    const options: Intl.DateTimeFormatOptions = {
      timeZone: this.timezone,
      hour12: false,
    };

    if (format.includes('ss')) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.second = '2-digit';
    } else if (format.includes('mm')) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }

    if (format.includes('dd')) {
      options.day = '2-digit';
      options.month = 'short';
    }

    return date.toLocaleString(undefined, options);
  }

  // ============ CONFIG ============

  updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setTimezone(tz: string): void {
    this.timezone = tz;
  }

  setCandlePeriod(seconds: number): void {
    this.state.candlePeriodSeconds = seconds;
  }
}

// ============ COMBINED CHART SCALE ============

export interface ChartScales {
  price: PriceScaleEngine;
  time: TimeScaleEngine;
}

export function createChartScales(config: ScaleConfig): ChartScales {
  return {
    price: new PriceScaleEngine(config),
    time: new TimeScaleEngine(config),
  };
}
