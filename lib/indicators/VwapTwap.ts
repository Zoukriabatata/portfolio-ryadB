/**
 * VWAP & TWAP INDICATORS — Professional ATAS-grade implementation
 *
 * VWAP: Volume Weighted Average Price
 * - Sum(TypicalPrice × Volume) / Sum(Volume)
 * - Updates on EVERY trade tick (tick-by-tick)
 * - Responds to volume: high volume at extreme prices PULLS VWAP
 * - Session anchored (resets at session start)
 *
 * TWAP: Time Weighted Average Price
 * - Sum(Price) / Count of TIME PERIODS
 * - Updates only ONCE per time period (candle)
 * - Ignores volume — pure time average
 * - Smooth line, less reactive to spikes
 *
 * Rendering: Catmull-Rom spline (smooth curves, anti-aliased)
 * Bands: 3 standard deviation bands with ATAS-style zone fills
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type VwapPeriod      = 'daily' | 'weekly' | 'monthly' | 'anchored' | 'custom';
export type VwapVolumeType  = 'total' | 'bid' | 'ask';
export type VwapSource      = 'hlc3' | 'hl2' | 'close' | 'ohlc4' | 'open';

export interface VwapTwapData {
  time:        number;
  vwap:        number;
  twap:        number;
  // Standard deviation bands (always computed, selectively rendered)
  upperBand1?: number;   // VWAP + 1σ
  lowerBand1?: number;   // VWAP − 1σ
  upperBand2?: number;   // VWAP + 2σ
  lowerBand2?: number;   // VWAP − 2σ
  upperBand3?: number;   // VWAP + 3σ
  lowerBand3?: number;   // VWAP − 3σ
  stdDev?:     number;   // Raw std dev (useful for external callers)
  bullish?:    boolean;  // Direction vs previous point (for colored-direction mode)
}

export interface VwapTwapConfig {
  // ── Calculation ──────────────────────────────────────────────────────────
  period:               VwapPeriod;     // Session scope
  source:               VwapSource;     // Price source for typical price
  volumeType:           VwapVolumeType; // Which volume side to weight by

  // Session boundaries (UTC hours)
  sessionStartHour:     number;
  sessionStartMinute:   number;
  sessionEndHour:       number;
  sessionEndMinute:     number;
  showFirstPartialPeriod: boolean;

  // TWAP specifics
  twapPeriodSeconds:    number;         // Granularity for TWAP periods (default 60 = 1 min)

  // ── Visualization ─────────────────────────────────────────────────────────
  coloredDirection:     boolean;        // Line color changes with VWAP direction
  bullishColor:         string;
  bearishColor:         string;

  // VWAP line
  vwapColor:            string;
  vwapLineWidth:        number;
  showVwapLabel:        boolean;

  // TWAP line
  twapColor:            string;
  twapLineWidth:        number;
  showTwapLabel:        boolean;

  // Standard deviation bands
  showBand1:            boolean;        // ±1σ
  showBand2:            boolean;        // ±2σ
  showBand3:            boolean;        // ±3σ
  bandMultiplier1:      number;         // Default 1.0
  bandMultiplier2:      number;         // Default 2.0
  bandMultiplier3:      number;         // Default 3.0

  // Fill zones (ATAS-style: upper fill, mid fill up/down, lower fill)
  showFills:            boolean;
  fillOpacityInner:     number;         // Between VWAP and ±1σ (0-1)
  fillOpacityMiddle:    number;         // Between ±1σ and ±2σ
  fillOpacityOuter:     number;         // Between ±2σ and ±3σ

  // Band line colors (if different from vwapColor)
  band1Color:           string;
  band2Color:           string;
  band3Color:           string;
  bandLineWidth:        number;

  // Spline smoothing (Catmull-Rom tension, 0=angular, 1=max smooth)
  splineTension:        number;
}

export const DEFAULT_VWAP_TWAP_CONFIG: VwapTwapConfig = {
  // Calculation
  period:               'daily',
  source:               'hlc3',
  volumeType:           'total',
  sessionStartHour:     0,
  sessionStartMinute:   0,
  sessionEndHour:       23,
  sessionEndMinute:     59,
  showFirstPartialPeriod: true,
  twapPeriodSeconds:    60,

  // Visualization
  coloredDirection:     false,
  bullishColor:         '#26a69a',
  bearishColor:         '#ef5350',

  vwapColor:            '#2196f3',
  vwapLineWidth:        2,
  showVwapLabel:        true,

  twapColor:            '#ff9800',
  twapLineWidth:        1.5,
  showTwapLabel:        true,

  showBand1:            true,
  showBand2:            true,
  showBand3:            false,
  bandMultiplier1:      1.0,
  bandMultiplier2:      2.0,
  bandMultiplier3:      3.0,

  showFills:            true,
  fillOpacityInner:     0.08,
  fillOpacityMiddle:    0.04,
  fillOpacityOuter:     0.02,

  band1Color:           '#2196f3',
  band2Color:           '#2196f3',
  band3Color:           '#2196f3',
  bandLineWidth:        1,

  splineTension:        0.4,
};

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCVCandle {
  time:    number;   // Unix seconds
  open:    number;
  high:    number;
  low:     number;
  close:   number;
  volume:  number;
  bidVol?: number;
  askVol?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class VwapTwapEngine {
  private config: VwapTwapConfig;

  // VWAP accumulators
  private cumulativeTPV:     number = 0;  // Sum(Source × Volume)
  private cumulativeVolume:  number = 0;  // Sum(Volume)
  private priceSquaredSum:   number = 0;  // Sum(Source² × Volume) — for stdDev

  // TWAP accumulators
  private twapPriceSum:      number = 0;
  private twapPeriodCount:   number = 0;
  private lastTwapPeriodTime:number = 0;

  // Session
  private sessionStartTime:  number = 0;
  private lastProcessedTime: number = 0;

  // Output
  private dataPoints: VwapTwapData[] = [];

  constructor(config: Partial<VwapTwapConfig> = {}) {
    this.config = { ...DEFAULT_VWAP_TWAP_CONFIG, ...config };
  }

  setConfig(config: Partial<VwapTwapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): VwapTwapConfig { return this.config; }
  getDataPoints(): VwapTwapData[] { return this.dataPoints; }

  getCurrentVwap(): number {
    return this.cumulativeVolume > 0 ? this.cumulativeTPV / this.cumulativeVolume : 0;
  }

  getCurrentTwap(): number {
    return this.twapPeriodCount > 0 ? this.twapPriceSum / this.twapPeriodCount : 0;
  }

  // ── Source price ────────────────────────────────────────────────────────

  private getSourcePrice(candle: OHLCVCandle): number {
    switch (this.config.source) {
      case 'hlc3':  return (candle.high + candle.low + candle.close) / 3;
      case 'hl2':   return (candle.high + candle.low) / 2;
      case 'ohlc4': return (candle.open + candle.high + candle.low + candle.close) / 4;
      case 'open':  return candle.open;
      case 'close':
      default:      return candle.close;
    }
  }

  private getVolume(candle: OHLCVCandle): number {
    switch (this.config.volumeType) {
      case 'bid': return candle.bidVol ?? candle.volume / 2;
      case 'ask': return candle.askVol ?? candle.volume / 2;
      default:    return candle.volume || 1;
    }
  }

  // ── Session management ───────────────────────────────────────────────────

  private getSessionStart(timestamp: number): number {
    const date = new Date(timestamp * 1000);
    date.setUTCHours(this.config.sessionStartHour, this.config.sessionStartMinute, 0, 0);
    if (date.getTime() / 1000 > timestamp) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return Math.floor(date.getTime() / 1000);
  }

  private resetAccumulators(): void {
    this.cumulativeTPV     = 0;
    this.cumulativeVolume  = 0;
    this.priceSquaredSum   = 0;
    this.twapPriceSum      = 0;
    this.twapPeriodCount   = 0;
    this.lastTwapPeriodTime= 0;
    this.sessionStartTime  = 0;
    this.lastProcessedTime = 0;
    this.dataPoints        = [];
  }

  reset(): void { this.resetAccumulators(); }

  // ── Standard deviation ───────────────────────────────────────────────────

  private computeStdDev(vwap: number): number {
    if (this.cumulativeVolume <= 0) return 0;
    const variance = (this.priceSquaredSum / this.cumulativeVolume) - (vwap * vwap);
    return variance > 0 ? Math.sqrt(variance) : 0;
  }

  private buildDataPoint(
    time: number,
    vwap: number,
    twap: number,
    prevVwap: number
  ): VwapTwapData {
    const m = this.config.bandMultiplier1;
    const m2 = this.config.bandMultiplier2;
    const m3 = this.config.bandMultiplier3;
    const sd = this.computeStdDev(vwap);

    return {
      time,
      vwap,
      twap,
      stdDev:     sd,
      upperBand1: vwap + sd * m,
      lowerBand1: vwap - sd * m,
      upperBand2: vwap + sd * m2,
      lowerBand2: vwap - sd * m2,
      upperBand3: vwap + sd * m3,
      lowerBand3: vwap - sd * m3,
      bullish:    vwap >= prevVwap,
    };
  }

  // ── Historical batch ─────────────────────────────────────────────────────

  processCandles(candles: OHLCVCandle[]): VwapTwapData[] {
    this.resetAccumulators();
    for (const candle of candles) this.processCandle(candle);
    return this.dataPoints;
  }

  processCandle(candle: OHLCVCandle): VwapTwapData | null {
    const sessionStart = this.getSessionStart(candle.time);

    if (sessionStart !== this.sessionStartTime) {
      this.cumulativeTPV    = 0;
      this.cumulativeVolume = 0;
      this.priceSquaredSum  = 0;
      this.twapPriceSum     = 0;
      this.twapPeriodCount  = 0;
      this.lastTwapPeriodTime = 0;
      this.sessionStartTime = sessionStart;
    }

    if (candle.time <= this.lastProcessedTime) return null;

    const src = this.getSourcePrice(candle);
    const vol = this.getVolume(candle);

    // VWAP
    this.cumulativeTPV    += src * vol;
    this.cumulativeVolume += vol;
    this.priceSquaredSum  += src * src * vol;

    // TWAP — one price per period
    this.twapPriceSum    += src;
    this.twapPeriodCount += 1;
    this.lastTwapPeriodTime = candle.time;

    const vwap = this.cumulativeVolume > 0
      ? this.cumulativeTPV / this.cumulativeVolume : src;
    const twap = this.twapPeriodCount > 0
      ? this.twapPriceSum / this.twapPeriodCount : src;

    const prev = this.dataPoints.length > 0
      ? this.dataPoints[this.dataPoints.length - 1].vwap : vwap;
    const dp = this.buildDataPoint(candle.time, vwap, twap, prev);

    this.dataPoints.push(dp);
    this.lastProcessedTime = candle.time;
    return dp;
  }

  // ── Live tick ────────────────────────────────────────────────────────────

  processLiveTick(
    price:     number,
    volume:    number,
    timestamp: number,
    periodSeconds: number = 60
  ): VwapTwapData {
    const sessionStart = this.getSessionStart(timestamp);
    if (sessionStart !== this.sessionStartTime) {
      this.cumulativeTPV    = 0;
      this.cumulativeVolume = 0;
      this.priceSquaredSum  = 0;
      this.twapPriceSum     = 0;
      this.twapPeriodCount  = 0;
      this.lastTwapPeriodTime = 0;
      this.sessionStartTime = sessionStart;
    }

    this.cumulativeTPV    += price * volume;
    this.cumulativeVolume += volume;
    this.priceSquaredSum  += price * price * volume;

    const currentPeriod = Math.floor(timestamp / periodSeconds) * periodSeconds;
    if (currentPeriod > this.lastTwapPeriodTime) {
      this.twapPriceSum    += price;
      this.twapPeriodCount += 1;
      this.lastTwapPeriodTime = currentPeriod;
    }

    const vwap = this.cumulativeVolume > 0
      ? this.cumulativeTPV / this.cumulativeVolume : price;
    const twap = this.twapPeriodCount > 0
      ? this.twapPriceSum / this.twapPeriodCount : price;

    const prev = this.dataPoints.length > 0
      ? this.dataPoints[this.dataPoints.length - 1].vwap : vwap;

    return this.buildDataPoint(timestamp, vwap, twap, prev);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATMULL-ROM SPLINE HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Draw a Catmull-Rom spline through screen-space (x,y) points.
 * tension: 0 = piecewise linear (same as lineTo), 0.5 = classic CR, 1 = tighter
 *
 * Algorithm: Convert Catmull-Rom into cubic Bezier segments.
 * For points P[i-1], P[i], P[i+1], P[i+2]:
 *   cp1 = P[i]   + tension * (P[i+1] - P[i-1]) / 6
 *   cp2 = P[i+1] - tension * (P[i+2] - P[i])   / 6
 */
function catmullRomSpline(
  ctx:     CanvasRenderingContext2D,
  points:  { x: number; y: number }[],
  tension: number = 0.4
): void {
  if (points.length < 2) return;

  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (tension * (p2.x - p0.x)) / 6;
    const cp1y = p1.y + (tension * (p2.y - p0.y)) / 6;
    const cp2x = p2.x - (tension * (p3.x - p1.x)) / 6;
    const cp2y = p2.y - (tension * (p3.y - p1.y)) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERER
// ─────────────────────────────────────────────────────────────────────────────

export class VwapTwapRenderer {
  private config: VwapTwapConfig;

  constructor(config: Partial<VwapTwapConfig> = {}) {
    this.config = { ...DEFAULT_VWAP_TWAP_CONFIG, ...config };
  }

  setConfig(config: Partial<VwapTwapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Master render ────────────────────────────────────────────────────────

  render(
    ctx:              CanvasRenderingContext2D,
    dataPoints:       VwapTwapData[],
    timeToX:          (time: number) => number,
    priceToY:         (price: number) => number,
    visibleTimeRange: { start: number; end: number },
    options: {
      showVwap?:   boolean;
      showTwap?:   boolean;
      showBands?:  boolean;
    } = {}
  ): void {
    const {
      showVwap  = true,
      showTwap  = true,
      showBands = this.config.showBand1 || this.config.showBand2 || this.config.showBand3,
    } = options;

    const visible = dataPoints.filter(
      d => d.time >= visibleTimeRange.start - 300 && d.time <= visibleTimeRange.end + 300
    );
    if (visible.length < 2) return;

    // 1. Zone fills (rendered first — behind everything)
    if (showBands && showVwap && this.config.showFills) {
      this.renderZoneFills(ctx, visible, timeToX, priceToY);
    }

    // 2. Band lines
    if (showBands && showVwap) {
      this.renderBandLines(ctx, visible, timeToX, priceToY);
    }

    // 3. VWAP line (on top)
    if (showVwap) {
      if (this.config.coloredDirection) {
        this.renderColoredDirectionLine(ctx, visible, timeToX, priceToY, 'vwap',
          this.config.vwapLineWidth);
      } else {
        this.renderSplineLine(ctx, visible, timeToX, priceToY,
          d => d.vwap, this.config.vwapColor, this.config.vwapLineWidth);
      }
      if (this.config.showVwapLabel && visible.length > 0) {
        const last = visible[visible.length - 1];
        this.renderLabel(ctx, 'VWAP', last.vwap, timeToX(last.time) + 6, priceToY,
          this.config.vwapColor);
      }
    }

    // 4. TWAP line
    if (showTwap) {
      this.renderSplineLine(ctx, visible, timeToX, priceToY,
        d => d.twap, this.config.twapColor, this.config.twapLineWidth);
      if (this.config.showTwapLabel && visible.length > 0) {
        const last = visible[visible.length - 1];
        this.renderLabel(ctx, 'TWAP', last.twap, timeToX(last.time) + 6, priceToY,
          this.config.twapColor);
      }
    }
  }

  // ── Smooth spline line ───────────────────────────────────────────────────

  private renderSplineLine(
    ctx:        CanvasRenderingContext2D,
    data:       VwapTwapData[],
    timeToX:    (t: number) => number,
    priceToY:   (p: number) => number,
    getValue:   (d: VwapTwapData) => number,
    color:      string,
    lineWidth:  number
  ): void {
    const pts = data
      .map(d => ({ x: timeToX(d.time), y: priceToY(getValue(d)) }))
      .filter(p => isFinite(p.x) && isFinite(p.y));

    if (pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    catmullRomSpline(ctx, pts, this.config.splineTension);
    ctx.stroke();
    ctx.restore();
  }

  // ── Colored-direction VWAP (bullish/bearish color per segment) ────────────

  private renderColoredDirectionLine(
    ctx:       CanvasRenderingContext2D,
    data:      VwapTwapData[],
    timeToX:   (t: number) => number,
    priceToY:  (p: number) => number,
    key:       'vwap' | 'twap',
    lineWidth: number
  ): void {
    if (data.length < 2) return;

    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const bullish = curr[key] >= prev[key];

      const x1 = timeToX(prev.time);
      const y1 = priceToY(prev[key]);
      const x2 = timeToX(curr.time);
      const y2 = priceToY(curr[key]);

      if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) continue;

      ctx.strokeStyle = bullish ? this.config.bullishColor : this.config.bearishColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      // Use a short Bezier for smooth per-segment coloring
      const cpx = (x1 + x2) / 2;
      ctx.quadraticCurveTo(cpx, y1, x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Band lines ────────────────────────────────────────────────────────────

  private renderBandLines(
    ctx:      CanvasRenderingContext2D,
    data:     VwapTwapData[],
    timeToX:  (t: number) => number,
    priceToY: (p: number) => number
  ): void {
    const bands: Array<{
      upper: keyof VwapTwapData;
      lower: keyof VwapTwapData;
      show:  boolean;
      color: string;
    }> = [
      { upper: 'upperBand1', lower: 'lowerBand1', show: this.config.showBand1, color: this.config.band1Color },
      { upper: 'upperBand2', lower: 'lowerBand2', show: this.config.showBand2, color: this.config.band2Color },
      { upper: 'upperBand3', lower: 'lowerBand3', show: this.config.showBand3, color: this.config.band3Color },
    ];

    for (const band of bands) {
      if (!band.show) continue;

      const lw = this.config.bandLineWidth;
      // Upper band
      this.renderSplineLine(ctx, data, timeToX, priceToY,
        d => (d[band.upper] as number) ?? d.vwap, band.color, lw);
      // Lower band
      this.renderSplineLine(ctx, data, timeToX, priceToY,
        d => (d[band.lower] as number) ?? d.vwap, band.color, lw);
    }
  }

  // ── Zone fills (ATAS-style: inner / middle / outer zones) ─────────────────

  private renderZoneFills(
    ctx:      CanvasRenderingContext2D,
    data:     VwapTwapData[],
    timeToX:  (t: number) => number,
    priceToY: (p: number) => number
  ): void {
    const color = this.config.vwapColor;

    // Zone 1: VWAP ↔ ±1σ (inner fill)
    if (this.config.showBand1) {
      this.renderFillZone(ctx, data, timeToX, priceToY,
        d => d.upperBand1 ?? d.vwap,
        d => d.lowerBand1 ?? d.vwap,
        color, this.config.fillOpacityInner);
    }

    // Zone 2: ±1σ ↔ ±2σ (middle fill)
    if (this.config.showBand1 && this.config.showBand2) {
      this.renderFillZone(ctx, data, timeToX, priceToY,
        d => d.upperBand2 ?? d.vwap,
        d => d.upperBand1 ?? d.vwap,
        color, this.config.fillOpacityMiddle);
      this.renderFillZone(ctx, data, timeToX, priceToY,
        d => d.lowerBand1 ?? d.vwap,
        d => d.lowerBand2 ?? d.vwap,
        color, this.config.fillOpacityMiddle);
    }

    // Zone 3: ±2σ ↔ ±3σ (outer fill)
    if (this.config.showBand2 && this.config.showBand3) {
      this.renderFillZone(ctx, data, timeToX, priceToY,
        d => d.upperBand3 ?? d.vwap,
        d => d.upperBand2 ?? d.vwap,
        color, this.config.fillOpacityOuter);
      this.renderFillZone(ctx, data, timeToX, priceToY,
        d => d.lowerBand2 ?? d.vwap,
        d => d.lowerBand3 ?? d.vwap,
        color, this.config.fillOpacityOuter);
    }
  }

  /** Fill between two smooth spline curves */
  private renderFillZone(
    ctx:       CanvasRenderingContext2D,
    data:      VwapTwapData[],
    timeToX:   (t: number) => number,
    priceToY:  (p: number) => number,
    getUpper:  (d: VwapTwapData) => number,
    getLower:  (d: VwapTwapData) => number,
    color:     string,
    opacity:   number
  ): void {
    if (data.length < 2 || opacity <= 0) return;

    const upper = data
      .map(d => ({ x: timeToX(d.time), y: priceToY(getUpper(d)) }))
      .filter(p => isFinite(p.x) && isFinite(p.y));
    const lower = data
      .map(d => ({ x: timeToX(d.time), y: priceToY(getLower(d)) }))
      .filter(p => isFinite(p.x) && isFinite(p.y));

    if (upper.length < 2 || lower.length < 2) return;

    ctx.save();
    ctx.fillStyle   = color;
    ctx.globalAlpha = opacity;

    ctx.beginPath();
    // Forward along upper band (Catmull-Rom)
    catmullRomSpline(ctx, upper, this.config.splineTension);
    // Backward along lower band (close the zone)
    const lowerReversed = [...lower].reverse();
    // Connect to end of lower band, then trace back
    ctx.lineTo(lowerReversed[0].x, lowerReversed[0].y);
    for (let i = 1; i < lowerReversed.length; i++) {
      ctx.lineTo(lowerReversed[i].x, lowerReversed[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Price label ───────────────────────────────────────────────────────────

  private renderLabel(
    ctx:      CanvasRenderingContext2D,
    label:    string,
    price:    number,
    x:        number,
    priceToY: (p: number) => number,
    color:    string
  ): void {
    if (!isFinite(price) || price <= 0) return;
    const y    = priceToY(price);
    const text = `${label} ${price.toFixed(2)}`;

    ctx.save();
    ctx.font         = 'bold 9px "Consolas", monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    const tw = ctx.measureText(text).width;
    ctx.fillStyle   = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 2, y - 7, tw + 8, 14);

    ctx.fillStyle = color;
    ctx.fillText(text, x + 2, y);
    ctx.restore();
  }

  // ── Horizontal line (for current VWAP across the full chart) ─────────────

  renderHorizontalLine(
    ctx:        CanvasRenderingContext2D,
    price:      number,
    priceToY:   (p: number) => number,
    chartWidth: number,
    color:      string,
    label:      string
  ): void {
    if (!isFinite(price) || price <= 0) return;
    const y = priceToY(price);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Badge
    ctx.fillStyle = color;
    ctx.fillRect(chartWidth - 55, y - 8, 55, 16);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 9px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, chartWidth - 27, y);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETONS
// ─────────────────────────────────────────────────────────────────────────────

let _engine:   VwapTwapEngine   | null = null;
let _renderer: VwapTwapRenderer | null = null;

export function getVwapTwapEngine(config?: Partial<VwapTwapConfig>): VwapTwapEngine {
  if (!_engine) _engine = new VwapTwapEngine(config);
  else if (config) _engine.setConfig(config);
  return _engine;
}

export function getVwapTwapRenderer(config?: Partial<VwapTwapConfig>): VwapTwapRenderer {
  if (!_renderer) _renderer = new VwapTwapRenderer(config);
  else if (config) _renderer.setConfig(config);
  return _renderer;
}

export function resetVwapTwap(): void {
  _engine?.reset();
  _engine   = null;
  _renderer = null;
}
