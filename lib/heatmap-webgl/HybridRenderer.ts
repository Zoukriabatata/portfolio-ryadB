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
import type { DirtyFlags, PassiveOrderData, TradeData } from './types';

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

  // Performance tracking
  private lastRenderTime: number = 0;
  private frameCount: number = 0;

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

      this.useWebGL = true;
      console.log('[HybridRenderer] WebGL initialized successfully');
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
   * Compute simple hash for quick dirty checking
   */
  private computeOrdersHash(orders: PassiveOrderData[]): number {
    if (orders.length === 0) return 0;
    // Simple hash based on first, last, and length
    const first = orders[0];
    const last = orders[orders.length - 1];
    return orders.length * 1000000 +
      Math.round(first.price * 100) +
      Math.round(last.price * 100) * 1000 +
      Math.round(first.intensity * 100);
  }

  private computeTradesHash(trades: TradeData[]): number {
    if (trades.length === 0) return 0;
    const first = trades[0];
    return trades.length * 1000000 +
      Math.round(first.price * 100) +
      Math.round(first.x);
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
  private renderWebGL(data: RenderData, dirty?: DirtyFlags): void {
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
      const horizontalLines = (data.gridHorizontalPrices || []).map((price) => {
        const priceRange = data.priceMax - data.priceMin;
        return pixelHeight - ((price - data.priceMin) / priceRange) * pixelHeight;
      });

      this.linesCommand.renderGrid(
        {
          horizontalLines,
          verticalLines: data.gridVerticalPositions || [],
          color: colors.gridColor || 'rgba(255, 255, 255, 0.05)',
          opacity: 1,
        },
        this.projection,
        pixelWidth,
        pixelHeight
      );
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
        this.linesCommand.renderStaircase(
          {
            bidPoints: this.cachedBidScreenPoints,
            askPoints: this.cachedAskScreenPoints,
            bidColor: colors.bidColor || '#22c55e',
            askColor: colors.askColor || '#ef4444',
            lineWidth: 2,
            opacity: 1,
          },
          this.projection
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
        this.tradesBubblesCommand.render(
          {
            trades: this.cachedTransformedTrades,
            priceMin: data.priceMin,
            priceMax: data.priceMax,
            buyColor: colors.buyColor || '#22c55e',
            sellColor: colors.sellColor || '#ef4444',
            opacity: 0.9,
            maxSize: 50 * dpr!,
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

    // Price axis labels
    const priceLabels = this.generatePriceLabels(
      data.priceMin,
      data.priceMax,
      data.tickSize,
      height!
    );
    this.overlay.renderPriceAxis(priceLabels, width! - priceAxisWidth! / 2);

    // Current price label
    const currentPriceY = this.priceToY(data.currentPrice, data.priceMin, data.priceMax, height!);
    if (currentPriceY >= 0 && currentPriceY <= height!) {
      this.overlay.renderCurrentPriceLabel(
        data.currentPrice,
        currentPriceY,
        width! - priceAxisWidth! + 2
      );
    }

    // Stats bar
    this.overlay.renderStatsBar(
      [
        { label: 'Bid', value: data.priceMin.toFixed(2), color: '#22c55e' },
        { label: 'Ask', value: data.priceMax.toFixed(2), color: '#ef4444' },
        { label: 'Orders', value: data.passiveOrders.length.toString() },
        { label: 'Trades', value: data.trades.length.toString() },
      ],
      height! - 12
    );

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

    // Then textures and context
    this.textureManager?.destroy();
    this.ctx?.destroy();
    this.overlay?.destroy();

    this.heatmapCommand = null;
    this.linesCommand = null;
    this.tradesBubblesCommand = null;
    this.profileBarsCommand = null;
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
