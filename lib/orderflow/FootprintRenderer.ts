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

  // Performance
  maxVisibleFootprints: number;
  virtualizationBuffer: number;
}

export const DEFAULT_FOOTPRINT_RENDER_CONFIG: FootprintRenderConfig = {
  // Layout
  footprintWidth: 90,
  ohlcWidth: 14,
  deltaProfileWidth: 16,
  sessionProfileWidth: 40,
  rowHeight: 16,
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

  // Current Price
  currentPriceColor: '#3b82f6',
  currentPriceBg: 'rgba(59, 130, 246, 0.1)',

  // Opacities
  cellBgOpacity: 0.12,
  imbalanceOpacity: 0.35,
  pocBgOpacity: 0.2,
  profileOpacity: 0.6,

  // Fonts
  clusterFont: '9px JetBrains Mono, Consolas, monospace',
  clusterFontBold: 'bold 9px JetBrains Mono, Consolas, monospace',
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

    // Render each footprint
    visibleCandles.forEach((candle, idx) => {
      const x = this.metrics.footprintStartX + idx * config.footprintWidth;
      this.renderFootprint(candle, x, tickSize);
    });

    // Render session profile
    if (config.showSessionProfile) {
      this.renderSessionProfile(tickSize, width);
    }

    // Render current price
    if (config.showCurrentPrice && currentPrice) {
      this.renderCurrentPriceLine(currentPrice, width);
    }

    // Render price axis
    this.renderPriceAxis(tickSize, width);

    // Render header
    this.renderHeader(candles[candles.length - 1], width);

    // Render footer with times and deltas
    this.renderFooter(visibleCandles, height);
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

    // Imbalance backgrounds
    if (config.showImbalances) {
      if (level.imbalanceBuy) {
        ctx.fillStyle = config.imbalanceBuyBg;
        ctx.fillRect(x + halfWidth, cellY + 1, halfWidth, rowHeight - 2);
      }
      if (level.imbalanceSell) {
        ctx.fillStyle = config.imbalanceSellBg;
        ctx.fillRect(x, cellY + 1, halfWidth, rowHeight - 2);
      }
    }

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

    // Text: Bid x Ask
    const centerX = x + halfWidth;
    ctx.font = isPOC ? config.clusterFontBold : config.clusterFont;

    // Bid (left side)
    if (level.bidVolume > 0) {
      ctx.fillStyle = level.imbalanceSell ? config.imbalanceSellText : config.bidTextColor;
      ctx.textAlign = 'right';
      ctx.fillText(this.formatVolume(level.bidVolume), centerX - padding - 1, y + 3);
    }

    // Separator "x"
    ctx.fillStyle = config.separatorColor;
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x', centerX, y + 3);

    // Ask (right side)
    ctx.font = isPOC ? config.clusterFontBold : config.clusterFont;
    if (level.askVolume > 0) {
      ctx.fillStyle = level.imbalanceBuy ? config.imbalanceBuyText : config.askTextColor;
      ctx.textAlign = 'left';
      ctx.fillText(this.formatVolume(level.askVolume), centerX + padding + 1, y + 3);
    }
  }

  private renderDeltaProfile(levels: [number, PriceLevel][], x: number, width: number): void {
    const { ctx, config } = this;
    const { rowHeight } = config;

    // Find max absolute delta for normalization
    let maxAbsDelta = 1;
    levels.forEach(([_, level]) => {
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(level.delta));
    });

    levels.forEach(([price, level]) => {
      const y = this.priceToY(price);
      const delta = level.delta;
      const normalized = delta / maxAbsDelta;
      const barWidth = Math.abs(normalized) * (width - 2);

      // Bar
      ctx.fillStyle = delta >= 0 ? config.deltaBarPositive : config.deltaBarNegative;
      if (delta >= 0) {
        ctx.fillRect(x + 1, y - rowHeight / 2 + 2, barWidth, rowHeight - 4);
      } else {
        ctx.fillRect(x + width - barWidth - 1, y - rowHeight / 2 + 2, barWidth, rowHeight - 4);
      }
    });
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

  private renderCurrentPriceLine(price: number, canvasWidth: number): void {
    const { ctx, config, metrics } = this;
    const y = this.priceToY(price);

    if (y < metrics.chartAreaY || y > metrics.chartAreaY + metrics.chartAreaHeight) return;

    // Background strip
    ctx.fillStyle = config.currentPriceBg;
    ctx.fillRect(0, y - 8, canvasWidth - 60, 16);

    // Dashed line
    ctx.strokeStyle = config.currentPriceColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth - 60, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label badge
    ctx.fillStyle = config.currentPriceColor;
    ctx.fillRect(canvasWidth - 60, y - 9, 60, 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(this.formatPrice(price), canvasWidth - 55, y + 4);
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

      // Time
      const date = new Date(candle.time * 1000);
      const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      ctx.font = config.timeFont;
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, centerX, footerY + 12);

      // Delta
      const delta = candle.totalDelta;
      ctx.font = config.deltaFont;
      ctx.fillStyle = delta >= 0 ? config.deltaPositive : config.deltaNegative;
      ctx.fillText(`${delta >= 0 ? '+' : ''}${this.formatVolume(delta)}`, centerX, footerY + 26);
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
    const idealRows = metrics.chartAreaHeight / config.rowHeight;
    const idealStep = metrics.visiblePriceRange / idealRows;

    const magnitude = Math.pow(10, Math.floor(Math.log10(idealStep)));
    const normalized = idealStep / magnitude;

    let nice: number;
    if (normalized < 1.5) nice = 1;
    else if (normalized < 3) nice = 2;
    else if (normalized < 7) nice = 5;
    else nice = 10;

    return Math.max(tickSize, Math.round(nice * magnitude / tickSize) * tickSize);
  }

  private formatVolume(vol: number): string {
    const abs = Math.abs(vol);
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 100) return Math.round(vol).toString();
    if (abs >= 10) return vol.toFixed(1);
    if (abs >= 1) return vol.toFixed(2);
    return vol.toFixed(3);
  }

  private formatPrice(price: number): string {
    if (price >= 10000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
