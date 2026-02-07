/**
 * FOOTPRINT RENDERER PRO - Professional Canvas Rendering
 *
 * Architecture style ATAS / NinjaTrader / Quantower
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  FOOTPRINT STRUCTURE (Fixed Width per Candle)                    │
 *   │                                                                   │
 *   │  ┌────────┬─────────────────────────┬────────┬────────────┐      │
 *   │  │  OHLC  │     BID x ASK CLUSTER   │ DELTA  │  PROFILE   │      │
 *   │  │ Candle │    (Footprint Data)     │ Profile│  (Session) │      │
 *   │  │  15px  │       ~70-80px          │  15px  │   40px     │      │
 *   │  ├────────┼─────────────────────────┼────────┼────────────┤      │
 *   │  │        │  1.2  x  0.8            │  +0.4  │   ████     │      │
 *   │  │   ▌    │  0.5  x  2.1            │  +1.6  │   ██████   │      │
 *   │  │   █    │  0.3  x  1.5            │  +1.2  │   ███      │      │
 *   │  │   █    │  1.8  x  0.4  ← POC     │  -1.4  │   █████    │      │
 *   │  │   ▐    │  0.9  x  1.2            │  +0.3  │   ████     │      │
 *   │  └────────┴─────────────────────────┴────────┴────────────┘      │
 *   │                                                                   │
 *   │  Red = Bid (Sells)    Green = Ask (Buys)                         │
 *   │  Highlight = Imbalance (300%+)   Box = POC                       │
 *   └──────────────────────────────────────────────────────────────────┘
 */

import type { FootprintCandle, PriceLevel } from './OrderflowEngine';
import type { PriceScaleEngine, TimeScaleEngine } from '../chart/ScaleEngine';
import { getPassiveLiquiditySimulator, type PassiveLevel, type StablePassiveLevel } from './PassiveLiquiditySimulator';

// ============ TYPES ============

export interface FootprintRenderConfig {
  // Layout (Fixed Width)
  footprintWidth: number;       // Total width per footprint (80-100px)
  ohlcWidth: number;            // OHLC candle width (15px)
  deltaProfileWidth: number;    // Delta profile width (15px)
  sessionProfileWidth: number;  // Session volume profile width (40px)
  rowHeight: number;            // Height per price level row
  padding: number;              // Internal padding

  // Colors - Background
  background: string;
  gridColor: string;
  gridColorMajor: string;

  // Colors - OHLC
  candleUpBody: string;
  candleDownBody: string;
  candleUpWick: string;
  candleDownWick: string;

  // Colors - Clusters
  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  separatorColor: string;

  // Colors - Imbalances
  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  imbalanceBuyText: string;
  imbalanceSellText: string;

  // Colors - POC
  pocBorderColor: string;
  pocBgColor: string;
  vahValColor: string;

  // Colors - Delta
  deltaPositive: string;
  deltaNegative: string;
  deltaBarPositive: string;
  deltaBarNegative: string;

  // Colors - Profile
  profileBarColor: string;
  profilePocColor: string;

  // Colors - Price Line
  currentPriceColor: string;
  currentPriceBg: string;

  // Opacities
  cellBgOpacity: number;
  imbalanceOpacity: number;
  pocBgOpacity: number;
  profileOpacity: number;

  // Fonts
  clusterFont: string;
  clusterFontBold: string;
  deltaFont: string;
  priceFont: string;
  timeFont: string;
  headerFont: string;

  // Features
  showOHLC: boolean;
  showClusters: boolean;
  showDeltaProfile: boolean;
  showSessionProfile: boolean;
  showImbalances: boolean;
  showPOC: boolean;
  showVAH_VAL: boolean;
  showGrid: boolean;
  showCurrentPrice: boolean;
  showVolumeBars: boolean;
  showPassiveLiquidity: boolean;

  // Passive Liquidity (Simulation)
  passiveLiquidityEnabled: boolean;
  passiveLiquidityIntensity: number;  // 0-1
  passiveLiquidityOpacity: number;    // 0-1
  passiveLiquidityFocusTicks: number; // 0 = show all
  passiveBidColor: string;
  passiveAskColor: string;
  passiveMaxBarWidth: number;

  // Performance
  maxVisibleFootprints: number;
  virtualizationBuffer: number;
}

export const DEFAULT_FOOTPRINT_RENDER_CONFIG: FootprintRenderConfig = {
  // Layout
  footprintWidth: 95,
  ohlcWidth: 14,
  deltaProfileWidth: 20,
  sessionProfileWidth: 40,
  rowHeight: 18,
  padding: 2,

  // Background
  background: '#0a0a0a',
  gridColor: '#1a1a1a',
  gridColorMajor: '#252525',

  // OHLC
  candleUpBody: '#22c55e',
  candleDownBody: '#ef4444',
  candleUpWick: '#22c55e',
  candleDownWick: '#ef4444',

  // Clusters
  bidColor: '#ef4444',
  askColor: '#22c55e',
  bidTextColor: '#fca5a5',
  askTextColor: '#86efac',
  separatorColor: '#333',

  // Imbalances
  imbalanceBuyBg: 'rgba(34, 197, 94, 0.3)',
  imbalanceSellBg: 'rgba(239, 68, 68, 0.3)',
  imbalanceBuyText: '#4ade80',
  imbalanceSellText: '#f87171',

  // POC
  pocBorderColor: '#facc15',
  pocBgColor: 'rgba(250, 204, 21, 0.15)',
  vahValColor: '#6366f1',

  // Delta
  deltaPositive: '#22c55e',
  deltaNegative: '#ef4444',
  deltaBarPositive: 'rgba(34, 197, 94, 0.4)',
  deltaBarNegative: 'rgba(239, 68, 68, 0.4)',

  // Profile
  profileBarColor: '#3b82f6',
  profilePocColor: '#facc15',

  // Current Price - Subtle professional style
  currentPriceColor: '#6b7280',
  currentPriceBg: 'rgba(107, 114, 128, 0.08)',

  // Opacities
  cellBgOpacity: 0.12,
  imbalanceOpacity: 0.35,
  pocBgOpacity: 0.2,
  profileOpacity: 0.6,

  // Fonts
  clusterFont: '11px JetBrains Mono, Consolas, monospace',
  clusterFontBold: 'bold 11px JetBrains Mono, Consolas, monospace',
  deltaFont: '8px JetBrains Mono, Consolas, monospace',
  priceFont: '9px JetBrains Mono, Consolas, monospace',
  timeFont: '8px system-ui, sans-serif',
  headerFont: '11px system-ui, sans-serif',

  // Features
  showOHLC: true,
  showClusters: true,
  showDeltaProfile: true,
  showSessionProfile: true,
  showImbalances: true,
  showPOC: true,
  showVAH_VAL: true,
  showGrid: true,
  showCurrentPrice: true,
  showVolumeBars: true,
  showPassiveLiquidity: true,

  // Passive Liquidity (Simulation)
  passiveLiquidityEnabled: true,
  passiveLiquidityIntensity: 0.6,
  passiveLiquidityOpacity: 0.25,
  passiveLiquidityFocusTicks: 0,
  passiveBidColor: '#00bcd4',
  passiveAskColor: '#ef5350',
  passiveMaxBarWidth: 80,

  // Performance
  maxVisibleFootprints: 30,
  virtualizationBuffer: 2,
};

// ============ RENDER STATE ============

interface RenderMetrics {
  visiblePriceMin: number;
  visiblePriceMax: number;
  visiblePriceRange: number;
  chartAreaX: number;
  chartAreaY: number;
  chartAreaWidth: number;
  chartAreaHeight: number;
  footprintStartX: number;
  visibleFootprints: number;
  rowsPerScreen: number;
}

// ============ FOOTPRINT RENDERER PRO ============

export class FootprintRendererPro {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: FootprintRenderConfig;
  private dpr: number;

  // Scale integration
  private priceScale: PriceScaleEngine | null = null;
  private timeScale: TimeScaleEngine | null = null;

  // Render metrics
  private metrics: RenderMetrics;

  // Session profile cache
  private sessionProfile: Map<number, number> = new Map();
  private sessionProfileMax: number = 0;

  // Frame management
  private frameId: number | null = null;
  private lastRenderTime: number = 0;
  private targetFps: number = 60;

  // Price context for USD conversion
  private currentPrice: number = 0;

  constructor(canvas: HTMLCanvasElement, config: Partial<FootprintRenderConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.config = { ...DEFAULT_FOOTPRINT_RENDER_CONFIG, ...config };
    this.dpr = window.devicePixelRatio || 1;

    this.metrics = {
      visiblePriceMin: 0,
      visiblePriceMax: 0,
      visiblePriceRange: 0,
      chartAreaX: 0,
      chartAreaY: 0,
      chartAreaWidth: 0,
      chartAreaHeight: 0,
      footprintStartX: 0,
      visibleFootprints: 0,
      rowsPerScreen: 0,
    };

    this.setupCanvas();
  }

  // ============ SETUP ============

  private setupCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    // Reset transform before applying new scale (prevents DPR accumulation on resize)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);

    // Enable font smoothing
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  resize(): void {
    this.setupCanvas();
    this.updateMetrics();
  }

  setConfig(config: Partial<FootprintRenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setScales(priceScale: PriceScaleEngine, timeScale: TimeScaleEngine): void {
    this.priceScale = priceScale;
    this.timeScale = timeScale;
  }

  // ============ METRICS ============

  private updateMetrics(): void {
    const { config } = this;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    const headerHeight = 30;
    const footerHeight = 35;
    const priceAxisWidth = 60;

    this.metrics.chartAreaX = 0;
    this.metrics.chartAreaY = headerHeight;
    this.metrics.chartAreaWidth = width - priceAxisWidth - (config.showSessionProfile ? config.sessionProfileWidth : 0);
    this.metrics.chartAreaHeight = height - headerHeight - footerHeight;
    this.metrics.visibleFootprints = Math.min(
      config.maxVisibleFootprints,
      Math.floor(this.metrics.chartAreaWidth / config.footprintWidth)
    );
    this.metrics.rowsPerScreen = Math.floor(this.metrics.chartAreaHeight / config.rowHeight);
  }

  // ============ COORDINATE TRANSFORMS ============

  private priceToY(price: number): number {
    if (this.priceScale) {
      return this.priceScale.priceToY(price) + this.metrics.chartAreaY;
    }
    // Fallback
    const { visiblePriceMin, visiblePriceMax, chartAreaY, chartAreaHeight } = this.metrics;
    const range = visiblePriceMax - visiblePriceMin;
    if (range === 0) return chartAreaY + chartAreaHeight / 2;
    return chartAreaY + ((visiblePriceMax - price) / range) * chartAreaHeight;
  }

  private timeToX(timestamp: number): number {
    if (this.timeScale) {
      return this.timeScale.timeToX(timestamp);
    }
    return 0;
  }

  // ============ MAIN RENDER ============

  render(
    candles: FootprintCandle[],
    tickSize: number,
    currentPrice?: number,
    scrollOffset: number = 0
  ): void {
    const now = performance.now();
    const elapsed = now - this.lastRenderTime;

    // Frame rate limiting
    if (elapsed < 1000 / this.targetFps) return;
    this.lastRenderTime = now;

    const { ctx, config } = this;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Store current price for USD volume conversion
    if (currentPrice) this.currentPrice = currentPrice;

    this.updateMetrics();

    // Clear
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, width, height);

    if (candles.length === 0) {
      this.renderEmptyState(width, height);
      return;
    }

    // Calculate visible candles
    const visibleCount = Math.min(candles.length, this.metrics.visibleFootprints);
    const startIdx = Math.max(0, candles.length - visibleCount - Math.floor(scrollOffset / config.footprintWidth));
    const endIdx = Math.min(candles.length, startIdx + visibleCount + config.virtualizationBuffer);
    const visibleCandles = candles.slice(startIdx, endIdx);

    // Calculate price range
    const priceRange = this.calculatePriceRange(visibleCandles, tickSize);
    this.metrics.visiblePriceMin = priceRange.min;
    this.metrics.visiblePriceMax = priceRange.max;
    this.metrics.visiblePriceRange = priceRange.max - priceRange.min;

    // Calculate footprint start X (aligned right)
    const totalWidth = visibleCandles.length * config.footprintWidth;
    this.metrics.footprintStartX = this.metrics.chartAreaWidth - totalWidth;

    // Build session profile
    this.buildSessionProfile(visibleCandles);

    // Render layers
    if (config.showGrid) {
      this.renderGrid(tickSize, width);
    }

    // Render passive liquidity FIRST (background layer)
    if (config.showPassiveLiquidity && config.passiveLiquidityEnabled) {
      this.renderPassiveLiquidity(tickSize, currentPrice);
    }

    // Render each footprint
    visibleCandles.forEach((candle, idx) => {
      const x = this.metrics.footprintStartX + idx * config.footprintWidth;
      this.renderFootprint(candle, x, tickSize);
    });

    // Render session profile
    if (config.showSessionProfile) {
      this.renderSessionProfile(tickSize, width);
    }

    // Render current price with candle direction color
    if (config.showCurrentPrice && currentPrice) {
      const lastCandle = candles[candles.length - 1];
      const isBullish = lastCandle ? lastCandle.close >= lastCandle.open : true;
      this.renderCurrentPriceLine(currentPrice, width, isBullish);
    }

    // Render price axis
    this.renderPriceAxis(tickSize, width);

    // Render header
    this.renderHeader(candles[candles.length - 1], width);

    // Render footer with times and deltas
    this.renderFooter(visibleCandles, height);

    // Render current time line on last candle (AFTER footer so badge is visible)
    if (config.showCurrentPrice && visibleCandles.length > 0) {
      const lastIdx = visibleCandles.length - 1;
      const lastCandleX = this.metrics.footprintStartX + lastIdx * config.footprintWidth;
      const lastCandle = visibleCandles[lastIdx];
      const isBullish = lastCandle.close >= lastCandle.open;
      this.renderCurrentTimeLine(lastCandleX, height, isBullish);
    }
  }

  // ============ FOOTPRINT RENDERING ============

  private renderFootprint(candle: FootprintCandle, x: number, tickSize: number): void {
    const { ctx, config, metrics } = this;
    const { footprintWidth, ohlcWidth, deltaProfileWidth, rowHeight, padding } = config;

    // Component positions
    const ohlcX = x + padding;
    const clusterX = x + ohlcWidth + padding * 2;
    const clusterWidth = footprintWidth - ohlcWidth - deltaProfileWidth - padding * 4;
    const deltaX = x + footprintWidth - deltaProfileWidth - padding;

    // Get sorted levels
    const levels = Array.from(candle.levels.entries())
      .sort((a, b) => b[0] - a[0]);

    // Find max volume for normalization
    let maxVolume = 1;
    levels.forEach(([_, level]) => {
      maxVolume = Math.max(maxVolume, level.bidVolume, level.askVolume);
    });

    // 1. Render OHLC candle
    if (config.showOHLC) {
      this.renderOHLCCandle(candle, ohlcX, ohlcWidth - padding);
    }

    // 2. Render clusters
    if (config.showClusters) {
      levels.forEach(([price, level]) => {
        const y = this.priceToY(price);
        if (y < metrics.chartAreaY - rowHeight || y > metrics.chartAreaY + metrics.chartAreaHeight + rowHeight) {
          return; // Skip if outside visible area
        }
        this.renderClusterRow(level, price, clusterX, y, clusterWidth, maxVolume, candle.poc);
      });
    }

    // 3. Render POC highlight box
    if (config.showPOC) {
      const pocY = this.priceToY(candle.poc);
      ctx.strokeStyle = config.pocBorderColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + padding, pocY - rowHeight / 2, footprintWidth - padding * 2, rowHeight);
    }

    // 4. Render VAH/VAL lines
    if (config.showVAH_VAL) {
      ctx.strokeStyle = config.vahValColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      const vahY = this.priceToY(candle.vah);
      const valY = this.priceToY(candle.val);

      ctx.beginPath();
      ctx.moveTo(x, vahY);
      ctx.lineTo(x + footprintWidth, vahY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, valY);
      ctx.lineTo(x + footprintWidth, valY);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // 5. Render delta profile
    if (config.showDeltaProfile) {
      this.renderDeltaProfile(levels, deltaX, deltaProfileWidth);
    }

    // 6. Render vertical separator
    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + footprintWidth, metrics.chartAreaY);
    ctx.lineTo(x + footprintWidth, metrics.chartAreaY + metrics.chartAreaHeight);
    ctx.stroke();
  }

  private renderOHLCCandle(candle: FootprintCandle, x: number, width: number): void {
    const { ctx, config, metrics } = this;
    const isUp = candle.close >= candle.open;

    const openY = this.priceToY(candle.open);
    const closeY = this.priceToY(candle.close);
    const highY = this.priceToY(candle.high);
    const lowY = this.priceToY(candle.low);

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(openY - closeY));
    const centerX = x + width / 2;

    // Wick
    ctx.strokeStyle = isUp ? config.candleUpWick : config.candleDownWick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, highY);
    ctx.lineTo(centerX, lowY);
    ctx.stroke();

    // Body
    ctx.fillStyle = isUp ? config.candleUpBody : config.candleDownBody;
    ctx.fillRect(x + 1, bodyTop, width - 2, bodyHeight);
  }

  private renderClusterRow(
    level: PriceLevel,
    price: number,
    x: number,
    y: number,
    width: number,
    maxVolume: number,
    pocPrice: number
  ): void {
    const { ctx, config } = this;
    const { rowHeight, padding } = config;
    const isPOC = price === pocPrice;
    const halfWidth = width / 2;
    const cellY = y - rowHeight / 2;

    // POC background
    if (isPOC && config.showPOC) {
      ctx.fillStyle = config.pocBgColor;
      ctx.fillRect(x, cellY, width, rowHeight);
    }

    // ATAS-style: NO imbalance backgrounds
    // Imbalance is indicated ONLY through text color (see text rendering below)
    // This provides cleaner, more professional orderflow visualization

    // Volume bars (background indicator)
    if (config.showVolumeBars) {
      const barHeight = 3;
      const barY = y + rowHeight / 2 - barHeight - 2;
      const barMaxWidth = halfWidth - padding - 15;

      if (level.bidVolume > 0) {
        const bidBarW = (level.bidVolume / maxVolume) * barMaxWidth;
        ctx.fillStyle = config.bidColor;
        ctx.globalAlpha = config.cellBgOpacity;
        ctx.fillRect(x + halfWidth - bidBarW - padding, barY, bidBarW, barHeight);
        ctx.globalAlpha = 1;
      }

      if (level.askVolume > 0) {
        const askBarW = (level.askVolume / maxVolume) * barMaxWidth;
        ctx.fillStyle = config.askColor;
        ctx.globalAlpha = config.cellBgOpacity;
        ctx.fillRect(x + halfWidth + padding, barY, askBarW, barHeight);
        ctx.globalAlpha = 1;
      }
    }

    // Text: Bid x Ask - CENTERED style with larger font and spacing
    const centerX = x + halfWidth;
    const spacing = 12; // Space from center for bid/ask

    // Bid (left side) - BRIGHT RED if sell imbalance
    if (level.bidVolume > 0) {
      const hasImbalance = level.imbalanceSell && config.showImbalances;
      ctx.fillStyle = hasImbalance ? '#ff3333' : config.bidTextColor;
      ctx.font = (isPOC || hasImbalance) ? 'bold 11px JetBrains Mono, Consolas, monospace' : '11px JetBrains Mono, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatVolume(level.bidVolume), centerX - spacing, y + 4);
    }

    // Separator "x" - WHITE and visible
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x', centerX, y + 4);

    // Ask (right side) - BRIGHT GREEN if buy imbalance
    if (level.askVolume > 0) {
      const hasImbalance = level.imbalanceBuy && config.showImbalances;
      ctx.fillStyle = hasImbalance ? '#00ff66' : config.askTextColor;
      ctx.font = (isPOC || hasImbalance) ? 'bold 11px JetBrains Mono, Consolas, monospace' : '11px JetBrains Mono, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(this.formatVolume(level.askVolume), centerX + spacing, y + 4);
    }
  }

  /**
   * ATAS-STYLE DELTA PROFILE RENDERING
   *
   * CRITICAL ARCHITECTURE:
   *
   *   ┌─────────────────────────────────────────┐
   *   │         DELTA PROFILE COLUMN            │
   *   │                                         │
   *   │  RED (BID)  │  ZERO AXIS  │  GREEN (ASK)│
   *   │  ◄──────────│─────────────│──────────►  │
   *   │             │      │      │             │
   *   │   ████████  │      │      │  ██████     │  delta = -X (sellers)
   *   │       ████  │      │      │  ████████   │  delta = +Y (buyers)
   *   │      █████  │      │      │  ███        │  delta = -Z (sellers)
   *   │             │      │      │             │
   *   └─────────────┴──────┴──────┴─────────────┘
   *                        ▲
   *                  FIXED ZERO AXIS
   *                (NEVER RECALCULATED)
   *
   * RULES:
   * 1. Delta = askVolume - bidVolume (per price level)
   * 2. Zero axis is IMMUTABLE vertical line at center
   * 3. Positive delta (ask > bid) → GREEN bar extends RIGHT from axis
   * 4. Negative delta (bid > ask) → RED bar extends LEFT from axis
   * 5. Bar width = abs(delta) / maxAbsDelta * halfWidth
   * 6. Direction is NEVER CSS-dependent, only Canvas coordinates
   */
  private renderDeltaProfile(levels: [number, PriceLevel][], x: number, width: number): void {
    const { ctx, config, metrics } = this;
    const { rowHeight } = config;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: CALCULATE FIXED ZERO AXIS (CENTER OF DELTA COLUMN)
    // ═══════════════════════════════════════════════════════════════════════
    const padding = 1;
    const centerX = x + width / 2;  // IMMUTABLE ZERO AXIS
    const halfWidth = (width - padding * 2) / 2;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: FIND MAX ABSOLUTE DELTA FOR NORMALIZATION
    // This ensures bars scale properly relative to each other
    // ═══════════════════════════════════════════════════════════════════════
    let maxAbsDelta = 0.001; // Avoid division by zero
    for (const [, level] of levels) {
      const absDelta = Math.abs(level.delta);
      if (absDelta > maxAbsDelta) {
        maxAbsDelta = absDelta;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: RENDER EACH DELTA BAR FROM THE FIXED ZERO AXIS
    // ═══════════════════════════════════════════════════════════════════════
    for (const [price, level] of levels) {
      const y = this.priceToY(price);

      // Skip if outside visible area
      if (y < metrics.chartAreaY - rowHeight || y > metrics.chartAreaY + metrics.chartAreaHeight + rowHeight) {
        continue;
      }

      const delta = level.delta; // askVolume - bidVolume

      // Skip zero delta (no bar to draw)
      if (delta === 0) continue;

      // Calculate bar width proportional to delta magnitude
      const normalizedDelta = Math.abs(delta) / maxAbsDelta;
      const barWidth = normalizedDelta * halfWidth;

      // Bar dimensions
      const barHeight = rowHeight - 2;
      const barY = y - barHeight / 2;

      // ─────────────────────────────────────────────────────────────────────
      // CRITICAL: Direction is determined by delta sign, NOT CSS
      // ─────────────────────────────────────────────────────────────────────
      if (delta > 0) {
        // POSITIVE DELTA (Ask > Bid) = BUYERS AGGRESSIVE
        // Draw GREEN bar extending RIGHT from zero axis
        ctx.fillStyle = config.deltaBarPositive;
        ctx.fillRect(centerX, barY, barWidth, barHeight);
      } else {
        // NEGATIVE DELTA (Bid > Ask) = SELLERS AGGRESSIVE
        // Draw RED bar extending LEFT from zero axis
        ctx.fillStyle = config.deltaBarNegative;
        ctx.fillRect(centerX - barWidth, barY, barWidth, barHeight);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: RENDER FIXED ZERO AXIS LINE (ALWAYS VISIBLE)
    // ═══════════════════════════════════════════════════════════════════════
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, metrics.chartAreaY);
    ctx.lineTo(centerX, metrics.chartAreaY + metrics.chartAreaHeight);
    ctx.stroke();
  }

  // ============ SESSION PROFILE ============

  private buildSessionProfile(candles: FootprintCandle[]): void {
    this.sessionProfile.clear();
    this.sessionProfileMax = 0;

    candles.forEach(candle => {
      candle.levels.forEach((level, price) => {
        const current = this.sessionProfile.get(price) || 0;
        const newVol = current + level.totalVolume;
        this.sessionProfile.set(price, newVol);
        this.sessionProfileMax = Math.max(this.sessionProfileMax, newVol);
      });
    });
  }

  private renderSessionProfile(tickSize: number, canvasWidth: number): void {
    const { ctx, config, metrics, sessionProfile, sessionProfileMax } = this;

    if (sessionProfileMax === 0) return;

    const profileX = canvasWidth - config.sessionProfileWidth - 60; // 60 = price axis width
    const barMaxWidth = config.sessionProfileWidth - 4;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(profileX, metrics.chartAreaY, config.sessionProfileWidth, metrics.chartAreaHeight);

    // Find POC
    let pocPrice = 0;
    let pocVolume = 0;
    sessionProfile.forEach((vol, price) => {
      if (vol > pocVolume) {
        pocVolume = vol;
        pocPrice = price;
      }
    });

    // Render bars
    sessionProfile.forEach((volume, price) => {
      const y = this.priceToY(price);
      const barWidth = (volume / sessionProfileMax) * barMaxWidth;
      const isPOC = price === pocPrice;

      ctx.fillStyle = isPOC ? config.profilePocColor : config.profileBarColor;
      ctx.globalAlpha = isPOC ? 0.8 : config.profileOpacity;
      ctx.fillRect(profileX + 2, y - config.rowHeight / 4, barWidth, config.rowHeight / 2);
    });

    ctx.globalAlpha = 1;
  }

  // ============ PASSIVE LIQUIDITY (SIMULATION) ============

  /**
   * Render passive liquidity from heatmap as horizontal volume bars
   * - Background layer (z-index below footprint)
   * - Bid passive = cyan bars (left side)
   * - Ask passive = red bars (right side)
   * - Reduced opacity (20-35%) for context without overwhelming footprint
   */
  private renderPassiveLiquidity(tickSize: number, currentPrice?: number): void {
    const { ctx, config, metrics } = this;
    const simulator = getPassiveLiquiditySimulator();

    // Update simulator with current price
    if (currentPrice) {
      simulator.setConfig({
        basePrice: currentPrice,
        tickSize,
        depth: Math.ceil(metrics.visiblePriceRange / tickSize),
      });
    }

    // Get levels to render (use stable levels for legacy compatibility)
    let levels: StablePassiveLevel[];
    if (config.passiveLiquidityFocusTicks > 0 && currentPrice) {
      // Focus mode: only show ±N ticks from current price
      levels = simulator.getStableLevelsNearPrice(currentPrice, config.passiveLiquidityFocusTicks);
    } else {
      // Show all levels in visible range
      levels = simulator.getStableLevelsInRange(metrics.visiblePriceMin, metrics.visiblePriceMax);
    }

    if (levels.length === 0) return;

    const snapshot = simulator.getSnapshot();
    const maxBid = snapshot.maxBidVolume || 1;
    const maxAsk = snapshot.maxAskVolume || 1;
    const maxBarWidth = config.passiveMaxBarWidth * config.passiveLiquidityIntensity;
    const barHeight = config.rowHeight * 0.6;

    // Chart center X for positioning bars
    const chartCenterX = metrics.chartAreaWidth / 2;

    ctx.save();
    ctx.globalAlpha = config.passiveLiquidityOpacity;

    for (const level of levels) {
      const y = this.priceToY(level.price);

      // Skip if outside visible area
      if (y < metrics.chartAreaY - barHeight || y > metrics.chartAreaY + metrics.chartAreaHeight + barHeight) {
        continue;
      }

      // Render BID bar (left side, extending left from center)
      if (level.bidVolume > 0) {
        const bidWidth = (level.bidVolume / maxBid) * maxBarWidth;
        const bidX = chartCenterX - bidWidth;

        // Gradient for depth effect
        const gradient = ctx.createLinearGradient(bidX, 0, chartCenterX, 0);
        gradient.addColorStop(0, this.hexToRgba(config.passiveBidColor, 0.3));
        gradient.addColorStop(1, this.hexToRgba(config.passiveBidColor, 0.6));

        ctx.fillStyle = gradient;
        ctx.fillRect(bidX, y - barHeight / 2, bidWidth, barHeight);

        // Interest zone highlight
        if (level.isInterestZone) {
          ctx.strokeStyle = config.passiveBidColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = config.passiveLiquidityOpacity * 1.5;
          ctx.strokeRect(bidX, y - barHeight / 2, bidWidth, barHeight);
          ctx.globalAlpha = config.passiveLiquidityOpacity;
        }
      }

      // Render ASK bar (right side, extending right from center)
      if (level.askVolume > 0) {
        const askWidth = (level.askVolume / maxAsk) * maxBarWidth;
        const askX = chartCenterX;

        // Gradient for depth effect
        const gradient = ctx.createLinearGradient(askX, 0, askX + askWidth, 0);
        gradient.addColorStop(0, this.hexToRgba(config.passiveAskColor, 0.6));
        gradient.addColorStop(1, this.hexToRgba(config.passiveAskColor, 0.3));

        ctx.fillStyle = gradient;
        ctx.fillRect(askX, y - barHeight / 2, askWidth, barHeight);

        // Interest zone highlight
        if (level.isInterestZone) {
          ctx.strokeStyle = config.passiveAskColor;
          ctx.lineWidth = 1;
          ctx.globalAlpha = config.passiveLiquidityOpacity * 1.5;
          ctx.strokeRect(askX, y - barHeight / 2, askWidth, barHeight);
          ctx.globalAlpha = config.passiveLiquidityOpacity;
        }
      }
    }

    ctx.restore();
  }

  // Helper: Convert hex color to rgba
  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(128, 128, 128, ${alpha})`;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ============ GRID & AXES ============

  private renderGrid(tickSize: number, canvasWidth: number): void {
    const { ctx, config, metrics } = this;
    const gridStep = this.calculateGridStep(tickSize);

    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.5;

    const firstPrice = Math.ceil(metrics.visiblePriceMin / gridStep) * gridStep;

    for (let price = firstPrice; price <= metrics.visiblePriceMax; price += gridStep) {
      const y = this.priceToY(price);
      if (y < metrics.chartAreaY || y > metrics.chartAreaY + metrics.chartAreaHeight) continue;

      const isMajor = price % (gridStep * 5) === 0;
      ctx.strokeStyle = isMajor ? config.gridColorMajor : config.gridColor;
      ctx.lineWidth = isMajor ? 1 : 0.5;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private renderPriceAxis(tickSize: number, canvasWidth: number): void {
    const { ctx, config, metrics } = this;
    const axisX = canvasWidth - 60;

    // Background
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(axisX, metrics.chartAreaY, 60, metrics.chartAreaHeight);

    // Labels
    const gridStep = this.calculateGridStep(tickSize);
    const firstPrice = Math.ceil(metrics.visiblePriceMin / gridStep) * gridStep;

    ctx.font = config.priceFont;
    ctx.textAlign = 'left';

    for (let price = firstPrice; price <= metrics.visiblePriceMax; price += gridStep) {
      const y = this.priceToY(price);
      if (y < metrics.chartAreaY + 5 || y > metrics.chartAreaY + metrics.chartAreaHeight - 5) continue;

      const isMajor = price % (gridStep * 5) === 0;
      ctx.fillStyle = isMajor ? '#888' : '#555';
      ctx.fillText(this.formatPrice(price), axisX + 5, y + 3);
    }
  }

  private renderCurrentPriceLine(price: number, canvasWidth: number, isBullish: boolean = true): void {
    const { ctx, config, metrics } = this;
    const y = this.priceToY(price);

    if (y < metrics.chartAreaY || y > metrics.chartAreaY + metrics.chartAreaHeight) return;

    const axisX = canvasWidth - 60;
    const priceText = this.formatPrice(price);

    // Color based on candle direction
    const lineColor = isBullish ? config.candleUpBody : config.candleDownBody;

    // Ultra-thin dotted line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.3;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([1, 2]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(axisX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Minimal badge
    ctx.font = '7px JetBrains Mono, monospace';
    const textWidth = ctx.measureText(priceText).width;
    const badgeWidth = textWidth + 6;
    const badgeHeight = 10;
    const badgeX = axisX + 3;
    const badgeY = y - badgeHeight / 2;

    // Badge background with candle color
    ctx.fillStyle = lineColor;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 1);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Badge text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(priceText, badgeX + 3, y + 2.5);
  }

  private renderCurrentTimeLine(candleX: number, canvasHeight: number, isBullish: boolean): void {
    const { ctx, config, metrics } = this;
    const x = candleX + config.footprintWidth / 2;
    const footerY = canvasHeight - 35;

    // Color based on candle direction
    const lineColor = isBullish ? config.candleUpBody : config.candleDownBody;

    // Vertical line through chart area
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, metrics.chartAreaY);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Current time badge
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const badgeWidth = 60;
    const badgeHeight = 16;
    const badgeX = x - badgeWidth / 2;
    const badgeY = canvasHeight - badgeHeight - 3;

    // Badge background (simple rect)
    ctx.fillStyle = lineColor;
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

    // Badge text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, x, badgeY + badgeHeight / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ============ HEADER & FOOTER ============

  private renderHeader(lastCandle: FootprintCandle | undefined, canvasWidth: number): void {
    const { ctx, config } = this;
    const headerHeight = 30;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, canvasWidth, headerHeight);

    if (!lastCandle) return;

    let xPos = 10;

    // Title
    ctx.font = 'bold 12px system-ui';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('FOOTPRINT PRO', xPos, 20);
    xPos += 120;

    // Volume
    ctx.font = '11px system-ui';
    ctx.fillStyle = '#888';
    ctx.fillText(`Vol: ${this.formatVolume(lastCandle.totalVolume)}`, xPos, 20);
    xPos += 90;

    // Delta
    const delta = lastCandle.totalDelta;
    ctx.fillStyle = delta >= 0 ? config.deltaPositive : config.deltaNegative;
    ctx.fillText(`Δ: ${delta >= 0 ? '+' : ''}${this.formatVolume(delta)}`, xPos, 20);
    xPos += 90;

    // POC
    ctx.fillStyle = config.pocBorderColor;
    ctx.fillText(`POC: ${this.formatPrice(lastCandle.poc)}`, xPos, 20);
    xPos += 100;

    // VAH / VAL
    ctx.fillStyle = config.vahValColor;
    ctx.fillText(`VAH: ${this.formatPrice(lastCandle.vah)} / VAL: ${this.formatPrice(lastCandle.val)}`, xPos, 20);
  }

  private renderFooter(candles: FootprintCandle[], canvasHeight: number): void {
    const { ctx, config } = this;
    const footerHeight = 35;
    const footerY = canvasHeight - footerHeight;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, footerY, this.canvas.width / this.dpr, footerHeight);

    candles.forEach((candle, idx) => {
      const x = this.metrics.footprintStartX + idx * config.footprintWidth;
      const centerX = x + config.footprintWidth / 2;

      // Time - BIGGER and BRIGHTER
      const date = new Date(candle.time * 1000);
      const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, centerX, footerY + 14);

      // Delta
      const delta = candle.totalDelta;
      ctx.font = config.deltaFont;
      ctx.fillStyle = delta >= 0 ? config.deltaPositive : config.deltaNegative;
      ctx.fillText(`${delta >= 0 ? '+' : ''}${this.formatVolume(delta)}`, centerX, footerY + 28);
    });
  }

  private renderEmptyState(width: number, height: number): void {
    const { ctx } = this;

    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting orderflow data...', width / 2, height / 2);

    ctx.font = '12px system-ui';
    ctx.fillStyle = '#444';
    ctx.fillText('Waiting for trades from WebSocket', width / 2, height / 2 + 25);
  }

  // ============ HELPERS ============

  private calculatePriceRange(candles: FootprintCandle[], tickSize: number): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    candles.forEach(candle => {
      candle.levels.forEach((_, price) => {
        min = Math.min(min, price);
        max = Math.max(max, price);
      });
    });

    if (!isFinite(min)) {
      candles.forEach(candle => {
        min = Math.min(min, candle.low);
        max = Math.max(max, candle.high);
      });
    }

    const padding = tickSize * 5;
    return {
      min: Math.floor(min / tickSize) * tickSize - padding,
      max: Math.ceil(max / tickSize) * tickSize + padding,
    };
  }

  private calculateGridStep(tickSize: number): number {
    const { metrics, config } = this;

    // Calculate ideal step based on visible range and desired label spacing
    // We want labels to be at least 20px apart to avoid overlap
    const minLabelSpacing = 20;
    const maxLabels = Math.floor(metrics.chartAreaHeight / minLabelSpacing);
    const idealStep = metrics.visiblePriceRange / Math.max(1, maxLabels);

    // "Nice" numbers sequence that works well for financial data
    // For CME futures (0.25 tick), this gives: 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100...
    const niceSequence = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

    // Find the smallest "nice" number >= idealStep that's also a multiple of tickSize
    let step = tickSize;
    for (const nice of niceSequence) {
      // Skip values smaller than tickSize
      if (nice < tickSize) continue;

      // Check if this nice number is a multiple of tickSize (within floating point tolerance)
      const isMultiple = Math.abs(nice / tickSize - Math.round(nice / tickSize)) < 0.001;
      if (!isMultiple) continue;

      if (nice >= idealStep) {
        step = nice;
        break;
      }
    }

    // If we didn't find a suitable value in sequence, calculate one
    if (step < idealStep) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(idealStep)));
      const normalized = idealStep / magnitude;

      let nice: number;
      if (normalized < 1.5) nice = 1;
      else if (normalized < 3) nice = 2.5;
      else if (normalized < 7) nice = 5;
      else nice = 10;

      step = Math.max(tickSize, Math.round(nice * magnitude / tickSize) * tickSize);
    }

    return step;
  }

  private formatVolume(vol: number): string {
    // For crypto futures (high price per contract), convert to USD
    if (this.currentPrice >= 100) {
      const usd = Math.abs(vol) * this.currentPrice;
      const sign = vol < 0 ? '-' : '';
      if (usd >= 1_000_000) return `${sign}${(usd / 1_000_000).toFixed(1)}M`;
      if (usd >= 1_000) return `${sign}${(usd / 1_000).toFixed(0)}K`;
      if (usd >= 1) return `${sign}${Math.round(usd)}`;
      return `${sign}${usd.toFixed(0)}`;
    }

    // For CME-style instruments (NQ, ES), show contracts
    const abs = Math.abs(vol);
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 100) return Math.round(vol).toString();
    if (abs >= 10) return vol.toFixed(1);
    if (abs >= 1) return vol.toFixed(2);
    return vol.toFixed(3);
  }

  private formatPrice(price: number): string {
    // Smart decimal formatting based on price magnitude
    // For large prices (like NQ ~20000), show fewer decimals
    // For smaller prices, show more decimals

    if (price >= 10000) {
      // Futures like NQ (20000+): show .25 precision
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else if (price >= 1000) {
      // Futures like ES (5000+): show .25 precision
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else if (price >= 100) {
      // Smaller assets
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else {
      // Very small prices
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
    }
  }

  // ============ CLEANUP ============

  destroy(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}

// ============ LEGACY COMPATIBILITY ============

// Re-export old interface for backwards compatibility
export type FootprintRenderConfig_Legacy = {
  candleWidth: number;
  rowHeight: number;
  padding: number;
  background: string;
  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  imbalanceBuyColor: string;
  imbalanceSellColor: string;
  pocColor: string;
  gridColor: string;
  deltaPositiveColor: string;
  deltaNegativeColor: string;
  cellOpacity: number;
  imbalanceOpacity: number;
  pocOpacity: number;
  volumeFont: string;
  deltaFont: string;
  priceFont: string;
  timeFont: string;
  showImbalances: boolean;
  showPOC: boolean;
  showDelta: boolean;
  showGrid: boolean;
  showVolumeProfile: boolean;
};

export const DEFAULT_RENDER_CONFIG: FootprintRenderConfig_Legacy = {
  candleWidth: 120,
  rowHeight: 18,
  padding: 4,
  background: '#0a0a0a',
  bidColor: '#ef4444',
  askColor: '#22c55e',
  bidTextColor: '#fca5a5',
  askTextColor: '#86efac',
  imbalanceBuyColor: '#22c55e',
  imbalanceSellColor: '#ef4444',
  pocColor: '#facc15',
  gridColor: '#1f1f1f',
  deltaPositiveColor: '#22c55e',
  deltaNegativeColor: '#ef4444',
  cellOpacity: 0.15,
  imbalanceOpacity: 0.35,
  pocOpacity: 0.25,
  volumeFont: '10px JetBrains Mono, Consolas, monospace',
  deltaFont: 'bold 11px JetBrains Mono, Consolas, monospace',
  priceFont: '10px JetBrains Mono, Consolas, monospace',
  timeFont: '9px system-ui, sans-serif',
  showImbalances: true,
  showPOC: true,
  showDelta: true,
  showGrid: true,
  showVolumeProfile: true,
};

// Legacy class alias
export { FootprintRendererPro as FootprintRenderer };
