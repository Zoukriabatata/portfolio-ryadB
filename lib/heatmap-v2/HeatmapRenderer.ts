/**
 * HEATMAP RENDERER V2 - Simple et clair
 *
 * Layers:
 * 1. Background
 * 2. Heatmap (ordres passifs)
 * 3. Traces (afterimages)
 * 4. Staircase lines (bid/ask)
 * 5. Trade bubbles
 * 6. Price axis
 */

import {
  MarketState,
  PassiveOrder,
  Trade,
  TradeCluster,
  HeatmapCell,
  TradeFlowSettings,
  DEFAULT_TRADE_FLOW_SETTINGS,
  CumulativeLevel,
  ImbalanceLevel,
  AbsorptionEvent,
  IcebergOrder,
  Drawing,
  DrawingBase,
  DrawingType,
  HorizontalLine,
  RectangleZone,
  TextAnnotation,
  TrendLine,
} from './types';

// ══════════════════════════════════════════════════════════════════════════════
// COULEURS
// ══════════════════════════════════════════════════════════════════════════════
const COLORS = {
  bg: '#081228',     // Deep navy blue (Bookmap-style)
  grid: '#0e1e3a',

  // Bid (achat) - Cyan/Bleu
  bidLight: '#0d3a4a',
  bidMedium: '#1a6080',
  bidBright: '#20a0c0',
  bidLine: '#00d4ff',

  // Ask (vente) - Rouge/Rose
  askLight: '#3a1a1a',
  askMedium: '#602020',
  askBright: '#a04040',
  askLine: '#ff4466',

  // Trades
  buyBubble: '#00ff88',
  sellBubble: '#ff3355',

  // Texte
  textPrimary: '#e0e4ec',
  textSecondary: '#606878',

  // Traces
  traceAbsorbed: 'rgba(255, 180, 60, 0.4)',
  traceCancelled: 'rgba(100, 100, 120, 0.3)',
};

// ══════════════════════════════════════════════════════════════════════════════
// COLOR GRADIENTS (professional style)
// ══════════════════════════════════════════════════════════════════════════════

// Bookmap-authentic bid gradient: deep navy → blue → cyan → yellow → orange (walls)
const BID_GRADIENT = [
  { stop: 0,    r: 8,   g: 18,  b: 42  },   // Deep navy (background blend)
  { stop: 0.15, r: 12,  g: 40,  b: 90  },   // Dark blue
  { stop: 0.3,  r: 20,  g: 80,  b: 140 },   // Medium blue
  { stop: 0.45, r: 30,  g: 140, b: 200 },   // Cyan-blue
  { stop: 0.6,  r: 60,  g: 200, b: 230 },   // Bright cyan
  { stop: 0.75, r: 180, g: 220, b: 100 },   // Yellow-green (transition)
  { stop: 0.85, r: 240, g: 200, b: 40  },   // Yellow (large orders)
  { stop: 0.95, r: 255, g: 140, b: 20  },   // Orange (walls)
  { stop: 1,    r: 255, g: 80,  b: 20  },   // Red-orange (mega walls)
];

// Bookmap-authentic ask gradient: deep navy → blue → magenta → yellow → orange (walls)
const ASK_GRADIENT = [
  { stop: 0,    r: 8,   g: 18,  b: 42  },   // Deep navy (background blend)
  { stop: 0.15, r: 35,  g: 20,  b: 70  },   // Dark purple
  { stop: 0.3,  r: 80,  g: 30,  b: 100 },   // Medium purple-red
  { stop: 0.45, r: 140, g: 40,  b: 90  },   // Magenta
  { stop: 0.6,  r: 200, g: 60,  b: 80  },   // Bright red-magenta
  { stop: 0.75, r: 220, g: 150, b: 60  },   // Orange transition
  { stop: 0.85, r: 240, g: 200, b: 40  },   // Yellow (large orders)
  { stop: 0.95, r: 255, g: 140, b: 20  },   // Orange (walls)
  { stop: 1,    r: 255, g: 80,  b: 20  },   // Red-orange (mega walls)
];

// Absorbed gradient (golden/orange trace)
const ABSORBED_GRADIENT = [
  { stop: 0, r: 60, g: 40, b: 10 },
  { stop: 0.5, r: 180, g: 120, b: 40 },
  { stop: 1, r: 255, g: 200, b: 80 },
];

function interpolateGradient(
  gradient: { stop: number; r: number; g: number; b: number }[],
  t: number
): { r: number; g: number; b: number } {
  t = Math.max(0, Math.min(1, t));

  for (let i = 0; i < gradient.length - 1; i++) {
    if (t >= gradient[i].stop && t <= gradient[i + 1].stop) {
      const range = gradient[i + 1].stop - gradient[i].stop;
      const localT = range > 0 ? (t - gradient[i].stop) / range : 0;

      return {
        r: Math.round(gradient[i].r + (gradient[i + 1].r - gradient[i].r) * localT),
        g: Math.round(gradient[i].g + (gradient[i + 1].g - gradient[i].g) * localT),
        b: Math.round(gradient[i].b + (gradient[i + 1].b - gradient[i].b) * localT),
      };
    }
  }

  const last = gradient[gradient.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDERER
// ══════════════════════════════════════════════════════════════════════════════
export class HeatmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  // Layout - NEW: Added delta profile panel on left, volume profile on right
  private deltaProfileWidth = 80;  // Width of delta profile panel (left)
  private volumeProfileWidth = 60; // Width of volume profile panel (right)
  private heatmapStartX = 80;      // Where heatmap starts (after delta profile)
  private heatmapWidth = 0;
  private priceAxisWidth = 60;
  private cellHeight = 14;
  private statsBarHeight = 28;     // Height of stats bar at bottom

  // Tick size pour calculs
  private tickSize = 0.5;

  // Feature toggles
  private showDeltaProfile = true;
  private showVolumeProfile = true;
  private showStatsBar = true;
  private showImbalances = true;
  private showAbsorption = true;
  private showIcebergs = true;
  private showVWAP = true;
  private showFootprintNumbers = true;
  private footprintStyle: 'bid_ask' | 'delta' | 'volume' = 'bid_ask';
  private showTimeSales = true;
  private timeSalesWidth = 140;
  private showCumulativeDelta = true;
  private cumulativeDeltaHeight = 80;
  private showDOMLadder = true;
  private domLadderWidth = 180;
  private showTapeVelocity = true;
  private tapeVelocityHeight = 60;
  private showLargeTradeAlerts = true;
  private showPressureMeter = true;
  private pressureMeterHeight = 50;
  private showSessionStats = true;
  private showDrawings = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Cannot get canvas context');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    // Reset transform before applying new scale (prevents DPR accumulation)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);

    // Calculate layout with delta profile (left), volume profile (right), time & sales, and DOM ladder
    this.heatmapStartX = this.showDeltaProfile ? this.deltaProfileWidth : 0;
    const rightPanelWidth =
      (this.showVolumeProfile ? this.volumeProfileWidth : 0) +
      this.priceAxisWidth +
      (this.showTimeSales ? this.timeSalesWidth : 0) +
      (this.showDOMLadder ? this.domLadderWidth : 0);
    this.heatmapWidth = this.width - rightPanelWidth - this.heatmapStartX;
  }

  setTickSize(ts: number): void {
    this.tickSize = ts;
  }

  setShowDeltaProfile(show: boolean): void {
    this.showDeltaProfile = show;
    this.resize();
  }

  setShowVolumeProfile(show: boolean): void {
    this.showVolumeProfile = show;
    this.resize();
  }

  setShowStatsBar(show: boolean): void {
    this.showStatsBar = show;
  }

  setShowImbalances(show: boolean): void {
    this.showImbalances = show;
  }

  setShowAbsorption(show: boolean): void {
    this.showAbsorption = show;
  }

  setShowIcebergs(show: boolean): void {
    this.showIcebergs = show;
  }

  setShowVWAP(show: boolean): void {
    this.showVWAP = show;
  }

  setShowFootprintNumbers(show: boolean): void {
    this.showFootprintNumbers = show;
  }

  setFootprintStyle(style: 'bid_ask' | 'delta' | 'volume'): void {
    this.footprintStyle = style;
  }

  setShowTimeSales(show: boolean): void {
    this.showTimeSales = show;
    this.resize();
  }

  setShowCumulativeDelta(show: boolean): void {
    this.showCumulativeDelta = show;
  }

  setShowDOMLadder(show: boolean): void {
    this.showDOMLadder = show;
    this.resize();
  }

  setShowTapeVelocity(show: boolean): void {
    this.showTapeVelocity = show;
  }

  setShowLargeTradeAlerts(show: boolean): void {
    this.showLargeTradeAlerts = show;
  }

  setShowPressureMeter(show: boolean): void {
    this.showPressureMeter = show;
  }

  setShowSessionStats(show: boolean): void {
    this.showSessionStats = show;
  }

  setShowDrawings(show: boolean): void {
    this.showDrawings = show;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRAWING INTERACTION - Mouse handlers for creating/editing drawings
  // ══════════════════════════════════════════════════════════════════════════
  private activeDrawingTool: DrawingType | null = null;
  private drawingInProgress: Partial<Drawing> | null = null;
  private drawingStartPoint: { x: number; y: number; price: number; timestamp: number } | null = null;
  private selectedDrawingId: string | null = null;
  private hoveredDrawingId: string | null = null;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  setActiveDrawingTool(tool: DrawingType | null): void {
    this.activeDrawingTool = tool;
    this.drawingInProgress = null;
    this.drawingStartPoint = null;
  }

  getActiveDrawingTool(): DrawingType | null {
    return this.activeDrawingTool;
  }

  getSelectedDrawingId(): string | null {
    return this.selectedDrawingId;
  }

  // Convert mouse coordinates to price/time
  mouseToPrice(y: number, priceRange: { min: number; max: number }): number {
    const normalizedY = y / this.height;
    return priceRange.max - normalizedY * (priceRange.max - priceRange.min);
  }

  mouseToTimeIndex(x: number, historyLength: number): number {
    const normalizedX = (x - this.heatmapStartX) / this.heatmapWidth;
    return Math.floor(normalizedX * historyLength);
  }

  // Start drawing on mouse down
  startDrawing(
    x: number,
    y: number,
    priceRange: { min: number; max: number },
    state: MarketState
  ): Drawing | null {
    if (!this.activeDrawingTool) {
      // Check if clicking on existing drawing for selection
      const hitDrawing = this.hitTestDrawings(x, y, priceRange, state);
      if (hitDrawing) {
        this.selectedDrawingId = hitDrawing.id;
        this.isDragging = true;
        // Calculate drag offset
        if (hitDrawing.type === 'hline') {
          const lineY = this.priceToY(hitDrawing.price, priceRange);
          this.dragOffset = { x: 0, y: y - lineY };
        }
        return null;
      }
      this.selectedDrawingId = null;
      return null;
    }

    const price = this.mouseToPrice(y, priceRange);
    const timestamp = state.priceHistory.length > 0
      ? state.priceHistory[Math.min(this.mouseToTimeIndex(x, state.priceHistory.length), state.priceHistory.length - 1)]?.timestamp || Date.now()
      : Date.now();

    this.drawingStartPoint = { x, y, price, timestamp };

    const id = `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const baseDrawing: DrawingBase = {
      id,
      type: this.activeDrawingTool,
      color: this.activeDrawingTool === 'hline' ? '#ffaa00' :
             this.activeDrawingTool === 'rect' ? '#4488ff' :
             this.activeDrawingTool === 'trendline' ? '#00ff88' : '#ffffff',
      opacity: 1,
      locked: false,
      visible: true,
      createdAt: Date.now(),
    };

    switch (this.activeDrawingTool) {
      case 'hline':
        this.drawingInProgress = {
          ...baseDrawing,
          type: 'hline',
          price: this.roundToTick(price),
          lineWidth: 1,
          lineStyle: 'solid',
          showLabel: true,
          label: this.roundToTick(price).toFixed(2),
          extendLeft: true,
          extendRight: true,
        } as HorizontalLine;
        // Horizontal line is instant - return immediately
        const hline = this.drawingInProgress as HorizontalLine;
        this.drawingInProgress = null;
        this.drawingStartPoint = null;
        return hline;

      case 'rect':
        this.drawingInProgress = {
          ...baseDrawing,
          type: 'rect',
          priceTop: price,
          priceBottom: price,
          timeStart: timestamp,
          timeEnd: timestamp,
          fillColor: '#4488ff',
          fillOpacity: 0.15,
          borderWidth: 1,
        } as RectangleZone;
        break;

      case 'text':
        this.drawingInProgress = {
          ...baseDrawing,
          type: 'text',
          price,
          timestamp,
          text: 'Text',
          fontSize: 12,
          fontWeight: 'normal',
        } as TextAnnotation;
        // Text is instant - return immediately
        const text = this.drawingInProgress as TextAnnotation;
        this.drawingInProgress = null;
        this.drawingStartPoint = null;
        return text;

      case 'trendline':
        this.drawingInProgress = {
          ...baseDrawing,
          type: 'trendline',
          startPrice: price,
          startTime: timestamp,
          endPrice: price,
          endTime: timestamp,
          lineWidth: 1,
          lineStyle: 'solid',
          extendRight: false,
        } as TrendLine;
        break;
    }

    return null;
  }

  // Update drawing on mouse move
  updateDrawing(
    x: number,
    y: number,
    priceRange: { min: number; max: number },
    state: MarketState
  ): void {
    // Handle dragging selected drawing
    if (this.isDragging && this.selectedDrawingId && state.drawings) {
      const drawing = state.drawings.drawings.find(d => d.id === this.selectedDrawingId);
      if (drawing && drawing.type === 'hline') {
        const newPrice = this.mouseToPrice(y - this.dragOffset.y, priceRange);
        (drawing as HorizontalLine).price = this.roundToTick(newPrice);
        (drawing as HorizontalLine).label = this.roundToTick(newPrice).toFixed(2);
      }
      return;
    }

    if (!this.drawingInProgress || !this.drawingStartPoint) return;

    const price = this.mouseToPrice(y, priceRange);
    const timestamp = state.priceHistory.length > 0
      ? state.priceHistory[Math.min(this.mouseToTimeIndex(x, state.priceHistory.length), state.priceHistory.length - 1)]?.timestamp || Date.now()
      : Date.now();

    switch (this.drawingInProgress.type) {
      case 'rect':
        const rect = this.drawingInProgress as Partial<RectangleZone>;
        rect.priceTop = Math.max(price, this.drawingStartPoint.price);
        rect.priceBottom = Math.min(price, this.drawingStartPoint.price);
        rect.timeEnd = timestamp;
        break;

      case 'trendline':
        const trendline = this.drawingInProgress as Partial<TrendLine>;
        trendline.endPrice = price;
        trendline.endTime = timestamp;
        break;
    }
  }

  // Finish drawing on mouse up
  finishDrawing(): Drawing | null {
    this.isDragging = false;

    if (!this.drawingInProgress) return null;

    const completed = this.drawingInProgress as Drawing;
    this.drawingInProgress = null;
    this.drawingStartPoint = null;

    return completed;
  }

  // Cancel current drawing
  cancelDrawing(): void {
    this.drawingInProgress = null;
    this.drawingStartPoint = null;
    this.isDragging = false;
  }

  // Hit test for selecting drawings
  hitTestDrawings(
    x: number,
    y: number,
    priceRange: { min: number; max: number },
    state: MarketState
  ): Drawing | null {
    if (!state.drawings) return null;

    const tolerance = 8; // pixels

    for (const drawing of state.drawings.drawings) {
      if (!drawing.visible) continue;

      switch (drawing.type) {
        case 'hline':
          const lineY = this.priceToY(drawing.price, priceRange);
          if (Math.abs(y - lineY) < tolerance && x >= this.heatmapStartX && x <= this.heatmapStartX + this.heatmapWidth) {
            return drawing;
          }
          break;

        case 'rect':
          const yTop = this.priceToY(drawing.priceTop, priceRange);
          const yBottom = this.priceToY(drawing.priceBottom, priceRange);
          if (y >= yTop && y <= yBottom && x >= this.heatmapStartX && x <= this.heatmapStartX + this.heatmapWidth) {
            return drawing;
          }
          break;

        case 'text':
          const textY = this.priceToY(drawing.price, priceRange);
          // Simplified hit test for text
          if (Math.abs(y - textY) < 15 && x >= this.heatmapStartX) {
            return drawing;
          }
          break;

        case 'trendline':
          // Point to line distance check
          const y1 = this.priceToY(drawing.startPrice, priceRange);
          const y2 = this.priceToY(drawing.endPrice, priceRange);
          let x1 = this.heatmapStartX;
          let x2 = this.heatmapStartX + this.heatmapWidth;

          if (state.priceHistory.length > 1) {
            const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
            if (timeRange > 0) {
              x1 = this.heatmapStartX + ((drawing.startTime - state.priceHistory[0].timestamp) / timeRange) * this.heatmapWidth;
              x2 = this.heatmapStartX + ((drawing.endTime - state.priceHistory[0].timestamp) / timeRange) * this.heatmapWidth;
            }
          }

          const dist = this.pointToLineDistance(x, y, x1, y1, x2, y2);
          if (dist < tolerance) {
            return drawing;
          }
          break;
      }
    }

    return null;
  }

  // Helper: point to line segment distance
  private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx: number, yy: number;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Delete selected drawing
  deleteSelectedDrawing(state: MarketState): boolean {
    if (!this.selectedDrawingId || !state.drawings) return false;

    const index = state.drawings.drawings.findIndex(d => d.id === this.selectedDrawingId);
    if (index !== -1) {
      state.drawings.drawings.splice(index, 1);
      this.selectedDrawingId = null;
      return true;
    }
    return false;
  }

  // Get drawing in progress for preview rendering
  getDrawingInProgress(): Partial<Drawing> | null {
    return this.drawingInProgress;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════
  render(
    state: MarketState,
    priceRange: { min: number; max: number },
    crosshair?: { x: number; y: number; price: number } | null,
    tradeFlowSettings: TradeFlowSettings = DEFAULT_TRADE_FLOW_SETTINGS
  ): void {
    const { ctx } = this;

    // 1. Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    // 1b. Drawing Tools (rendered as background)
    if (this.showDrawings && state.drawings) {
      this.renderDrawings(state, priceRange);
    }

    // 1c. Drawing preview (in progress)
    if (this.drawingInProgress) {
      this.renderDrawingPreview(state, priceRange);
    }

    // 2. Delta Profile & Volume Profile (LEFT PANEL)
    if (this.showDeltaProfile) {
      this.renderDeltaProfile(state, priceRange);
    }

    // 3. Passive Orders - LIFECYCLE BASED (lignes horizontales continues)
    this.renderHeatmap(state, priceRange);

    // 3a. Traces (afterimages of absorbed/cancelled orders)
    if (state.traces.length > 0) {
      this.renderTraces(state, priceRange);
    }

    // 3b. Footprint Numbers (professional style bid/ask volumes)
    if (this.showFootprintNumbers) {
      this.renderFootprintNumbers(state, priceRange);
    }

    // 4. Staircase lines (best bid/ask)
    this.renderStaircaseLines(state, priceRange);

    // 5. Trade bubbles / Trade Flow
    if (tradeFlowSettings.enabled) {
      if (tradeFlowSettings.cumulativeMode) {
        this.renderCumulativeTradeFlow(state, priceRange, tradeFlowSettings);
      } else {
        this.renderTradeBubbles(state, priceRange, tradeFlowSettings);
      }
    }

    // 5b. Large Trade Alerts
    if (this.showLargeTradeAlerts && state.largeTradeAlerts) {
      this.renderLargeTradeAlerts(state, priceRange);
    }

    // 6. VWAP line
    if (this.showVWAP && state.vwap) {
      this.renderVWAP(state, priceRange);
    }

    // 7. Imbalance indicators
    if (this.showImbalances && state.imbalances) {
      this.renderImbalances(state, priceRange);
    }

    // 8. Absorption events
    if (this.showAbsorption && state.absorptionEvents) {
      this.renderAbsorptionEvents(state, priceRange);
    }

    // 9. Iceberg indicators
    if (this.showIcebergs && state.icebergs) {
      this.renderIcebergs(state, priceRange);
    }

    // 10. Current price highlight
    this.renderCurrentPrice(state, priceRange);

    // 11. Volume Profile (right panel)
    if (this.showVolumeProfile) {
      this.renderVolumeProfile(state, priceRange);
    }

    // 12. Price axis
    this.renderPriceAxis(priceRange, state.currentBid, state.currentAsk, crosshair?.price);

    // 13. Time & Sales Tape
    if (this.showTimeSales) {
      this.renderTimeSales(state);
    }

    // 14. DOM Ladder (far right)
    if (this.showDOMLadder) {
      this.renderDOMLadder(state, priceRange);
    }

    // 15. Crosshair (si actif)
    if (crosshair) {
      this.renderCrosshair(crosshair, priceRange, state);
    }

    // 16. Stats bar at bottom
    if (this.showStatsBar) {
      this.renderStatsBar(state);
    }

    // 16. Cumulative Delta Chart (mini chart at bottom)
    if (this.showCumulativeDelta && state.cumulativeDelta) {
      this.renderCumulativeDeltaChart(state, priceRange);
    }

    // 17. Tape Velocity (Speed of Tape indicator)
    if (this.showTapeVelocity && state.tapeVelocity) {
      this.renderTapeVelocity(state);
    }

    // 18. Pressure Meter (Bid/Ask pressure gauge)
    if (this.showPressureMeter && state.pressureMeter) {
      this.renderPressureMeter(state);
    }

    // 19. Session Stats Panel (top-left overlay)
    if (this.showSessionStats && state.sessionStats) {
      this.renderSessionStats(state);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELTA PROFILE - Cumulative Buy/Sell volume at each price level (professional style)
  // ══════════════════════════════════════════════════════════════════════════
  private renderDeltaProfile(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, deltaProfileWidth, height, tickSize } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / tickSize);
    const rowHeight = Math.max(2, height / numLevels);

    // Background for delta profile panel
    ctx.fillStyle = '#080a0e';
    ctx.fillRect(0, 0, deltaProfileWidth, height);

    // Separator line
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(deltaProfileWidth - 0.5, 0);
    ctx.lineTo(deltaProfileWidth - 0.5, height);
    ctx.stroke();

    // Get cumulative levels
    const cumulativeLevels = state.cumulativeLevels;
    if (cumulativeLevels.size === 0) return;

    // Find max volume for normalization
    let maxVolume = 1;
    for (const level of cumulativeLevels.values()) {
      maxVolume = Math.max(maxVolume, level.totalBuySize, level.totalSellSize);
    }

    const halfWidth = (deltaProfileWidth - 8) / 2;
    const centerX = deltaProfileWidth / 2;

    // Render each price level
    for (const level of cumulativeLevels.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const y = this.priceToY(level.price, priceRange);
      const barHeight = Math.max(2, rowHeight * 0.8);

      // Buy bar (green) - extends LEFT from center
      if (level.totalBuySize > 0) {
        const buyWidth = (level.totalBuySize / maxVolume) * halfWidth;
        const buyX = centerX - buyWidth;

        // Gradient based on intensity
        const intensity = level.totalBuySize / maxVolume;
        const r = Math.round(0 + intensity * 50);
        const g = Math.round(100 + intensity * 155);
        const b = Math.round(50 + intensity * 88);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        ctx.fillRect(buyX, y - barHeight / 2, buyWidth, barHeight);

        // Volume label for significant levels
        if (level.totalBuySize > maxVolume * 0.3) {
          ctx.fillStyle = '#00ff88';
          ctx.font = 'bold 8px Consolas, monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.formatVolume(level.totalBuySize), buyX - 2, y);
        }
      }

      // Sell bar (red) - extends RIGHT from center
      if (level.totalSellSize > 0) {
        const sellWidth = (level.totalSellSize / maxVolume) * halfWidth;
        const sellX = centerX;

        // Gradient based on intensity
        const intensity = level.totalSellSize / maxVolume;
        const r = Math.round(150 + intensity * 105);
        const g = Math.round(30 + intensity * 30);
        const b = Math.round(50 + intensity * 35);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        ctx.fillRect(sellX, y - barHeight / 2, sellWidth, barHeight);

        // Volume label for significant levels
        if (level.totalSellSize > maxVolume * 0.3) {
          ctx.fillStyle = '#ff4466';
          ctx.font = 'bold 8px Consolas, monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.formatVolume(level.totalSellSize), sellX + sellWidth + 2, y);
        }
      }

      // Delta indicator (small triangle showing imbalance)
      const delta = level.totalBuySize - level.totalSellSize;
      if (Math.abs(delta) > maxVolume * 0.1) {
        const isBullish = delta > 0;
        ctx.fillStyle = isBullish ? '#00ff88' : '#ff4466';
        ctx.beginPath();
        if (isBullish) {
          // Up triangle
          ctx.moveTo(centerX - 3, y + 2);
          ctx.lineTo(centerX + 3, y + 2);
          ctx.lineTo(centerX, y - 3);
        } else {
          // Down triangle
          ctx.moveTo(centerX - 3, y - 2);
          ctx.lineTo(centerX + 3, y - 2);
          ctx.lineTo(centerX, y + 3);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Center line
    ctx.strokeStyle = '#2a2e38';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels at top
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BUY', centerX - halfWidth / 2, 12);

    ctx.fillStyle = '#ff4466';
    ctx.fillText('SELL', centerX + halfWidth / 2, 12);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATS BAR - Bottom bar with bid/ask volumes and delta
  // ══════════════════════════════════════════════════════════════════════════
  private renderStatsBar(state: MarketState): void {
    const { ctx, width, height } = this;
    const barHeight = 28;
    const barY = height - barHeight;

    // Background
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, barY, width, barHeight);

    // Top border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(width, barY);
    ctx.stroke();

    // Calculate totals from cumulative levels
    let totalBuy = 0;
    let totalSell = 0;
    for (const level of state.cumulativeLevels.values()) {
      totalBuy += level.totalBuySize;
      totalSell += level.totalSellSize;
    }
    const totalVolume = totalBuy + totalSell;
    const delta = totalBuy - totalSell;
    const buyRatio = totalVolume > 0 ? totalBuy / totalVolume : 0.5;

    // Ratio bar
    const ratioBarWidth = 150;
    const ratioBarX = 20;
    const ratioBarY = barY + 9;
    const ratioBarHeight = 10;

    // Buy portion (green)
    ctx.fillStyle = '#00aa66';
    ctx.fillRect(ratioBarX, ratioBarY, ratioBarWidth * buyRatio, ratioBarHeight);

    // Sell portion (red)
    ctx.fillStyle = '#aa3344';
    ctx.fillRect(ratioBarX + ratioBarWidth * buyRatio, ratioBarY, ratioBarWidth * (1 - buyRatio), ratioBarHeight);

    // Border
    ctx.strokeStyle = '#2a2e38';
    ctx.strokeRect(ratioBarX, ratioBarY, ratioBarWidth, ratioBarHeight);

    // Labels
    ctx.font = '10px Consolas, monospace';
    ctx.textBaseline = 'middle';
    const textY = barY + 14;

    // Buy volume
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'left';
    ctx.fillText(`BUY: ${this.formatVolume(totalBuy)}`, ratioBarX + ratioBarWidth + 15, textY);

    // Sell volume
    ctx.fillStyle = '#ff4466';
    ctx.fillText(`SELL: ${this.formatVolume(totalSell)}`, ratioBarX + ratioBarWidth + 100, textY);

    // Delta
    ctx.fillStyle = delta >= 0 ? '#00ff88' : '#ff4466';
    ctx.fillText(`Δ: ${delta >= 0 ? '+' : ''}${this.formatVolume(delta)}`, ratioBarX + ratioBarWidth + 195, textY);

    // Current price
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillText(`${state.midPrice.toFixed(2)}`, width - this.priceAxisWidth - 10, textY);
  }

  private formatVolume(vol: number): string {
    const abs = Math.abs(vol);
    if (abs >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 100) return Math.round(vol).toString();
    return vol.toFixed(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUMULATIVE DELTA CHART - Mini chart at bottom showing cumulative delta over time
  // ══════════════════════════════════════════════════════════════════════════
  private renderCumulativeDeltaChart(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, width, heatmapStartX, heatmapWidth, cumulativeDeltaHeight } = this;
    const cd = state.cumulativeDelta;

    if (!cd || cd.points.length < 2) return;

    // Position: above stats bar if shown, otherwise at bottom
    const barHeight = this.showStatsBar ? this.statsBarHeight : 0;
    const chartY = this.height - barHeight - cumulativeDeltaHeight;
    const chartWidth = heatmapWidth;
    const chartX = heatmapStartX;

    // Background
    ctx.fillStyle = 'rgba(8, 10, 14, 0.95)';
    ctx.fillRect(chartX, chartY, chartWidth, cumulativeDeltaHeight);

    // Top border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX + chartWidth, chartY);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#606878';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('CUMULATIVE DELTA', chartX + 5, chartY + 3);

    // Current delta value
    const currentDelta = cd.currentDelta;
    ctx.fillStyle = currentDelta >= 0 ? '#00ff88' : '#ff4466';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `${currentDelta >= 0 ? '+' : ''}${this.formatVolume(currentDelta)}`,
      chartX + chartWidth - 5,
      chartY + 3
    );

    // Chart area (with padding)
    const padding = { top: 18, bottom: 5, left: 5, right: 5 };
    const plotX = chartX + padding.left;
    const plotY = chartY + padding.top;
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = cumulativeDeltaHeight - padding.top - padding.bottom;

    // Find min/max delta for scaling
    const maxAbsDelta = cd.maxAbsDelta;
    const deltaRange = maxAbsDelta * 2;

    // Zero line
    const zeroY = plotY + plotHeight / 2;
    ctx.strokeStyle = '#2a2e38';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);
    ctx.lineTo(plotX + plotWidth, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw filled area and line
    const points = cd.points;
    const timeRange = points[points.length - 1].timestamp - points[0].timestamp;

    if (timeRange <= 0) return;

    // Build path
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = plotX + ((point.timestamp - points[0].timestamp) / timeRange) * plotWidth;
      const normalizedDelta = point.delta / maxAbsDelta; // -1 to 1
      const y = zeroY - normalizedDelta * (plotHeight / 2);

      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    // Close path to zero line for fill
    const lastX = plotX + plotWidth;
    ctx.lineTo(lastX, zeroY);
    ctx.closePath();

    // Fill with gradient based on last delta value
    const isPositive = currentDelta >= 0;
    const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotHeight);
    if (isPositive) {
      grad.addColorStop(0, 'rgba(0, 255, 136, 0.4)');
      grad.addColorStop(0.5, 'rgba(0, 255, 136, 0.1)');
      grad.addColorStop(1, 'rgba(255, 68, 102, 0.1)');
    } else {
      grad.addColorStop(0, 'rgba(0, 255, 136, 0.1)');
      grad.addColorStop(0.5, 'rgba(255, 68, 102, 0.1)');
      grad.addColorStop(1, 'rgba(255, 68, 102, 0.4)');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw line on top
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = plotX + ((point.timestamp - points[0].timestamp) / timeRange) * plotWidth;
      const normalizedDelta = point.delta / maxAbsDelta;
      const y = zeroY - normalizedDelta * (plotHeight / 2);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = currentDelta >= 0 ? '#00ff88' : '#ff4466';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Session high/low markers
    ctx.font = '8px Consolas, monospace';
    ctx.textBaseline = 'middle';

    // High
    const highY = zeroY - (cd.sessionHigh / maxAbsDelta) * (plotHeight / 2);
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'left';
    ctx.fillText(`H: ${this.formatVolume(cd.sessionHigh)}`, plotX + 2, Math.max(plotY + 6, highY));

    // Low
    const lowY = zeroY - (cd.sessionLow / maxAbsDelta) * (plotHeight / 2);
    ctx.fillStyle = '#ff4466';
    ctx.textAlign = 'left';
    ctx.fillText(`L: ${this.formatVolume(cd.sessionLow)}`, plotX + 2, Math.min(plotY + plotHeight - 6, lowY));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAPE VELOCITY - Speed of tape indicator showing trades per second
  // ══════════════════════════════════════════════════════════════════════════
  private renderTapeVelocity(state: MarketState): void {
    const { ctx, heatmapStartX, heatmapWidth, tapeVelocityHeight } = this;
    const tv = state.tapeVelocity;

    if (!tv || tv.points.length < 2) return;

    // Position: above cumulative delta (if shown) or stats bar
    const cdHeight = this.showCumulativeDelta ? this.cumulativeDeltaHeight : 0;
    const barHeight = this.showStatsBar ? this.statsBarHeight : 0;
    const chartY = this.height - barHeight - cdHeight - tapeVelocityHeight;
    const chartWidth = heatmapWidth;
    const chartX = heatmapStartX;

    // Background
    ctx.fillStyle = 'rgba(8, 10, 14, 0.95)';
    ctx.fillRect(chartX, chartY, chartWidth, tapeVelocityHeight);

    // Top border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX + chartWidth, chartY);
    ctx.stroke();

    // Acceleration indicator (colored bar at top)
    const accelBarHeight = 4;
    let accelColor = '#333'; // normal
    if (tv.accelerationLevel === 'elevated') accelColor = '#886600';
    else if (tv.accelerationLevel === 'high') accelColor = '#cc6600';
    else if (tv.accelerationLevel === 'extreme') accelColor = '#ff3300';

    ctx.fillStyle = accelColor;
    ctx.fillRect(chartX, chartY, chartWidth, accelBarHeight);

    // Label
    ctx.fillStyle = '#606878';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TAPE VELOCITY', chartX + 5, chartY + 6);

    // Current TPS with color based on acceleration
    let tpsColor = '#888';
    if (tv.accelerationLevel === 'elevated') tpsColor = '#ffaa00';
    else if (tv.accelerationLevel === 'high') tpsColor = '#ff8800';
    else if (tv.accelerationLevel === 'extreme') tpsColor = '#ff4400';

    ctx.fillStyle = tpsColor;
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${tv.currentTPS} t/s`, chartX + chartWidth - 5, chartY + 5);

    // Avg TPS
    ctx.fillStyle = '#555';
    ctx.font = '9px Consolas, monospace';
    ctx.fillText(`avg: ${tv.avgTPS.toFixed(1)}`, chartX + chartWidth - 60, chartY + 5);

    // Chart area
    const padding = { top: 18, bottom: 4, left: 5, right: 5 };
    const plotX = chartX + padding.left;
    const plotY = chartY + padding.top;
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = tapeVelocityHeight - padding.top - padding.bottom;

    // Find max TPS for scaling
    const maxTPS = Math.max(1, tv.maxTPS, ...tv.points.map(p => p.tradesPerSecond));

    // Average line
    const avgY = plotY + plotHeight - (tv.avgTPS / maxTPS) * plotHeight;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(plotX, avgY);
    ctx.lineTo(plotX + plotWidth, avgY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bars
    const points = tv.points;
    const timeRange = points[points.length - 1].timestamp - points[0].timestamp;
    if (timeRange <= 0) return;

    const barWidth = Math.max(2, plotWidth / points.length - 1);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = plotX + ((point.timestamp - points[0].timestamp) / timeRange) * plotWidth;
      const barHeight = (point.tradesPerSecond / maxTPS) * plotHeight;
      const y = plotY + plotHeight - barHeight;

      // Color based on intensity vs average
      const ratio = tv.avgTPS > 0 ? point.tradesPerSecond / tv.avgTPS : 1;
      let barColor: string;
      if (ratio <= 1.0) {
        barColor = 'rgba(80, 80, 100, 0.6)';
      } else if (ratio <= 1.5) {
        barColor = 'rgba(180, 150, 50, 0.7)';
      } else if (ratio <= 2.5) {
        barColor = 'rgba(220, 130, 30, 0.8)';
      } else {
        barColor = 'rgba(255, 80, 30, 0.9)';
      }

      ctx.fillStyle = barColor;
      ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);

      // Buy/sell split indicator at bottom of bar
      if (point.buyVolume + point.sellVolume > 0) {
        const buyRatio = point.buyVolume / (point.buyVolume + point.sellVolume);
        const splitHeight = Math.min(3, barHeight);
        ctx.fillStyle = '#0a8';
        ctx.fillRect(x - barWidth / 2, plotY + plotHeight - splitHeight, barWidth * buyRatio, splitHeight);
        ctx.fillStyle = '#a34';
        ctx.fillRect(x - barWidth / 2 + barWidth * buyRatio, plotY + plotHeight - splitHeight, barWidth * (1 - buyRatio), splitHeight);
      }
    }

    // Max TPS marker
    ctx.fillStyle = '#666';
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`max: ${tv.maxTPS}`, plotX + 2, plotY + 2);

    // Alert indicator for extreme acceleration
    if (tv.accelerationLevel === 'extreme') {
      ctx.fillStyle = '#ff4400';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      const pulseAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.5;
      ctx.fillStyle = `rgba(255, 68, 0, ${pulseAlpha})`;
      ctx.fillText('⚡ FAST TAPE ⚡', chartX + chartWidth / 2, chartY + 5);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LARGE TRADE ALERTS - Visual markers for significant trades
  // ══════════════════════════════════════════════════════════════════════════
  private renderLargeTradeAlerts(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, height } = this;
    const lta = state.largeTradeAlerts;

    if (!lta || lta.trades.length === 0) return;

    const history = state.priceHistory;
    const visiblePoints = Math.min(history.length, 200);
    const historyStartIdx = history.length - visiblePoints;
    const pointWidth = heatmapWidth / visiblePoints;

    for (const lt of lta.trades) {
      // Check if in price range
      if (lt.price < priceRange.min || lt.price > priceRange.max) continue;

      const y = this.priceToY(lt.price, priceRange);
      const x = heatmapStartX + Math.max(0, (lt.historyIndex - historyStartIdx) * pointWidth);

      // Skip if outside visible area
      if (x < heatmapStartX || x > heatmapStartX + heatmapWidth) continue;

      const isBuy = lt.side === 'buy';

      // Size based on level
      let baseSize = 8;
      let glowSize = 15;
      let labelSize = '9px';

      if (lt.level === 'huge') {
        baseSize = 12;
        glowSize = 22;
        labelSize = '10px';
      } else if (lt.level === 'massive') {
        baseSize = 16;
        glowSize = 30;
        labelSize = '11px';
      }

      // Pulse effect for first 3 seconds
      let pulseScale = 1;
      if (lt.pulsePhase > 0) {
        pulseScale = 1 + Math.sin(lt.pulsePhase * Math.PI * 2) * 0.3;
      }

      const size = baseSize * pulseScale;
      const glow = glowSize * pulseScale;

      // Glow effect
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, glow);
      if (isBuy) {
        gradient.addColorStop(0, `rgba(0, 255, 136, ${lt.opacity * 0.6})`);
        gradient.addColorStop(0.5, `rgba(0, 255, 136, ${lt.opacity * 0.2})`);
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
      } else {
        gradient.addColorStop(0, `rgba(255, 68, 102, ${lt.opacity * 0.6})`);
        gradient.addColorStop(0.5, `rgba(255, 68, 102, ${lt.opacity * 0.2})`);
        gradient.addColorStop(1, 'rgba(255, 68, 102, 0)');
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();

      // Main marker (diamond shape for large trades)
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);

      // Outer border
      ctx.fillStyle = isBuy ? `rgba(0, 255, 136, ${lt.opacity})` : `rgba(255, 68, 102, ${lt.opacity})`;
      ctx.fillRect(-size / 2 - 1, -size / 2 - 1, size + 2, size + 2);

      // Inner fill
      ctx.fillStyle = isBuy ? `rgba(0, 180, 100, ${lt.opacity})` : `rgba(180, 50, 70, ${lt.opacity})`;
      ctx.fillRect(-size / 2 + 1, -size / 2 + 1, size - 2, size - 2);

      ctx.restore();

      // Size label
      ctx.fillStyle = isBuy ? `rgba(0, 255, 136, ${lt.opacity})` : `rgba(255, 68, 102, ${lt.opacity})`;
      ctx.font = `bold ${labelSize} Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const sizeText = this.formatLargeTradeSize(lt.size);
      const labelX = x + size / 2 + 5;

      // Label background
      const textWidth = ctx.measureText(sizeText).width;
      ctx.fillStyle = `rgba(0, 0, 0, ${lt.opacity * 0.7})`;
      ctx.fillRect(labelX - 2, y - 7, textWidth + 4, 14);

      // Label text
      ctx.fillStyle = isBuy ? `rgba(0, 255, 136, ${lt.opacity})` : `rgba(255, 68, 102, ${lt.opacity})`;
      ctx.fillText(sizeText, labelX, y);

      // Level indicator for huge/massive
      if (lt.level === 'huge' || lt.level === 'massive') {
        ctx.font = 'bold 8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = lt.level === 'massive' ? '#ffaa00' : '#ff8800';
        ctx.fillText(lt.level === 'massive' ? '⚠ MASSIVE' : '! HUGE', x, y - size - 5);
      }
    }
  }

  private formatLargeTradeSize(size: number): string {
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    if (size >= 100) return size.toFixed(0);
    return size.toFixed(2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRESSURE METER - Bid/Ask pressure gauge indicator
  // ══════════════════════════════════════════════════════════════════════════
  private renderPressureMeter(state: MarketState): void {
    const { ctx, heatmapStartX, heatmapWidth, pressureMeterHeight } = this;
    const pm = state.pressureMeter;

    if (!pm) return;

    // Position: above tape velocity (if shown) or cumulative delta
    const tvHeight = this.showTapeVelocity ? this.tapeVelocityHeight : 0;
    const cdHeight = this.showCumulativeDelta ? this.cumulativeDeltaHeight : 0;
    const barHeight = this.showStatsBar ? this.statsBarHeight : 0;
    const chartY = this.height - barHeight - cdHeight - tvHeight - pressureMeterHeight;
    const chartWidth = heatmapWidth;
    const chartX = heatmapStartX;

    // Background
    ctx.fillStyle = 'rgba(8, 10, 14, 0.95)';
    ctx.fillRect(chartX, chartY, chartWidth, pressureMeterHeight);

    // Top border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY);
    ctx.lineTo(chartX + chartWidth, chartY);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#606878';
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('PRESSURE', chartX + 5, chartY + 3);

    // Momentum indicator
    let momentumColor = '#888';
    let momentumText = 'NEUTRAL';
    if (pm.momentum === 'strong_buy') {
      momentumColor = '#00ff88';
      momentumText = '▲▲ STRONG BUY';
    } else if (pm.momentum === 'buy') {
      momentumColor = '#00cc66';
      momentumText = '▲ BUY';
    } else if (pm.momentum === 'strong_sell') {
      momentumColor = '#ff4466';
      momentumText = '▼▼ STRONG SELL';
    } else if (pm.momentum === 'sell') {
      momentumColor = '#cc3355';
      momentumText = '▼ SELL';
    }

    ctx.fillStyle = momentumColor;
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(momentumText, chartX + chartWidth - 5, chartY + 3);

    // Main gauge area
    const gaugeY = chartY + 18;
    const gaugeHeight = 20;
    const gaugeWidth = chartWidth - 20;
    const gaugeX = chartX + 10;

    // Gauge background
    ctx.fillStyle = '#111418';
    ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    // Calculate fill position (ratio from -1 to 1, center is neutral)
    const ratio = pm.smoothedRatio;
    const centerX = gaugeX + gaugeWidth / 2;

    // Draw pressure bars from center
    if (ratio > 0) {
      // Buy pressure - green from center to right
      const fillWidth = ratio * (gaugeWidth / 2);
      const gradient = ctx.createLinearGradient(centerX, 0, centerX + fillWidth, 0);
      gradient.addColorStop(0, 'rgba(0, 180, 100, 0.8)');
      gradient.addColorStop(1, 'rgba(0, 255, 136, 1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX, gaugeY + 2, fillWidth, gaugeHeight - 4);
    } else if (ratio < 0) {
      // Sell pressure - red from center to left
      const fillWidth = -ratio * (gaugeWidth / 2);
      const gradient = ctx.createLinearGradient(centerX - fillWidth, 0, centerX, 0);
      gradient.addColorStop(0, 'rgba(255, 68, 102, 1)');
      gradient.addColorStop(1, 'rgba(180, 50, 70, 0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - fillWidth, gaugeY + 2, fillWidth, gaugeHeight - 4);
    }

    // Center line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, gaugeY);
    ctx.lineTo(centerX, gaugeY + gaugeHeight);
    ctx.stroke();

    // Gauge border
    ctx.strokeStyle = '#2a2e38';
    ctx.lineWidth = 1;
    ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    // Scale markers
    ctx.fillStyle = '#444';
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const scaleY = gaugeY + gaugeHeight + 2;
    ctx.fillText('SELL', gaugeX + gaugeWidth * 0.15, scaleY);
    ctx.fillText('|', centerX, scaleY);
    ctx.fillText('BUY', gaugeX + gaugeWidth * 0.85, scaleY);

    // Volume info at bottom
    const infoY = chartY + pressureMeterHeight - 10;
    ctx.font = '8px Consolas, monospace';
    ctx.textBaseline = 'bottom';

    ctx.fillStyle = '#00cc66';
    ctx.textAlign = 'left';
    ctx.fillText(`B: ${this.formatVolume(pm.shortTermBuyVol)}`, chartX + 5, infoY);

    ctx.fillStyle = '#cc3355';
    ctx.textAlign = 'right';
    ctx.fillText(`S: ${this.formatVolume(pm.shortTermSellVol)}`, chartX + chartWidth - 5, infoY);

    // Ratio percentage
    ctx.fillStyle = ratio > 0 ? '#00ff88' : ratio < 0 ? '#ff4466' : '#888';
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px Consolas, monospace';
    const pct = Math.abs(ratio * 100).toFixed(0);
    ctx.fillText(`${ratio > 0 ? '+' : ratio < 0 ? '-' : ''}${pct}%`, centerX, infoY);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION STATS - Overlay panel with key session statistics
  // ══════════════════════════════════════════════════════════════════════════
  private renderSessionStats(state: MarketState): void {
    const { ctx, heatmapStartX } = this;
    const ss = state.sessionStats;

    if (!ss) return;

    // Panel position and size (top-left corner of heatmap area)
    const panelX = heatmapStartX + 10;
    const panelY = 10;
    const panelWidth = 160;
    const panelHeight = 145;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(8, 10, 14, 0.9)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

    // Border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // Header
    ctx.fillStyle = '#888';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SESSION STATS', panelX + 8, panelY + 6);

    // Separator
    ctx.strokeStyle = '#1a1e28';
    ctx.beginPath();
    ctx.moveTo(panelX + 5, panelY + 22);
    ctx.lineTo(panelX + panelWidth - 5, panelY + 22);
    ctx.stroke();

    // Stats rows
    ctx.font = '9px Consolas, monospace';
    const rowHeight = 14;
    let y = panelY + 28;

    // Helper function for rows
    const drawRow = (label: string, value: string, valueColor: string = '#fff') => {
      ctx.fillStyle = '#666';
      ctx.textAlign = 'left';
      ctx.fillText(label, panelX + 8, y);
      ctx.fillStyle = valueColor;
      ctx.textAlign = 'right';
      ctx.fillText(value, panelX + panelWidth - 8, y);
      y += rowHeight;
    };

    // Price levels
    drawRow('High', ss.sessionHigh.toFixed(2), '#00ff88');
    drawRow('Low', ss.sessionLow.toFixed(2), '#ff4466');
    drawRow('POC', ss.poc.toFixed(2), '#ffaa00');
    drawRow('VAH', ss.vah.toFixed(2), '#888');
    drawRow('VAL', ss.val.toFixed(2), '#888');

    // Separator
    ctx.strokeStyle = '#1a1e28';
    ctx.beginPath();
    ctx.moveTo(panelX + 5, y);
    ctx.lineTo(panelX + panelWidth - 5, y);
    ctx.stroke();
    y += 4;

    // Volume stats
    drawRow('Volume', this.formatVolume(ss.totalVolume), '#fff');
    const deltaColor = ss.delta >= 0 ? '#00ff88' : '#ff4466';
    const deltaSign = ss.delta >= 0 ? '+' : '';
    drawRow('Delta', `${deltaSign}${this.formatVolume(ss.delta)} (${ss.deltaPercent.toFixed(1)}%)`, deltaColor);

    // Trade stats
    drawRow('Trades', ss.totalTrades.toString(), '#888');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DRAWING TOOLS - Horizontal lines, rectangles, text annotations, trendlines
  // ══════════════════════════════════════════════════════════════════════════
  private renderDrawings(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapStartX, heatmapWidth, height, width } = this;
    const drawings = state.drawings?.drawings || [];

    for (const drawing of drawings) {
      if (!drawing.visible) continue;

      switch (drawing.type) {
        case 'hline':
          this.renderHorizontalLine(drawing as HorizontalLine, priceRange);
          break;
        case 'rect':
          this.renderRectangleZone(drawing as RectangleZone, priceRange, state);
          break;
        case 'text':
          this.renderTextAnnotation(drawing as TextAnnotation, priceRange, state);
          break;
        case 'trendline':
          this.renderTrendLine(drawing as TrendLine, priceRange, state);
          break;
      }
    }
  }

  // Render horizontal line (Support/Resistance levels)
  private renderHorizontalLine(line: HorizontalLine, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapStartX, heatmapWidth, width } = this;

    // Check if price is in visible range
    if (line.price < priceRange.min || line.price > priceRange.max) return;

    const y = this.priceToY(line.price, priceRange);
    const startX = line.extendLeft ? 0 : heatmapStartX;
    const endX = line.extendRight ? width : heatmapStartX + heatmapWidth;

    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.globalAlpha = line.opacity;
    ctx.lineWidth = line.lineWidth;

    // Set line style
    if (line.lineStyle === 'dashed') {
      ctx.setLineDash([8, 4]);
    } else if (line.lineStyle === 'dotted') {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    // Draw line
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    // Draw label if enabled
    if (line.showLabel && line.label) {
      ctx.globalAlpha = 1;
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillStyle = line.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';

      // Background for label
      const labelWidth = ctx.measureText(line.label).width + 8;
      ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
      ctx.fillRect(heatmapStartX + 5, y - 16, labelWidth, 14);

      // Label text
      ctx.fillStyle = line.color;
      ctx.fillText(line.label, heatmapStartX + 9, y - 4);
    }

    ctx.restore();
  }

  // Render rectangle zone (supply/demand zones, order blocks)
  private renderRectangleZone(rect: RectangleZone, priceRange: { min: number; max: number }, state: MarketState): void {
    const { ctx, heatmapStartX, heatmapWidth, width, height } = this;

    // Check if zone overlaps visible range
    if (rect.priceTop < priceRange.min || rect.priceBottom > priceRange.max) return;

    const yTop = this.priceToY(rect.priceTop, priceRange);
    const yBottom = this.priceToY(rect.priceBottom, priceRange);
    const rectHeight = yBottom - yTop;

    // Calculate X coordinates based on time or extend flags
    let startX = heatmapStartX;
    let endX = heatmapStartX + heatmapWidth;

    if (rect.timeStart !== -1 && state.priceHistory.length > 0) {
      // Find X position based on timestamp
      const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
      if (timeRange > 0) {
        const normalizedStart = (rect.timeStart - state.priceHistory[0].timestamp) / timeRange;
        startX = heatmapStartX + normalizedStart * heatmapWidth;
      }
    }
    if (rect.timeEnd !== -1 && state.priceHistory.length > 0) {
      const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
      if (timeRange > 0) {
        const normalizedEnd = (rect.timeEnd - state.priceHistory[0].timestamp) / timeRange;
        endX = heatmapStartX + normalizedEnd * heatmapWidth;
      }
    }

    // Clamp to visible area
    startX = Math.max(0, startX);
    endX = Math.min(width, endX);
    const rectWidth = endX - startX;

    if (rectWidth <= 0) return;

    ctx.save();

    // Fill
    ctx.fillStyle = rect.fillColor;
    ctx.globalAlpha = rect.fillOpacity;
    ctx.fillRect(startX, yTop, rectWidth, rectHeight);

    // Border
    if (rect.borderWidth > 0) {
      ctx.strokeStyle = rect.color;
      ctx.globalAlpha = rect.opacity;
      ctx.lineWidth = rect.borderWidth;
      ctx.strokeRect(startX, yTop, rectWidth, rectHeight);
    }

    // Label if present
    if (rect.label) {
      ctx.globalAlpha = 1;
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = rect.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(rect.label, startX + 4, yTop + 4);
    }

    ctx.restore();
  }

  // Render text annotation
  private renderTextAnnotation(text: TextAnnotation, priceRange: { min: number; max: number }, state: MarketState): void {
    const { ctx, heatmapStartX, heatmapWidth } = this;

    // Check if price is in visible range
    if (text.price < priceRange.min || text.price > priceRange.max) return;

    const y = this.priceToY(text.price, priceRange);

    // Calculate X position based on timestamp
    let x = heatmapStartX + heatmapWidth / 2; // Default to center
    if (state.priceHistory.length > 1) {
      const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
      if (timeRange > 0) {
        const normalizedX = (text.timestamp - state.priceHistory[0].timestamp) / timeRange;
        x = heatmapStartX + normalizedX * heatmapWidth;
      }
    }

    ctx.save();
    ctx.globalAlpha = text.opacity;
    ctx.font = `${text.fontWeight} ${text.fontSize}px Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Background if specified
    if (text.backgroundColor) {
      const textWidth = ctx.measureText(text.text).width + 8;
      const textHeight = text.fontSize + 6;
      ctx.fillStyle = text.backgroundColor;
      ctx.fillRect(x - 2, y - textHeight / 2, textWidth, textHeight);
    }

    // Text
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, x + 2, y);

    ctx.restore();
  }

  // Render trendline
  private renderTrendLine(line: TrendLine, priceRange: { min: number; max: number }, state: MarketState): void {
    const { ctx, heatmapStartX, heatmapWidth, width } = this;

    // Convert prices to Y
    const y1 = this.priceToY(line.startPrice, priceRange);
    const y2 = this.priceToY(line.endPrice, priceRange);

    // Calculate X positions based on timestamps
    let x1 = heatmapStartX;
    let x2 = heatmapStartX + heatmapWidth;

    if (state.priceHistory.length > 1) {
      const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
      if (timeRange > 0) {
        const normalizedStart = (line.startTime - state.priceHistory[0].timestamp) / timeRange;
        const normalizedEnd = (line.endTime - state.priceHistory[0].timestamp) / timeRange;
        x1 = heatmapStartX + normalizedStart * heatmapWidth;
        x2 = heatmapStartX + normalizedEnd * heatmapWidth;
      }
    }

    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.globalAlpha = line.opacity;
    ctx.lineWidth = line.lineWidth;

    // Set line style
    if (line.lineStyle === 'dashed') {
      ctx.setLineDash([8, 4]);
    } else if (line.lineStyle === 'dotted') {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);

    if (line.extendRight) {
      // Calculate slope and extend to right edge
      const slope = (y2 - y1) / (x2 - x1);
      const extendedY = y1 + slope * (width - x1);
      ctx.lineTo(width, extendedY);
    } else {
      ctx.lineTo(x2, y2);
    }

    ctx.stroke();

    // Draw anchor points (small circles)
    ctx.setLineDash([]);
    ctx.fillStyle = line.color;
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Render preview of drawing in progress
  private renderDrawingPreview(state: MarketState, priceRange: { min: number; max: number }): void {
    const drawing = this.drawingInProgress;
    if (!drawing) return;

    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.6; // Semi-transparent for preview

    switch (drawing.type) {
      case 'rect':
        const rect = drawing as Partial<RectangleZone>;
        if (rect.priceTop !== undefined && rect.priceBottom !== undefined) {
          const yTop = this.priceToY(rect.priceTop, priceRange);
          const yBottom = this.priceToY(rect.priceBottom, priceRange);

          ctx.fillStyle = rect.fillColor || '#4488ff';
          ctx.globalAlpha = 0.2;
          ctx.fillRect(this.heatmapStartX, yTop, this.heatmapWidth, yBottom - yTop);

          ctx.strokeStyle = rect.color || '#4488ff';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(this.heatmapStartX, yTop, this.heatmapWidth, yBottom - yTop);
        }
        break;

      case 'trendline':
        const tline = drawing as Partial<TrendLine>;
        if (tline.startPrice !== undefined && tline.endPrice !== undefined && this.drawingStartPoint) {
          const y1 = this.priceToY(tline.startPrice, priceRange);
          const y2 = this.priceToY(tline.endPrice, priceRange);
          const x1 = this.drawingStartPoint.x;

          // Get current mouse position from endTime ratio
          let x2 = x1;
          if (state.priceHistory.length > 1 && tline.startTime && tline.endTime) {
            const timeRange = state.priceHistory[state.priceHistory.length - 1].timestamp - state.priceHistory[0].timestamp;
            if (timeRange > 0) {
              x2 = this.heatmapStartX + ((tline.endTime - state.priceHistory[0].timestamp) / timeRange) * this.heatmapWidth;
            }
          }

          ctx.strokeStyle = tline.color || '#00ff88';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Anchor points
          ctx.setLineDash([]);
          ctx.fillStyle = tline.color || '#00ff88';
          ctx.beginPath();
          ctx.arc(x1, y1, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x2, y2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VOLUME PROFILE - Total volume at each price level (professional style)
  // ══════════════════════════════════════════════════════════════════════════
  private renderVolumeProfile(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, volumeProfileWidth, height, tickSize } = this;

    // Volume profile starts after heatmap
    const vpStartX = heatmapStartX + heatmapWidth;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / tickSize);
    const rowHeight = Math.max(2, height / numLevels);

    // Background for volume profile panel
    ctx.fillStyle = '#080a0e';
    ctx.fillRect(vpStartX, 0, volumeProfileWidth, height);

    // Separator line
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vpStartX + 0.5, 0);
    ctx.lineTo(vpStartX + 0.5, height);
    ctx.stroke();

    // Get cumulative levels
    const cumulativeLevels = state.cumulativeLevels;
    if (cumulativeLevels.size === 0) return;

    // Find max total volume for normalization
    let maxVolume = 1;
    for (const level of cumulativeLevels.values()) {
      const total = level.totalBuySize + level.totalSellSize;
      maxVolume = Math.max(maxVolume, total);
    }

    const barMaxWidth = volumeProfileWidth - 8;

    // Find POC (Point of Control) - price with highest volume
    let pocPrice = 0;
    let pocVolume = 0;
    for (const level of cumulativeLevels.values()) {
      const total = level.totalBuySize + level.totalSellSize;
      if (total > pocVolume) {
        pocVolume = total;
        pocPrice = level.price;
      }
    }

    // Render each price level
    for (const level of cumulativeLevels.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const y = this.priceToY(level.price, priceRange);
      const barHeight = Math.max(2, rowHeight * 0.8);
      const totalVolume = level.totalBuySize + level.totalSellSize;

      if (totalVolume < 0.1) continue;

      const barWidth = (totalVolume / maxVolume) * barMaxWidth;
      const buyRatio = totalVolume > 0 ? level.totalBuySize / totalVolume : 0.5;

      // Check if this is POC
      const isPOC = level.price === pocPrice;

      // Draw stacked bar: buy portion + sell portion
      const buyWidth = barWidth * buyRatio;
      const sellWidth = barWidth * (1 - buyRatio);

      // Buy portion (left side, green)
      if (buyWidth > 0) {
        const intensity = level.totalBuySize / maxVolume;
        ctx.fillStyle = isPOC
          ? `rgba(0, 255, 136, 0.9)`
          : `rgba(0, ${Math.round(150 + intensity * 105)}, ${Math.round(80 + intensity * 56)}, 0.7)`;
        ctx.fillRect(vpStartX + 4, y - barHeight / 2, buyWidth, barHeight);
      }

      // Sell portion (right side, red)
      if (sellWidth > 0) {
        const intensity = level.totalSellSize / maxVolume;
        ctx.fillStyle = isPOC
          ? `rgba(255, 68, 102, 0.9)`
          : `rgba(${Math.round(180 + intensity * 75)}, ${Math.round(50 + intensity * 30)}, ${Math.round(60 + intensity * 40)}, 0.7)`;
        ctx.fillRect(vpStartX + 4 + buyWidth, y - barHeight / 2, sellWidth, barHeight);
      }

      // POC indicator
      if (isPOC) {
        // Yellow highlight line
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(vpStartX + 2, y);
        ctx.lineTo(vpStartX + volumeProfileWidth - 2, y);
        ctx.stroke();

        // POC label
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 8px Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('POC', vpStartX + volumeProfileWidth - 2, y - barHeight);
      }

      // Volume label for significant levels
      if (totalVolume > maxVolume * 0.5 && barHeight > 8) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.formatVolume(totalVolume), vpStartX + barWidth + 6, y);
      }
    }

    // Header label
    ctx.fillStyle = '#888';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VOL', vpStartX + volumeProfileWidth / 2, 12);

    // Value Area calculation (70% of volume)
    // This is a simplified version - proper VA requires sorting by volume
    const sortedLevels = Array.from(cumulativeLevels.values())
      .filter(l => l.price >= priceRange.min && l.price <= priceRange.max)
      .sort((a, b) => (b.totalBuySize + b.totalSellSize) - (a.totalBuySize + a.totalSellSize));

    const totalAllVolume = sortedLevels.reduce((sum, l) => sum + l.totalBuySize + l.totalSellSize, 0);
    const vaThreshold = totalAllVolume * 0.7;

    let vaVolume = 0;
    let vaHigh = -Infinity;
    let vaLow = Infinity;

    for (const level of sortedLevels) {
      if (vaVolume >= vaThreshold) break;
      vaVolume += level.totalBuySize + level.totalSellSize;
      vaHigh = Math.max(vaHigh, level.price);
      vaLow = Math.min(vaLow, level.price);
    }

    // Draw Value Area bounds
    if (vaHigh > vaLow) {
      const vaHighY = this.priceToY(vaHigh, priceRange);
      const vaLowY = this.priceToY(vaLow, priceRange);

      // VA background
      ctx.fillStyle = 'rgba(251, 191, 36, 0.05)';
      ctx.fillRect(vpStartX, vaHighY, volumeProfileWidth, vaLowY - vaHighY);

      // VA lines
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(vpStartX, vaHighY);
      ctx.lineTo(vpStartX + volumeProfileWidth, vaHighY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(vpStartX, vaLowY);
      ctx.lineTo(vpStartX + volumeProfileWidth, vaLowY);
      ctx.stroke();

      ctx.setLineDash([]);

      // VA labels
      ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.font = '7px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('VAH', vpStartX + 2, vaHighY - 2);
      ctx.fillText('VAL', vpStartX + 2, vaLowY + 8);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VWAP - Volume Weighted Average Price line with bands
  // ══════════════════════════════════════════════════════════════════════════
  private renderVWAP(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const { vwap } = state;

    if (!vwap || vwap.cumulativeVolume < 1) return;

    const vwapY = this.priceToY(vwap.vwap, priceRange);
    const upperY = this.priceToY(vwap.upperBand, priceRange);
    const lowerY = this.priceToY(vwap.lowerBand, priceRange);

    // VWAP bands (shaded area)
    ctx.fillStyle = 'rgba(147, 51, 234, 0.08)';
    ctx.fillRect(heatmapStartX, upperY, heatmapWidth, lowerY - upperY);

    // Upper band
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(heatmapStartX, upperY);
    ctx.lineTo(heatmapStartX + heatmapWidth, upperY);
    ctx.stroke();

    // Lower band
    ctx.beginPath();
    ctx.moveTo(heatmapStartX, lowerY);
    ctx.lineTo(heatmapStartX + heatmapWidth, lowerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // VWAP main line
    ctx.strokeStyle = '#9333ea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(heatmapStartX, vwapY);
    ctx.lineTo(heatmapStartX + heatmapWidth, vwapY);
    ctx.stroke();

    // VWAP label
    ctx.fillStyle = '#9333ea';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`VWAP ${vwap.vwap.toFixed(2)}`, heatmapStartX + 5, vwapY - 4);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IMBALANCES - Diagonal stacking indicators
  // ══════════════════════════════════════════════════════════════════════════
  private renderImbalances(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, tickSize } = this;

    if (!state.imbalances || state.imbalances.length === 0) return;

    for (const imb of state.imbalances) {
      if (imb.price < priceRange.min || imb.price > priceRange.max) continue;

      const y = this.priceToY(imb.price, priceRange);
      const isBidImbalance = imb.type === 'bid_imbalance' || (imb.type === 'stacked_imbalance' && imb.bidVolume > imb.askVolume);

      // Stacked imbalances get special treatment (stronger visual)
      const isStacked = imb.type === 'stacked_imbalance';
      const alpha = isStacked ? 0.7 : 0.4;
      const size = isStacked ? 12 : 8;

      // Draw imbalance indicator (arrow pointing in direction of imbalance)
      const x = heatmapStartX + heatmapWidth - 30;

      ctx.fillStyle = isBidImbalance
        ? `rgba(0, 255, 136, ${alpha})`
        : `rgba(255, 68, 102, ${alpha})`;

      // Triangle arrow
      ctx.beginPath();
      if (isBidImbalance) {
        // Up arrow (bid imbalance = bullish)
        ctx.moveTo(x, y + size / 2);
        ctx.lineTo(x + size, y + size / 2);
        ctx.lineTo(x + size / 2, y - size / 2);
      } else {
        // Down arrow (ask imbalance = bearish)
        ctx.moveTo(x, y - size / 2);
        ctx.lineTo(x + size, y - size / 2);
        ctx.lineTo(x + size / 2, y + size / 2);
      }
      ctx.closePath();
      ctx.fill();

      // Stacked imbalances get a connecting line
      if (isStacked && imb.consecutiveCount >= 3) {
        ctx.strokeStyle = isBidImbalance
          ? 'rgba(0, 255, 136, 0.6)'
          : 'rgba(255, 68, 102, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        const lineLength = imb.consecutiveCount * tickSize;
        const startY = isBidImbalance ? y + lineLength : y - lineLength;

        ctx.beginPath();
        ctx.moveTo(x + size / 2, y);
        ctx.lineTo(x + size / 2, startY);
        ctx.stroke();

        // Label
        ctx.fillStyle = isBidImbalance ? '#00ff88' : '#ff4466';
        ctx.font = 'bold 8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${imb.consecutiveCount}x`, x + size / 2, isBidImbalance ? y - size - 2 : y + size + 8);
      }

      // Ratio text
      if (imb.ratio >= 3) {
        ctx.fillStyle = '#fff';
        ctx.font = '7px Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${imb.ratio.toFixed(1)}:1`, x - 3, y + 3);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ABSORPTION EVENTS - Visual markers for large order absorption
  // ══════════════════════════════════════════════════════════════════════════
  private renderAbsorptionEvents(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;

    if (!state.absorptionEvents || state.absorptionEvents.length === 0) return;

    for (const event of state.absorptionEvents) {
      if (event.price < priceRange.min || event.price > priceRange.max) continue;
      if (event.opacity < 0.05) continue;

      const y = this.priceToY(event.price, priceRange);
      const x = heatmapStartX + heatmapWidth - 60;

      // Absorption burst effect
      const radius = event.isSignificant ? 15 : 10;
      const alpha = event.opacity;

      // Outer glow
      ctx.shadowColor = event.side === 'bid' ? '#00ffff' : '#ff4466';
      ctx.shadowBlur = 15 * alpha;

      // Main circle
      ctx.fillStyle = event.side === 'bid'
        ? `rgba(0, 255, 255, ${alpha * 0.7})`
        : `rgba(255, 68, 102, ${alpha * 0.7})`;

      ctx.beginPath();
      ctx.arc(x, y, radius * alpha, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Inner ring
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.6 * alpha, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Volume text
      if (event.isSignificant && alpha > 0.5) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.formatVolume(event.absorbedVolume), x, y);
      }

      // "ABSORBED" label for significant events
      if (event.isSignificant && alpha > 0.7) {
        ctx.fillStyle = event.side === 'bid' ? '#00ffff' : '#ff4466';
        ctx.font = 'bold 8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ABSORBED', x, y - radius - 5);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ICEBERGS - Hidden order indicators
  // ══════════════════════════════════════════════════════════════════════════
  private renderIcebergs(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;

    if (!state.icebergs || state.icebergs.size === 0) return;

    for (const iceberg of state.icebergs.values()) {
      if (iceberg.price < priceRange.min || iceberg.price > priceRange.max) continue;
      if (iceberg.confidence < 0.3) continue;

      const y = this.priceToY(iceberg.price, priceRange);
      const x = heatmapStartX + 10;

      const alpha = iceberg.confidence;
      const isBid = iceberg.side === 'bid';

      // Iceberg icon (triangle pointing down for hidden depth)
      ctx.fillStyle = isBid
        ? `rgba(0, 200, 255, ${alpha})`
        : `rgba(255, 100, 130, ${alpha})`;

      // Main visible part (small triangle)
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 8, y - 4);
      ctx.lineTo(x + 4, y + 2);
      ctx.closePath();
      ctx.fill();

      // Hidden part indicator (dashed larger triangle below)
      ctx.strokeStyle = isBid
        ? `rgba(0, 200, 255, ${alpha * 0.5})`
        : `rgba(255, 100, 130, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 2);
      ctx.lineTo(x + 12, y + 2);
      ctx.lineTo(x + 4, y + 12);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Refill count badge
      if (iceberg.refillCount >= 2) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 8px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`×${iceberg.refillCount}`, x + 14, y);
      }

      // Estimated hidden size
      if (iceberg.confidence > 0.6) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.font = '7px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`~${this.formatVolume(iceberg.estimatedHiddenSize)}`, x + 14, y + 8);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FOOTPRINT NUMBERS - Professional style bid/ask volume display
  // ══════════════════════════════════════════════════════════════════════════
  private renderFootprintNumbers(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, height, tickSize } = this;
    const cumulativeLevels = state.cumulativeLevels;

    if (cumulativeLevels.size === 0) return;

    const numLevels = Math.ceil((priceRange.max - priceRange.min) / tickSize);
    const rowHeight = height / numLevels;

    // Don't render if rows are too small
    if (rowHeight < 12) return;

    // Find max volume for color intensity
    let maxVolume = 1;
    for (const level of cumulativeLevels.values()) {
      maxVolume = Math.max(maxVolume, level.totalBuySize, level.totalSellSize);
    }

    // Calculate column width based on visible time window
    const history = state.priceHistory;
    const visiblePoints = Math.min(history.length, 200);
    const columnWidth = heatmapWidth / Math.max(1, Math.floor(visiblePoints / 10)); // Group by 10 points

    ctx.font = `bold ${Math.min(11, Math.max(8, rowHeight * 0.6))}px Consolas, monospace`;
    ctx.textBaseline = 'middle';

    // Render footprint for each price level
    for (const level of cumulativeLevels.values()) {
      if (level.price < priceRange.min || level.price > priceRange.max) continue;

      const y = this.priceToY(level.price, priceRange);
      const bidVol = level.totalBuySize;
      const askVol = level.totalSellSize;

      // Skip if no volume
      if (bidVol < 0.1 && askVol < 0.1) continue;

      // Position X: right side of heatmap (most recent)
      const cellX = heatmapStartX + heatmapWidth - columnWidth;
      const cellWidth = columnWidth - 4;
      const halfWidth = cellWidth / 2;

      // Calculate imbalance for coloring
      const totalVol = bidVol + askVol;
      const imbalanceRatio = totalVol > 0 ? (bidVol - askVol) / totalVol : 0;

      // Cell background based on imbalance
      if (Math.abs(imbalanceRatio) > 0.3) {
        const bgAlpha = Math.min(0.3, Math.abs(imbalanceRatio) * 0.4);
        ctx.fillStyle = imbalanceRatio > 0
          ? `rgba(0, 255, 136, ${bgAlpha})`  // Bid dominant = green
          : `rgba(255, 68, 102, ${bgAlpha})`; // Ask dominant = red
        ctx.fillRect(cellX, y - rowHeight / 2, cellWidth, rowHeight);
      }

      // Cell border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cellX, y - rowHeight / 2, cellWidth, rowHeight);

      // Render based on style
      switch (this.footprintStyle) {
        case 'bid_ask':
          this.renderBidAskNumbers(ctx, cellX, y, halfWidth, bidVol, askVol, maxVolume, rowHeight);
          break;
        case 'delta':
          this.renderDeltaNumber(ctx, cellX + halfWidth, y, bidVol - askVol, maxVolume);
          break;
        case 'volume':
          this.renderVolumeNumber(ctx, cellX + halfWidth, y, totalVol, maxVolume);
          break;
      }

      // Diagonal imbalance indicator (professional style)
      this.renderDiagonalImbalance(ctx, cellX, y, rowHeight, level, state, priceRange);
    }
  }

  private renderBidAskNumbers(
    ctx: CanvasRenderingContext2D,
    cellX: number,
    y: number,
    halfWidth: number,
    bidVol: number,
    askVol: number,
    maxVolume: number,
    rowHeight: number
  ): void {
    // Bid volume (left side, cyan/green)
    if (bidVol >= 0.1) {
      const bidIntensity = Math.min(1, bidVol / maxVolume);
      const bidColor = this.getFootprintColor('bid', bidIntensity);
      ctx.fillStyle = bidColor;
      ctx.textAlign = 'right';
      ctx.fillText(this.formatFootprintVolume(bidVol), cellX + halfWidth - 3, y);
    }

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cellX + halfWidth, y - rowHeight / 2 + 2);
    ctx.lineTo(cellX + halfWidth, y + rowHeight / 2 - 2);
    ctx.stroke();

    // Ask volume (right side, red/magenta)
    if (askVol >= 0.1) {
      const askIntensity = Math.min(1, askVol / maxVolume);
      const askColor = this.getFootprintColor('ask', askIntensity);
      ctx.fillStyle = askColor;
      ctx.textAlign = 'left';
      ctx.fillText(this.formatFootprintVolume(askVol), cellX + halfWidth + 3, y);
    }
  }

  private renderDeltaNumber(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    delta: number,
    maxVolume: number
  ): void {
    const intensity = Math.min(1, Math.abs(delta) / maxVolume);
    ctx.fillStyle = delta >= 0
      ? this.getFootprintColor('bid', intensity)
      : this.getFootprintColor('ask', intensity);
    ctx.textAlign = 'center';
    ctx.fillText((delta >= 0 ? '+' : '') + this.formatFootprintVolume(delta), x, y);
  }

  private renderVolumeNumber(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    volume: number,
    maxVolume: number
  ): void {
    const intensity = Math.min(1, volume / maxVolume);
    // White with intensity-based brightness
    const brightness = Math.round(150 + intensity * 105);
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    ctx.textAlign = 'center';
    ctx.fillText(this.formatFootprintVolume(volume), x, y);
  }

  private renderDiagonalImbalance(
    ctx: CanvasRenderingContext2D,
    cellX: number,
    y: number,
    rowHeight: number,
    currentLevel: CumulativeLevel,
    state: MarketState,
    priceRange: { min: number; max: number }
  ): void {
    const { tickSize } = this;
    const IMBALANCE_THRESHOLD = 2.5; // 2.5x = significant imbalance

    // Check diagonal imbalance: current bid vs ask at price above
    const priceAbove = currentLevel.price + tickSize;
    const levelAbove = state.cumulativeLevels.get(priceAbove);

    if (levelAbove) {
      // Bid imbalance: current bid >> ask above (buying pressure)
      if (currentLevel.totalBuySize > 0 && levelAbove.totalSellSize > 0) {
        const ratio = currentLevel.totalBuySize / levelAbove.totalSellSize;
        if (ratio >= IMBALANCE_THRESHOLD) {
          // Draw diagonal line from current bid to ask above
          const yAbove = this.priceToY(priceAbove, priceRange);
          ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cellX + 2, y);
          ctx.lineTo(cellX + 20, yAbove);
          ctx.stroke();

          // Small green dot
          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(cellX + 2, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Check ask imbalance: current ask >> bid below
    const priceBelow = currentLevel.price - tickSize;
    const levelBelow = state.cumulativeLevels.get(priceBelow);

    if (levelBelow) {
      if (currentLevel.totalSellSize > 0 && levelBelow.totalBuySize > 0) {
        const ratio = currentLevel.totalSellSize / levelBelow.totalBuySize;
        if (ratio >= IMBALANCE_THRESHOLD) {
          // Draw diagonal line from current ask to bid below
          const yBelow = this.priceToY(priceBelow, priceRange);
          ctx.strokeStyle = 'rgba(255, 68, 102, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cellX + 20, y);
          ctx.lineTo(cellX + 2, yBelow);
          ctx.stroke();

          // Small red dot
          ctx.fillStyle = '#ff4466';
          ctx.beginPath();
          ctx.arc(cellX + 20, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private getFootprintColor(side: 'bid' | 'ask', intensity: number): string {
    if (side === 'bid') {
      // Cyan to bright green based on intensity
      const r = Math.round(0 + intensity * 50);
      const g = Math.round(180 + intensity * 75);
      const b = Math.round(200 - intensity * 80);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Pink to bright red based on intensity
      const r = Math.round(200 + intensity * 55);
      const g = Math.round(100 - intensity * 50);
      const b = Math.round(120 - intensity * 20);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  private formatFootprintVolume(vol: number): string {
    const abs = Math.abs(vol);
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 100) return Math.round(vol).toString();
    if (abs >= 10) return vol.toFixed(0);
    if (abs >= 1) return vol.toFixed(1);
    return vol.toFixed(2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GRID
  // ══════════════════════════════════════════════════════════════════════════
  private renderGrid(priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, height, tickSize } = this;
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / tickSize);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    // Lignes horizontales tous les 10 ticks (accounting for delta profile)
    for (let i = 0; i <= numLevels; i += 10) {
      const y = (i / numLevels) * height;
      ctx.beginPath();
      ctx.moveTo(heatmapStartX, y);
      ctx.lineTo(heatmapStartX + heatmapWidth, y);
      ctx.stroke();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASSIVE ORDERS - LIFECYCLE BASED RENDERING (professional style)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // RÈGLES:
  // - UN ordre = UNE ligne horizontale continue
  // - draw on ADD, extend on NO_CHANGE, shorten/remove on FILL/CANCEL
  // - Zéro time-bucket, zéro micro-blocs
  // - Filtrage par seuil de volume significatif
  // ══════════════════════════════════════════════════════════════════════════

  // Setting pour l'épaisseur (défini par le composant parent)
  private passiveThickness: 'thin' | 'normal' | 'thick' = 'normal';

  setPassiveThickness(thickness: 'thin' | 'normal' | 'thick'): void {
    this.passiveThickness = thickness;
  }

  // ── Bookmap-style bitmap renderer ────────────────────────────────────────
  // Pre-baked LUT for fast color lookup (256 entries × RGBA)
  private bidLUT: Uint8ClampedArray | null = null;
  private askLUT: Uint8ClampedArray | null = null;
  private smoothMaxDepth = 1;

  private ensureLUTs(): void {
    if (this.bidLUT) return;
    this.bidLUT = new Uint8ClampedArray(256 * 4);
    this.askLUT = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const bid = interpolateGradient(BID_GRADIENT, t);
      const ask = interpolateGradient(ASK_GRADIENT, t);
      // Full opacity — Bookmap fills every pixel solidly
      this.bidLUT[i * 4] = bid.r; this.bidLUT[i * 4 + 1] = bid.g;
      this.bidLUT[i * 4 + 2] = bid.b; this.bidLUT[i * 4 + 3] = 255;
      this.askLUT[i * 4] = ask.r; this.askLUT[i * 4 + 1] = ask.g;
      this.askLUT[i * 4 + 2] = ask.b; this.askLUT[i * 4 + 3] = 255;
    }
  }

  private renderHeatmap(state: MarketState, priceRange: { min: number; max: number }): void {
    this.ensureLUTs();
    const ctx = this.ctx;
    const columns = state.depthColumns || [];
    if (columns.length === 0) return;

    const chartHeight = this.height - this.statsBarHeight;
    const priceSpan = priceRange.max - priceRange.min;
    if (priceSpan <= 0 || chartHeight <= 0) return;

    const hmW = Math.floor(this.heatmapWidth);
    const hmH = Math.floor(chartHeight);
    if (hmW <= 0 || hmH <= 0) return;

    // Column layout
    const visibleColumns = Math.min(columns.length, hmW);
    const startIdx = Math.max(0, columns.length - visibleColumns);
    const colWidth = hmW / visibleColumns;

    // Adaptive max-depth with smoothing (no flicker)
    let frameMax = 0;
    const step = Math.max(1, Math.floor(visibleColumns / 200));
    for (let i = startIdx; i < columns.length; i += step) {
      const col = columns[i];
      for (const size of col.bidDepth.values()) if (size > frameMax) frameMax = size;
      for (const size of col.askDepth.values()) if (size > frameMax) frameMax = size;
    }
    if (frameMax > 0) this.smoothMaxDepth = this.smoothMaxDepth * 0.92 + frameMax * 0.08;
    const maxD = this.smoothMaxDepth || 1;

    // Build pixel bitmap via ImageData
    const imgData = ctx.createImageData(hmW, hmH);
    const px = imgData.data;

    // Background — deep navy blue (Bookmap-style #081228)
    for (let p = 0; p < px.length; p += 4) {
      px[p] = 8; px[p + 1] = 18; px[p + 2] = 40; px[p + 3] = 255;
    }

    const bidLUT = this.bidLUT!;
    const askLUT = this.askLUT!;
    const tickSize = this.tickSize || 0.5;
    const pxPerTick = (tickSize / priceSpan) * hmH;
    const cellH = Math.max(1, Math.round(pxPerTick));

    // Paint each column
    for (let ci = startIdx; ci < columns.length; ci++) {
      const col = columns[ci];
      const xStart = Math.floor((ci - startIdx) * colWidth);
      const xEnd = Math.min(hmW, Math.floor(xStart + colWidth) + 1);
      if (xEnd <= xStart) continue;

      // Bids (below best bid)
      for (const [price, size] of col.bidDepth) {
        const yMid = Math.floor(((priceRange.max - price) / priceSpan) * hmH);
        const yTop = Math.max(0, yMid - (cellH >> 1));
        const yBot = Math.min(hmH, yTop + cellH);
        if (yBot <= 0 || yTop >= hmH) continue;
        const g = Math.pow(Math.min(size / maxD, 1), 0.55);
        const li = Math.min(255, Math.floor(g * 255)) * 4;
        const cr = bidLUT[li], cg = bidLUT[li + 1], cb = bidLUT[li + 2], ca = bidLUT[li + 3];
        const a = ca / 255;
        const inv = 1 - a;
        for (let y = yTop; y < yBot; y++) {
          const row = y * hmW;
          for (let x = xStart; x < xEnd; x++) {
            const off = (row + x) * 4;
            px[off]     = (px[off]     * inv + cr * a) | 0;
            px[off + 1] = (px[off + 1] * inv + cg * a) | 0;
            px[off + 2] = (px[off + 2] * inv + cb * a) | 0;
          }
        }
      }

      // Asks (above best ask)
      for (const [price, size] of col.askDepth) {
        const yMid = Math.floor(((priceRange.max - price) / priceSpan) * hmH);
        const yTop = Math.max(0, yMid - (cellH >> 1));
        const yBot = Math.min(hmH, yTop + cellH);
        if (yBot <= 0 || yTop >= hmH) continue;
        const g = Math.pow(Math.min(size / maxD, 1), 0.55);
        const li = Math.min(255, Math.floor(g * 255)) * 4;
        const cr = askLUT[li], cg = askLUT[li + 1], cb = askLUT[li + 2], ca = askLUT[li + 3];
        const a = ca / 255;
        const inv = 1 - a;
        for (let y = yTop; y < yBot; y++) {
          const row = y * hmW;
          for (let x = xStart; x < xEnd; x++) {
            const off = (row + x) * 4;
            px[off]     = (px[off]     * inv + cr * a) | 0;
            px[off + 1] = (px[off + 1] * inv + cg * a) | 0;
            px[off + 2] = (px[off + 2] * inv + cb * a) | 0;
          }
        }
      }
    }

    // Blit bitmap to canvas at heatmap offset
    ctx.putImageData(imgData, Math.floor(this.heatmapStartX), 0);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRACES (afterimages - ordres absorbés/annulés)
  // ══════════════════════════════════════════════════════════════════════════
  private renderTraces(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, height, tickSize } = this;
    const history = state.priceHistory;

    if (history.length < 2) return;

    const visiblePoints = Math.min(history.length, 200);
    const startIdx = history.length - visiblePoints;
    const cellWidth = heatmapWidth / visiblePoints;
    const barHeight = Math.max(3, height / ((priceRange.max - priceRange.min) / tickSize));

    for (const trace of state.traces) {
      if (trace.price < priceRange.min || trace.price > priceRange.max) continue;

      const y = this.priceToY(trace.price, priceRange);

      // Position X: vers la droite (traces récentes) - with delta profile offset
      const x = heatmapStartX + heatmapWidth - cellWidth * 8;

      if (trace.type === 'absorbed') {
        // Glow doré pour les ordres absorbés (quelqu'un a tradé à travers)
        const intensity = trace.opacity;
        const color = interpolateGradient(ABSORBED_GRADIENT, intensity);

        // Glow externe
        ctx.shadowColor = `rgba(255, 180, 60, ${intensity})`;
        ctx.shadowBlur = 12 * intensity;

        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${intensity * 0.8})`;
        ctx.fillRect(x, y - barHeight / 2, cellWidth * 6, barHeight);

        ctx.shadowBlur = 0;

        // Ligne brillante au centre
        ctx.fillStyle = `rgba(255, 220, 100, ${intensity * 0.6})`;
        ctx.fillRect(x, y - 1, cellWidth * 6, 2);
      } else {
        // Trace grise pour les ordres annulés
        ctx.globalAlpha = trace.opacity * 0.5;
        ctx.fillStyle = '#404050';
        ctx.fillRect(x, y - barHeight / 2, cellWidth * 4, barHeight);
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAIRCASE LINES (Bid/Ask)
  // ══════════════════════════════════════════════════════════════════════════
  private renderStaircaseLines(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const history = state.priceHistory;

    if (history.length < 2) return;

    // Calculer combien de points afficher
    const visiblePoints = Math.min(history.length, 200);
    const startIdx = history.length - visiblePoints;
    const pointWidth = heatmapWidth / visiblePoints;

    // ═══ BID LINE (cyan) ═══
    ctx.strokeStyle = COLORS.bidLine;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < visiblePoints; i++) {
      const point = history[startIdx + i];
      const x = heatmapStartX + i * pointWidth;
      const y = this.priceToY(point.bid, priceRange);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Staircase: d'abord horizontal, puis vertical
        const prevPoint = history[startIdx + i - 1];
        const prevY = this.priceToY(prevPoint.bid, priceRange);
        ctx.lineTo(x, prevY); // Horizontal
        ctx.lineTo(x, y);     // Vertical
      }
    }
    ctx.stroke();

    // ═══ ASK LINE (rouge) ═══
    ctx.strokeStyle = COLORS.askLine;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < visiblePoints; i++) {
      const point = history[startIdx + i];
      const x = heatmapStartX + i * pointWidth;
      const y = this.priceToY(point.ask, priceRange);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevPoint = history[startIdx + i - 1];
        const prevY = this.priceToY(prevPoint.ask, priceRange);
        ctx.lineTo(x, prevY);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRADE BUBBLES
  // ══════════════════════════════════════════════════════════════════════════
  private renderTradeBubbles(
    state: MarketState,
    priceRange: { min: number; max: number },
    settings: TradeFlowSettings
  ): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const history = state.priceHistory;

    if (history.length < 2) return;

    const visiblePoints = Math.min(history.length, 200);
    const startIdx = history.length - visiblePoints;
    const pointWidth = heatmapWidth / visiblePoints;
    const xOffset = heatmapStartX; // Offset for delta profile

    // Mode Pie Chart: grouper par prix pour détecter buy+sell au même niveau
    if (settings.bubbleShape === 'pie') {
      this.renderPieChartTrades(state, priceRange, startIdx, pointWidth, visiblePoints, settings);
    } else {
      // Mode Cercle standard
      if (state.tradeClusters && state.tradeClusters.length > 0) {
        this.renderTradeClusters(state, priceRange, startIdx, pointWidth, visiblePoints, settings);
      } else {
        this.renderIndividualTrades(state, priceRange, startIdx, pointWidth, visiblePoints, settings);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PIE CHART MODE
  // ══════════════════════════════════════════════════════════════════════════
  private renderPieChartTrades(
    state: MarketState,
    priceRange: { min: number; max: number },
    startIdx: number,
    pointWidth: number,
    visiblePoints: number,
    settings: TradeFlowSettings
  ): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const history = state.priceHistory;

    // Calculer la fenêtre temporelle visible
    const timeWindowStart = history[startIdx]?.timestamp ?? history[0]?.timestamp ?? 0;
    const timeWindowEnd = history[history.length - 1]?.timestamp ?? Date.now();
    const timeWindowDuration = timeWindowEnd - timeWindowStart;

    // Grouper les trades par prix (buy + sell ensemble)
    // Utiliser avgTimestamp au lieu de avgIdx pour ancrage fixe
    const priceGroups = new Map<number, { buySize: number; sellSize: number; avgTimestamp: number; count: number }>();

    for (const trade of state.trades) {
      if (trade.size < settings.filterThreshold) continue;
      if (trade.opacity < 0.1) continue;

      const roundedPrice = Math.round(trade.price / this.tickSize) * this.tickSize;

      if (!priceGroups.has(roundedPrice)) {
        priceGroups.set(roundedPrice, { buySize: 0, sellSize: 0, avgTimestamp: 0, count: 0 });
      }

      const group = priceGroups.get(roundedPrice)!;
      if (trade.side === 'buy') {
        group.buySize += trade.size;
      } else {
        group.sellSize += trade.size;
      }
      group.avgTimestamp += trade.timestamp;
      group.count++;
    }

    // Render chaque groupe
    for (const [price, group] of priceGroups) {
      if (price < priceRange.min || price > priceRange.max) continue;

      // Position X basée sur TIMESTAMP moyen (ancrage fixe)
      const avgTimestamp = group.avgTimestamp / group.count;
      const groupTimeOffset = avgTimestamp - timeWindowStart;
      if (groupTimeOffset < 0 || groupTimeOffset > timeWindowDuration) continue;

      // Apply heatmapStartX offset for delta profile panel
      const x = heatmapStartX + (groupTimeOffset / timeWindowDuration) * heatmapWidth;
      const y = this.priceToY(price, priceRange);

      const totalSize = group.buySize + group.sellSize;
      const radius = Math.min(30, 8 + Math.sqrt(totalSize) * 3);

      // Si les deux côtés ont du volume -> Pie Chart
      if (group.buySize > 0 && group.sellSize > 0) {
        this.drawPieChart(x, y, radius, group.buySize, group.sellSize, settings);
      } else {
        // Sinon cercle simple
        const isBuy = group.buySize > 0;
        const color = isBuy ? settings.buyColor : settings.sellColor;
        this.drawCircleBubble(x, y, radius, color, totalSize, settings.showTextLabels);
      }
    }
  }

  private drawPieChart(
    x: number,
    y: number,
    radius: number,
    buySize: number,
    sellSize: number,
    settings: TradeFlowSettings
  ): void {
    const { ctx } = this;
    const total = buySize + sellSize;

    // Glow
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6;

    // Buy portion (start from top, go clockwise)
    const buyAngle = (buySize / total) * Math.PI * 2;

    ctx.fillStyle = settings.buyColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + buyAngle);
    ctx.closePath();
    ctx.fill();

    // Sell portion
    ctx.fillStyle = settings.sellColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2 + buyAngle, -Math.PI / 2 + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Bordure
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Label total
    if (settings.showTextLabels && radius > 12) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(total.toFixed(0), x, y);
    }
  }

  private drawCircleBubble(
    x: number,
    y: number,
    radius: number,
    color: string,
    size: number,
    showLabel: boolean
  ): void {
    const { ctx } = this;

    // Glow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Cercle principal
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bordure
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.stroke();

    // Label
    if (showLabel && radius > 12) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(size.toFixed(0), x, y);
    }

    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUMULATIVE TRADE FLOW
  // ══════════════════════════════════════════════════════════════════════════
  private renderCumulativeTradeFlow(
    state: MarketState,
    priceRange: { min: number; max: number },
    settings: TradeFlowSettings
  ): void {
    const { ctx, heatmapWidth, heatmapStartX, height } = this;

    if (!state.cumulativeLevels || state.cumulativeLevels.size === 0) return;

    // Apply heatmapStartX offset for delta profile panel
    const rightEdge = heatmapStartX + heatmapWidth - 20;

    for (const [price, level] of state.cumulativeLevels) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const totalSize = level.totalBuySize + level.totalSellSize;
      if (totalSize < settings.filterThreshold) continue;

      const y = this.priceToY(price, priceRange);
      const radius = Math.min(35, 10 + Math.sqrt(totalSize) * 2);

      if (settings.bubbleShape === 'pie' && level.totalBuySize > 0 && level.totalSellSize > 0) {
        this.drawPieChart(rightEdge, y, radius, level.totalBuySize, level.totalSellSize, settings);
      } else {
        // Cercle avec la couleur dominante
        const isBuyDominant = level.totalBuySize >= level.totalSellSize;
        const color = isBuyDominant ? settings.buyColor : settings.sellColor;
        this.drawCircleBubble(rightEdge, y, radius, color, totalSize, settings.showTextLabels);
      }

      // Barres de volume horizontal (style DOM)
      const maxBarWidth = 80;
      const barHeight = Math.max(3, height / ((priceRange.max - priceRange.min) / this.tickSize) * 0.6);
      const buyBarWidth = Math.min(maxBarWidth, (level.totalBuySize / 50) * maxBarWidth);
      const sellBarWidth = Math.min(maxBarWidth, (level.totalSellSize / 50) * maxBarWidth);

      // Buy bar (vers la gauche)
      if (buyBarWidth > 2) {
        ctx.fillStyle = settings.buyColor;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(rightEdge - radius - 10 - buyBarWidth, y - barHeight / 2, buyBarWidth, barHeight);
      }

      // Sell bar (vers la droite, après le cercle)
      if (sellBarWidth > 2) {
        ctx.fillStyle = settings.sellColor;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(rightEdge + radius + 10, y - barHeight / 2, sellBarWidth, barHeight);
      }

      ctx.globalAlpha = 1;
    }
  }

  private renderTradeClusters(
    state: MarketState,
    priceRange: { min: number; max: number },
    startIdx: number,
    pointWidth: number,
    visiblePoints: number,
    settings: TradeFlowSettings
  ): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const history = state.priceHistory;

    // Calculer la fenêtre temporelle visible
    const timeWindowStart = history[startIdx]?.timestamp ?? history[0]?.timestamp ?? 0;
    const timeWindowEnd = history[history.length - 1]?.timestamp ?? Date.now();
    const timeWindowDuration = timeWindowEnd - timeWindowStart;

    for (const cluster of state.tradeClusters) {
      if (cluster.price < priceRange.min || cluster.price > priceRange.max) continue;
      if (cluster.opacity < 0.05) continue;
      if (cluster.totalSize < settings.filterThreshold) continue;

      // Position X basée sur TIMESTAMP moyen (ancrage fixe)
      // Calculer le timestamp moyen des trades du cluster
      const avgTimestamp = cluster.trades.reduce((sum, t) => sum + t.timestamp, 0) / cluster.count;
      const clusterTimeOffset = avgTimestamp - timeWindowStart;
      if (clusterTimeOffset < 0 || clusterTimeOffset > timeWindowDuration) continue;
      // Apply heatmapStartX offset for delta profile panel
      const x = heatmapStartX + (clusterTimeOffset / timeWindowDuration) * heatmapWidth;

      // Position Y: utiliser le PRIX DU CLUSTER (ancrage fixe)
      const y = this.priceToY(cluster.price, priceRange);

      // Rayon basé sur le total
      const minRadius = 10;
      const radius = (minRadius + Math.sqrt(cluster.totalSize) * 3) * cluster.scale;

      const isBuy = cluster.side === 'buy';
      const color = isBuy ? settings.buyColor : settings.sellColor;

      // Glow
      ctx.globalAlpha = cluster.opacity * 0.25;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Bubble principale
      ctx.globalAlpha = cluster.opacity * 0.85;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Bordure
      ctx.strokeStyle = isBuy ? '#00ffaa' : '#ff6688';
      ctx.lineWidth = 2;
      ctx.globalAlpha = cluster.opacity * 0.9;
      ctx.stroke();

      // Label: total volume
      if (settings.showTextLabels && radius > 14) {
        ctx.globalAlpha = cluster.opacity;
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cluster.totalSize.toFixed(0), x, y);
      }

      // Badge count si plusieurs trades
      if (cluster.count > 1 && radius > 10) {
        const badgeX = x + radius * 0.7;
        const badgeY = y - radius * 0.7;
        const badgeRadius = 7;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px Arial';
        ctx.fillText(cluster.count.toString(), badgeX, badgeY);
      }
    }

    ctx.globalAlpha = 1;
  }

  private renderIndividualTrades(
    state: MarketState,
    priceRange: { min: number; max: number },
    startIdx: number,
    pointWidth: number,
    visiblePoints: number,
    settings: TradeFlowSettings
  ): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;
    const history = state.priceHistory;

    // Calculer la fenêtre temporelle visible
    const timeWindowStart = history[startIdx]?.timestamp ?? history[0]?.timestamp ?? 0;
    const timeWindowEnd = history[history.length - 1]?.timestamp ?? Date.now();
    const timeWindowDuration = timeWindowEnd - timeWindowStart;

    for (const trade of state.trades) {
      if (trade.price < priceRange.min || trade.price > priceRange.max) continue;
      if (trade.opacity < 0.05) continue;
      if (trade.size < settings.filterThreshold) continue;

      // Position X basée sur TIMESTAMP (ancrage fixe) - pas sur historyIndex
      // La bulle reste à sa position temporelle d'origine
      const tradeTimeOffset = trade.timestamp - timeWindowStart;
      if (tradeTimeOffset < 0 || tradeTimeOffset > timeWindowDuration) continue;
      // Apply heatmapStartX offset for delta profile panel
      const x = heatmapStartX + (tradeTimeOffset / timeWindowDuration) * heatmapWidth;

      // Position Y: utiliser le PRIX DU TRADE (ancrage fixe)
      // La bulle reste au prix où le trade a été exécuté
      const y = this.priceToY(trade.price, priceRange);

      // Rayon
      const minRadius = 8;
      const radius = (minRadius + Math.sqrt(trade.size) * 4) * trade.scale;
      const isBuy = trade.side === 'buy';
      const color = isBuy ? settings.buyColor : settings.sellColor;

      // Glow
      ctx.globalAlpha = trade.opacity * 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Bubble
      ctx.globalAlpha = trade.opacity * 0.9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Bordure
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = trade.opacity * 0.8;
      ctx.stroke();

      // Label
      if (settings.showTextLabels && radius > 12) {
        ctx.globalAlpha = trade.opacity;
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trade.size.toFixed(0), x, y);
      }
    }

    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CURRENT PRICE
  // ══════════════════════════════════════════════════════════════════════════
  private renderCurrentPrice(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX } = this;

    const bidY = this.priceToY(state.currentBid, priceRange);
    const askY = this.priceToY(state.currentAsk, priceRange);

    // Apply heatmapStartX offset for delta profile panel
    const lineStartX = heatmapStartX;
    const lineEndX = heatmapStartX + heatmapWidth;

    // Ligne bid actuelle
    ctx.strokeStyle = COLORS.bidLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lineStartX, bidY);
    ctx.lineTo(lineEndX, bidY);
    ctx.stroke();

    // Ligne ask actuelle
    ctx.strokeStyle = COLORS.askLine;
    ctx.beginPath();
    ctx.moveTo(lineStartX, askY);
    ctx.lineTo(lineEndX, askY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRICE AXIS
  // ══════════════════════════════════════════════════════════════════════════
  private renderPriceAxis(
    priceRange: { min: number; max: number },
    currentBid: number,
    currentAsk: number,
    hoverPrice?: number
  ): void {
    const { ctx, heatmapWidth, heatmapStartX, priceAxisWidth, volumeProfileWidth, height, tickSize } = this;
    // Price axis starts after heatmap area and volume profile
    const vpWidth = this.showVolumeProfile ? volumeProfileWidth : 0;
    const axisX = heatmapStartX + heatmapWidth + vpWidth;

    // Background
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(axisX, 0, priceAxisWidth, height);

    // Bordure
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX, 0);
    ctx.lineTo(axisX, height);
    ctx.stroke();

    // Labels de prix
    const numLevels = Math.ceil((priceRange.max - priceRange.min) / tickSize);
    const labelInterval = Math.max(1, Math.floor(numLevels / 15));

    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numLevels; i += labelInterval) {
      const price = priceRange.max - i * tickSize;
      const y = (i / numLevels) * height;

      const isBid = Math.abs(price - currentBid) < tickSize * 0.5;
      const isAsk = Math.abs(price - currentAsk) < tickSize * 0.5;
      const isHover = hoverPrice !== undefined && Math.abs(price - hoverPrice) < tickSize * 0.5;

      if (isHover && !isBid && !isAsk) {
        // Prix survolé (ni bid ni ask) - fond ambre
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(axisX + 1, y - 8, priceAxisWidth - 2, 16);
        ctx.fillStyle = '#000';
      } else if (isBid) {
        ctx.fillStyle = COLORS.bidLine;
        ctx.fillRect(axisX + 1, y - 8, priceAxisWidth - 2, 16);
        ctx.fillStyle = '#000';
      } else if (isAsk) {
        ctx.fillStyle = COLORS.askLine;
        ctx.fillRect(axisX + 1, y - 8, priceAxisWidth - 2, 16);
        ctx.fillStyle = '#000';
      } else {
        ctx.fillStyle = COLORS.textSecondary;
      }

      ctx.fillText(price.toFixed(1), axisX + 4, y);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIME & SALES TAPE - Real-time trade flow panel
  // ══════════════════════════════════════════════════════════════════════════
  private renderTimeSales(state: MarketState): void {
    const { ctx, heatmapWidth, heatmapStartX, priceAxisWidth, volumeProfileWidth, timeSalesWidth, height } = this;

    // Calculate panel position (far right, after price axis)
    const vpWidth = this.showVolumeProfile ? volumeProfileWidth : 0;
    const panelX = heatmapStartX + heatmapWidth + vpWidth + priceAxisWidth;

    // Panel background
    ctx.fillStyle = '#08090c';
    ctx.fillRect(panelX, 0, timeSalesWidth, height);

    // Left border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 0.5, 0);
    ctx.lineTo(panelX + 0.5, height);
    ctx.stroke();

    // Header
    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(panelX, 0, timeSalesWidth, 24);

    ctx.fillStyle = '#888';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TIME & SALES', panelX + timeSalesWidth / 2, 12);

    // Column headers
    const headerY = 28;
    ctx.fillStyle = '#555';
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TIME', panelX + 4, headerY);
    ctx.textAlign = 'center';
    ctx.fillText('PRICE', panelX + 60, headerY);
    ctx.textAlign = 'right';
    ctx.fillText('SIZE', panelX + timeSalesWidth - 4, headerY);

    // Header separator
    ctx.strokeStyle = '#1a1e28';
    ctx.beginPath();
    ctx.moveTo(panelX, 34);
    ctx.lineTo(panelX + timeSalesWidth, 34);
    ctx.stroke();

    // Get trades sorted by time (most recent first)
    const trades = [...state.trades].sort((a, b) => b.timestamp - a.timestamp);
    const rowHeight = 16;
    const maxVisibleTrades = Math.floor((height - 40) / rowHeight);
    const visibleTrades = trades.slice(0, maxVisibleTrades);

    // Find max trade size for highlighting
    const maxSize = Math.max(1, ...visibleTrades.map(t => t.size));
    const avgSize = visibleTrades.length > 0
      ? visibleTrades.reduce((sum, t) => sum + t.size, 0) / visibleTrades.length
      : 1;

    // Render each trade
    visibleTrades.forEach((trade, index) => {
      const y = 40 + index * rowHeight;
      const isBuy = trade.side === 'buy';
      const isLarge = trade.size > avgSize * 2;
      const isHuge = trade.size > avgSize * 4;

      // Row background for large trades
      if (isHuge) {
        ctx.fillStyle = isBuy ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 68, 102, 0.15)';
        ctx.fillRect(panelX + 1, y - rowHeight / 2, timeSalesWidth - 2, rowHeight);
      } else if (isLarge) {
        ctx.fillStyle = isBuy ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 68, 102, 0.08)';
        ctx.fillRect(panelX + 1, y - rowHeight / 2, timeSalesWidth - 2, rowHeight);
      }

      // Alternating row background
      if (index % 2 === 0 && !isLarge && !isHuge) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(panelX + 1, y - rowHeight / 2, timeSalesWidth - 2, rowHeight);
      }

      // Time
      const date = new Date(trade.timestamp);
      const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      ctx.fillStyle = '#666';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(timeStr, panelX + 4, y);

      // Price with color
      ctx.fillStyle = isBuy ? '#00ff88' : '#ff4466';
      ctx.font = isLarge ? 'bold 9px Consolas, monospace' : '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(trade.price.toFixed(2), panelX + 68, y);

      // Size with intensity
      const sizeIntensity = Math.min(1, trade.size / maxSize);
      if (isBuy) {
        const g = Math.round(180 + sizeIntensity * 75);
        ctx.fillStyle = `rgb(0, ${g}, 100)`;
      } else {
        const r = Math.round(200 + sizeIntensity * 55);
        ctx.fillStyle = `rgb(${r}, 68, 102)`;
      }
      ctx.font = isLarge ? 'bold 9px Consolas, monospace' : '9px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatTimeSalesSize(trade.size), panelX + timeSalesWidth - 4, y);

      // Side indicator (dot)
      ctx.fillStyle = isBuy ? '#00ff88' : '#ff4466';
      ctx.beginPath();
      ctx.arc(panelX + 50, y, isLarge ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();

      // Fade effect based on opacity
      if (trade.opacity < 1) {
        ctx.fillStyle = `rgba(8, 9, 12, ${1 - trade.opacity})`;
        ctx.fillRect(panelX + 1, y - rowHeight / 2, timeSalesWidth - 2, rowHeight);
      }
    });

    // Summary footer
    const footerY = height - 24;
    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(panelX, footerY, timeSalesWidth, 24);

    // Buy/Sell counts
    const buyCount = trades.filter(t => t.side === 'buy').length;
    const sellCount = trades.filter(t => t.side === 'sell').length;
    const buyVol = trades.filter(t => t.side === 'buy').reduce((sum, t) => sum + t.size, 0);
    const sellVol = trades.filter(t => t.side === 'sell').reduce((sum, t) => sum + t.size, 0);

    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`B:${buyCount}`, panelX + 4, footerY + 10);
    ctx.fillStyle = '#ff4466';
    ctx.fillText(`S:${sellCount}`, panelX + 4, footerY + 20);

    // Volume totals
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(this.formatVolume(buyVol), panelX + timeSalesWidth - 4, footerY + 10);
    ctx.fillStyle = '#ff4466';
    ctx.fillText(this.formatVolume(sellVol), panelX + timeSalesWidth - 4, footerY + 20);
  }

  private formatTimeSalesSize(size: number): string {
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    if (size >= 100) return size.toFixed(0);
    if (size >= 10) return size.toFixed(1);
    return size.toFixed(2);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DOM LADDER - Depth of Market vertical order book view
  // ══════════════════════════════════════════════════════════════════════════
  private renderDOMLadder(state: MarketState, priceRange: { min: number; max: number }): void {
    const { ctx, heatmapWidth, heatmapStartX, priceAxisWidth, volumeProfileWidth, timeSalesWidth, domLadderWidth, height, tickSize } = this;

    // Calculate panel position (far right, after time & sales)
    const vpWidth = this.showVolumeProfile ? volumeProfileWidth : 0;
    const tsWidth = this.showTimeSales ? timeSalesWidth : 0;
    const panelX = heatmapStartX + heatmapWidth + vpWidth + priceAxisWidth + tsWidth;

    // Panel background
    ctx.fillStyle = '#06080a';
    ctx.fillRect(panelX, 0, domLadderWidth, height);

    // Left border
    ctx.strokeStyle = '#1a1e28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 0.5, 0);
    ctx.lineTo(panelX + 0.5, height);
    ctx.stroke();

    // Header
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(panelX, 0, domLadderWidth, 24);

    ctx.fillStyle = '#888';
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DOM LADDER', panelX + domLadderWidth / 2, 12);

    // Column headers
    const headerY = 28;
    ctx.fillStyle = '#555';
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'center';

    const bidColWidth = (domLadderWidth - 50) / 2;
    const askColX = panelX + bidColWidth;
    const priceColX = panelX + bidColWidth;
    const askStartX = panelX + bidColWidth + 50;

    ctx.textAlign = 'left';
    ctx.fillText('BID', panelX + 4, headerY);
    ctx.textAlign = 'center';
    ctx.fillText('PRICE', panelX + domLadderWidth / 2, headerY);
    ctx.textAlign = 'right';
    ctx.fillText('ASK', panelX + domLadderWidth - 4, headerY);

    // Header separator
    ctx.strokeStyle = '#1a1e28';
    ctx.beginPath();
    ctx.moveTo(panelX, 34);
    ctx.lineTo(panelX + domLadderWidth, 34);
    ctx.stroke();

    // Calculate row dimensions
    const startY = 38;
    const availableHeight = height - startY - 30; // Leave room for footer
    const rowHeight = 18;
    const numRows = Math.floor(availableHeight / rowHeight);

    // Get price levels around current price
    const midPrice = state.midPrice;
    const halfRows = Math.floor(numRows / 2);
    const topPrice = this.roundToTick(midPrice + halfRows * tickSize);

    // Find max volume for scaling bars
    let maxBidVol = 1;
    let maxAskVol = 1;
    for (const order of state.bids.values()) {
      maxBidVol = Math.max(maxBidVol, order.displaySize);
    }
    for (const order of state.asks.values()) {
      maxAskVol = Math.max(maxAskVol, order.displaySize);
    }
    const maxVol = Math.max(maxBidVol, maxAskVol);

    // Column widths
    const volBarMaxWidth = (domLadderWidth - 54) / 2;
    const priceCenterX = panelX + domLadderWidth / 2;

    // Track totals
    let totalBidVol = 0;
    let totalAskVol = 0;

    // Render each price level
    for (let i = 0; i < numRows; i++) {
      const price = this.roundToTick(topPrice - i * tickSize);
      const y = startY + i * rowHeight + rowHeight / 2;

      // Get bid/ask at this level
      const bid = state.bids.get(price);
      const ask = state.asks.get(price);
      const bidVol = bid?.displaySize || 0;
      const askVol = ask?.displaySize || 0;

      totalBidVol += bidVol;
      totalAskVol += askVol;

      // Alternating row background
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.fillRect(panelX + 1, y - rowHeight / 2, domLadderWidth - 2, rowHeight);
      }

      // Current price highlight
      const isCurrentBid = Math.abs(price - state.currentBid) < tickSize * 0.5;
      const isCurrentAsk = Math.abs(price - state.currentAsk) < tickSize * 0.5;
      const isSpread = price > state.currentBid && price < state.currentAsk;

      if (isCurrentBid || isCurrentAsk) {
        ctx.fillStyle = isCurrentBid ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 68, 102, 0.15)';
        ctx.fillRect(panelX + 1, y - rowHeight / 2, domLadderWidth - 2, rowHeight);
      }

      // Bid volume bar (grows left from center)
      if (bidVol > 0) {
        const barWidth = (bidVol / maxVol) * volBarMaxWidth;
        const barX = priceCenterX - 27 - barWidth;

        // Bar gradient
        const intensity = bidVol / maxVol;
        const r = Math.round(0 + intensity * 30);
        const g = Math.round(80 + intensity * 130);
        const b = Math.round(120 + intensity * 100);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.fillRect(barX, y - rowHeight / 2 + 2, barWidth, rowHeight - 4);

        // Bid volume text
        ctx.fillStyle = intensity > 0.5 ? '#fff' : '#0af';
        ctx.font = bidVol > maxVol * 0.3 ? 'bold 9px Consolas, monospace' : '9px Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(this.formatDOMVolume(bidVol), priceCenterX - 30, y);
      }

      // Ask volume bar (grows right from center)
      if (askVol > 0) {
        const barWidth = (askVol / maxVol) * volBarMaxWidth;
        const barX = priceCenterX + 27;

        // Bar gradient
        const intensity = askVol / maxVol;
        const r = Math.round(120 + intensity * 100);
        const g = Math.round(30 + intensity * 30);
        const b = Math.round(50 + intensity * 50);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.fillRect(barX, y - rowHeight / 2 + 2, barWidth, rowHeight - 4);

        // Ask volume text
        ctx.fillStyle = intensity > 0.5 ? '#fff' : '#f46';
        ctx.font = askVol > maxVol * 0.3 ? 'bold 9px Consolas, monospace' : '9px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(this.formatDOMVolume(askVol), priceCenterX + 30, y);
      }

      // Price in center
      let priceColor = '#666';
      if (isCurrentBid) priceColor = '#0af';
      else if (isCurrentAsk) priceColor = '#f46';
      else if (isSpread) priceColor = '#444';
      else if (price > state.currentAsk) priceColor = '#a34';
      else if (price < state.currentBid) priceColor = '#0a8';

      ctx.fillStyle = priceColor;
      ctx.font = (isCurrentBid || isCurrentAsk) ? 'bold 9px Consolas, monospace' : '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), priceCenterX, y);

      // Spread marker
      if (isSpread) {
        ctx.fillStyle = '#333';
        ctx.fillText('---', priceCenterX, y);
      }

      // Last trade indicator
      const lastTrade = state.trades[state.trades.length - 1];
      if (lastTrade && Math.abs(lastTrade.price - price) < tickSize * 0.5) {
        ctx.fillStyle = lastTrade.side === 'buy' ? '#0f8' : '#f46';
        ctx.beginPath();
        ctx.arc(priceCenterX + (lastTrade.side === 'buy' ? -20 : 20), y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Footer with totals
    const footerY = height - 28;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(panelX, footerY, domLadderWidth, 28);

    ctx.strokeStyle = '#1a1e28';
    ctx.beginPath();
    ctx.moveTo(panelX, footerY);
    ctx.lineTo(panelX + domLadderWidth, footerY);
    ctx.stroke();

    // Total volumes
    ctx.font = '9px Consolas, monospace';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#0af';
    ctx.textAlign = 'left';
    ctx.fillText(`BID: ${this.formatVolume(totalBidVol)}`, panelX + 4, footerY + 10);

    ctx.fillStyle = '#f46';
    ctx.textAlign = 'right';
    ctx.fillText(`ASK: ${this.formatVolume(totalAskVol)}`, panelX + domLadderWidth - 4, footerY + 10);

    // Spread
    const spread = state.currentAsk - state.currentBid;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText(`Spread: ${spread.toFixed(2)}`, panelX + domLadderWidth / 2, footerY + 20);
  }

  private formatDOMVolume(vol: number): string {
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    if (vol >= 100) return vol.toFixed(0);
    return vol.toFixed(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CROSSHAIR
  // ══════════════════════════════════════════════════════════════════════════
  private renderCrosshair(
    crosshair: { x: number; y: number; price: number },
    priceRange: { min: number; max: number },
    state: MarketState
  ): void {
    const { ctx, heatmapWidth, heatmapStartX, volumeProfileWidth, height } = this;
    const { x, y, price } = crosshair;

    // Ne pas dessiner si hors zone (accounting for delta profile)
    const heatmapEndX = heatmapStartX + heatmapWidth;
    const vpWidth = this.showVolumeProfile ? volumeProfileWidth : 0;
    if (x < heatmapStartX || x > heatmapEndX || y < 0 || y > height) return;

    // Ligne horizontale (prix)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([2, 3]);

    ctx.beginPath();
    ctx.moveTo(heatmapStartX, y);
    ctx.lineTo(heatmapEndX, y);
    ctx.stroke();

    // Ligne verticale (temps)
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.setLineDash([]);

    // Highlight du niveau de prix (bande horizontale subtile)
    const levelHeight = height / ((priceRange.max - priceRange.min) / this.tickSize);
    const levelY = this.priceToY(price, priceRange);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(heatmapStartX, levelY - levelHeight / 2, heatmapWidth, levelHeight);

    // Prix sur l'axe Y (à droite, after volume profile)
    const axisX = heatmapEndX + vpWidth;
    ctx.fillStyle = '#fbbf24'; // Amber
    ctx.fillRect(axisX + 1, y - 10, this.priceAxisWidth - 2, 20);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(price.toFixed(2), axisX + 4, y);

    // Point central
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Cercle externe
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ══════════════════════════════════════════════════════════════════════════
  private priceToY(price: number, priceRange: { min: number; max: number }): number {
    const ratio = (priceRange.max - price) / (priceRange.max - priceRange.min);
    return ratio * this.height;
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  destroy(): void {
    // Cleanup si nécessaire
  }
}
