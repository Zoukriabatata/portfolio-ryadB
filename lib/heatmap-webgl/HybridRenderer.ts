/**
 * Hybrid Renderer
 * Coordinates WebGL rendering with Canvas 2D text overlay
 * Falls back to pure Canvas 2D if WebGL unavailable
 */

import { RenderContext } from './core/RenderContext';
import { TextureManager } from './core/TextureManager';
import { Canvas2DOverlay } from './Canvas2DOverlay';
import { HeatmapCommand } from './commands/HeatmapCommand';
import { LinesCommand } from './commands/LinesCommand';
import { TradeBubblesCommand } from './commands/TradeBubblesCommand';
import { ProfileBarsCommand } from './commands/ProfileBarsCommand';
import { KeyLevelsCommand, type KeyLevel } from './commands/KeyLevelsCommand';
import type { DirtyFlags, PassiveOrderData, TradeData } from './types';

// === PERF: Module-level default objects (avoid per-frame allocation) ===
const DEFAULT_GRID_SETTINGS = {
  showMajorGrid: true,
  showMinorGrid: true,
  majorGridInterval: 10,
  majorGridColor: '#ffffff',
  majorGridOpacity: 0.15,
  minorGridColor: '#ffffff',
  minorGridOpacity: 0.05,
  gridStyle: 'solid' as const,
  showTickMarks: true,
  tickSize: 5,
  tickColor: '#6b7280',
  highlightRoundNumbers: true,
  roundNumberInterval: 100,
  highlightColor: '#ffffff',
};

const DEFAULT_PASSIVE_SETTINGS = {
  glowEnabled: true,
  glowIntensity: 0.8,
  pulseEnabled: true,
  pulseSpeed: 2.0,
  showStates: true,
  icebergDetection: true,
};

const DEFAULT_BUBBLE_SETTINGS = {
  showBorder: true,
  borderWidth: 0.08,
  borderColor: 'rgba(255, 255, 255, 0.5)',
  glowEnabled: true,
  glowIntensity: 0.6,
  showGradient: true,
  rippleEnabled: true,
  largeTradeThreshold: 2.0,
  sizeScaling: 'sqrt' as const,
  popInAnimation: true,
  bubbleOpacity: 0.7,
  maxSize: 50,
  minSize: 8,
};

export interface HybridRendererConfig {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  width: number;
  height: number;
  dpr?: number;
  priceAxisWidth?: number;
  deltaProfileWidth?: number;
  volumeProfileWidth?: number;
}

export interface RenderData {
  // Price range
  priceMin: number;
  priceMax: number;
  tickSize: number;
  currentPrice: number;

  // Orderbook data
  passiveOrders: PassiveOrderData[];

  // Trades
  trades: TradeData[];

  // Best bid/ask lines
  bestBidPoints?: { x: number; price: number }[];
  bestAskPoints?: { x: number; price: number }[];

  // Grid settings
  gridHorizontalPrices?: number[];
  gridVerticalPositions?: number[];

  // Grid settings (advanced)
  gridSettings?: {
    showMajorGrid: boolean;
    showMinorGrid: boolean;
    majorGridInterval: number;
    majorGridColor: string;
    majorGridOpacity: number;
    minorGridColor: string;
    minorGridOpacity: number;
    gridStyle: 'solid' | 'dashed' | 'dotted';
    showTickMarks: boolean;
    tickSize: number;
    tickColor: string;
    highlightRoundNumbers: boolean;
    roundNumberInterval: number;
    highlightColor: string;
    // Labels
    labelPrecision?: 'auto' | number;
    // Time axis
    showTimeAxis?: boolean;
    timeFormat?: '12h' | '24h';
    showTimezone?: boolean;
    timezone?: string;
    showSessionMarkers?: boolean;
  };

  // Time data for time axis
  timeLabels?: { time: Date; x: number }[];

  // Passive order settings
  passiveOrderSettings?: {
    glowEnabled: boolean;
    glowIntensity: number;
    pulseEnabled: boolean;
    pulseSpeed: number;
    showStates: boolean;
    icebergDetection: boolean;
  };

  // Crosshair (optional)
  crosshair?: {
    x: number;
    y: number;
    price: number;
    time?: string;
    visible: boolean;
  };

  // Profile bars (optional)
  deltaProfile?: {
    bars: { price: number; bidValue: number; askValue: number }[];
    maxValue: number;
  };
  volumeProfile?: {
    bars: { price: number; bidValue: number; askValue: number }[];
    maxValue: number;
  };

  // Staircase line settings (optional)
  staircaseSettings?: {
    lineWidth: number;
    showGlow: boolean;
    glowIntensity: number;
    showSpreadFill: boolean;
    spreadFillOpacity: number;
    showTrail: boolean;
    trailLength: number;
    trailFadeSpeed: number;
  };

  // Trade bubble settings (optional)
  tradeBubbleSettings?: {
    showBorder: boolean;
    borderWidth: number;
    borderColor: string;
    glowEnabled: boolean;
    glowIntensity: number;
    showGradient: boolean;
    rippleEnabled: boolean;
    largeTradeThreshold: number;
    sizeScaling: 'sqrt' | 'linear' | 'log';
    popInAnimation: boolean;
    bubbleOpacity: number;
    maxSize: number;
    minSize: number;
  };

  // Key levels (POC, VAH/VAL, VWAP, etc.)
  keyLevels?: {
    levels: KeyLevel[];
    settings: {
      pocColor?: string;
      vahColor?: string;
      valColor?: string;
      vwapColor?: string;
      sessionHighColor?: string;
      sessionLowColor?: string;
      roundNumberColor?: string;
      vwapBand1Color?: string;
      vwapBand2Color?: string;
      opacity?: number;
    };
  };

  // Imbalance markers
  imbalanceMarkers?: {
    price: number;
    direction: 'bullish' | 'bearish';
    ratio: number;
    isStrong: boolean;
  }[];

  // CVD (Cumulative Volume Delta) panel data
  cvdData?: {
    points: { time: number; delta: number }[];
  };

  // Absorption alerts
  absorptionAlerts?: {
    price: number;
    volume: number;
    side: 'bid' | 'ask';
    timestamp: number;
    age: number; // 0-1 normalized age for fade-out
  }[];

  // Settings
  contrast: number;
  upperCutoff: number;
  opacity?: number;

  // Colors
  colors?: {
    bidColor?: string;
    askColor?: string;
    buyColor?: string;
    sellColor?: string;
    gridColor?: string;
  };

  // Dirty flags (optional - for optimization)
  dirty?: Partial<DirtyFlags>;
}

export class HybridRenderer {
  private config: HybridRendererConfig;
  private ctx: RenderContext | null = null;
  private textureManager: TextureManager | null = null;
  private overlay: Canvas2DOverlay | null = null;
  private useWebGL: boolean = false;
  private _isInitialized: boolean = false;

  // Cached projection matrix
  private projection: number[] = [];

  // WebGL commands
  private heatmapCommand: HeatmapCommand | null = null;
  private linesCommand: LinesCommand | null = null;
  private tradesBubblesCommand: TradeBubblesCommand | null = null;
  private profileBarsCommand: ProfileBarsCommand | null = null;
  private keyLevelsCommand: KeyLevelsCommand | null = null;

  // Performance tracking
  private lastRenderTime: number = 0;
  private frameCount: number = 0;

  // Animation tracking (for trail effect)
  private animationStartTime: number = performance.now();
  private animationTime: number = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRTY FLAGS & DATA CACHING
  // ═══════════════════════════════════════════════════════════════════════════
  private lastPriceRange: { min: number; max: number } | null = null;
  private lastOrdersHash: number = 0;
  private lastTradesHash: number = 0;
  private lastBidPointsLength: number = 0;
  private lastAskPointsLength: number = 0;
  private lastContrast: number = 0;
  private lastUpperCutoff: number = 0;

  // Profile dirty tracking
  private lastDeltaProfileHash: number = 0;
  private lastVolumeProfileHash: number = 0;

  // Cached transformed data (avoid re-transforming every frame)
  private cachedTransformedOrders: PassiveOrderData[] = [];
  private cachedTransformedTrades: TradeData[] = [];
  private cachedBidScreenPoints: { x: number; y: number }[] = [];
  private cachedAskScreenPoints: { x: number; y: number }[] = [];

  // Cached profile data
  private cachedDeltaProfileBars: { price: number; bidValue: number; askValue: number }[] = [];
  private cachedVolumeProfileBars: { price: number; bidValue: number; askValue: number }[] = [];

  // PERF: Cached grid line arrays (only recompute on grid data change)
  private cachedGridHPrices: number[] | undefined = undefined;
  private cachedGridVPositions: number[] | undefined = undefined;
  private cachedFilteredHorizontal: { position: number; isMajor: boolean }[] = [];
  private cachedFilteredVertical: { position: number; isMajor: boolean }[] = [];
  private cachedTicks: { y: number; isHighlight: boolean }[] = [];

  // PERF: Cached overlay transform data
  private lastOverlayKeyLevelsRef: KeyLevel[] | null = null;
  private lastOverlayPriceMin: number = 0;
  private lastOverlayPriceMax: number = 0;
  private cachedOverlayLevels: { price: number; y: number; type: string; label: string; color: string }[] = [];
  private cachedStatsItems: { label: string; value: string; color?: string }[] = [];

  constructor(config: HybridRendererConfig) {
    this.config = {
      dpr: window.devicePixelRatio || 1,
      priceAxisWidth: 60,
      deltaProfileWidth: 80,
      volumeProfileWidth: 60,
      ...config,
    };

    this.init();
  }

  private init(): void {
    const { canvas, container, width, height, dpr } = this.config;

    // Try to create WebGL context
    try {
      this.ctx = new RenderContext(canvas);
      this.ctx.resize(width, height, dpr!);
      this.textureManager = new TextureManager(this.ctx);

      // Create gradient textures
      this.textureManager.createBidGradient();
      this.textureManager.createAskGradient();

      // Update projection
      this.projection = this.ctx.createProjection(width * dpr!, height * dpr!);

      // Create render commands
      this.heatmapCommand = new HeatmapCommand(this.ctx, this.textureManager);
      this.linesCommand = new LinesCommand(this.ctx);
      this.tradesBubblesCommand = new TradeBubblesCommand(this.ctx);
      this.profileBarsCommand = new ProfileBarsCommand(this.ctx);
      this.keyLevelsCommand = new KeyLevelsCommand(this.ctx);

      this.useWebGL = true;
      console.debug('[HybridRenderer] WebGL initialized successfully');
    } catch (e) {
      console.warn('[HybridRenderer] WebGL not available, will use Canvas 2D fallback:', e);
      this.useWebGL = false;
    }

    // Create text overlay (always used)
    this.overlay = new Canvas2DOverlay({
      width,
      height,
      dpr: dpr!,
      priceAxisWidth: this.config.priceAxisWidth!,
      deltaProfileWidth: this.config.deltaProfileWidth!,
      font: 'Consolas, Monaco, monospace',
      fontSize: 11,
    });

    // Append overlay to container
    container.appendChild(this.overlay.element);

    this._isInitialized = true;
  }

  get isWebGL(): boolean {
    return this.useWebGL;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Set the color theme
   */
  setTheme(themeName: 'atas' | 'bookmap' | 'sierra' | 'highcontrast'): void {
    if (this.textureManager) {
      this.textureManager.setTheme(themeName);
    }
  }

  /**
   * Get current theme
   */
  getTheme(): string {
    return this.textureManager?.getTheme() || 'senzoukria';
  }

  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    const { dpr } = this.config;
    this.config.width = width;
    this.config.height = height;

    if (this.ctx) {
      this.ctx.resize(width, height, dpr!);
      this.projection = this.ctx.createProjection(width * dpr!, height * dpr!);
    }

    if (this.overlay) {
      this.overlay.resize(width, height, dpr!);
    }
  }

  /**
   * Compute hash for dirty checking - samples multiple points for better detection
   */
  private computeOrdersHash(orders: PassiveOrderData[]): number {
    if (orders.length === 0) return 0;
    const first = orders[0];
    const last = orders[orders.length - 1];
    // Sample middle element too to detect mid-array changes
    const midIdx = Math.floor(orders.length / 2);
    const mid = orders[midIdx];
    return orders.length * 10000000 +
      Math.round(first.price * 100) +
      Math.round(last.price * 100) * 1000 +
      Math.round(first.intensity * 100) * 10 +
      Math.round(mid.price * 100) * 100 +
      Math.round(mid.intensity * 100);
  }

  private computeTradesHash(trades: TradeData[]): number {
    if (trades.length === 0) return 0;
    const first = trades[0];
    const last = trades[trades.length - 1];
    return trades.length * 10000000 +
      Math.round(first.price * 100) +
      Math.round(first.x) * 100 +
      Math.round(last.price * 100) * 1000 +
      Math.round(last.x);
  }

  private computeProfileHash(bars: { price: number; bidValue: number; askValue: number }[] | undefined): number {
    if (!bars || bars.length === 0) return 0;
    const first = bars[0];
    const last = bars[bars.length - 1];
    return bars.length * 1000000 +
      Math.round((first.bidValue + first.askValue) * 10) +
      Math.round((last.bidValue + last.askValue) * 10) * 100;
  }

  /**
   * Check what data has changed and compute dirty flags
   */
  private computeDirtyFlags(data: RenderData): DirtyFlags {
    const ordersHash = this.computeOrdersHash(data.passiveOrders);
    const tradesHash = this.computeTradesHash(data.trades);
    const deltaProfileHash = this.computeProfileHash(data.deltaProfile?.bars);
    const volumeProfileHash = this.computeProfileHash(data.volumeProfile?.bars);

    const priceRangeChanged = data.priceMin !== this.lastPriceRange?.min ||
      data.priceMax !== this.lastPriceRange?.max;

    const dirty: DirtyFlags = {
      heatmap: ordersHash !== this.lastOrdersHash ||
        priceRangeChanged ||
        data.contrast !== this.lastContrast ||
        data.upperCutoff !== this.lastUpperCutoff,
      trades: tradesHash !== this.lastTradesHash,
      lines: (data.bestBidPoints?.length || 0) !== this.lastBidPointsLength ||
        (data.bestAskPoints?.length || 0) !== this.lastAskPointsLength ||
        priceRangeChanged,
      priceRange: priceRangeChanged,
      settings: data.contrast !== this.lastContrast ||
        data.upperCutoff !== this.lastUpperCutoff,
      deltaProfile: deltaProfileHash !== this.lastDeltaProfileHash || priceRangeChanged,
      volumeProfile: volumeProfileHash !== this.lastVolumeProfileHash || priceRangeChanged,
    };

    // Update cached values
    this.lastOrdersHash = ordersHash;
    this.lastTradesHash = tradesHash;
    this.lastDeltaProfileHash = deltaProfileHash;
    this.lastVolumeProfileHash = volumeProfileHash;
    this.lastPriceRange = { min: data.priceMin, max: data.priceMax };
    this.lastBidPointsLength = data.bestBidPoints?.length || 0;
    this.lastAskPointsLength = data.bestAskPoints?.length || 0;
    this.lastContrast = data.contrast;
    this.lastUpperCutoff = data.upperCutoff;

    return dirty;
  }

  /**
   * Main render method
   */
  render(data: RenderData): void {
    if (!this._isInitialized) return;

    // Compute dirty flags for optimization
    const dirty = data.dirty || this.computeDirtyFlags(data);

    if (this.useWebGL && this.ctx) {
      try {
        this.renderWebGL(data, dirty);
      } catch (e) {
        console.error('[HybridRenderer] WebGL render error:', e);
      }
    }

    // Always render text overlay (lightweight)
    this.renderOverlay(data);
  }

  /**
   * WebGL rendering with dirty flag optimization
   */
  private renderWebGL(data: RenderData, dirty?: Partial<DirtyFlags>): void {
    if (!this.ctx) return;

    const { width, height, dpr, deltaProfileWidth, priceAxisWidth } = this.config;
    const pixelWidth = width! * dpr!;
    const pixelHeight = height! * dpr!;

    // Always clear (required for transparency)
    this.ctx.clear([0.039, 0.047, 0.063, 1]); // #0a0c10

    const colors = data.colors || {};
    const heatmapLeft = (deltaProfileWidth || 0) * dpr!;
    const heatmapRight = pixelWidth - (priceAxisWidth || 0) * dpr!;

    // Default: render everything if no dirty flags
    const shouldRenderGrid = !dirty || dirty.priceRange;
    const shouldRenderHeatmap = !dirty || dirty.heatmap;
    const shouldRenderLines = !dirty || dirty.lines;
    const shouldRenderTrades = !dirty || dirty.trades;

    // 1. Render grid lines (only if price range changed)
    if (shouldRenderGrid && this.linesCommand && (data.gridHorizontalPrices || data.gridVerticalPositions)) {
      const priceRange = data.priceMax - data.priceMin;

      // Get grid settings (with defaults)
      const gridSettings = data.gridSettings || DEFAULT_GRID_SETTINGS;

      // PERF: Only recompute grid lines when source data changes
      const gridDataChanged = data.gridHorizontalPrices !== this.cachedGridHPrices ||
        data.gridVerticalPositions !== this.cachedGridVPositions;

      if (gridDataChanged) {
        this.cachedGridHPrices = data.gridHorizontalPrices;
        this.cachedGridVPositions = data.gridVerticalPositions;

        const horizontalLines = (data.gridHorizontalPrices || []).map((price, index) => {
          const y = pixelHeight - ((price - data.priceMin) / priceRange) * pixelHeight;
          const isMajor = index % gridSettings.majorGridInterval === 0 ||
            (gridSettings.highlightRoundNumbers && price % gridSettings.roundNumberInterval === 0);
          return { position: y, isMajor };
        });

        const verticalLines = (data.gridVerticalPositions || []).map((x, index) => ({
          position: x * dpr!,
          isMajor: index % gridSettings.majorGridInterval === 0,
        }));

        this.cachedFilteredHorizontal = horizontalLines.filter((line) =>
          line.isMajor ? gridSettings.showMajorGrid : gridSettings.showMinorGrid
        );
        this.cachedFilteredVertical = verticalLines.filter((line) =>
          line.isMajor ? gridSettings.showMajorGrid : gridSettings.showMinorGrid
        );

        if (gridSettings.showTickMarks) {
          this.cachedTicks = (data.gridHorizontalPrices || []).map((price) => {
            const y = pixelHeight - ((price - data.priceMin) / priceRange) * pixelHeight;
            const isHighlight = gridSettings.highlightRoundNumbers &&
              price % gridSettings.roundNumberInterval === 0;
            return { y, isHighlight };
          });
        }
      }

      if (this.cachedFilteredHorizontal.length > 0 || this.cachedFilteredVertical.length > 0) {
        this.linesCommand.renderGrid(
          {
            horizontalLines: this.cachedFilteredHorizontal,
            verticalLines: this.cachedFilteredVertical,
            majorColor: gridSettings.majorGridColor,
            minorColor: gridSettings.minorGridColor,
            majorOpacity: gridSettings.majorGridOpacity,
            minorOpacity: gridSettings.minorGridOpacity,
            gridStyle: gridSettings.gridStyle,
          },
          this.projection,
          pixelWidth,
          pixelHeight
        );
      }

      // Render tick marks on price axis
      if (gridSettings.showTickMarks && this.cachedTicks.length > 0) {
        this.linesCommand.renderTickMarks(
          {
            ticks: this.cachedTicks,
            x: heatmapRight,
            tickSize: gridSettings.tickSize * dpr!,
            normalColor: gridSettings.tickColor,
            highlightColor: gridSettings.highlightColor,
            opacity: 0.8,
          },
          this.projection
        );
      }
    }

    // 2. Render heatmap cells
    if (this.heatmapCommand && data.passiveOrders.length > 0) {
      const cellHeight = pixelHeight / ((data.priceMax - data.priceMin) / data.tickSize);

      // Only re-transform if heatmap data changed
      if (shouldRenderHeatmap) {
        this.cachedTransformedOrders = data.passiveOrders.map((order) => ({
          ...order,
          x: order.x * dpr!,
          size: order.size * dpr!,
        }));
      }

      // Get passive order settings (with defaults)
      const passiveSettings = data.passiveOrderSettings || DEFAULT_PASSIVE_SETTINGS;

      if (this.cachedTransformedOrders.length > 0) {
        this.heatmapCommand.render(
          {
            orders: this.cachedTransformedOrders,
            priceMin: data.priceMin,
            priceMax: data.priceMax,
            cellHeight: Math.max(1, cellHeight),
            contrast: data.contrast,
            upperCutoff: data.upperCutoff,
            opacity: data.opacity ?? 0.8,
            baseX: heatmapLeft,
            // Enhanced passive order settings
            glowEnabled: passiveSettings.glowEnabled,
            glowIntensity: passiveSettings.glowIntensity,
            animationTime: this.animationTime * passiveSettings.pulseSpeed,
          },
          this.projection,
          [pixelWidth, pixelHeight]
        );
      }
    }

    // 3. Render best bid/ask staircase lines
    if (this.linesCommand && (data.bestBidPoints || data.bestAskPoints)) {
      const priceRange = data.priceMax - data.priceMin;

      // Only re-transform if lines data changed
      if (shouldRenderLines) {
        const toScreenPoints = (points: { x: number; price: number }[] | undefined) =>
          (points || []).map((p) => ({
            x: p.x * dpr!,
            y: pixelHeight - ((p.price - data.priceMin) / priceRange) * pixelHeight,
          }));

        this.cachedBidScreenPoints = toScreenPoints(data.bestBidPoints);
        this.cachedAskScreenPoints = toScreenPoints(data.bestAskPoints);
      }

      if (this.cachedBidScreenPoints.length > 0 || this.cachedAskScreenPoints.length > 0) {
        // Use staircase settings from data or defaults
        const staircaseSettings = data.staircaseSettings || {
          lineWidth: 3,
          showGlow: true,
          glowIntensity: 0.7,
          showSpreadFill: true,
          spreadFillOpacity: 0.15,
          showTrail: false,
          trailLength: 2,
          trailFadeSpeed: 1.0,
        };

        // Update animation time for trail effect (cycling 0-1 over trailLength seconds)
        const now = performance.now();
        const elapsed = (now - this.animationStartTime) / 1000; // seconds
        const trailCycleDuration = staircaseSettings.trailLength || 2;
        this.animationTime = (elapsed / trailCycleDuration) % 1.0;

        this.linesCommand.renderStaircase(
          {
            bidPoints: this.cachedBidScreenPoints,
            askPoints: this.cachedAskScreenPoints,
            bidColor: colors.bidColor || '#10b981', // Emerald green
            askColor: colors.askColor || '#f43f5e', // Rose red
            lineWidth: staircaseSettings.lineWidth * dpr!, // Line width with DPR scaling
            opacity: 0.95,
            glowIntensity: staircaseSettings.showGlow ? staircaseSettings.glowIntensity : 0,
            showFill: staircaseSettings.showSpreadFill,
            // Trail animation parameters
            showTrail: staircaseSettings.showTrail,
            trailFadeSpeed: staircaseSettings.trailFadeSpeed,
            animationTime: this.animationTime,
          },
          this.projection,
          pixelWidth // Pass viewport width for fill area shader
        );
      }
    }

    // 4. Render trade bubbles
    if (this.tradesBubblesCommand && data.trades.length > 0) {
      // Only re-transform if trades data changed
      if (shouldRenderTrades) {
        this.cachedTransformedTrades = data.trades.map((trade) => ({
          ...trade,
          x: trade.x * dpr!,
          size: trade.size * dpr!,
        }));
      }

      if (this.cachedTransformedTrades.length > 0) {
        // Get trade bubble settings (with defaults)
        const bubbleSettings = data.tradeBubbleSettings || DEFAULT_BUBBLE_SETTINGS;

        this.tradesBubblesCommand.render(
          {
            trades: this.cachedTransformedTrades,
            priceMin: data.priceMin,
            priceMax: data.priceMax,
            buyColor: colors.buyColor || '#22c55e',
            sellColor: colors.sellColor || '#ef4444',
            opacity: bubbleSettings.bubbleOpacity,
            maxSize: bubbleSettings.maxSize * dpr!,
            minSize: bubbleSettings.minSize * dpr!,
            showBorder: bubbleSettings.showBorder,
            borderWidth: bubbleSettings.borderWidth,
            borderColor: bubbleSettings.borderColor,
            glowEnabled: bubbleSettings.glowEnabled,
            glowIntensity: bubbleSettings.glowIntensity,
            showGradient: bubbleSettings.showGradient,
            rippleEnabled: bubbleSettings.rippleEnabled,
            largeTradeThreshold: bubbleSettings.largeTradeThreshold,
            sizeScaling: bubbleSettings.sizeScaling,
            animationTime: this.animationTime,
          },
          this.projection,
          pixelHeight
        );
      }
    }

    // 5. Render delta profile (left side) - with dirty flag optimization
    const shouldRenderDeltaProfile = dirty?.deltaProfile !== false;
    if (this.profileBarsCommand && data.deltaProfile && data.deltaProfile.bars.length > 0) {
      // Cache bars if data changed
      if (shouldRenderDeltaProfile) {
        this.cachedDeltaProfileBars = data.deltaProfile.bars;
      }

      if (this.cachedDeltaProfileBars.length > 0) {
        this.profileBarsCommand.render(
          {
            bars: this.cachedDeltaProfileBars,
            priceMin: data.priceMin,
            priceMax: data.priceMax,
            maxValue: data.deltaProfile.maxValue,
            baseX: 4 * dpr!, // Small padding from edge
            maxWidth: heatmapLeft - 8 * dpr!, // Leave padding on both sides
            bidColor: colors.bidColor || '#10b981', // Emerald green (more vibrant)
            askColor: colors.askColor || '#f43f5e', // Rose red (more vibrant)
            opacity: 0.85,
            side: 'left',
          },
          this.projection,
          pixelHeight
        );
      }
    }

    // 6. Render volume profile (right side) - with dirty flag optimization
    const shouldRenderVolumeProfile = dirty?.volumeProfile !== false;
    if (this.profileBarsCommand && data.volumeProfile && data.volumeProfile.bars.length > 0) {
      // Cache bars if data changed
      if (shouldRenderVolumeProfile) {
        this.cachedVolumeProfileBars = data.volumeProfile.bars;
      }

      if (this.cachedVolumeProfileBars.length > 0) {
        const volumeProfileX = heatmapRight + 4 * dpr!; // Small padding
        const volumeProfileWidth = (priceAxisWidth || 60) * dpr! - 8 * dpr!;

        this.profileBarsCommand.render(
          {
            bars: this.cachedVolumeProfileBars,
            priceMin: data.priceMin,
            priceMax: data.priceMax,
            maxValue: data.volumeProfile.maxValue,
            baseX: volumeProfileX,
            maxWidth: volumeProfileWidth * 0.75, // Leave space for price labels
            bidColor: colors.bidColor || '#10b981',
            askColor: colors.askColor || '#f43f5e',
            opacity: 0.75,
            side: 'right',
          },
          this.projection,
          pixelHeight
        );
      }
    }

    // 7. Render key levels (POC, VAH/VAL, VWAP, etc.)
    if (this.keyLevelsCommand && data.keyLevels && data.keyLevels.levels.length > 0) {
      const levelSettings = data.keyLevels.settings || {};

      this.keyLevelsCommand.render(
        {
          levels: data.keyLevels.levels,
          priceMin: data.priceMin,
          priceMax: data.priceMax,
          viewportWidth: pixelWidth,
          viewportHeight: pixelHeight,
          leftMargin: heatmapLeft,
          rightMargin: (priceAxisWidth || 60) * dpr!,
          opacity: levelSettings.opacity ?? 0.8,
          pocColor: levelSettings.pocColor || '#f59e0b',
          vahColor: levelSettings.vahColor || '#8b5cf6',
          valColor: levelSettings.valColor || '#8b5cf6',
          vwapColor: levelSettings.vwapColor || '#06b6d4',
          sessionHighColor: levelSettings.sessionHighColor || '#22d3ee',
          sessionLowColor: levelSettings.sessionLowColor || '#fb7185',
          roundNumberColor: levelSettings.roundNumberColor || '#fbbf24',
          vwapBand1Color: levelSettings.vwapBand1Color || levelSettings.vwapColor || '#06b6d4',
          vwapBand2Color: levelSettings.vwapBand2Color || levelSettings.vwapColor || '#06b6d4',
          dashPhase: this.animationTime * 20, // Animated dash for certain lines
        },
        this.projection
      );
    }

    // Track performance
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastRenderTime > 1000) {
      if (this.frameCount > 0) {
        console.debug(`[HybridRenderer] FPS: ${this.frameCount}`);
      }
      this.frameCount = 0;
      this.lastRenderTime = now;
    }
  }

  /**
   * Render text overlay
   */
  private renderOverlay(data: RenderData): void {
    if (!this.overlay) return;

    const { width, height, priceAxisWidth, deltaProfileWidth } = this.config;

    this.overlay.clear();

    // Update label options from grid settings
    const gridSettings = data.gridSettings;
    if (gridSettings) {
      this.overlay.setLabelOptions({
        precision: gridSettings.labelPrecision ?? 'auto',
        tickSize: data.tickSize,
        highlightRoundNumbers: gridSettings.highlightRoundNumbers ?? true,
        roundNumberInterval: gridSettings.roundNumberInterval ?? 100,
        timeFormat: gridSettings.timeFormat ?? '24h',
        showTimezone: gridSettings.showTimezone ?? false,
        timezone: gridSettings.timezone ?? 'local',
      });
    } else {
      // Default options
      this.overlay.setLabelOptions({
        precision: 'auto',
        tickSize: data.tickSize,
        highlightRoundNumbers: true,
        roundNumberInterval: 100,
        timeFormat: '24h',
        showTimezone: false,
        timezone: 'local',
      });
    }

    // Price axis labels
    const priceLabels = this.generatePriceLabels(
      data.priceMin,
      data.priceMax,
      data.tickSize,
      height!
    );
    this.overlay.renderPriceAxis(priceLabels, width! - priceAxisWidth! / 2);

    // Time axis (if enabled and time labels provided)
    const showTimeAxis = gridSettings?.showTimeAxis ?? true;
    if (showTimeAxis && data.timeLabels && data.timeLabels.length > 0) {
      const timeLabels = data.timeLabels.map(t => ({
        time: this.overlay!.formatTime(t.time),
        x: t.x,
      }));
      this.overlay.renderTimeAxis(timeLabels, height! - 20);
    }

    // Current price label
    const currentPriceY = this.priceToY(data.currentPrice, data.priceMin, data.priceMax, height!);
    if (currentPriceY >= 0 && currentPriceY <= height!) {
      this.overlay.renderCurrentPriceLabel(
        data.currentPrice,
        currentPriceY,
        width! - priceAxisWidth! + 2
      );
    }

    // Key level text labels (complement WebGL lines with readable labels)
    if (data.keyLevels && data.keyLevels.levels.length > 0) {
      const priceAxisX = width! - priceAxisWidth!;
      // PERF: Only recompute when key levels source or price range changes
      const levelsChanged = data.keyLevels.levels !== this.lastOverlayKeyLevelsRef ||
        data.priceMin !== this.lastOverlayPriceMin ||
        data.priceMax !== this.lastOverlayPriceMax;

      if (levelsChanged) {
        this.lastOverlayKeyLevelsRef = data.keyLevels.levels;
        this.lastOverlayPriceMin = data.priceMin;
        this.lastOverlayPriceMax = data.priceMax;
        const levelSettings = data.keyLevels.settings || {};
        const levelColorMap: Record<string, string> = {
          poc: levelSettings.pocColor || '#f59e0b',
          vah: levelSettings.vahColor || '#8b5cf6',
          val: levelSettings.valColor || '#8b5cf6',
          vwap: levelSettings.vwapColor || '#06b6d4',
          sessionHigh: levelSettings.sessionHighColor || '#22d3ee',
          sessionLow: levelSettings.sessionLowColor || '#fb7185',
          roundNumber: levelSettings.roundNumberColor || '#fbbf24',
          vwapBand1: levelSettings.vwapBand1Color || levelSettings.vwapColor || '#06b6d4',
          vwapBand2: levelSettings.vwapBand2Color || levelSettings.vwapColor || '#06b6d4',
        };
        this.cachedOverlayLevels = data.keyLevels.levels
          .filter(l => l.price >= data.priceMin && l.price <= data.priceMax)
          .map(l => ({
            price: l.price,
            y: this.priceToY(l.price, data.priceMin, data.priceMax, height!),
            type: l.type,
            label: l.label || l.type.toUpperCase(),
            color: levelColorMap[l.type] || '#ffffff',
          }));
      }
      if (this.cachedOverlayLevels.length > 0) {
        this.overlay.renderKeyLevelLabels(this.cachedOverlayLevels, priceAxisX);
      }
    }

    // Stats bar - show current price, spread, and counts
    const lastBidPrice = data.bestBidPoints?.length ? data.bestBidPoints[data.bestBidPoints.length - 1].price : 0;
    const lastAskPrice = data.bestAskPoints?.length ? data.bestAskPoints[data.bestAskPoints.length - 1].price : 0;
    const spread = lastAskPrice > 0 && lastBidPrice > 0 ? lastAskPrice - lastBidPrice : 0;
    const statsItems: { label: string; value: string; color?: string }[] = [];
    if (lastBidPrice > 0) statsItems.push({ label: 'Bid', value: this.overlay.formatPrice(lastBidPrice), color: '#22c55e' });
    if (lastAskPrice > 0) statsItems.push({ label: 'Ask', value: this.overlay.formatPrice(lastAskPrice), color: '#ef4444' });
    if (spread > 0) statsItems.push({ label: 'Spread', value: this.overlay.formatPrice(spread) });
    statsItems.push({ label: 'Orders', value: data.passiveOrders.length.toString() });
    statsItems.push({ label: 'Trades', value: data.trades.length.toString() });
    this.overlay.renderStatsBar(statsItems, height! - 12);

    // Imbalance markers (triangles at price levels)
    if (data.imbalanceMarkers && data.imbalanceMarkers.length > 0) {
      const imbalanceLevels = data.imbalanceMarkers
        .filter(m => m.price >= data.priceMin && m.price <= data.priceMax)
        .map(m => ({
          ...m,
          y: this.priceToY(m.price, data.priceMin, data.priceMax, height!),
        }));
      if (imbalanceLevels.length > 0) {
        this.overlay.renderImbalanceMarkers(imbalanceLevels, deltaProfileWidth!);
      }
    }

    // CVD panel (bottom of chart)
    if (data.cvdData && data.cvdData.points.length > 0) {
      const panelHeight = 60;
      const panelY = height! - panelHeight - 20; // Above stats bar
      this.overlay.renderCVDPanel(
        data.cvdData.points,
        panelY,
        panelHeight,
        width! - priceAxisWidth! - deltaProfileWidth!,
        deltaProfileWidth!
      );
    }

    // Absorption alerts (badges at price levels)
    if (data.absorptionAlerts && data.absorptionAlerts.length > 0) {
      const alertLevels = data.absorptionAlerts
        .filter(a => a.price >= data.priceMin && a.price <= data.priceMax)
        .map(a => ({
          ...a,
          y: this.priceToY(a.price, data.priceMin, data.priceMax, height!),
        }));
      if (alertLevels.length > 0) {
        this.overlay.renderAbsorptionAlerts(alertLevels, width! - priceAxisWidth!);
      }
    }

    // Crosshair (if visible)
    if (data.crosshair?.visible) {
      const priceAxisX = width! - priceAxisWidth!;
      this.overlay.renderCrosshair(
        data.crosshair.x,
        data.crosshair.y,
        data.crosshair.price,
        data.crosshair.time || '',
        priceAxisX
      );
    }
  }

  /**
   * Generate price labels for the axis
   */
  private generatePriceLabels(
    priceMin: number,
    priceMax: number,
    tickSize: number,
    height: number
  ): { price: number; y: number; highlight?: boolean }[] {
    const labels: { price: number; y: number; highlight?: boolean }[] = [];
    const range = priceMax - priceMin;

    // Determine step (show ~10-15 labels)
    const targetLabels = 12;
    const rawStep = range / targetLabels;
    const step = Math.ceil(rawStep / tickSize) * tickSize;

    const startPrice = Math.ceil(priceMin / step) * step;

    for (let price = startPrice; price <= priceMax; price += step) {
      const y = this.priceToY(price, priceMin, priceMax, height);
      const isRound = price % (step * 5) === 0;
      labels.push({ price, y, highlight: isRound });
    }

    return labels;
  }

  /**
   * Convert price to Y coordinate
   */
  private priceToY(
    price: number,
    priceMin: number,
    priceMax: number,
    height: number
  ): number {
    const range = priceMax - priceMin;
    if (range === 0) return height / 2;
    return height - ((price - priceMin) / range) * height;
  }

  /**
   * Check if WebGL context is still valid
   */
  isContextLost(): boolean {
    return this.ctx?.isContextLost() ?? true;
  }

  /**
   * Destroy the renderer and release resources
   */
  destroy(): void {
    // Destroy commands first
    this.heatmapCommand?.destroy();
    this.linesCommand?.destroy();
    this.tradesBubblesCommand?.destroy();
    this.profileBarsCommand?.destroy();
    this.keyLevelsCommand?.destroy();

    // Then textures and context
    this.textureManager?.destroy();
    this.ctx?.destroy();
    this.overlay?.destroy();

    this.heatmapCommand = null;
    this.linesCommand = null;
    this.tradesBubblesCommand = null;
    this.profileBarsCommand = null;
    this.keyLevelsCommand = null;
    this.ctx = null;
    this.textureManager = null;
    this.overlay = null;
    this._isInitialized = false;
  }

  /**
   * Get performance stats
   */
  getStats(): { fps: number; webgl: boolean; orders: number } {
    return {
      fps: this.frameCount,
      webgl: this.useWebGL,
      orders: 0,
    };
  }
}
