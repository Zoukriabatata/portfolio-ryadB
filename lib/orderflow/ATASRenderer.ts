/**
 * PROFESSIONAL FOOTPRINT RENDERER
 *
 * RÈGLES DE RENDU STRICTES (professional standard):
 *
 * 1. AXE DELTA = 0 EST FIXE ET CENTRAL (IMMUABLE)
 * 2. Barres DELTA s'étendent depuis le centre:
 *    - Delta positif → DROITE (vert)
 *    - Delta négatif → GAUCHE (rouge)
 * 3. Colonnes BID/ASK:
 *    - BID = GAUCHE (rouge)
 *    - ASK = DROITE (vert)
 * 4. Chaque ligne = 1 TICK exact
 * 5. POC = ligne surlignée (jaune)
 * 6. Imbalances = highlight sur la cellule
 */

import type {
  FootprintCandle,
  FootprintLevel,
} from './FootprintAggregator';
import { getContractSpec, type CMEContractSpec } from './CMEContractSpecs';

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ATASRenderConfig {
  // Layout
  candleWidth: number;        // Total width per footprint candle
  rowHeight: number;          // Height per price level (tick)
  padding: number;            // Padding between elements

  // Column widths (within candleWidth)
  bidColumnWidth: number;     // Width for bid numbers
  askColumnWidth: number;     // Width for ask numbers
  deltaColumnWidth: number;   // Width for delta bars
  ohlcWidth: number;          // Width for OHLC candle

  // Colors - Background
  background: string;
  gridColor: string;
  gridColorMajor: string;

  // Colors - OHLC
  candleUp: string;
  candleDown: string;

  // Colors - Bid/Ask
  bidColor: string;           // Red
  askColor: string;           // Green
  bidTextColor: string;
  askTextColor: string;

  // Colors - Delta
  deltaPositive: string;      // Green
  deltaNegative: string;      // Red
  deltaZeroLine: string;      // Axis color

  // Colors - Highlights
  pocColor: string;           // Yellow
  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  vahColor: string;
  valColor: string;

  // Fonts
  volumeFont: string;
  deltaFont: string;
  priceFont: string;

  // Display options
  showImbalances: boolean;
  showPOC: boolean;
  showDeltaBars: boolean;
  showDeltaNumbers: boolean;
  showValueArea: boolean;
  showOHLC: boolean;
  minVolumeToShow: number;    // Hide levels with volume below this
}

export const DEFAULT_ATAS_CONFIG: ATASRenderConfig = {
  // Layout
  candleWidth: 120,
  rowHeight: 16,
  padding: 2,

  // Column widths
  bidColumnWidth: 35,
  askColumnWidth: 35,
  deltaColumnWidth: 30,
  ohlcWidth: 12,

  // Background
  background: '#0a0a0a',
  gridColor: '#1a1a1a',
  gridColorMajor: '#252525',

  // OHLC
  candleUp: '#22c55e',
  candleDown: '#ef4444',

  // Bid/Ask
  bidColor: '#ef4444',
  askColor: '#22c55e',
  bidTextColor: '#fca5a5',
  askTextColor: '#86efac',

  // Delta
  deltaPositive: '#22c55e',
  deltaNegative: '#ef4444',
  deltaZeroLine: 'rgba(255, 255, 255, 0.3)',

  // Highlights
  pocColor: '#facc15',
  imbalanceBuyBg: 'rgba(34, 197, 94, 0.35)',
  imbalanceSellBg: 'rgba(239, 68, 68, 0.35)',
  vahColor: 'rgba(59, 130, 246, 0.2)',
  valColor: 'rgba(59, 130, 246, 0.2)',

  // Fonts
  volumeFont: '10px JetBrains Mono, Consolas, monospace',
  deltaFont: 'bold 10px JetBrains Mono, Consolas, monospace',
  priceFont: '10px JetBrains Mono, Consolas, monospace',

  // Display
  showImbalances: true,
  showPOC: true,
  showDeltaBars: true,
  showDeltaNumbers: true,
  showValueArea: true,
  showOHLC: true,
  minVolumeToShow: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

interface RenderContext {
  ctx: CanvasRenderingContext2D;
  config: ATASRenderConfig;
  spec: CMEContractSpec;

  // Viewport
  viewportTop: number;        // Highest price visible
  viewportBottom: number;     // Lowest price visible
  visibleLevels: number;      // Number of price levels visible

  // Computed
  totalFootprintWidth: number;
  priceToY: (price: number) => number;
  yToPrice: (y: number) => number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL RENDERER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ATASRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: ATASRenderConfig;
  private spec: CMEContractSpec;

  // Viewport state
  private viewportCenter: number = 0;
  private zoomY: number = 1;  // Vertical zoom (affects rowHeight)
  private horizontalScroll: number = 0;

  constructor(
    canvas: HTMLCanvasElement,
    symbol: string,
    config: Partial<ATASRenderConfig> = {}
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    this.config = { ...DEFAULT_ATAS_CONFIG, ...config };
    this.spec = getContractSpec(symbol);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  render(candles: FootprintCandle[], currentPrice?: number): void {
    const { ctx, config, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = config.background;
    ctx.fillRect(0, 0, width, height);

    if (candles.length === 0) return;

    // Calculate viewport
    const lastCandle = candles[candles.length - 1];
    if (this.viewportCenter === 0) {
      this.viewportCenter = currentPrice || lastCandle.close;
    }

    const effectiveRowHeight = config.rowHeight * this.zoomY;
    const visibleLevels = Math.ceil(height / effectiveRowHeight);
    const viewportRange = visibleLevels * this.spec.tickSize;

    const viewportTop = this.viewportCenter + viewportRange / 2;
    const viewportBottom = this.viewportCenter - viewportRange / 2;

    // Price-to-Y conversion
    const priceToY = (price: number): number => {
      const priceOffset = viewportTop - price;
      return (priceOffset / this.spec.tickSize) * effectiveRowHeight;
    };

    const yToPrice = (y: number): number => {
      const priceOffset = (y / effectiveRowHeight) * this.spec.tickSize;
      return viewportTop - priceOffset;
    };

    // Create render context
    const renderCtx: RenderContext = {
      ctx,
      config,
      spec: this.spec,
      viewportTop,
      viewportBottom,
      visibleLevels,
      totalFootprintWidth: config.bidColumnWidth + config.askColumnWidth +
                           config.deltaColumnWidth + config.ohlcWidth + config.padding * 4,
      priceToY,
      yToPrice,
    };

    // Calculate visible candles
    const visibleCandleCount = Math.ceil(width / renderCtx.totalFootprintWidth);
    const startIndex = Math.max(0, candles.length - visibleCandleCount - Math.floor(this.horizontalScroll));
    const endIndex = Math.min(candles.length, startIndex + visibleCandleCount + 1);

    // Render grid
    this.renderGrid(renderCtx, width, height);

    // Render each visible candle
    for (let i = startIndex; i < endIndex; i++) {
      const candle = candles[i];
      const x = (i - startIndex) * renderCtx.totalFootprintWidth;
      this.renderFootprintCandle(renderCtx, candle, x);
    }

    // Render price axis
    this.renderPriceAxis(renderCtx, width, height);

    // Render current price line
    if (currentPrice) {
      this.renderCurrentPriceLine(renderCtx, currentPrice, width);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRID RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  private renderGrid(ctx: RenderContext, width: number, height: number): void {
    const { config, spec, viewportTop, viewportBottom, priceToY } = ctx;
    const { gridColor, gridColorMajor } = config;

    // Horizontal grid lines (price levels)
    const tickSize = spec.tickSize;
    const firstPrice = Math.ceil(viewportBottom / tickSize) * tickSize;

    for (let price = firstPrice; price <= viewportTop; price += tickSize) {
      const y = priceToY(price);
      if (y < 0 || y > height) continue;

      // Major lines every 10 ticks (or 1 point for NQ/ES)
      const isMajor = Math.abs(price % (tickSize * 10)) < 0.001;

      ctx.ctx.strokeStyle = isMajor ? gridColorMajor : gridColor;
      ctx.ctx.lineWidth = isMajor ? 1 : 0.5;

      ctx.ctx.beginPath();
      ctx.ctx.moveTo(0, y);
      ctx.ctx.lineTo(width, y);
      ctx.ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTPRINT CANDLE RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  private renderFootprintCandle(
    ctx: RenderContext,
    candle: FootprintCandle,
    x: number
  ): void {
    const { config, priceToY } = ctx;

    // Column positions within the candle
    const ohlcX = x + config.padding;
    const bidX = ohlcX + config.ohlcWidth + config.padding;
    const askX = bidX + config.bidColumnWidth + config.padding;
    const deltaX = askX + config.askColumnWidth + config.padding;

    // 1. Render OHLC candle
    if (config.showOHLC) {
      this.renderOHLC(ctx, candle, ohlcX);
    }

    // 2. Render each price level
    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[0] - a[0]);  // Sort by price descending

    // Find max values for scaling
    let maxVolume = 0;
    let maxDelta = 0;
    for (const [, level] of sortedLevels) {
      maxVolume = Math.max(maxVolume, level.bidVolume, level.askVolume);
      maxDelta = Math.max(maxDelta, Math.abs(level.delta));
    }

    for (const [price, level] of sortedLevels) {
      const y = priceToY(price);

      // Skip if outside viewport
      if (y < -config.rowHeight || y > ctx.ctx.canvas.height + config.rowHeight) {
        continue;
      }

      // Skip if below minimum volume
      if (level.totalVolume < config.minVolumeToShow) {
        continue;
      }

      // Render level row
      this.renderFootprintLevel(ctx, level, bidX, askX, deltaX, y, maxVolume, maxDelta);
    }

    // 3. Render POC highlight
    if (config.showPOC) {
      const pocY = priceToY(candle.poc);
      ctx.ctx.fillStyle = config.pocColor;
      ctx.ctx.globalAlpha = 0.2;
      ctx.ctx.fillRect(x, pocY, ctx.totalFootprintWidth, config.rowHeight);
      ctx.ctx.globalAlpha = 1;
    }

    // 4. Render Value Area
    if (config.showValueArea) {
      const vahY = priceToY(candle.vah);
      const valY = priceToY(candle.val);
      const vaHeight = valY - vahY;

      ctx.ctx.fillStyle = config.vahColor;
      ctx.ctx.globalAlpha = 0.15;
      ctx.ctx.fillRect(x, vahY, ctx.totalFootprintWidth, vaHeight);
      ctx.ctx.globalAlpha = 1;
    }

    // 5. Render candle delta total
    this.renderCandleDeltaTotal(ctx, candle, x);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OHLC CANDLE
  // ═══════════════════════════════════════════════════════════════════════════

  private renderOHLC(ctx: RenderContext, candle: FootprintCandle, x: number): void {
    const { config, priceToY } = ctx;

    const openY = priceToY(candle.open);
    const closeY = priceToY(candle.close);
    const highY = priceToY(candle.high);
    const lowY = priceToY(candle.low);

    const isBullish = candle.close >= candle.open;
    const color = isBullish ? config.candleUp : config.candleDown;

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    const centerX = x + config.ohlcWidth / 2;

    // Wick
    ctx.ctx.strokeStyle = color;
    ctx.ctx.lineWidth = 1;
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(centerX, highY);
    ctx.ctx.lineTo(centerX, lowY);
    ctx.ctx.stroke();

    // Body
    ctx.ctx.fillStyle = color;
    ctx.ctx.fillRect(x + 1, bodyTop, config.ohlcWidth - 2, bodyHeight);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTPRINT LEVEL (1 ROW = 1 TICK)
  // ═══════════════════════════════════════════════════════════════════════════

  private renderFootprintLevel(
    ctx: RenderContext,
    level: FootprintLevel,
    bidX: number,
    askX: number,
    deltaX: number,
    y: number,
    maxVolume: number,
    maxDelta: number
  ): void {
    const { config } = ctx;
    const rowHeight = config.rowHeight * this.zoomY;

    // === IMBALANCE BACKGROUNDS ===
    if (config.showImbalances) {
      if (level.imbalanceBuy) {
        ctx.ctx.fillStyle = config.imbalanceBuyBg;
        ctx.ctx.fillRect(askX, y, config.askColumnWidth, rowHeight);
      }
      if (level.imbalanceSell) {
        ctx.ctx.fillStyle = config.imbalanceSellBg;
        ctx.ctx.fillRect(bidX, y, config.bidColumnWidth, rowHeight);
      }
    }

    // === BID VOLUME (LEFT, RED) ===
    if (level.bidVolume > 0) {
      // Background intensity based on volume
      const bidIntensity = Math.min(1, level.bidVolume / Math.max(1, maxVolume));
      ctx.ctx.fillStyle = this.adjustAlpha(config.bidColor, bidIntensity * 0.3);
      ctx.ctx.fillRect(bidX, y, config.bidColumnWidth, rowHeight);

      // Text
      ctx.ctx.fillStyle = config.bidTextColor;
      ctx.ctx.font = config.volumeFont;
      ctx.ctx.textAlign = 'right';
      ctx.ctx.textBaseline = 'middle';
      ctx.ctx.fillText(
        this.formatVolume(level.bidVolume),
        bidX + config.bidColumnWidth - 2,
        y + rowHeight / 2
      );
    }

    // === ASK VOLUME (RIGHT, GREEN) ===
    if (level.askVolume > 0) {
      // Background intensity based on volume
      const askIntensity = Math.min(1, level.askVolume / Math.max(1, maxVolume));
      ctx.ctx.fillStyle = this.adjustAlpha(config.askColor, askIntensity * 0.3);
      ctx.ctx.fillRect(askX, y, config.askColumnWidth, rowHeight);

      // Text
      ctx.ctx.fillStyle = config.askTextColor;
      ctx.ctx.font = config.volumeFont;
      ctx.ctx.textAlign = 'left';
      ctx.ctx.textBaseline = 'middle';
      ctx.ctx.fillText(
        this.formatVolume(level.askVolume),
        askX + 2,
        y + rowHeight / 2
      );
    }

    // === DELTA BAR (CENTRAL AXIS = 0) ===
    if (config.showDeltaBars && level.delta !== 0) {
      this.renderDeltaBar(ctx, level.delta, deltaX, y, rowHeight, maxDelta);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELTA BAR - PROFESSIONAL STYLE (FIXED CENTER AXIS)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * RENDU DELTA BAR - professional methodology
   *
   * RÈGLE ABSOLUE:
   * - L'axe Delta = 0 est AU CENTRE de la colonne delta
   * - Cet axe est FIXE et ne bouge JAMAIS
   * - Delta positif s'étend vers la DROITE (vert)
   * - Delta négatif s'étend vers la GAUCHE (rouge)
   *
   * CALCUL:
   * - centerX = deltaX + deltaColumnWidth / 2
   * - barWidth = |delta| / maxDelta * halfWidth
   * - if delta > 0: draw from centerX to centerX + barWidth
   * - if delta < 0: draw from centerX - barWidth to centerX
   */
  private renderDeltaBar(
    ctx: RenderContext,
    delta: number,
    deltaX: number,
    y: number,
    rowHeight: number,
    maxDelta: number
  ): void {
    const { config } = ctx;

    // STEP 1: CALCULATE FIXED CENTER AXIS (IMMUTABLE)
    const centerX = deltaX + config.deltaColumnWidth / 2;
    const halfWidth = (config.deltaColumnWidth - 4) / 2;

    // STEP 2: CALCULATE BAR WIDTH (NORMALIZED)
    const normalizedDelta = Math.min(1, Math.abs(delta) / Math.max(1, maxDelta));
    const barWidth = normalizedDelta * halfWidth;

    // STEP 3: DETERMINE DIRECTION AND COLOR
    const barHeight = rowHeight - 2;
    const barY = y + 1;

    if (delta > 0) {
      // POSITIVE DELTA = GREEN BAR EXTENDING RIGHT FROM CENTER
      ctx.ctx.fillStyle = config.deltaPositive;
      ctx.ctx.fillRect(centerX, barY, barWidth, barHeight);
    } else {
      // NEGATIVE DELTA = RED BAR EXTENDING LEFT FROM CENTER
      ctx.ctx.fillStyle = config.deltaNegative;
      ctx.ctx.fillRect(centerX - barWidth, barY, barWidth, barHeight);
    }

    // STEP 4: RENDER CENTER AXIS LINE (DELTA = 0)
    ctx.ctx.strokeStyle = config.deltaZeroLine;
    ctx.ctx.lineWidth = 1;
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(centerX, y);
    ctx.ctx.lineTo(centerX, y + rowHeight);
    ctx.ctx.stroke();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE DELTA TOTAL (BOTTOM)
  // ═══════════════════════════════════════════════════════════════════════════

  private renderCandleDeltaTotal(
    ctx: RenderContext,
    candle: FootprintCandle,
    x: number
  ): void {
    const { config } = ctx;
    const canvas = ctx.ctx.canvas;

    const delta = candle.totalDelta;
    const color = delta >= 0 ? config.deltaPositive : config.deltaNegative;
    const text = (delta >= 0 ? '+' : '') + this.formatVolume(delta);

    ctx.ctx.fillStyle = color;
    ctx.ctx.font = config.deltaFont;
    ctx.ctx.textAlign = 'center';
    ctx.ctx.textBaseline = 'bottom';
    ctx.ctx.fillText(
      text,
      x + ctx.totalFootprintWidth / 2,
      canvas.height - 5
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE AXIS
  // ═══════════════════════════════════════════════════════════════════════════

  private renderPriceAxis(
    ctx: RenderContext,
    width: number,
    height: number
  ): void {
    const { config, spec, viewportTop, viewportBottom, priceToY } = ctx;
    const axisWidth = 60;
    const axisX = width - axisWidth;

    // Background
    ctx.ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
    ctx.ctx.fillRect(axisX, 0, axisWidth, height);

    // Labels
    const tickSize = spec.tickSize;
    const labelStep = this.calculateLabelStep(ctx);
    const firstPrice = Math.ceil(viewportBottom / labelStep) * labelStep;

    ctx.ctx.font = config.priceFont;
    ctx.ctx.textAlign = 'left';
    ctx.ctx.fillStyle = '#888';

    for (let price = firstPrice; price <= viewportTop; price += labelStep) {
      const y = priceToY(price);
      if (y < 10 || y > height - 10) continue;

      ctx.ctx.fillText(spec.priceFormat(price), axisX + 5, y + 3);
    }
  }

  private calculateLabelStep(ctx: RenderContext): number {
    const { config, spec } = ctx;
    const effectiveRowHeight = config.rowHeight * this.zoomY;

    // We want labels every ~30 pixels minimum
    const minLabelSpacing = 30;
    const ticksPerLabel = Math.ceil(minLabelSpacing / effectiveRowHeight);

    // Round to nice numbers
    const niceMultiples = [1, 2, 4, 5, 10, 20, 40, 50, 100];
    for (const mult of niceMultiples) {
      if (mult >= ticksPerLabel) {
        return spec.tickSize * mult;
      }
    }

    return spec.tickSize * 100;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CURRENT PRICE LINE
  // ═══════════════════════════════════════════════════════════════════════════

  private renderCurrentPriceLine(
    ctx: RenderContext,
    price: number,
    width: number
  ): void {
    const { config, priceToY, spec } = ctx;
    const y = priceToY(price);

    // Line
    ctx.ctx.strokeStyle = config.candleUp;
    ctx.ctx.lineWidth = 1;
    ctx.ctx.setLineDash([3, 3]);
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(0, y);
    ctx.ctx.lineTo(width - 60, y);
    ctx.ctx.stroke();
    ctx.ctx.setLineDash([]);

    // Price badge
    const axisX = width - 60;
    const text = spec.priceFormat(price);
    ctx.ctx.font = 'bold 10px JetBrains Mono';
    const textWidth = ctx.ctx.measureText(text).width;

    ctx.ctx.fillStyle = config.candleUp;
    ctx.ctx.fillRect(axisX, y - 8, textWidth + 10, 16);

    ctx.ctx.fillStyle = '#000';
    ctx.ctx.textAlign = 'left';
    ctx.ctx.textBaseline = 'middle';
    ctx.ctx.fillText(text, axisX + 5, y);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWPORT CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  setViewportCenter(price: number): void {
    this.viewportCenter = price;
  }

  scroll(deltaY: number): void {
    this.viewportCenter += deltaY * this.spec.tickSize * 5;
  }

  scrollHorizontally(deltaX: number): void {
    this.horizontalScroll = Math.max(0, this.horizontalScroll + deltaX);
  }

  zoom(factor: number): void {
    this.zoomY = Math.max(0.5, Math.min(3, this.zoomY * factor));
  }

  resetView(price?: number): void {
    if (price) {
      this.viewportCenter = price;
    }
    this.zoomY = 1;
    this.horizontalScroll = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private formatVolume(vol: number): string {
    const abs = Math.abs(vol);
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 100) return Math.round(vol).toString();
    return vol.toString();
  }

  private adjustAlpha(color: string, alpha: number): string {
    // Simple hex to rgba
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  // Config
  setConfig(config: Partial<ATASRenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ATASRenderConfig {
    return { ...this.config };
  }
}
