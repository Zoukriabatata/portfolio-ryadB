/**
 * INSTITUTIONAL HEATMAP RENDERER
 *
 * Professional-grade rendering with:
 * - Percentile/log color compression
 * - Focus band around current price
 * - Liquidity age encoding
 * - Passive delta visualization
 * - Contact feedback & absorption halos
 * - Ghost bars for history
 * - Trade bubble clustering
 * - 30% noise reduction
 *
 * Visual Hierarchy (strict order):
 * 1. Background
 * 2. Subtle grid
 * 3. Liquidity heatmap (with age texture)
 * 4. Ghost bars (historical liquidity)
 * 5. Passive bars (current)
 * 6. Passive delta indicators
 * 7. Price line
 * 8. Absorption halos
 * 9. Trade bubbles
 * 10. Interaction feedback
 * 11. Price axis
 * 12. Crosshair
 */

import type { LiquidityLevel, InstitutionalTrade, TradeCluster, InteractionEvent, InstitutionalState } from '../simulation/InstitutionalSimulationEngine';
import type { PriceRange, Point } from '../core/types';

// ============================================================================
// COLOR PALETTE (REFINED - 30% less noise)
// ============================================================================
export const PALETTE = {
  // Background
  bg: '#070809',
  bgPanel: '#0a0b0d',
  bgSubtle: '#0d0e11',

  // Grid (very subtle)
  grid: '#121418',
  gridEmphasis: '#181c22',

  // Bid gradient (cold - refined)
  bidDim: '#0a1825',
  bidLow: '#0c2538',
  bidMed: '#10456a',
  bidHigh: '#1878a8',
  bidIntense: '#28b8e8',

  // Ask gradient (warm - refined)
  askDim: '#1a0c0c',
  askLow: '#2a1212',
  askMed: '#4a2020',
  askHigh: '#883838',
  askIntense: '#c85050',

  // Focus band saturation boost
  focusSaturation: 1.15,
  outOfFocusDesaturation: 0.7,

  // Passive bars
  bidBar: '#185878',
  bidBarGhost: '#102838',
  askBar: '#783838',
  askBarGhost: '#382020',

  // Delta indicators
  deltaPositive: '#28a868',
  deltaNegative: '#a84848',

  // Price
  priceLine: '#e8eaf0',
  priceGlow: 'rgba(232, 234, 240, 0.08)',

  // Trades
  buyBubble: '#18805a',
  buyBubbleGlow: 'rgba(24, 128, 90, 0.25)',
  sellBubble: '#884040',
  sellBubbleGlow: 'rgba(136, 64, 64, 0.25)',

  // Absorption
  absorptionHalo: 'rgba(255, 180, 60, 0.15)',
  absorptionCore: 'rgba(255, 200, 100, 0.4)',

  // Wall
  wallIndicator: '#38a8c8',

  // Spoof
  spoofIndicator: '#a080c0',

  // Text
  textPrimary: '#d8dce8',
  textSecondary: '#6878a0',
  textMuted: '#384060',

  // Crosshair
  crosshair: 'rgba(200, 210, 230, 0.2)',
};

// ============================================================================
// RENDER SETTINGS
// ============================================================================
export interface InstitutionalRenderSettings {
  // Layout
  domWidth: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  statsBarHeight: number;

  // Heatmap
  cellHeight: number;
  minCellWidth: number;

  // Color
  percentileCompression: boolean;
  logScale: boolean;
  gamma: number;
  upperPercentile: number;
  lowerPercentile: number;

  // Focus band
  focusBandTicks: number;

  // Age encoding
  showAgeTexture: boolean;
  maxAgeMs: number;

  // Passive delta
  showPassiveDelta: boolean;
  deltaBarWidth: number;

  // Ghost bars
  showGhostBars: boolean;
  ghostOpacity: number;

  // Trade bubbles
  minBubbleRadius: number;
  maxBubbleRadius: number;
  bubbleOpacity: number;
  clusterBorderWidth: number;

  // Absorption
  showAbsorptionHalos: boolean;
  haloMaxRadius: number;

  // Interaction
  contactPulseDuration: number;

  // Trader focus mode
  focusModeEnabled: boolean;
  focusModeLiquidityThreshold: number;
  focusModeTradeThreshold: number;
}

const DEFAULT_SETTINGS: InstitutionalRenderSettings = {
  domWidth: 90,
  priceAxisWidth: 65,
  timeAxisHeight: 20,
  statsBarHeight: 28,

  cellHeight: 13,
  minCellWidth: 3,

  percentileCompression: true,
  logScale: true,
  gamma: 1.05,
  upperPercentile: 90,
  lowerPercentile: 10,

  focusBandTicks: 15,

  showAgeTexture: true,
  maxAgeMs: 15000,

  showPassiveDelta: true,
  deltaBarWidth: 4,

  showGhostBars: true,
  ghostOpacity: 0.35,

  minBubbleRadius: 3,
  maxBubbleRadius: 18,
  bubbleOpacity: 0.55,
  clusterBorderWidth: 1.5,

  showAbsorptionHalos: true,
  haloMaxRadius: 25,

  contactPulseDuration: 300,

  focusModeEnabled: false,
  focusModeLiquidityThreshold: 50,
  focusModeTradeThreshold: 1,
};

// ============================================================================
// RENDER CONTEXT
// ============================================================================
export interface InstitutionalRenderContext {
  state: InstitutionalState;
  history: Array<{
    timestamp: number;
    bids: Map<number, number>;
    asks: Map<number, number>;
  }>;
  mousePosition: Point | null;
  focusModeEnabled: boolean;
}

// ============================================================================
// LAYOUT
// ============================================================================
interface Layout {
  width: number;
  height: number;
  dom: { x: number; y: number; w: number; h: number };
  heatmap: { x: number; y: number; w: number; h: number };
  priceAxis: { x: number; y: number; w: number; h: number };
  timeAxis: { x: number; y: number; w: number; h: number };
  statsBar: { x: number; y: number; w: number; h: number };
}

// ============================================================================
// MAIN RENDERER
// ============================================================================
export class InstitutionalHeatmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: InstitutionalRenderSettings;
  private layout: Layout;
  private dpr = 1;
  private tickSize = 0.5;

  // Stats for percentile normalization
  private liquidityValues: number[] = [];
  private percentiles = { p10: 0, p50: 0, p90: 0, max: 1 };

  // Animation state
  private interactionPulses: Map<number, { startTime: number; intensity: number }> = new Map();

  constructor(canvas: HTMLCanvasElement, settings?: Partial<InstitutionalRenderSettings>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;

    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.layout = this.calcLayout();
    this.setupCanvas();
  }

  private setupCanvas(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);

    this.layout = this.calcLayout();
  }

  private calcLayout(): Layout {
    const { domWidth, priceAxisWidth, timeAxisHeight, statsBarHeight } = this.settings;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const contentH = h - timeAxisHeight - statsBarHeight;

    return {
      width: w,
      height: h,
      dom: { x: 0, y: 0, w: domWidth, h: contentH },
      heatmap: { x: domWidth, y: 0, w: w - domWidth - priceAxisWidth, h: contentH },
      priceAxis: { x: w - priceAxisWidth, y: 0, w: priceAxisWidth, h: contentH },
      timeAxis: { x: domWidth, y: contentH, w: w - domWidth - priceAxisWidth, h: timeAxisHeight },
      statsBar: { x: 0, y: h - statsBarHeight, w, h: statsBarHeight },
    };
  }

  setTickSize(ts: number): void {
    this.tickSize = ts;
  }

  resize(): void {
    this.setupCanvas();
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  render(context: InstitutionalRenderContext, priceRange: PriceRange): void {
    const { ctx, layout } = this;
    const { state, history, mousePosition, focusModeEnabled } = context;
    const now = Date.now();

    // Update percentiles
    this.updatePercentiles(state);

    // Layer 1: Background
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, layout.width, layout.height);

    // Layer 2: Grid
    this.renderGrid(priceRange);

    // Layer 3: Heatmap with age texture
    this.renderHeatmap(history, priceRange, state.currentPrice, focusModeEnabled);

    // Layer 4: Ghost bars
    if (this.settings.showGhostBars) {
      this.renderGhostBars(state, priceRange);
    }

    // Layer 5: Passive bars
    this.renderPassiveBars(state, priceRange);

    // Layer 6: Passive delta
    if (this.settings.showPassiveDelta) {
      this.renderPassiveDelta(state, priceRange);
    }

    // Layer 7: Price line
    this.renderPriceLine(state.currentPrice, priceRange);

    // Layer 8: Absorption halos
    if (this.settings.showAbsorptionHalos) {
      this.renderAbsorptionHalos(state, priceRange);
    }

    // Layer 9: Trade bubbles (with clustering)
    this.renderTradeBubbles(state, priceRange, focusModeEnabled);

    // Layer 10: Interaction feedback
    this.renderInteractionFeedback(state, priceRange, now);

    // Layer 11: Price axis
    this.renderPriceAxis(priceRange, state.currentPrice);

    // Layer 12: Stats bar
    this.renderStatsBar(state);

    // Layer 13: Crosshair
    if (mousePosition) {
      this.renderCrosshair(mousePosition, priceRange);
    }
  }

  // ============================================================================
  // PERCENTILE CALCULATION
  // ============================================================================
  private updatePercentiles(state: InstitutionalState): void {
    this.liquidityValues = [];

    for (const level of state.bids.values()) {
      if (level.visibleSize > 0.01) this.liquidityValues.push(level.visibleSize);
    }
    for (const level of state.asks.values()) {
      if (level.visibleSize > 0.01) this.liquidityValues.push(level.visibleSize);
    }

    if (this.liquidityValues.length === 0) {
      this.percentiles = { p10: 0, p50: 1, p90: 2, max: 3 };
      return;
    }

    this.liquidityValues.sort((a, b) => a - b);
    const n = this.liquidityValues.length;

    this.percentiles = {
      p10: this.liquidityValues[Math.floor(n * 0.1)] || 0,
      p50: this.liquidityValues[Math.floor(n * 0.5)] || 1,
      p90: this.liquidityValues[Math.floor(n * 0.9)] || 2,
      max: this.liquidityValues[n - 1] || 3,
    };
  }

  // ============================================================================
  // LAYER 2: GRID
  // ============================================================================
  private renderGrid(priceRange: PriceRange): void {
    const { ctx, layout } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);

    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 0.5;

    // Horizontal lines every 10 ticks
    for (let i = 0; i <= numLevels; i += 10) {
      const y = layout.heatmap.y + (i / numLevels) * layout.heatmap.h;
      ctx.beginPath();
      ctx.moveTo(layout.dom.x, y);
      ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
      ctx.stroke();
    }
  }

  // ============================================================================
  // LAYER 3: HEATMAP WITH AGE TEXTURE
  // ============================================================================
  private renderHeatmap(
    history: InstitutionalRenderContext['history'],
    priceRange: PriceRange,
    currentPrice: number,
    focusMode: boolean
  ): void {
    const { ctx, layout, settings } = this;

    if (history.length === 0) return;

    const numColumns = history.length;
    const colWidth = Math.max(settings.minCellWidth, layout.heatmap.w / numColumns);
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const cellH = layout.heatmap.h / numLevels;

    // Focus band
    const focusMin = currentPrice - settings.focusBandTicks * this.tickSize;
    const focusMax = currentPrice + settings.focusBandTicks * this.tickSize;

    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
      const column = history[colIdx];
      const x = layout.heatmap.x + layout.heatmap.w - (numColumns - colIdx) * colWidth;

      if (x < layout.heatmap.x - colWidth || x > layout.heatmap.x + layout.heatmap.w) continue;

      // Render bids
      for (const [price, size] of column.bids) {
        if (price < priceRange.min || price > priceRange.max) continue;
        if (focusMode && size < settings.focusModeLiquidityThreshold) continue;

        const y = this.priceToY(price, priceRange);
        const inFocus = price >= focusMin && price <= focusMax;
        const color = this.getLiquidityColor(size, 'bid', inFocus);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellH / 2, colWidth, cellH);
      }

      // Render asks
      for (const [price, size] of column.asks) {
        if (price < priceRange.min || price > priceRange.max) continue;
        if (focusMode && size < settings.focusModeLiquidityThreshold) continue;

        const y = this.priceToY(price, priceRange);
        const inFocus = price >= focusMin && price <= focusMax;
        const color = this.getLiquidityColor(size, 'ask', inFocus);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellH / 2, colWidth, cellH);
      }
    }
  }

  private getLiquidityColor(value: number, side: 'bid' | 'ask', inFocus: boolean): string {
    const { percentileCompression, logScale, gamma, upperPercentile, lowerPercentile } = this.settings;

    // Normalize using percentiles
    let normalized: number;
    if (percentileCompression) {
      if (value <= this.percentiles.p10) {
        normalized = 0;
      } else if (value >= this.percentiles.p90) {
        normalized = 1;
      } else {
        normalized = (value - this.percentiles.p10) / (this.percentiles.p90 - this.percentiles.p10 + 0.001);
      }
    } else {
      normalized = value / (this.percentiles.max + 0.001);
    }

    // Log scale
    if (logScale && normalized > 0) {
      normalized = Math.log(1 + normalized * 9) / Math.log(10);
    }

    // Gamma correction
    normalized = Math.pow(Math.max(0, Math.min(1, normalized)), 1 / gamma);

    // Focus adjustment
    if (!inFocus) {
      normalized *= PALETTE.outOfFocusDesaturation;
    }

    // Map to gradient
    const colors = side === 'bid'
      ? [PALETTE.bidDim, PALETTE.bidLow, PALETTE.bidMed, PALETTE.bidHigh, PALETTE.bidIntense]
      : [PALETTE.askDim, PALETTE.askLow, PALETTE.askMed, PALETTE.askHigh, PALETTE.askIntense];

    const idx = Math.min(4, Math.floor(normalized * 4));
    const t = normalized * 4 - idx;

    return this.lerpColor(colors[idx], colors[Math.min(4, idx + 1)], t);
  }

  private lerpColor(c1: string, c2: string, t: number): string {
    const r1 = parseInt(c1.slice(1, 3), 16);
    const g1 = parseInt(c1.slice(3, 5), 16);
    const b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16);
    const g2 = parseInt(c2.slice(3, 5), 16);
    const b2 = parseInt(c2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `rgb(${r},${g},${b})`;
  }

  // ============================================================================
  // LAYER 4: GHOST BARS
  // ============================================================================
  private renderGhostBars(state: InstitutionalState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const maxBarW = settings.domWidth - 10;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);

    // Find max for scaling
    let maxSize = 0;
    for (const l of state.bids.values()) maxSize = Math.max(maxSize, l.previousSize);
    for (const l of state.asks.values()) maxSize = Math.max(maxSize, l.previousSize);
    if (maxSize === 0) return;

    ctx.globalAlpha = settings.ghostOpacity;

    // Ghost bid bars
    for (const level of state.bids.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;
      if (level.previousSize < 0.1) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.previousSize / maxSize) * maxBarW;

      ctx.fillStyle = PALETTE.bidBarGhost;
      ctx.fillRect(layout.dom.x + layout.dom.w - w, y - barH / 2, w, barH);
    }

    // Ghost ask bars
    for (const level of state.asks.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;
      if (level.previousSize < 0.1) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.previousSize / maxSize) * maxBarW;

      ctx.fillStyle = PALETTE.askBarGhost;
      ctx.fillRect(layout.dom.x + layout.dom.w, y - barH / 2, w, barH);
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 5: PASSIVE BARS
  // ============================================================================
  private renderPassiveBars(state: InstitutionalState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const maxBarW = settings.domWidth - 10;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);

    // Find max
    let maxSize = 0;
    for (const l of state.bids.values()) maxSize = Math.max(maxSize, l.visibleSize);
    for (const l of state.asks.values()) maxSize = Math.max(maxSize, l.visibleSize);
    if (maxSize === 0) return;

    // Bid bars (extend left from center)
    const centerX = layout.dom.x + layout.dom.w;

    for (const level of state.bids.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.visibleSize / maxSize) * maxBarW;

      // Age-based texture (older = slightly textured)
      const ageRatio = Math.min(1, level.ageMs / settings.maxAgeMs);
      const alpha = 0.7 + ageRatio * 0.3;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = level.isAbsorbing ? PALETTE.absorptionCore : PALETTE.bidBar;
      this.roundRect(ctx, centerX - w, y - barH / 2, w, barH, 2);
      ctx.fill();

      // Wall indicator
      if (level.isWall) {
        ctx.strokeStyle = PALETTE.wallIndicator;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Ask bars (extend right from center)
    for (const level of state.asks.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.visibleSize / maxSize) * maxBarW;

      const ageRatio = Math.min(1, level.ageMs / settings.maxAgeMs);
      const alpha = 0.7 + ageRatio * 0.3;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = level.isAbsorbing ? PALETTE.absorptionCore : PALETTE.askBar;
      this.roundRect(ctx, centerX, y - barH / 2, w, barH, 2);
      ctx.fill();

      if (level.isWall) {
        ctx.strokeStyle = PALETTE.wallIndicator;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 6: PASSIVE DELTA
  // ============================================================================
  private renderPassiveDelta(state: InstitutionalState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);
    const deltaX = layout.dom.x + 2;

    // Find max delta for scaling
    let maxDelta = 1;
    for (const l of state.bids.values()) maxDelta = Math.max(maxDelta, Math.abs(l.passiveDelta));
    for (const l of state.asks.values()) maxDelta = Math.max(maxDelta, Math.abs(l.passiveDelta));

    const renderDelta = (level: LiquidityLevel) => {
      if (level.price < priceRange.min || level.price > priceRange.max) return;
      if (Math.abs(level.passiveDelta) < 0.5) return;

      const y = this.priceToY(level.price, priceRange);
      const intensity = Math.abs(level.passiveDelta) / maxDelta;
      const h = barH * 0.6;

      ctx.fillStyle = level.passiveDelta > 0 ? PALETTE.deltaPositive : PALETTE.deltaNegative;
      ctx.globalAlpha = Math.min(0.8, 0.3 + intensity * 0.5);
      ctx.fillRect(deltaX, y - h / 2, settings.deltaBarWidth * intensity + 1, h);
    };

    for (const level of state.bids.values()) renderDelta(level);
    for (const level of state.asks.values()) renderDelta(level);

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 7: PRICE LINE
  // ============================================================================
  private renderPriceLine(price: number, priceRange: PriceRange): void {
    const { ctx, layout } = this;

    if (price < priceRange.min || price > priceRange.max) return;

    const y = this.priceToY(price, priceRange);

    // Glow
    ctx.strokeStyle = PALETTE.priceGlow;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
    ctx.stroke();

    // Main line
    ctx.strokeStyle = PALETTE.priceLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ============================================================================
  // LAYER 8: ABSORPTION HALOS
  // ============================================================================
  private renderAbsorptionHalos(state: InstitutionalState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;

    for (const absorption of state.activeAbsorptions) {
      if (absorption.price < priceRange.min || absorption.price > priceRange.max) continue;

      const y = this.priceToY(absorption.price, priceRange);
      const x = layout.heatmap.x + layout.heatmap.w - 60;
      const radius = settings.haloMaxRadius * absorption.intensity;

      // Outer halo
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, PALETTE.absorptionCore);
      gradient.addColorStop(0.5, PALETTE.absorptionHalo);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================================================================
  // LAYER 9: TRADE BUBBLES
  // ============================================================================
  private renderTradeBubbles(state: InstitutionalState, priceRange: PriceRange, focusMode: boolean): void {
    const { ctx, layout, settings } = this;
    const now = Date.now();
    const fadeMs = 4000;

    // Get recent trades
    const recentTrades = state.recentTrades.filter(
      t => t.timestamp > now - fadeMs && t.price >= priceRange.min && t.price <= priceRange.max
    );

    if (focusMode) {
      // Filter small trades
      recentTrades.filter(t => t.quantity >= settings.focusModeTradeThreshold);
    }

    // Find max for scaling
    const maxSize = Math.max(...recentTrades.map(t => t.isCluster ? t.clusterSize : t.quantity), 1);

    // Render clusters first (larger)
    const clustersRendered = new Set<string>();

    for (const trade of recentTrades) {
      if (trade.isCluster && trade.clusterId && !clustersRendered.has(trade.clusterId)) {
        clustersRendered.add(trade.clusterId);

        const cluster = state.tradeClusters.find(c => c.id === trade.clusterId);
        if (!cluster) continue;

        const age = now - cluster.endTime;
        const fadeRatio = 1 - age / fadeMs;
        const y = this.priceToY(cluster.price, priceRange);
        const x = layout.heatmap.x + layout.heatmap.w - 50;

        const sizeRatio = Math.sqrt(cluster.totalQuantity / maxSize);
        const radius = settings.minBubbleRadius + sizeRatio * (settings.maxBubbleRadius - settings.minBubbleRadius);

        const isBuy = cluster.side === 'buy';
        const baseColor = isBuy ? PALETTE.buyBubble : PALETTE.sellBubble;
        const glowColor = isBuy ? PALETTE.buyBubbleGlow : PALETTE.sellBubbleGlow;

        // Glow
        ctx.globalAlpha = fadeRatio * 0.4;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Bubble
        ctx.globalAlpha = fadeRatio * settings.bubbleOpacity;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Cluster border (thicker)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = settings.clusterBorderWidth;
        ctx.stroke();

        // Wall hit indicator
        if (cluster.hitWall) {
          ctx.strokeStyle = PALETTE.wallIndicator;
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Render individual trades
    for (const trade of recentTrades) {
      if (trade.isCluster) continue;

      const age = now - trade.timestamp;
      const fadeRatio = 1 - age / fadeMs;
      const y = this.priceToY(trade.price, priceRange);
      const x = layout.heatmap.x + layout.heatmap.w - 50;

      const sizeRatio = Math.sqrt(trade.quantity / maxSize);
      const radius = settings.minBubbleRadius + sizeRatio * (settings.maxBubbleRadius - settings.minBubbleRadius);

      const isBuy = trade.side === 'buy';
      const baseColor = isBuy ? PALETTE.buyBubble : PALETTE.sellBubble;
      const glowColor = isBuy ? PALETTE.buyBubbleGlow : PALETTE.sellBubbleGlow;

      // Glow
      ctx.globalAlpha = fadeRatio * 0.3;
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Bubble
      ctx.globalAlpha = fadeRatio * settings.bubbleOpacity;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 10: INTERACTION FEEDBACK
  // ============================================================================
  private renderInteractionFeedback(state: InstitutionalState, priceRange: PriceRange, now: number): void {
    const { ctx, layout, settings } = this;

    // Recent interactions
    const recentEvents = state.interactionEvents.filter(
      e => now - e.timestamp < settings.contactPulseDuration
    );

    for (const event of recentEvents) {
      if (event.price < priceRange.min || event.price > priceRange.max) continue;

      const y = this.priceToY(event.price, priceRange);
      const elapsed = now - event.timestamp;
      const progress = elapsed / settings.contactPulseDuration;

      if (event.type === 'contact') {
        // Subtle horizontal pulse
        ctx.globalAlpha = (1 - progress) * 0.15 * event.intensity;
        ctx.fillStyle = PALETTE.priceLine;
        ctx.fillRect(layout.dom.x, y - 1, layout.heatmap.x + layout.heatmap.w - layout.dom.x, 2);
      } else if (event.type === 'break') {
        // Fracture effect
        ctx.globalAlpha = (1 - progress) * 0.4;
        ctx.strokeStyle = event.side === 'bid' ? PALETTE.bidIntense : PALETTE.askIntense;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(layout.heatmap.x + layout.heatmap.w * 0.7, y);
        ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 11: PRICE AXIS
  // ============================================================================
  private renderPriceAxis(priceRange: PriceRange, currentPrice: number): void {
    const { ctx, layout } = this;

    // Background
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fillRect(layout.priceAxis.x, layout.priceAxis.y, layout.priceAxis.w, layout.priceAxis.h);

    // Border
    ctx.strokeStyle = PALETTE.gridEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.priceAxis.x, layout.priceAxis.y);
    ctx.lineTo(layout.priceAxis.x, layout.priceAxis.y + layout.priceAxis.h);
    ctx.stroke();

    // Labels
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const labelInterval = Math.max(1, Math.floor(numLevels / 12));

    ctx.font = '10px "SF Mono", Monaco, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numLevels; i += labelInterval) {
      const price = priceRange.max - i * this.tickSize;
      const y = layout.priceAxis.y + (i / numLevels) * layout.heatmap.h;

      const isCurrent = Math.abs(price - currentPrice) < this.tickSize * 0.5;

      if (isCurrent) {
        ctx.fillStyle = PALETTE.priceLine;
        ctx.fillRect(layout.priceAxis.x + 1, y - 7, layout.priceAxis.w - 2, 14);
        ctx.fillStyle = PALETTE.bg;
      } else {
        ctx.fillStyle = PALETTE.textSecondary;
      }

      ctx.fillText(this.formatPrice(price), layout.priceAxis.x + 5, y);
    }
  }

  // ============================================================================
  // LAYER 12: STATS BAR
  // ============================================================================
  private renderStatsBar(state: InstitutionalState): void {
    const { ctx, layout } = this;

    // Background
    ctx.fillStyle = PALETTE.bgPanel;
    ctx.fillRect(layout.statsBar.x, layout.statsBar.y, layout.statsBar.w, layout.statsBar.h);

    // Border
    ctx.strokeStyle = PALETTE.gridEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.statsBar.x, layout.statsBar.y);
    ctx.lineTo(layout.statsBar.x + layout.statsBar.w, layout.statsBar.y);
    ctx.stroke();

    // Calculate stats
    let buyVol = 0, sellVol = 0;
    const now = Date.now();
    for (const t of state.recentTrades) {
      if (t.timestamp > now - 5000) {
        if (t.side === 'buy') buyVol += t.quantity;
        else sellVol += t.quantity;
      }
    }
    const delta = buyVol - sellVol;

    // Render
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const y = layout.statsBar.y + layout.statsBar.h / 2;

    const stats = [
      { label: 'BID', value: state.totalBidLiquidity.toFixed(0), color: PALETTE.bidHigh },
      { label: 'ASK', value: state.totalAskLiquidity.toFixed(0), color: PALETTE.askHigh },
      { label: 'BUY', value: buyVol.toFixed(1), color: PALETTE.buyBubble },
      { label: 'SELL', value: sellVol.toFixed(1), color: PALETTE.sellBubble },
      { label: 'DELTA', value: (delta >= 0 ? '+' : '') + delta.toFixed(1), color: delta >= 0 ? PALETTE.deltaPositive : PALETTE.deltaNegative },
      { label: 'WALLS', value: state.walls.length.toString(), color: PALETTE.wallIndicator },
    ];

    let x = layout.statsBar.x + 12;
    for (const stat of stats) {
      ctx.fillStyle = PALETTE.textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(stat.label, x, y);

      ctx.fillStyle = stat.color;
      ctx.fillText(stat.value, x + 32, y);
      x += 75;
    }
  }

  // ============================================================================
  // LAYER 13: CROSSHAIR
  // ============================================================================
  private renderCrosshair(pos: Point, priceRange: PriceRange): void {
    const { ctx, layout } = this;

    if (pos.x < layout.dom.x || pos.x > layout.heatmap.x + layout.heatmap.w) return;
    if (pos.y < layout.heatmap.y || pos.y > layout.heatmap.y + layout.heatmap.h) return;

    const price = this.yToPrice(pos.y, priceRange);

    ctx.strokeStyle = PALETTE.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Horizontal
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, pos.y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, pos.y);
    ctx.stroke();

    // Vertical
    ctx.beginPath();
    ctx.moveTo(pos.x, layout.heatmap.y);
    ctx.lineTo(pos.x, layout.heatmap.y + layout.heatmap.h);
    ctx.stroke();

    ctx.setLineDash([]);

    // Price label
    ctx.fillStyle = PALETTE.textSecondary;
    ctx.fillRect(layout.priceAxis.x + 1, pos.y - 7, layout.priceAxis.w - 2, 14);
    ctx.fillStyle = PALETTE.bg;
    ctx.font = '10px "SF Mono", Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatPrice(price), layout.priceAxis.x + 5, pos.y);
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================
  private priceToY(price: number, range: PriceRange): number {
    const ratio = (range.max - price) / (range.max - range.min);
    return this.layout.heatmap.y + ratio * this.layout.heatmap.h;
  }

  private yToPrice(y: number, range: PriceRange): number {
    const ratio = (y - this.layout.heatmap.y) / this.layout.heatmap.h;
    return range.max - ratio * (range.max - range.min);
  }

  private formatPrice(price: number): string {
    if (this.tickSize >= 1) return price.toFixed(0);
    if (this.tickSize >= 0.1) return price.toFixed(1);
    return price.toFixed(2);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  isInPriceAxis(x: number): boolean {
    return x >= this.layout.priceAxis.x;
  }

  getLayout() {
    return { ...this.layout };
  }

  updateSettings(s: Partial<InstitutionalRenderSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.layout = this.calcLayout();
  }

  destroy(): void {
    this.interactionPulses.clear();
  }
}

export default InstitutionalHeatmapRenderer;
