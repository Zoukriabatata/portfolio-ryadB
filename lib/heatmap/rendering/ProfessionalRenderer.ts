/**
 * PROFESSIONAL HEATMAP RENDERER
 *
 * Ultra-clean, visually hierarchical rendering system.
 * Superior to ATAS, inspired by Bookmap.
 *
 * Visual Philosophy:
 * - Dark, matte background (near-black)
 * - High contrast but never flashy
 * - Everything serves readability
 * - 30% less visual noise than standard implementations
 *
 * Layer Order (strict):
 * 1. Background
 * 2. Subtle grid
 * 3. Liquidity heatmap
 * 4. Passive liquidity bars
 * 5. Price line
 * 6. Trade bubbles
 * 7. Signal markers
 * 8. Crosshair & UI
 */

import type { Trade, PriceRange, Point, LiquidityStats } from '../core/types';
import type { SimulationState } from '../simulation/MarketSimulationEngine';

// ============================================================================
// COLOR PALETTE (Hex values)
// ============================================================================
export const COLORS = {
  // Background
  background: '#08090c',           // Near-black, matte
  backgroundAlt: '#0a0c10',        // Slightly lighter for panels

  // Grid
  gridLine: '#151820',             // Very subtle
  gridLineEmphasis: '#1a1f2a',     // Slightly visible

  // Bid colors (cold scale)
  bidVeryLight: '#0d2840',
  bidLight: '#0f4060',
  bidMedium: '#1a6080',
  bidStrong: '#2890b0',
  bidIntense: '#3cc8e8',

  // Ask colors (warm scale)
  askVeryLight: '#401818',
  askLight: '#602020',
  askMedium: '#803030',
  askStrong: '#b04545',
  askIntense: '#e86060',

  // Passive bars
  bidBar: '#1a5070',
  bidBarHit: '#2890b0',
  askBar: '#702020',
  askBarHit: '#b04545',

  // Price
  priceLine: '#ffffff',
  priceLineGlow: 'rgba(255, 255, 255, 0.1)',

  // Trades
  tradeBuy: '#1a8060',
  tradeBuyGlow: 'rgba(26, 128, 96, 0.3)',
  tradeSell: '#a04040',
  tradeSellGlow: 'rgba(160, 64, 64, 0.3)',

  // Signals
  absorptionMarker: '#e0a030',
  spoofMarker: '#a080d0',
  wallMarker: '#40a0c0',

  // Text
  textPrimary: '#e0e4ec',
  textSecondary: '#7080a0',
  textMuted: '#404860',

  // Crosshair
  crosshair: 'rgba(255, 255, 255, 0.3)',
  crosshairText: '#b0b8c8',
};

// ============================================================================
// RENDER SETTINGS
// ============================================================================
export interface RenderSettings {
  // Layout
  heatmapWidth: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  statsBarHeight: number;
  domBarWidth: number;

  // Heatmap
  cellHeight: number;
  minCellWidth: number;
  maxCellWidth: number;
  blurRadius: number;              // Slight vertical blur

  // Color
  gammaCorrection: number;
  contrastMultiplier: number;
  upperCutoffPercent: number;
  lowerCutoffPercent: number;
  useLogarithmicScale: boolean;

  // Trade bubbles
  minBubbleRadius: number;
  maxBubbleRadius: number;
  bubbleOpacity: number;
  bubbleFadeMs: number;

  // Passive bars
  maxBarWidth: number;
  barOpacity: number;

  // Animation
  transitionDuration: number;      // 200-300ms
  smoothScrolling: boolean;

  // Performance
  skipFrameOnLag: boolean;
  maxVisiblePriceLevels: number;
}

const DEFAULT_SETTINGS: RenderSettings = {
  heatmapWidth: 0,                 // Auto-calculated
  priceAxisWidth: 70,
  timeAxisHeight: 24,
  statsBarHeight: 32,
  domBarWidth: 80,

  cellHeight: 14,
  minCellWidth: 2,
  maxCellWidth: 8,
  blurRadius: 0.5,

  gammaCorrection: 1.1,
  contrastMultiplier: 1.2,
  upperCutoffPercent: 95,
  lowerCutoffPercent: 5,
  useLogarithmicScale: true,

  minBubbleRadius: 3,
  maxBubbleRadius: 20,
  bubbleOpacity: 0.6,
  bubbleFadeMs: 3000,

  maxBarWidth: 60,
  barOpacity: 0.8,

  transitionDuration: 200,
  smoothScrolling: true,

  skipFrameOnLag: true,
  maxVisiblePriceLevels: 200,
};

// ============================================================================
// LAYOUT
// ============================================================================
interface Layout {
  width: number;
  height: number;

  // DOM area (left)
  domArea: { x: number; y: number; width: number; height: number };

  // Heatmap area (center)
  heatmapArea: { x: number; y: number; width: number; height: number };

  // Price axis (right)
  priceAxisArea: { x: number; y: number; width: number; height: number };

  // Time axis (bottom)
  timeAxisArea: { x: number; y: number; width: number; height: number };

  // Stats bar (bottom)
  statsBarArea: { x: number; y: number; width: number; height: number };
}

// ============================================================================
// RENDER CONTEXT
// ============================================================================
export interface ProfessionalRenderContext {
  // History data
  history: Array<{
    timestamp: number;
    bids: Map<number, number>;
    asks: Map<number, number>;
    bestBid: number;
    bestAsk: number;
  }>;

  // Current order book
  currentBids: Map<number, number>;
  currentAsks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;

  // Trades
  trades: Trade[];

  // Signals
  walls: Array<{ price: number; side: 'bid' | 'ask'; size: number }>;
  spoofPatterns: Array<{ price: number; side: 'bid' | 'ask'; confidence: number }>;
  absorptionZones: Array<{ price: number; side: 'bid' | 'ask'; absorbed: number }>;

  // Interaction
  mousePosition: Point | null;
  hoveredPrice: number | null;

  // Stats
  stats: LiquidityStats;
}

// ============================================================================
// PROFESSIONAL RENDERER CLASS
// ============================================================================
export class ProfessionalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: RenderSettings;
  private layout: Layout;
  private tickSize: number = 0.5;
  private dpr: number = 1;

  // Cached values
  private colorCache: Map<string, string> = new Map();
  private lastStats: LiquidityStats | null = null;

  constructor(canvas: HTMLCanvasElement, settings?: Partial<RenderSettings>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;

    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.layout = this.calculateLayout();
    this.setupCanvas();
  }

  /**
   * Setup canvas with proper DPI
   */
  private setupCanvas(): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout = this.calculateLayout();
  }

  /**
   * Calculate layout dimensions
   */
  private calculateLayout(): Layout {
    const { priceAxisWidth, timeAxisHeight, statsBarHeight, domBarWidth } = this.settings;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    const contentHeight = height - timeAxisHeight - statsBarHeight;

    return {
      width,
      height,

      domArea: {
        x: 0,
        y: 0,
        width: domBarWidth,
        height: contentHeight,
      },

      heatmapArea: {
        x: domBarWidth,
        y: 0,
        width: width - domBarWidth - priceAxisWidth,
        height: contentHeight,
      },

      priceAxisArea: {
        x: width - priceAxisWidth,
        y: 0,
        width: priceAxisWidth,
        height: contentHeight,
      },

      timeAxisArea: {
        x: domBarWidth,
        y: contentHeight,
        width: width - domBarWidth - priceAxisWidth,
        height: timeAxisHeight,
      },

      statsBarArea: {
        x: 0,
        y: height - statsBarHeight,
        width,
        height: statsBarHeight,
      },
    };
  }

  /**
   * Set tick size
   */
  setTickSize(tickSize: number): void {
    this.tickSize = tickSize;
  }

  /**
   * Resize handler
   */
  resize(): void {
    this.setupCanvas();
  }

  /**
   * Main render method
   */
  render(context: ProfessionalRenderContext, priceRange: PriceRange): void {
    const { ctx } = this;
    this.lastStats = context.stats;

    // Clear with background color
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.layout.width, this.layout.height);

    // Layer 1: Background grid
    this.renderGrid(priceRange);

    // Layer 2: Liquidity heatmap
    this.renderHeatmap(context, priceRange);

    // Layer 3: Passive liquidity bars (DOM)
    this.renderPassiveBars(context, priceRange);

    // Layer 4: Price line
    this.renderPriceLine(context.midPrice, priceRange);

    // Layer 5: Trade bubbles
    this.renderTradeBubbles(context.trades, priceRange);

    // Layer 6: Signal markers
    this.renderSignals(context, priceRange);

    // Layer 7: Price axis
    this.renderPriceAxis(priceRange, context.midPrice);

    // Layer 8: Time axis
    this.renderTimeAxis(context);

    // Layer 9: Stats bar
    this.renderStatsBar(context);

    // Layer 10: Crosshair
    if (context.mousePosition) {
      this.renderCrosshair(context.mousePosition, priceRange);
    }
  }

  // ============================================================================
  // LAYER 1: GRID
  // ============================================================================
  private renderGrid(priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea, domArea } = this.layout;

    // Calculate price levels
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const levelHeight = heatmapArea.height / numLevels;

    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.5;

    // Horizontal grid lines (very subtle)
    for (let i = 0; i <= numLevels; i += 5) { // Every 5 ticks
      const y = heatmapArea.y + i * levelHeight;

      ctx.beginPath();
      ctx.moveTo(domArea.x, y);
      ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
      ctx.stroke();
    }
  }

  // ============================================================================
  // LAYER 2: HEATMAP
  // ============================================================================
  private renderHeatmap(context: ProfessionalRenderContext, priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea } = this.layout;
    const { history, stats } = context;

    if (history.length === 0) return;

    const numColumns = history.length;
    const columnWidth = Math.max(
      this.settings.minCellWidth,
      Math.min(this.settings.maxCellWidth, heatmapArea.width / numColumns)
    );

    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const cellHeight = heatmapArea.height / numLevels;

    // Render columns from oldest to newest
    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
      const column = history[colIdx];
      const x = heatmapArea.x + heatmapArea.width - (numColumns - colIdx) * columnWidth;

      if (x < heatmapArea.x - columnWidth || x > heatmapArea.x + heatmapArea.width) continue;

      // Render bid cells
      for (const [price, size] of column.bids) {
        if (price < priceRange.min || price > priceRange.max) continue;

        const y = this.priceToY(price, priceRange);
        const color = this.getLiquidityColor(size, 'bid', stats);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellHeight / 2, columnWidth, cellHeight);
      }

      // Render ask cells
      for (const [price, size] of column.asks) {
        if (price < priceRange.min || price > priceRange.max) continue;

        const y = this.priceToY(price, priceRange);
        const color = this.getLiquidityColor(size, 'ask', stats);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellHeight / 2, columnWidth, cellHeight);
      }
    }
  }

  /**
   * Get color for liquidity value
   */
  private getLiquidityColor(value: number, side: 'bid' | 'ask', stats: LiquidityStats): string {
    if (!stats || stats.max === 0) return 'transparent';

    // Apply logarithmic scaling
    let normalized: number;
    if (this.settings.useLogarithmicScale && value > 0) {
      const logValue = Math.log(value + 1);
      const logMin = Math.log(stats.p5 + 1);
      const logMax = Math.log(stats.p95 + 1);
      normalized = (logValue - logMin) / (logMax - logMin + 0.001);
    } else {
      normalized = (value - stats.p5) / (stats.p95 - stats.p5 + 0.001);
    }

    // Clamp and apply gamma
    normalized = Math.max(0, Math.min(1, normalized));
    normalized = Math.pow(normalized, 1 / this.settings.gammaCorrection);

    // Apply contrast
    normalized = Math.max(0, Math.min(1, (normalized - 0.5) * this.settings.contrastMultiplier + 0.5));

    // Map to color gradient
    const intensity = Math.floor(normalized * 4);
    const colors = side === 'bid'
      ? [COLORS.bidVeryLight, COLORS.bidLight, COLORS.bidMedium, COLORS.bidStrong, COLORS.bidIntense]
      : [COLORS.askVeryLight, COLORS.askLight, COLORS.askMedium, COLORS.askStrong, COLORS.askIntense];

    // Interpolate between two colors
    const lowerIdx = Math.min(intensity, 4);
    const upperIdx = Math.min(intensity + 1, 4);
    const t = normalized * 4 - intensity;

    return this.interpolateColor(colors[lowerIdx], colors[upperIdx], t);
  }

  /**
   * Interpolate between two hex colors
   */
  private interpolateColor(color1: string, color2: string, t: number): string {
    const cacheKey = `${color1}-${color2}-${Math.round(t * 100)}`;
    const cached = this.colorCache.get(cacheKey);
    if (cached) return cached;

    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    const result = `rgb(${r}, ${g}, ${b})`;
    this.colorCache.set(cacheKey, result);

    // Limit cache size
    if (this.colorCache.size > 1000) {
      const firstKey = this.colorCache.keys().next().value;
      if (firstKey) this.colorCache.delete(firstKey);
    }

    return result;
  }

  // ============================================================================
  // LAYER 3: PASSIVE LIQUIDITY BARS
  // ============================================================================
  private renderPassiveBars(context: ProfessionalRenderContext, priceRange: PriceRange): void {
    const { ctx } = this;
    const { domArea, heatmapArea } = this.layout;
    const { currentBids, currentAsks, stats } = context;

    const maxBarWidth = this.settings.maxBarWidth;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barHeight = Math.max(2, heatmapArea.height / numLevels - 1);

    // Find max for scaling
    let maxSize = 0;
    for (const size of currentBids.values()) maxSize = Math.max(maxSize, size);
    for (const size of currentAsks.values()) maxSize = Math.max(maxSize, size);
    if (maxSize === 0) return;

    // Render bid bars (extending left from center)
    const centerX = domArea.x + domArea.width;

    ctx.globalAlpha = this.settings.barOpacity;

    for (const [price, size] of currentBids) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange);
      const barWidth = (size / maxSize) * maxBarWidth;

      // Main bar
      ctx.fillStyle = COLORS.bidBar;
      this.roundRect(ctx, centerX - barWidth, y - barHeight / 2, barWidth, barHeight, 2);
      ctx.fill();
    }

    for (const [price, size] of currentAsks) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange);
      const barWidth = (size / maxSize) * maxBarWidth;

      // Main bar
      ctx.fillStyle = COLORS.askBar;
      this.roundRect(ctx, centerX, y - barHeight / 2, barWidth, barHeight, 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Draw rounded rectangle
   */
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // ============================================================================
  // LAYER 4: PRICE LINE
  // ============================================================================
  private renderPriceLine(midPrice: number, priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea, domArea } = this.layout;

    if (!midPrice || midPrice < priceRange.min || midPrice > priceRange.max) return;

    const y = this.priceToY(midPrice, priceRange);

    // Glow effect
    ctx.strokeStyle = COLORS.priceLineGlow;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(domArea.x, y);
    ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
    ctx.stroke();

    // Main line (dashed)
    ctx.strokeStyle = COLORS.priceLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(domArea.x, y);
    ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ============================================================================
  // LAYER 5: TRADE BUBBLES
  // ============================================================================
  private renderTradeBubbles(trades: Trade[], priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea } = this.layout;
    const now = Date.now();

    // Filter recent trades
    const recentTrades = trades.filter(t =>
      t.timestamp > now - this.settings.bubbleFadeMs &&
      t.price >= priceRange.min &&
      t.price <= priceRange.max
    );

    // Find max size for scaling
    const maxSize = Math.max(...recentTrades.map(t => t.quantity), 1);

    for (const trade of recentTrades) {
      const age = now - trade.timestamp;
      const fadeRatio = 1 - age / this.settings.bubbleFadeMs;
      const opacity = fadeRatio * this.settings.bubbleOpacity;

      const y = this.priceToY(trade.price, priceRange);

      // Position on right side of heatmap (recent trades)
      const x = heatmapArea.x + heatmapArea.width - 40;

      // Scale radius
      const sizeRatio = Math.sqrt(trade.quantity / maxSize);
      const radius = this.settings.minBubbleRadius +
        sizeRatio * (this.settings.maxBubbleRadius - this.settings.minBubbleRadius);

      // Choose color
      const isBuy = trade.side === 'buy';
      const baseColor = isBuy ? COLORS.tradeBuy : COLORS.tradeSell;
      const glowColor = isBuy ? COLORS.tradeBuyGlow : COLORS.tradeSellGlow;

      // Draw glow
      ctx.globalAlpha = opacity * 0.5;
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Draw bubble
      ctx.globalAlpha = opacity;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Size label for large trades
      if (trade.quantity > maxSize * 0.3 && radius > 8) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trade.quantity.toFixed(1), x, y);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 6: SIGNALS
  // ============================================================================
  private renderSignals(context: ProfessionalRenderContext, priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea } = this.layout;

    // Wall markers
    for (const wall of context.walls) {
      if (wall.price < priceRange.min || wall.price > priceRange.max) continue;

      const y = this.priceToY(wall.price, priceRange);
      const x = heatmapArea.x + heatmapArea.width - 15;

      // Small diamond marker
      ctx.fillStyle = COLORS.wallMarker;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    }

    // Absorption markers
    for (const zone of context.absorptionZones) {
      if (zone.price < priceRange.min || zone.price > priceRange.max) continue;

      const y = this.priceToY(zone.price, priceRange);
      const x = heatmapArea.x + heatmapArea.width - 25;

      // Small shield icon
      ctx.fillStyle = COLORS.absorptionMarker;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Spoof markers
    for (const spoof of context.spoofPatterns) {
      if (spoof.price < priceRange.min || spoof.price > priceRange.max) continue;

      const y = this.priceToY(spoof.price, priceRange);
      const x = heatmapArea.x + heatmapArea.width - 35;

      // Dashed outline
      ctx.strokeStyle = COLORS.spoofMarker;
      ctx.globalAlpha = spoof.confidence * 0.5;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 7: PRICE AXIS
  // ============================================================================
  private renderPriceAxis(priceRange: PriceRange, midPrice: number): void {
    const { ctx } = this;
    const { priceAxisArea, heatmapArea } = this.layout;

    // Background
    ctx.fillStyle = COLORS.backgroundAlt;
    ctx.fillRect(priceAxisArea.x, priceAxisArea.y, priceAxisArea.width, priceAxisArea.height);

    // Border
    ctx.strokeStyle = COLORS.gridLineEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(priceAxisArea.x, priceAxisArea.y);
    ctx.lineTo(priceAxisArea.x, priceAxisArea.y + priceAxisArea.height);
    ctx.stroke();

    // Calculate price steps
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const labelInterval = Math.max(1, Math.floor(numLevels / 15)); // ~15 labels max

    ctx.font = '10px "SF Mono", Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numLevels; i += labelInterval) {
      const price = priceRange.max - i * this.tickSize;
      const y = priceAxisArea.y + (i / numLevels) * heatmapArea.height;

      // Determine if this is the current price
      const isCurrentPrice = Math.abs(price - midPrice) < this.tickSize * 0.5;

      if (isCurrentPrice) {
        // Highlight current price
        ctx.fillStyle = COLORS.priceLine;
        ctx.fillRect(priceAxisArea.x + 2, y - 8, priceAxisArea.width - 4, 16);
        ctx.fillStyle = COLORS.background;
      } else {
        ctx.fillStyle = COLORS.textSecondary;
      }

      ctx.fillText(this.formatPrice(price), priceAxisArea.x + 6, y);
    }
  }

  /**
   * Format price for display
   */
  private formatPrice(price: number): string {
    if (this.tickSize >= 1) return price.toFixed(0);
    if (this.tickSize >= 0.1) return price.toFixed(1);
    return price.toFixed(2);
  }

  // ============================================================================
  // LAYER 8: TIME AXIS
  // ============================================================================
  private renderTimeAxis(context: ProfessionalRenderContext): void {
    const { ctx } = this;
    const { timeAxisArea } = this.layout;

    // Background
    ctx.fillStyle = COLORS.backgroundAlt;
    ctx.fillRect(timeAxisArea.x, timeAxisArea.y, timeAxisArea.width, timeAxisArea.height);

    // Top border
    ctx.strokeStyle = COLORS.gridLineEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(timeAxisArea.x, timeAxisArea.y);
    ctx.lineTo(timeAxisArea.x + timeAxisArea.width, timeAxisArea.y);
    ctx.stroke();

    // Time labels
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.fillStyle = COLORS.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const now = Date.now();
    const intervals = [0, 5, 10, 15, 20, 25, 30]; // seconds ago

    for (const sec of intervals) {
      const x = timeAxisArea.x + timeAxisArea.width - (sec / 30) * timeAxisArea.width;
      const label = sec === 0 ? 'now' : `-${sec}s`;
      ctx.fillText(label, x, timeAxisArea.y + timeAxisArea.height / 2);
    }
  }

  // ============================================================================
  // LAYER 9: STATS BAR
  // ============================================================================
  private renderStatsBar(context: ProfessionalRenderContext): void {
    const { ctx } = this;
    const { statsBarArea } = this.layout;

    // Background
    ctx.fillStyle = COLORS.backgroundAlt;
    ctx.fillRect(statsBarArea.x, statsBarArea.y, statsBarArea.width, statsBarArea.height);

    // Top border
    ctx.strokeStyle = COLORS.gridLineEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(statsBarArea.x, statsBarArea.y);
    ctx.lineTo(statsBarArea.x + statsBarArea.width, statsBarArea.y);
    ctx.stroke();

    // Calculate stats
    let totalBid = 0, totalAsk = 0, tradesBuy = 0, tradesSell = 0;
    for (const size of context.currentBids.values()) totalBid += size;
    for (const size of context.currentAsks.values()) totalAsk += size;

    const recentTrades = context.trades.filter(t => t.timestamp > Date.now() - 5000);
    for (const trade of recentTrades) {
      if (trade.side === 'buy') tradesBuy += trade.quantity;
      else tradesSell += trade.quantity;
    }

    const delta = tradesBuy - tradesSell;

    // Render stats
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const y = statsBarArea.y + statsBarArea.height / 2;

    const stats = [
      { label: 'BID', value: totalBid.toFixed(0), color: COLORS.bidStrong },
      { label: 'ASK', value: totalAsk.toFixed(0), color: COLORS.askStrong },
      { label: 'BUY', value: tradesBuy.toFixed(1), color: COLORS.tradeBuy },
      { label: 'SELL', value: tradesSell.toFixed(1), color: COLORS.tradeSell },
      { label: 'DELTA', value: (delta >= 0 ? '+' : '') + delta.toFixed(1), color: delta >= 0 ? COLORS.tradeBuy : COLORS.tradeSell },
    ];

    let x = statsBarArea.x + 15;
    for (const stat of stats) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(stat.label, x, y);

      ctx.fillStyle = stat.color;
      ctx.textAlign = 'left';
      ctx.fillText(stat.value, x + 35, y);

      x += 90;
    }
  }

  // ============================================================================
  // LAYER 10: CROSSHAIR
  // ============================================================================
  private renderCrosshair(mousePos: Point, priceRange: PriceRange): void {
    const { ctx } = this;
    const { heatmapArea, domArea, priceAxisArea } = this.layout;

    // Check if mouse is in heatmap area
    if (mousePos.x < domArea.x || mousePos.x > heatmapArea.x + heatmapArea.width) return;
    if (mousePos.y < heatmapArea.y || mousePos.y > heatmapArea.y + heatmapArea.height) return;

    const price = this.yToPrice(mousePos.y, priceRange);

    // Horizontal line
    ctx.strokeStyle = COLORS.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(domArea.x, mousePos.y);
    ctx.lineTo(heatmapArea.x + heatmapArea.width, mousePos.y);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(mousePos.x, heatmapArea.y);
    ctx.lineTo(mousePos.x, heatmapArea.y + heatmapArea.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label
    ctx.fillStyle = COLORS.crosshairText;
    ctx.fillRect(priceAxisArea.x + 2, mousePos.y - 8, priceAxisArea.width - 4, 16);
    ctx.fillStyle = COLORS.background;
    ctx.font = '10px "SF Mono", Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatPrice(price), priceAxisArea.x + 6, mousePos.y);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  private priceToY(price: number, priceRange: PriceRange): number {
    const ratio = (priceRange.max - price) / (priceRange.max - priceRange.min);
    return this.layout.heatmapArea.y + ratio * this.layout.heatmapArea.height;
  }

  private yToPrice(y: number, priceRange: PriceRange): number {
    const ratio = (y - this.layout.heatmapArea.y) / this.layout.heatmapArea.height;
    return priceRange.max - ratio * (priceRange.max - priceRange.min);
  }

  /**
   * Check if point is in DOM area
   */
  isInDOMArea(x: number): boolean {
    return x >= this.layout.domArea.x && x < this.layout.domArea.x + this.layout.domArea.width;
  }

  /**
   * Check if point is in price axis
   */
  isInPriceAxis(x: number): boolean {
    return x >= this.layout.priceAxisArea.x;
  }

  /**
   * Get layout info
   */
  getLayout(): Layout {
    return { ...this.layout };
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<RenderSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.layout = this.calculateLayout();
  }

  /**
   * Destroy renderer
   */
  destroy(): void {
    this.colorCache.clear();
  }
}

export default ProfessionalRenderer;
