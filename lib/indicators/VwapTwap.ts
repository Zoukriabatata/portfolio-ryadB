/**
 * VWAP & TWAP INDICATORS - ATAS Professional Style
 *
 * VWAP: Volume Weighted Average Price
 * - Sum(Price × Volume) / Sum(Volume)
 * - Updates on EVERY trade (tick-by-tick)
 * - Responds to volume: high volume at extreme prices PULLS VWAP
 * - Session anchored (resets at midnight UTC)
 *
 * TWAP: Time Weighted Average Price
 * - Sum(Price) / Count of TIME PERIODS
 * - Updates only ONCE per time period (candle)
 * - IGNORES volume completely - pure time average
 * - Smooth line, less reactive to spikes
 *
 * KEY DIFFERENCE (Why they diverge):
 * - If price spikes to $100 with 1000 volume, VWAP moves strongly
 * - TWAP only records $100 once (regardless of volume)
 * - This creates visible divergence during high-volume moves
 */

// ============ TYPES ============

export interface VwapTwapData {
  time: number;
  vwap: number;
  twap: number;
  upperBand1?: number;  // VWAP + 1 std dev
  lowerBand1?: number;  // VWAP - 1 std dev
  upperBand2?: number;  // VWAP + 2 std dev
  lowerBand2?: number;  // VWAP - 2 std dev
}

export interface VwapTwapConfig {
  // Session anchoring
  sessionStartHour: number;      // UTC hour for session start (e.g., 0 for midnight UTC)
  sessionStartMinute: number;

  // Visual settings
  vwapColor: string;
  twapColor: string;
  bandColor: string;
  lineWidth: number;
  bandOpacity: number;
  showBands: boolean;

  // Calculation
  useTypicalPrice: boolean;      // (H+L+C)/3 instead of close
}

export const DEFAULT_VWAP_TWAP_CONFIG: VwapTwapConfig = {
  sessionStartHour: 0,           // Midnight UTC
  sessionStartMinute: 0,

  vwapColor: '#2196f3',          // Blue
  twapColor: '#ff9800',          // Orange
  bandColor: '#2196f3',
  lineWidth: 1.5,
  bandOpacity: 0.15,
  showBands: false,

  useTypicalPrice: true,
};

// ============ CANDLE INTERFACE ============

export interface OHLCVCandle {
  time: number;       // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ============ VWAP/TWAP ENGINE ============

export class VwapTwapEngine {
  private config: VwapTwapConfig;

  // ─── VWAP ACCUMULATOR (Volume Weighted) ───
  private cumulativeTPV: number = 0;     // Sum(TypicalPrice × Volume)
  private cumulativeVolume: number = 0;  // Sum(Volume)

  // ─── TWAP ACCUMULATOR (Time Weighted - per candle/period, NOT per tick) ───
  private twapPriceSum: number = 0;      // Sum(Price) - one entry per TIME PERIOD
  private twapPeriodCount: number = 0;   // Count of TIME PERIODS (candles), NOT ticks

  // For standard deviation bands (VWAP only)
  private priceSquaredSum: number = 0;

  // Session tracking
  private sessionStartTime: number = 0;
  private lastProcessedTime: number = 0;

  // TWAP: Track last candle time to avoid double-counting within same period
  private lastTwapPeriodTime: number = 0;

  // Data points
  private dataPoints: VwapTwapData[] = [];

  constructor(config: Partial<VwapTwapConfig> = {}) {
    this.config = { ...DEFAULT_VWAP_TWAP_CONFIG, ...config };
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<VwapTwapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get session start time for a given timestamp
   */
  private getSessionStart(timestamp: number): number {
    const date = new Date(timestamp * 1000);
    date.setUTCHours(this.config.sessionStartHour, this.config.sessionStartMinute, 0, 0);

    // If current time is before session start, use previous day's session
    if (date.getTime() / 1000 > timestamp) {
      date.setUTCDate(date.getUTCDate() - 1);
    }

    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Calculate typical price
   */
  private getTypicalPrice(candle: OHLCVCandle): number {
    if (this.config.useTypicalPrice) {
      return (candle.high + candle.low + candle.close) / 3;
    }
    return candle.close;
  }

  /**
   * Reset calculations for new session
   */
  reset(): void {
    // VWAP accumulators
    this.cumulativeTPV = 0;
    this.cumulativeVolume = 0;
    this.priceSquaredSum = 0;

    // TWAP accumulators (completely separate from VWAP)
    this.twapPriceSum = 0;
    this.twapPeriodCount = 0;
    this.lastTwapPeriodTime = 0;

    // Session tracking
    this.sessionStartTime = 0;
    this.lastProcessedTime = 0;
    this.dataPoints = [];
  }

  /**
   * Process historical candles
   */
  processCandles(candles: OHLCVCandle[]): VwapTwapData[] {
    this.reset();

    for (const candle of candles) {
      this.processCandle(candle);
    }

    return this.dataPoints;
  }

  /**
   * Process a single candle
   *
   * VWAP: Sum(TypicalPrice × Volume) / Sum(Volume)
   *       - Responds to volume (high volume at extreme prices = more pull)
   *
   * TWAP: Sum(Price) / Count of TIME PERIODS
   *       - Equal weight per candle regardless of volume
   *       - Smooth, time-based average
   */
  processCandle(candle: OHLCVCandle): VwapTwapData | null {
    const sessionStart = this.getSessionStart(candle.time);

    // New session - reset ALL calculations
    if (sessionStart !== this.sessionStartTime) {
      // VWAP reset
      this.cumulativeTPV = 0;
      this.cumulativeVolume = 0;
      this.priceSquaredSum = 0;

      // TWAP reset (completely independent)
      this.twapPriceSum = 0;
      this.twapPeriodCount = 0;
      this.lastTwapPeriodTime = 0;

      this.sessionStartTime = sessionStart;
    }

    // Skip if already processed
    if (candle.time <= this.lastProcessedTime) {
      return null;
    }

    const typicalPrice = this.getTypicalPrice(candle);
    const volume = candle.volume || 1; // Fallback to 1 if no volume

    // ─── UPDATE VWAP (Volume Weighted) ───
    // High volume at extreme prices will PULL vwap toward that price
    this.cumulativeTPV += typicalPrice * volume;
    this.cumulativeVolume += volume;
    this.priceSquaredSum += typicalPrice * typicalPrice * volume;

    // ─── UPDATE TWAP (Time Weighted - per candle) ───
    // Each candle gets EXACTLY 1 unit of weight, regardless of volume
    // This is the key difference: TWAP doesn't care about volume
    this.twapPriceSum += typicalPrice;
    this.twapPeriodCount += 1;
    this.lastTwapPeriodTime = candle.time;

    // ─── CALCULATE VWAP ───
    const vwap = this.cumulativeVolume > 0
      ? this.cumulativeTPV / this.cumulativeVolume
      : typicalPrice;

    // ─── CALCULATE TWAP ───
    // Pure arithmetic mean of prices over time periods
    const twap = this.twapPeriodCount > 0
      ? this.twapPriceSum / this.twapPeriodCount
      : typicalPrice;

    // Calculate standard deviation for bands (VWAP-based)
    let stdDev = 0;
    if (this.cumulativeVolume > 0 && this.config.showBands) {
      const variance = (this.priceSquaredSum / this.cumulativeVolume) - (vwap * vwap);
      stdDev = variance > 0 ? Math.sqrt(variance) : 0;
    }

    const dataPoint: VwapTwapData = {
      time: candle.time,
      vwap,
      twap,
      upperBand1: vwap + stdDev,
      lowerBand1: vwap - stdDev,
      upperBand2: vwap + stdDev * 2,
      lowerBand2: vwap - stdDev * 2,
    };

    this.dataPoints.push(dataPoint);
    this.lastProcessedTime = candle.time;

    return dataPoint;
  }

  /**
   * Process a live tick/trade
   *
   * CRITICAL: VWAP updates on EVERY tick (volume-weighted by trade)
   *           TWAP only updates once per TIME PERIOD (minute/candle)
   *
   * This is the key to making them DIVERGE properly:
   * - VWAP reacts immediately to volume spikes at extreme prices
   * - TWAP remains smooth, only updating at period boundaries
   *
   * @param price - Trade price
   * @param volume - Trade volume
   * @param timestamp - Unix seconds
   * @param periodSeconds - Time period for TWAP updates (default 60 = 1 minute)
   */
  processLiveTick(
    price: number,
    volume: number,
    timestamp: number,
    periodSeconds: number = 60
  ): VwapTwapData {
    const sessionStart = this.getSessionStart(timestamp);

    // New session - reset everything
    if (sessionStart !== this.sessionStartTime) {
      // VWAP reset
      this.cumulativeTPV = 0;
      this.cumulativeVolume = 0;
      this.priceSquaredSum = 0;

      // TWAP reset
      this.twapPriceSum = 0;
      this.twapPeriodCount = 0;
      this.lastTwapPeriodTime = 0;

      this.sessionStartTime = sessionStart;
    }

    // ─── UPDATE VWAP (Every tick - volume weighted) ───
    // VWAP responds immediately to every trade
    this.cumulativeTPV += price * volume;
    this.cumulativeVolume += volume;
    this.priceSquaredSum += price * price * volume;

    // ─── UPDATE TWAP (Only once per time period) ───
    // Calculate which period this tick belongs to
    const currentPeriod = Math.floor(timestamp / periodSeconds) * periodSeconds;

    // Only update TWAP if we've entered a NEW time period
    if (currentPeriod > this.lastTwapPeriodTime) {
      this.twapPriceSum += price;  // Add just ONE price sample for this period
      this.twapPeriodCount += 1;
      this.lastTwapPeriodTime = currentPeriod;
    }
    // If still in the same period, TWAP doesn't change
    // This ensures TWAP weights each TIME PERIOD equally, not each tick

    // ─── CALCULATE VALUES ───
    const vwap = this.cumulativeVolume > 0
      ? this.cumulativeTPV / this.cumulativeVolume
      : price;

    // TWAP: arithmetic mean of one price per period
    const twap = this.twapPeriodCount > 0
      ? this.twapPriceSum / this.twapPeriodCount
      : price;

    let stdDev = 0;
    if (this.config.showBands && this.cumulativeVolume > 0) {
      const variance = (this.priceSquaredSum / this.cumulativeVolume) - (vwap * vwap);
      stdDev = variance > 0 ? Math.sqrt(variance) : 0;
    }

    return {
      time: timestamp,
      vwap,
      twap,
      upperBand1: vwap + stdDev,
      lowerBand1: vwap - stdDev,
      upperBand2: vwap + stdDev * 2,
      lowerBand2: vwap - stdDev * 2,
    };
  }

  /**
   * Get current VWAP value
   */
  getCurrentVwap(): number {
    if (this.cumulativeVolume === 0) return 0;
    return this.cumulativeTPV / this.cumulativeVolume;
  }

  /**
   * Get current TWAP value
   */
  getCurrentTwap(): number {
    if (this.twapPeriodCount === 0) return 0;
    return this.twapPriceSum / this.twapPeriodCount;
  }

  /**
   * Get all data points
   */
  getDataPoints(): VwapTwapData[] {
    return this.dataPoints;
  }

  /**
   * Get config
   */
  getConfig(): VwapTwapConfig {
    return this.config;
  }
}

// ============ RENDERER ============

export class VwapTwapRenderer {
  private config: VwapTwapConfig;

  constructor(config: Partial<VwapTwapConfig> = {}) {
    this.config = { ...DEFAULT_VWAP_TWAP_CONFIG, ...config };
  }

  setConfig(config: Partial<VwapTwapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Render VWAP/TWAP lines on canvas
   */
  render(
    ctx: CanvasRenderingContext2D,
    dataPoints: VwapTwapData[],
    timeToX: (time: number) => number,
    priceToY: (price: number) => number,
    visibleTimeRange: { start: number; end: number },
    options: {
      showVwap?: boolean;
      showTwap?: boolean;
      showBands?: boolean;
    } = {}
  ): void {
    const { showVwap = true, showTwap = true, showBands = this.config.showBands } = options;

    // Filter to visible range
    const visibleData = dataPoints.filter(
      d => d.time >= visibleTimeRange.start && d.time <= visibleTimeRange.end
    );

    if (visibleData.length < 2) return;

    // ── VWAP Bands (render first, behind lines) ──
    if (showBands && showVwap) {
      this.renderBands(ctx, visibleData, timeToX, priceToY);
    }

    // ── VWAP Line ──
    if (showVwap) {
      this.renderLine(
        ctx,
        visibleData,
        timeToX,
        priceToY,
        d => d.vwap,
        this.config.vwapColor,
        this.config.lineWidth
      );
    }

    // ── TWAP Line ──
    if (showTwap) {
      this.renderLine(
        ctx,
        visibleData,
        timeToX,
        priceToY,
        d => d.twap,
        this.config.twapColor,
        this.config.lineWidth
      );
    }

    // ── Labels ──
    if (visibleData.length > 0) {
      const lastPoint = visibleData[visibleData.length - 1];
      const labelX = timeToX(lastPoint.time) + 5;

      if (showVwap) {
        this.renderLabel(ctx, 'VWAP', lastPoint.vwap, labelX, priceToY, this.config.vwapColor);
      }
      if (showTwap) {
        this.renderLabel(ctx, 'TWAP', lastPoint.twap, labelX, priceToY, this.config.twapColor);
      }
    }
  }

  /**
   * Render a single line
   */
  private renderLine(
    ctx: CanvasRenderingContext2D,
    data: VwapTwapData[],
    timeToX: (time: number) => number,
    priceToY: (price: number) => number,
    getValue: (d: VwapTwapData) => number,
    color: string,
    lineWidth: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    let started = false;

    for (const point of data) {
      const value = getValue(point);
      if (!value || !isFinite(value)) continue;

      const x = timeToX(point.time);
      const y = priceToY(value);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Render standard deviation bands
   */
  private renderBands(
    ctx: CanvasRenderingContext2D,
    data: VwapTwapData[],
    timeToX: (time: number) => number,
    priceToY: (price: number) => number
  ): void {
    if (data.length < 2) return;

    ctx.fillStyle = this.config.bandColor;
    ctx.globalAlpha = this.config.bandOpacity;

    // Band 1 (1 std dev)
    ctx.beginPath();

    // Upper line
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      if (!point.upperBand1) continue;
      const x = timeToX(point.time);
      const y = priceToY(point.upperBand1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Lower line (reverse)
    for (let i = data.length - 1; i >= 0; i--) {
      const point = data[i];
      if (!point.lowerBand1) continue;
      const x = timeToX(point.time);
      const y = priceToY(point.lowerBand1);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Render price label
   */
  private renderLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    price: number,
    x: number,
    priceToY: (price: number) => number,
    color: string
  ): void {
    const y = priceToY(price);

    ctx.font = 'bold 9px system-ui';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Background
    const text = `${label}: ${price.toFixed(2)}`;
    const textWidth = ctx.measureText(text).width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 2, y - 7, textWidth + 8, 14);

    ctx.fillStyle = color;
    ctx.fillText(text, x + 2, y);
  }

  /**
   * Render horizontal VWAP/TWAP price line across entire chart
   */
  renderHorizontalLine(
    ctx: CanvasRenderingContext2D,
    price: number,
    priceToY: (price: number) => number,
    chartWidth: number,
    color: string,
    label: string
  ): void {
    const y = priceToY(price);

    // Dashed line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Label badge
    ctx.fillStyle = color;
    ctx.fillRect(chartWidth - 55, y - 8, 55, 16);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, chartWidth - 27, y);
  }
}

// ============ SINGLETON ============

let vwapTwapEngine: VwapTwapEngine | null = null;
let vwapTwapRenderer: VwapTwapRenderer | null = null;

export function getVwapTwapEngine(config?: Partial<VwapTwapConfig>): VwapTwapEngine {
  if (!vwapTwapEngine) {
    vwapTwapEngine = new VwapTwapEngine(config);
  } else if (config) {
    vwapTwapEngine.setConfig(config);
  }
  return vwapTwapEngine;
}

export function getVwapTwapRenderer(config?: Partial<VwapTwapConfig>): VwapTwapRenderer {
  if (!vwapTwapRenderer) {
    vwapTwapRenderer = new VwapTwapRenderer(config);
  } else if (config) {
    vwapTwapRenderer.setConfig(config);
  }
  return vwapTwapRenderer;
}

export function resetVwapTwap(): void {
  vwapTwapEngine?.reset();
  vwapTwapEngine = null;
  vwapTwapRenderer = null;
}
