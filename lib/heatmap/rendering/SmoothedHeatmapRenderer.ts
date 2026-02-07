/**
 * SMOOTHED HEATMAP RENDERER
 *
 * Calm, professional rendering for human trading analysis.
 * Uses pre-interpolated values from SmoothedSimulationEngine.
 *
 * Key Features:
 * - No frame-to-frame jitter
 * - EMA-smoothed colors
 * - Gradual fade transitions
 * - Calm trade bubbles
 * - Heavy visual damping
 *
 * Visual Philosophy:
 * - Market feels alive, not chaotic
 * - Liquidity appears heavy, not digital
 * - Price negotiates, not vibrates
 * - Trader can think without stress
 */

import type { SmoothedState, SmoothedLiquidityLevel, SmoothedTrade, SpeedMode } from '../simulation/SmoothedSimulationEngine';
import type { PriceRange, Point } from '../core/types';

// ============================================================================
// COLOR PALETTE (CALMER THAN BEFORE)
// ============================================================================
export const CALM_PALETTE = {
  // Background (slightly warmer)
  bg: '#080909',
  bgPanel: '#0b0c0d',

  // Grid (very subtle)
  grid: '#101214',
  gridEmphasis: '#161a1e',

  // Bid gradient (softer blues)
  bidDim: '#081620',
  bidLow: '#0a2030',
  bidMed: '#0e3850',
  bidHigh: '#146080',
  bidIntense: '#1a90b8',

  // Ask gradient (softer reds)
  askDim: '#160a0a',
  askLow: '#200e0e',
  askMed: '#382020',
  askHigh: '#603838',
  askIntense: '#905050',

  // Passive bars
  bidBar: '#145060',
  bidBarGhost: '#0c2830',
  askBar: '#603030',
  askBarGhost: '#301818',

  // Price
  priceLine: '#d8dce4',
  priceGlow: 'rgba(216, 220, 228, 0.06)',

  // Trades (muted)
  buyBubble: '#146850',
  buyBubbleGlow: 'rgba(20, 104, 80, 0.2)',
  sellBubble: '#704040',
  sellBubbleGlow: 'rgba(112, 64, 64, 0.2)',

  // Absorption
  absorptionHalo: 'rgba(220, 160, 60, 0.12)',
  absorptionCore: 'rgba(220, 180, 80, 0.3)',

  // Wall
  wallIndicator: '#30889a',

  // Text
  textPrimary: '#c8ccd8',
  textSecondary: '#607090',
  textMuted: '#384050',

  // Crosshair
  crosshair: 'rgba(180, 190, 210, 0.15)',
};

// ============================================================================
// RENDER SETTINGS
// ============================================================================
export interface SmoothedRenderSettings {
  // Layout
  domWidth: number;
  priceAxisWidth: number;
  timeAxisHeight: number;
  statsBarHeight: number;

  // Cell
  cellHeight: number;
  minCellWidth: number;

  // Color
  gamma: number;
  colorSmoothingFrames: number;

  // Focus band
  focusBandTicks: number;
  focusSaturationBoost: number;
  outOfFocusDesaturation: number;

  // Ghost bars
  showGhostBars: boolean;
  ghostOpacity: number;

  // Trade bubbles
  minBubbleRadius: number;
  maxBubbleRadius: number;
  bubbleOpacity: number;

  // Absorption
  showAbsorptionHalos: boolean;
  haloMaxRadius: number;

  // Focus mode
  focusModeEnabled: boolean;
  focusModeLiquidityThreshold: number;
  focusModeTradeThreshold: number;

  // Contact feedback
  showContactFeedback: boolean;
  contactPulseIntensity: number;

  // Texture rendering
  showTextureVariation: boolean;

  // ══════════════════════════════════════════════════════════════════════════
  // THERMAL MEMORY
  // ══════════════════════════════════════════════════════════════════════════
  showThermalSolidity: boolean;
  thermalSaturationBoost: number; // How much more saturated solid levels are

  // ══════════════════════════════════════════════════════════════════════════
  // AFTERIMAGES (residual traces)
  // ══════════════════════════════════════════════════════════════════════════
  showAfterimages: boolean;

  // ══════════════════════════════════════════════════════════════════════════
  // DIRECTIONAL PRESSURE
  // ══════════════════════════════════════════════════════════════════════════
  showDirectionalPressure: boolean;
  pressureStretchFactor: number;  // How much to stretch visually

  // ══════════════════════════════════════════════════════════════════════════
  // SILENCE (render optimization)
  // ══════════════════════════════════════════════════════════════════════════
  enableSilenceOptimization: boolean;
  silenceOpacityReduction: number; // Reduce opacity in quiet zones
}

const DEFAULT_SETTINGS: SmoothedRenderSettings = {
  domWidth: 85,
  priceAxisWidth: 62,
  timeAxisHeight: 18,
  statsBarHeight: 26,

  cellHeight: 12,
  minCellWidth: 3,

  gamma: 1.0,
  colorSmoothingFrames: 3,

  focusBandTicks: 12,
  focusSaturationBoost: 1.1,
  outOfFocusDesaturation: 0.65,

  showGhostBars: true,
  ghostOpacity: 0.35,

  minBubbleRadius: 8,
  maxBubbleRadius: 24,
  bubbleOpacity: 0.9,

  showAbsorptionHalos: true,
  haloMaxRadius: 24,

  focusModeEnabled: false,
  focusModeLiquidityThreshold: 50,
  focusModeTradeThreshold: 2.0,

  showContactFeedback: true,
  contactPulseIntensity: 0.08,

  showTextureVariation: true,

  // Thermal memory
  showThermalSolidity: true,
  thermalSaturationBoost: 0.25,

  // Afterimages
  showAfterimages: true,

  // Directional pressure
  showDirectionalPressure: true,
  pressureStretchFactor: 0.08,

  // Silence optimization
  enableSilenceOptimization: true,
  silenceOpacityReduction: 0.3,
};

// ============================================================================
// RENDER CONTEXT
// ============================================================================
export interface SmoothedRenderContext {
  state: SmoothedState;
  history: Array<{
    timestamp: number;
    bids: Map<number, number>;
    asks: Map<number, number>;
  }>;
  mousePosition: Point | null;
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
export class SmoothedHeatmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: SmoothedRenderSettings;
  private layout: Layout;
  private dpr = 1;
  private tickSize = 0.5;

  // Color smoothing cache
  private colorCache: Map<string, { color: string; frames: number }> = new Map();

  // Previous percentiles for smoothing
  private smoothedPercentiles = { p10: 1, p50: 5, p90: 15, max: 20 };

  constructor(canvas: HTMLCanvasElement, settings?: Partial<SmoothedRenderSettings>) {
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
  render(context: SmoothedRenderContext, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const { state, history, mousePosition } = context;

    // Update percentiles smoothly
    this.updateSmoothedPercentiles(state);

    // ══════════════════════════════════════════════════════════════════════════
    // SILENCE OPTIMIZATION: Reduce updates when market is quiet
    // ══════════════════════════════════════════════════════════════════════════
    const quietFactor = settings.enableSilenceOptimization && state.isQuiet
      ? 1 - settings.silenceOpacityReduction * Math.min(1, state.quietDuration / 3000)
      : 1;

    // Layer 1: Background
    ctx.fillStyle = CALM_PALETTE.bg;
    ctx.fillRect(0, 0, layout.width, layout.height);

    // Layer 2: Grid
    this.renderGrid(priceRange);

    // Layer 3: Afterimages (residual traces of removed liquidity)
    if (settings.showAfterimages && state.afterimages.length > 0) {
      this.renderAfterimages(state, priceRange);
    }

    // Layer 4: Heatmap with thermal memory
    this.renderHeatmap(history, priceRange, state.displayPrice);

    // Layer 5: Ghost bars
    if (settings.showGhostBars) {
      this.renderGhostBars(state, priceRange);
    }

    // Layer 6: Passive bars with thermal solidity
    this.renderPassiveBars(state, priceRange, quietFactor);

    // Layer 7: Contact feedback
    if (settings.showContactFeedback) {
      this.renderContactFeedback(state, priceRange);
    }

    // Layer 8: Directional pressure (subtle visual bias)
    if (settings.showDirectionalPressure && Math.abs(state.pressureBias) > 0.1) {
      this.renderDirectionalPressure(state, priceRange);
    }

    // Layer 9: Price line (THE HERO)
    this.renderPriceLineHero(state, priceRange);

    // Layer 10: Absorption halos
    if (settings.showAbsorptionHalos) {
      this.renderAbsorptionHalos(state, priceRange);
    }

    // Layer 11: Trade bubbles
    this.renderTradeBubbles(state, priceRange);

    // Layer 12: Price axis
    this.renderPriceAxis(priceRange, state.displayPrice, state.currentPrice);

    // Layer 13: Stats bar with pressure indicator
    this.renderStatsBar(state);

    // Layer 14: Crosshair
    if (mousePosition) {
      this.renderCrosshair(mousePosition, priceRange);
    }

    // Layer 15: Silence indicator (when market is quiet)
    if (state.isQuiet && state.quietDuration > 1500) {
      this.renderSilenceIndicator(state);
    }
  }

  // ============================================================================
  // PERCENTILE SMOOTHING
  // ============================================================================
  private updateSmoothedPercentiles(state: SmoothedState): void {
    const sizes: number[] = [];

    for (const level of state.bids.values()) {
      if (level.displaySize > 0.1) sizes.push(level.displaySize);
    }
    for (const level of state.asks.values()) {
      if (level.displaySize > 0.1) sizes.push(level.displaySize);
    }

    if (sizes.length === 0) return;

    sizes.sort((a, b) => a - b);
    const n = sizes.length;

    const raw = {
      p10: sizes[Math.floor(n * 0.1)] || 1,
      p50: sizes[Math.floor(n * 0.5)] || 5,
      p90: sizes[Math.floor(n * 0.9)] || 15,
      max: sizes[n - 1] || 20,
    };

    // EMA smoothing on percentiles (lower alpha = smoother, less jitter)
    const alpha = 0.05;
    this.smoothedPercentiles.p10 += (raw.p10 - this.smoothedPercentiles.p10) * alpha;
    this.smoothedPercentiles.p50 += (raw.p50 - this.smoothedPercentiles.p50) * alpha;
    this.smoothedPercentiles.p90 += (raw.p90 - this.smoothedPercentiles.p90) * alpha;
    this.smoothedPercentiles.max += (raw.max - this.smoothedPercentiles.max) * alpha;
  }

  // ============================================================================
  // LAYER 3: AFTERIMAGES (Residual traces of removed liquidity)
  // ============================================================================
  private renderAfterimages(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);
    const maxBarW = this.settings.domWidth - 8;
    const centerX = layout.dom.x + layout.dom.w;

    for (const ai of state.afterimages) {
      if (ai.price < priceRange.min || ai.price > priceRange.max) continue;
      if (ai.opacity < 0.02) continue;

      const y = this.priceToY(ai.price, priceRange);
      const w = Math.min(maxBarW * 0.8, (ai.size / 30) * maxBarW);

      // Color based on removal type
      let color: string;
      switch (ai.type) {
        case 'consumed':
          // Warm amber trace (liquidity was hit)
          color = `rgba(180, 140, 60, ${ai.opacity * 0.4})`;
          break;
        case 'spoof':
          // Faint red flash (fake liquidity)
          color = `rgba(180, 60, 60, ${ai.opacity * 0.3})`;
          break;
        case 'cancel':
        default:
          // Neutral grey trace
          color = `rgba(100, 110, 120, ${ai.opacity * 0.25})`;
      }

      ctx.fillStyle = color;

      if (ai.side === 'bid') {
        // Bid: left side, slightly faded/displaced
        ctx.fillRect(centerX - w - 2, y - barH / 2 - 1, w, barH + 2);
      } else {
        // Ask: right side
        ctx.fillRect(centerX + 2, y - barH / 2 - 1, w, barH + 2);
      }

      // Extra effect for consumed (small ring)
      if (ai.type === 'consumed' && ai.opacity > 0.15) {
        ctx.strokeStyle = `rgba(220, 180, 80, ${ai.opacity * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, y, barH * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // ============================================================================
  // LAYER 8: DIRECTIONAL PRESSURE (Subtle visual bias)
  // ============================================================================
  private renderDirectionalPressure(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const { pressureBias, pressureMomentum, buyPressure, sellPressure } = state;

    // Don't render if bias is too small
    if (Math.abs(pressureBias) < 0.1) return;

    const priceY = this.priceToY(state.displayPrice, priceRange);
    const heatmapMidX = layout.heatmap.x + layout.heatmap.w / 2;

    // Calculate stretch amount
    const stretchAmount = pressureBias * settings.pressureStretchFactor * layout.heatmap.h;

    // Create subtle gradient showing pressure direction
    const gradientHeight = Math.abs(stretchAmount) * 3;
    const gradientY = pressureBias > 0
      ? priceY - gradientHeight  // Buy pressure: gradient above price
      : priceY;                   // Sell pressure: gradient below price

    const gradient = ctx.createLinearGradient(
      layout.heatmap.x, gradientY,
      layout.heatmap.x, gradientY + gradientHeight
    );

    if (pressureBias > 0) {
      // Buy pressure: subtle cyan tint at top
      gradient.addColorStop(0, `rgba(40, 180, 200, ${Math.abs(pressureBias) * 0.06})`);
      gradient.addColorStop(1, 'transparent');
    } else {
      // Sell pressure: subtle red tint at bottom
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(1, `rgba(200, 80, 80, ${Math.abs(pressureBias) * 0.06})`);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(layout.heatmap.x, gradientY, layout.heatmap.w, gradientHeight);

    // Small directional indicator near price line
    if (Math.abs(pressureBias) > 0.2) {
      const indicatorX = layout.heatmap.x + layout.heatmap.w - 20;
      const indicatorSize = Math.abs(pressureBias) * 8;

      ctx.globalAlpha = Math.abs(pressureBias) * 0.4;
      ctx.fillStyle = pressureBias > 0 ? '#38b8d0' : '#d05858';

      ctx.beginPath();
      if (pressureBias > 0) {
        // Up arrow
        ctx.moveTo(indicatorX, priceY - 5);
        ctx.lineTo(indicatorX - indicatorSize, priceY - 5 + indicatorSize);
        ctx.lineTo(indicatorX + indicatorSize, priceY - 5 + indicatorSize);
      } else {
        // Down arrow
        ctx.moveTo(indicatorX, priceY + 5);
        ctx.lineTo(indicatorX - indicatorSize, priceY + 5 - indicatorSize);
        ctx.lineTo(indicatorX + indicatorSize, priceY + 5 - indicatorSize);
      }
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
    }
  }

  // ============================================================================
  // LAYER 15: SILENCE INDICATOR
  // ============================================================================
  private renderSilenceIndicator(state: SmoothedState): void {
    const { ctx, layout } = this;

    // Subtle "quiet market" indicator
    const alpha = Math.min(0.4, (state.quietDuration - 1500) / 5000);

    ctx.fillStyle = `rgba(60, 70, 80, ${alpha})`;
    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = layout.heatmap.x + layout.heatmap.w / 2;
    const y = layout.heatmap.y + 30;

    ctx.fillText('· · ·', x, y);
  }

  // ============================================================================
  // LAYER 2: GRID
  // ============================================================================
  private renderGrid(priceRange: PriceRange): void {
    const { ctx, layout } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);

    ctx.strokeStyle = CALM_PALETTE.grid;
    ctx.lineWidth = 0.5;

    for (let i = 0; i <= numLevels; i += 10) {
      const y = layout.heatmap.y + (i / numLevels) * layout.heatmap.h;
      ctx.beginPath();
      ctx.moveTo(layout.dom.x, y);
      ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
      ctx.stroke();
    }
  }

  // ============================================================================
  // LAYER 3: HEATMAP
  // ============================================================================
  private renderHeatmap(
    history: SmoothedRenderContext['history'],
    priceRange: PriceRange,
    displayPrice: number
  ): void {
    const { ctx, layout, settings } = this;

    if (history.length === 0) return;

    const numColumns = history.length;
    const colWidth = Math.max(settings.minCellWidth, layout.heatmap.w / numColumns);
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const cellH = layout.heatmap.h / numLevels;

    // Focus band
    const focusMin = displayPrice - settings.focusBandTicks * this.tickSize;
    const focusMax = displayPrice + settings.focusBandTicks * this.tickSize;

    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
      const column = history[colIdx];
      const x = layout.heatmap.x + layout.heatmap.w - (numColumns - colIdx) * colWidth;

      if (x < layout.heatmap.x - colWidth || x > layout.heatmap.x + layout.heatmap.w) continue;

      // Bids
      for (const [price, size] of column.bids) {
        if (price < priceRange.min || price > priceRange.max) continue;
        if (settings.focusModeEnabled && size < settings.focusModeLiquidityThreshold) continue;

        const y = this.priceToY(price, priceRange);
        const inFocus = price >= focusMin && price <= focusMax;
        const color = this.getSmoothedColor(size, 'bid', inFocus);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellH / 2, colWidth, cellH);
      }

      // Asks
      for (const [price, size] of column.asks) {
        if (price < priceRange.min || price > priceRange.max) continue;
        if (settings.focusModeEnabled && size < settings.focusModeLiquidityThreshold) continue;

        const y = this.priceToY(price, priceRange);
        const inFocus = price >= focusMin && price <= focusMax;
        const color = this.getSmoothedColor(size, 'ask', inFocus);

        ctx.fillStyle = color;
        ctx.fillRect(x, y - cellH / 2, colWidth, cellH);
      }
    }
  }

  private getSmoothedColor(value: number, side: 'bid' | 'ask', inFocus: boolean): string {
    // Normalize using smoothed percentiles
    let normalized: number;
    if (value <= this.smoothedPercentiles.p10) {
      normalized = 0;
    } else if (value >= this.smoothedPercentiles.p90) {
      normalized = 1;
    } else {
      normalized = (value - this.smoothedPercentiles.p10) /
        (this.smoothedPercentiles.p90 - this.smoothedPercentiles.p10 + 0.001);
    }

    // Log scale for compression
    if (normalized > 0) {
      normalized = Math.log(1 + normalized * 9) / Math.log(10);
    }

    // Gamma
    normalized = Math.pow(Math.max(0, Math.min(1, normalized)), 1 / this.settings.gamma);

    // Focus adjustment
    if (!inFocus) {
      normalized *= this.settings.outOfFocusDesaturation;
    }

    // Map to gradient
    const colors = side === 'bid'
      ? [CALM_PALETTE.bidDim, CALM_PALETTE.bidLow, CALM_PALETTE.bidMed, CALM_PALETTE.bidHigh, CALM_PALETTE.bidIntense]
      : [CALM_PALETTE.askDim, CALM_PALETTE.askLow, CALM_PALETTE.askMed, CALM_PALETTE.askHigh, CALM_PALETTE.askIntense];

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
  // LAYER 4: GHOST BARS (1 second history - shows stacking/pulling/absorption)
  // ============================================================================
  private renderGhostBars(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;
    const maxBarW = settings.domWidth - 8;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);

    // Calculate max size from ghost sizes
    let maxSize = 0;
    for (const l of state.bids.values()) maxSize = Math.max(maxSize, l.ghostSize || l.displaySize);
    for (const l of state.asks.values()) maxSize = Math.max(maxSize, l.ghostSize || l.displaySize);
    if (maxSize === 0) return;

    const centerX = layout.dom.x + layout.dom.w;

    // Bid ghost bars
    for (const level of state.bids.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const ghostSize = level.ghostSize || level.displaySize;
      if (ghostSize < 0.1) continue;

      const y = this.priceToY(level.price, priceRange);
      const ghostW = (ghostSize / maxSize) * maxBarW;
      const currentW = (level.displaySize / maxSize) * maxBarW;

      // Determine change type: stacking (+), pulling (-), or stable
      const delta = level.displaySize - ghostSize;
      let ghostColor = CALM_PALETTE.bidBarGhost;

      if (delta > ghostSize * 0.15) {
        // Stacking: liquidity added (green tint)
        ghostColor = 'rgba(40, 160, 120, 0.15)';
      } else if (delta < -ghostSize * 0.15) {
        // Pulling: liquidity removed (red tint)
        ghostColor = 'rgba(160, 80, 80, 0.15)';
      }

      ctx.globalAlpha = settings.ghostOpacity;
      ctx.fillStyle = ghostColor;
      ctx.fillRect(centerX - ghostW, y - barH / 2, ghostW, barH);
    }

    // Ask ghost bars
    for (const level of state.asks.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const ghostSize = level.ghostSize || level.displaySize;
      if (ghostSize < 0.1) continue;

      const y = this.priceToY(level.price, priceRange);
      const ghostW = (ghostSize / maxSize) * maxBarW;

      // Determine change type
      const delta = level.displaySize - ghostSize;
      let ghostColor = CALM_PALETTE.askBarGhost;

      if (delta > ghostSize * 0.15) {
        ghostColor = 'rgba(40, 160, 120, 0.15)';
      } else if (delta < -ghostSize * 0.15) {
        ghostColor = 'rgba(160, 80, 80, 0.15)';
      }

      ctx.globalAlpha = settings.ghostOpacity;
      ctx.fillStyle = ghostColor;
      ctx.fillRect(centerX, y - barH / 2, ghostW, barH);
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 6: PASSIVE BARS (with thermal solidity and texture)
  // ============================================================================
  private renderPassiveBars(state: SmoothedState, priceRange: PriceRange, quietFactor: number = 1): void {
    const { ctx, layout, settings } = this;
    const maxBarW = settings.domWidth - 8;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);

    // Calculate percentile threshold for focus mode
    const allSizes: number[] = [];
    for (const l of state.bids.values()) if (l.displaySize > 0.1) allSizes.push(l.displaySize);
    for (const l of state.asks.values()) if (l.displaySize > 0.1) allSizes.push(l.displaySize);

    allSizes.sort((a, b) => a - b);
    const focusThreshold = settings.focusModeEnabled && allSizes.length > 0
      ? allSizes[Math.floor(allSizes.length * 0.5)] // Hide bottom 50%
      : 0;

    let maxSize = Math.max(...allSizes, 1);

    const centerX = layout.dom.x + layout.dom.w;

    // Bid bars
    for (const level of state.bids.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;
      if (level.displaySize < 0.1) continue;

      // Focus mode: hide small liquidity
      if (settings.focusModeEnabled && level.displaySize < focusThreshold) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.displaySize / maxSize) * maxBarW;

      // Base alpha with contact pulse boost
      const contactBoost = level.contactPulse * settings.contactPulseIntensity;
      ctx.globalAlpha = Math.min(1, level.displayOpacity * 0.85 + contactBoost);

      // Color based on density category
      ctx.fillStyle = this.getBarColorByDensity(level, 'bid');
      this.roundRect(ctx, centerX - w, y - barH / 2, w, barH, 2);
      ctx.fill();

      // Texture for dense/wall (subtle vertical lines)
      if (settings.showTextureVariation && (level.densityCategory === 'dense' || level.densityCategory === 'wall')) {
        this.renderBarTexture(ctx, centerX - w, y - barH / 2, w, barH, level.densityCategory);
      }

      // Wall indicator
      if (level.isWall) {
        ctx.strokeStyle = CALM_PALETTE.wallIndicator;
        ctx.lineWidth = level.densityCategory === 'wall' ? 2 : 1.5;
        ctx.stroke();
      }

      // Contact micro-contraction effect
      if (level.contactPulse > 0.1) {
        const contractionW = w * (1 - level.contactPulse * 0.05);
        ctx.strokeStyle = `rgba(255, 255, 255, ${level.contactPulse * 0.2})`;
        ctx.lineWidth = 1;
        this.roundRect(ctx, centerX - contractionW, y - barH / 2 + 1, contractionW, barH - 2, 2);
        ctx.stroke();
      }
    }

    // Ask bars
    for (const level of state.asks.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;
      if (level.displaySize < 0.1) continue;

      // Focus mode: hide small liquidity
      if (settings.focusModeEnabled && level.displaySize < focusThreshold) continue;

      const y = this.priceToY(level.price, priceRange);
      const w = (level.displaySize / maxSize) * maxBarW;

      const contactBoost = level.contactPulse * settings.contactPulseIntensity;
      ctx.globalAlpha = Math.min(1, level.displayOpacity * 0.85 + contactBoost);

      ctx.fillStyle = this.getBarColorByDensity(level, 'ask');
      this.roundRect(ctx, centerX, y - barH / 2, w, barH, 2);
      ctx.fill();

      // Texture for dense/wall
      if (settings.showTextureVariation && (level.densityCategory === 'dense' || level.densityCategory === 'wall')) {
        this.renderBarTexture(ctx, centerX, y - barH / 2, w, barH, level.densityCategory);
      }

      // Wall indicator
      if (level.isWall) {
        ctx.strokeStyle = CALM_PALETTE.wallIndicator;
        ctx.lineWidth = level.densityCategory === 'wall' ? 2 : 1.5;
        ctx.stroke();
      }

      // Contact micro-contraction effect
      if (level.contactPulse > 0.1) {
        const contractionW = w * (1 - level.contactPulse * 0.05);
        ctx.strokeStyle = `rgba(255, 255, 255, ${level.contactPulse * 0.2})`;
        ctx.lineWidth = 1;
        this.roundRect(ctx, centerX, y - barH / 2 + 1, contractionW, barH - 2, 2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }

  private getBarColorByDensity(level: SmoothedLiquidityLevel, side: 'bid' | 'ask'): string {
    const { densityCategory, isAbsorbing, thermalSolidity } = level;

    if (isAbsorbing) return CALM_PALETTE.absorptionCore;

    // Base colors by density
    let baseColor: { r: number; g: number; b: number };

    if (side === 'bid') {
      switch (densityCategory) {
        case 'soft': baseColor = { r: 10, g: 48, b: 64 }; break;
        case 'normal': baseColor = { r: 20, g: 80, b: 96 }; break;
        case 'dense': baseColor = { r: 26, g: 104, b: 120 }; break;
        case 'wall': baseColor = { r: 36, g: 144, b: 152 }; break;
        default: baseColor = { r: 20, g: 80, b: 96 };
      }
    } else {
      switch (densityCategory) {
        case 'soft': baseColor = { r: 64, g: 24, b: 24 }; break;
        case 'normal': baseColor = { r: 96, g: 48, b: 48 }; break;
        case 'dense': baseColor = { r: 128, g: 56, b: 56 }; break;
        case 'wall': baseColor = { r: 160, g: 72, b: 72 }; break;
        default: baseColor = { r: 96, g: 48, b: 48 };
      }
    }

    // Apply thermal solidity boost (older levels = more saturated)
    if (this.settings.showThermalSolidity && thermalSolidity > 0.1) {
      const boost = thermalSolidity * this.settings.thermalSaturationBoost;
      baseColor.r = Math.min(255, Math.round(baseColor.r * (1 + boost)));
      baseColor.g = Math.min(255, Math.round(baseColor.g * (1 + boost)));
      baseColor.b = Math.min(255, Math.round(baseColor.b * (1 + boost)));
    }

    return `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
  }

  private renderBarTexture(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    density: 'dense' | 'wall'
  ): void {
    // Subtle vertical lines for texture
    const spacing = density === 'wall' ? 3 : 5;
    const alpha = density === 'wall' ? 0.12 : 0.06;

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 0.5;

    for (let i = spacing; i < w; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + 1);
      ctx.lineTo(x + i, y + h - 1);
      ctx.stroke();
    }
  }

  // ============================================================================
  // LAYER 6: CONTACT FEEDBACK (Pulse when price touches liquidity)
  // ============================================================================
  private renderContactFeedback(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;

    // Render contact pulses on liquidity levels
    for (const level of state.bids.values()) {
      if (level.contactPulse > 0.01) {
        this.renderContactPulse(level, priceRange, settings.contactPulseIntensity);
      }
    }
    for (const level of state.asks.values()) {
      if (level.contactPulse > 0.01) {
        this.renderContactPulse(level, priceRange, settings.contactPulseIntensity);
      }
    }

    // Render contact events (brief flashes)
    for (const contact of state.priceContacts) {
      if (contact.price < priceRange.min || contact.price > priceRange.max) continue;

      const y = this.priceToY(contact.price, priceRange);
      const x = layout.heatmap.x + layout.heatmap.w / 2;

      // Expanding ring effect
      const radius = 15 + (1 - contact.intensity) * 30;
      const alpha = contact.intensity * 0.2;

      ctx.strokeStyle = contact.side === 'bid'
        ? `rgba(20, 160, 180, ${alpha})`
        : `rgba(180, 80, 80, ${alpha})`;
      ctx.lineWidth = 2 * contact.intensity;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderContactPulse(level: SmoothedLiquidityLevel, priceRange: PriceRange, intensity: number): void {
    const { ctx, layout } = this;

    if (level.price < priceRange.min || level.price > priceRange.max) return;

    const y = this.priceToY(level.price, priceRange);
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const barH = Math.max(2, layout.heatmap.h / numLevels - 1);

    // Pulse effect: brief opacity boost
    const pulseAlpha = level.contactPulse * intensity;
    const pulseColor = level.side === 'bid'
      ? `rgba(40, 200, 220, ${pulseAlpha})`
      : `rgba(220, 100, 100, ${pulseAlpha})`;

    ctx.fillStyle = pulseColor;
    ctx.fillRect(layout.dom.x, y - barH, layout.dom.w + layout.heatmap.w, barH * 2);
  }

  // ============================================================================
  // LAYER 7: PRICE LINE (THE HERO - Variable thickness, glow, pressure)
  // ============================================================================
  private renderPriceLineHero(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout } = this;
    const { displayPrice, priceLineThickness, priceLineGlow, denseZonePressure } = state;

    if (displayPrice < priceRange.min || displayPrice > priceRange.max) return;

    const y = this.priceToY(displayPrice, priceRange);

    // Layer 1: Wide glow (responsive to dense zones)
    const glowWidth = 8 + denseZonePressure * 12;
    const glowAlpha = 0.04 + priceLineGlow * 0.08;
    ctx.strokeStyle = `rgba(216, 220, 228, ${glowAlpha})`;
    ctx.lineWidth = glowWidth;
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
    ctx.stroke();

    // Layer 2: Medium glow
    ctx.strokeStyle = `rgba(216, 220, 228, ${glowAlpha * 1.5})`;
    ctx.lineWidth = glowWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
    ctx.stroke();

    // Layer 3: Core line (variable thickness)
    ctx.strokeStyle = CALM_PALETTE.priceLine;
    ctx.lineWidth = priceLineThickness;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(layout.dom.x, y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Layer 4: Pressure indicator (when in dense zone)
    if (denseZonePressure > 0.3) {
      const pressureAlpha = (denseZonePressure - 0.3) * 0.15;
      ctx.fillStyle = `rgba(255, 200, 100, ${pressureAlpha})`;

      // Small pressure glow at the heatmap edge
      const gradient = ctx.createRadialGradient(
        layout.heatmap.x + layout.heatmap.w - 40, y, 0,
        layout.heatmap.x + layout.heatmap.w - 40, y, 35
      );
      gradient.addColorStop(0, `rgba(255, 200, 100, ${pressureAlpha})`);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(layout.heatmap.x + layout.heatmap.w - 40, y, 35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================================================================
  // LAYER 7: ABSORPTION HALOS
  // ============================================================================
  private renderAbsorptionHalos(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout, settings } = this;

    for (const absorption of state.activeAbsorptions) {
      if (absorption.price < priceRange.min || absorption.price > priceRange.max) continue;

      const y = this.priceToY(absorption.price, priceRange);
      const x = layout.heatmap.x + layout.heatmap.w - 55;
      const radius = settings.haloMaxRadius * absorption.intensity;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, CALM_PALETTE.absorptionCore);
      gradient.addColorStop(0.5, CALM_PALETTE.absorptionHalo);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============================================================================
  // LAYER 11: TRADE BUBBLES - VERY VISIBLE, SIMPLE, NO BUGS
  // ============================================================================
  private renderTradeBubbles(state: SmoothedState, priceRange: PriceRange): void {
    const { ctx, layout } = this;

    // Filter visible trades
    const visibleTrades = state.trades.filter(
      t => t.price >= priceRange.min && t.price <= priceRange.max && t.displayOpacity > 0.05
    );

    if (visibleTrades.length === 0) return;

    // Position: right side of heatmap, near the DOM
    const bubbleX = layout.dom.x + layout.dom.w + 25;

    // Simple fixed size range
    const MIN_RADIUS = 6;
    const MAX_RADIUS = 18;

    // Find max for scaling
    const maxQty = Math.max(...visibleTrades.map(t => t.quantity), 1);

    for (const trade of visibleTrades) {
      const y = this.priceToY(trade.price, priceRange);

      // Simple size calculation
      const sizeRatio = Math.min(1, trade.quantity / maxQty);
      const radius = MIN_RADIUS + sizeRatio * (MAX_RADIUS - MIN_RADIUS);

      // Apply display animation
      const animatedRadius = radius * Math.min(1, trade.displayOpacity * 1.2);
      const alpha = Math.min(1, trade.displayOpacity);

      if (animatedRadius < 2) continue;

      const isBuy = trade.side === 'buy';

      // ═══════════════════════════════════════════════════════════════════════
      // VERY BRIGHT, SATURATED COLORS - EASY TO SEE
      // ═══════════════════════════════════════════════════════════════════════
      const buyColor = '#00e5a0';      // Bright cyan-green
      const sellColor = '#ff5566';     // Bright red-pink
      const baseColor = isBuy ? buyColor : sellColor;

      // Glow (big, visible)
      ctx.globalAlpha = alpha * 0.4;
      ctx.fillStyle = isBuy ? 'rgba(0, 229, 160, 0.5)' : 'rgba(255, 85, 102, 0.5)';
      ctx.beginPath();
      ctx.arc(bubbleX, y, animatedRadius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Core bubble (solid, bright)
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(bubbleX, y, animatedRadius, 0, Math.PI * 2);
      ctx.fill();

      // White border (always visible)
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Size label for big trades
      if (trade.quantity > 3 && animatedRadius > 8) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trade.quantity.toFixed(1), bubbleX, y);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ============================================================================
  // LAYER 9: PRICE AXIS
  // ============================================================================
  private renderPriceAxis(priceRange: PriceRange, displayPrice: number, currentPrice: number): void {
    const { ctx, layout } = this;

    ctx.fillStyle = CALM_PALETTE.bgPanel;
    ctx.fillRect(layout.priceAxis.x, layout.priceAxis.y, layout.priceAxis.w, layout.priceAxis.h);

    ctx.strokeStyle = CALM_PALETTE.gridEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.priceAxis.x, layout.priceAxis.y);
    ctx.lineTo(layout.priceAxis.x, layout.priceAxis.y + layout.priceAxis.h);
    ctx.stroke();

    const numLevels = Math.ceil((priceRange.max - priceRange.min) / this.tickSize);
    const labelInterval = Math.max(1, Math.floor(numLevels / 10));

    ctx.font = '9px "SF Mono", Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numLevels; i += labelInterval) {
      const price = priceRange.max - i * this.tickSize;
      const y = layout.priceAxis.y + (i / numLevels) * layout.heatmap.h;

      const isCurrent = Math.abs(price - displayPrice) < this.tickSize * 0.5;

      if (isCurrent) {
        ctx.fillStyle = CALM_PALETTE.priceLine;
        ctx.fillRect(layout.priceAxis.x + 1, y - 6, layout.priceAxis.w - 2, 12);
        ctx.fillStyle = CALM_PALETTE.bg;
      } else {
        ctx.fillStyle = CALM_PALETTE.textSecondary;
      }

      ctx.fillText(this.formatPrice(price), layout.priceAxis.x + 4, y);
    }
  }

  // ============================================================================
  // LAYER 13: STATS BAR (with pressure and activity)
  // ============================================================================
  private renderStatsBar(state: SmoothedState): void {
    const { ctx, layout } = this;

    ctx.fillStyle = CALM_PALETTE.bgPanel;
    ctx.fillRect(layout.statsBar.x, layout.statsBar.y, layout.statsBar.w, layout.statsBar.h);

    ctx.strokeStyle = CALM_PALETTE.gridEmphasis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.statsBar.x, layout.statsBar.y);
    ctx.lineTo(layout.statsBar.x + layout.statsBar.w, layout.statsBar.y);
    ctx.stroke();

    // Smooth stats
    let buyVol = 0, sellVol = 0;
    for (const t of state.trades) {
      if (t.side === 'buy') buyVol += t.quantity * t.displayOpacity;
      else sellVol += t.quantity * t.displayOpacity;
    }
    const delta = buyVol - sellVol;

    // Pressure indicator
    const pressureLabel = state.pressureBias > 0.15 ? '↑' : state.pressureBias < -0.15 ? '↓' : '·';
    const pressureColor = state.pressureBias > 0.15 ? '#38b8d0' : state.pressureBias < -0.15 ? '#d05858' : CALM_PALETTE.textMuted;

    // Activity indicator
    const activityLabel = state.isQuiet ? '◦' : state.marketActivity > 0.6 ? '●' : '○';
    const activityColor = state.isQuiet ? CALM_PALETTE.textMuted : state.marketActivity > 0.6 ? '#e8b848' : CALM_PALETTE.textSecondary;

    ctx.font = '9px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const y = layout.statsBar.y + layout.statsBar.h / 2;

    const stats = [
      { label: 'BID', value: state.totalBidLiquidity.toFixed(0), color: CALM_PALETTE.bidHigh },
      { label: 'ASK', value: state.totalAskLiquidity.toFixed(0), color: CALM_PALETTE.askHigh },
      { label: 'Δ', value: (delta >= 0 ? '+' : '') + delta.toFixed(1), color: delta >= 0 ? '#28a868' : '#a84848' },
      { label: 'P', value: pressureLabel, color: pressureColor },
      { label: 'ACT', value: activityLabel, color: activityColor },
      { label: '', value: state.speedMode.toUpperCase(), color: CALM_PALETTE.wallIndicator },
    ];

    let x = layout.statsBar.x + 10;
    for (const stat of stats) {
      if (stat.label) {
        ctx.fillStyle = CALM_PALETTE.textMuted;
        ctx.textAlign = 'left';
        ctx.fillText(stat.label, x, y);
        ctx.fillStyle = stat.color;
        ctx.fillText(stat.value, x + 24, y);
        x += 52;
      } else {
        ctx.fillStyle = stat.color;
        ctx.fillText(stat.value, x, y);
        x += 45;
      }
    }

    // Thermal solidity indicator (mini bar showing average solidity)
    if (this.settings.showThermalSolidity) {
      let totalSolidity = 0;
      let count = 0;
      for (const l of state.bids.values()) { totalSolidity += l.thermalSolidity; count++; }
      for (const l of state.asks.values()) { totalSolidity += l.thermalSolidity; count++; }
      const avgSolidity = count > 0 ? totalSolidity / count : 0;

      // Draw mini solidity bar
      const barX = layout.statsBar.x + layout.statsBar.w - 60;
      const barW = 40;
      const barFill = avgSolidity * barW;

      ctx.fillStyle = CALM_PALETTE.textMuted;
      ctx.fillRect(barX, y - 3, barW, 6);
      ctx.fillStyle = '#4a8090';
      ctx.fillRect(barX, y - 3, barFill, 6);
    }
  }

  // ============================================================================
  // LAYER 11: CROSSHAIR
  // ============================================================================
  private renderCrosshair(pos: Point, priceRange: PriceRange): void {
    const { ctx, layout } = this;

    if (pos.x < layout.dom.x || pos.x > layout.heatmap.x + layout.heatmap.w) return;
    if (pos.y < layout.heatmap.y || pos.y > layout.heatmap.y + layout.heatmap.h) return;

    const price = this.yToPrice(pos.y, priceRange);

    ctx.strokeStyle = CALM_PALETTE.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(layout.dom.x, pos.y);
    ctx.lineTo(layout.heatmap.x + layout.heatmap.w, pos.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pos.x, layout.heatmap.y);
    ctx.lineTo(pos.x, layout.heatmap.y + layout.heatmap.h);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.fillStyle = CALM_PALETTE.textSecondary;
    ctx.fillRect(layout.priceAxis.x + 1, pos.y - 6, layout.priceAxis.w - 2, 12);
    ctx.fillStyle = CALM_PALETTE.bg;
    ctx.font = '9px "SF Mono", Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.formatPrice(price), layout.priceAxis.x + 4, pos.y);
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

  updateSettings(s: Partial<SmoothedRenderSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.layout = this.calcLayout();
  }

  destroy(): void {
    this.colorCache.clear();
  }
}

export default SmoothedHeatmapRenderer;
