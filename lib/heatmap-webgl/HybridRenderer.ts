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

  // Previous render state for dirty checking
  private lastRenderTime: number = 0;
  private frameCount: number = 0;

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
   * Main render method
   */
  render(data: RenderData): void {
    if (!this._isInitialized) return;

    if (this.useWebGL && this.ctx) {
      try {
        this.renderWebGL(data);
      } catch (e) {
        console.error('[HybridRenderer] WebGL render error:', e);
        // Could fall back to Canvas 2D here
      }
    } else {
      // Canvas 2D fallback (TODO: implement in Phase 2 if needed)
      console.warn('[HybridRenderer] Canvas 2D fallback not yet implemented');
    }

    // Always render text overlay
    this.renderOverlay(data);
  }

  /**
   * WebGL rendering
   */
  private renderWebGL(data: RenderData): void {
    if (!this.ctx) return;

    const { width, height, dpr, deltaProfileWidth, priceAxisWidth } = this.config;
    const pixelWidth = width! * dpr!;
    const pixelHeight = height! * dpr!;

    // Clear canvas with dark background
    this.ctx.clear([0.039, 0.047, 0.063, 1]); // #0a0c10

    const colors = data.colors || {};
    const heatmapLeft = (deltaProfileWidth || 0) * dpr!;
    const heatmapRight = pixelWidth - (priceAxisWidth || 0) * dpr!;
    const heatmapWidth = heatmapRight - heatmapLeft;

    // 1. Render grid lines
    if (this.linesCommand && (data.gridHorizontalPrices || data.gridVerticalPositions)) {
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

      this.heatmapCommand.render(
        {
          orders: data.passiveOrders,
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

    // 3. Render best bid/ask staircase lines
    if (this.linesCommand && (data.bestBidPoints || data.bestAskPoints)) {
      const priceRange = data.priceMax - data.priceMin;

      const toScreenPoints = (points: { x: number; price: number }[] | undefined) =>
        (points || []).map((p) => ({
          x: p.x * dpr!,
          y: pixelHeight - ((p.price - data.priceMin) / priceRange) * pixelHeight,
        }));

      this.linesCommand.renderStaircase(
        {
          bidPoints: toScreenPoints(data.bestBidPoints),
          askPoints: toScreenPoints(data.bestAskPoints),
          bidColor: colors.bidColor || '#22c55e',
          askColor: colors.askColor || '#ef4444',
          lineWidth: 2,
          opacity: 1,
        },
        this.projection
      );
    }

    // 4. Render trade bubbles
    if (this.tradesBubblesCommand && data.trades.length > 0) {
      this.tradesBubblesCommand.render(
        {
          trades: data.trades,
          priceMin: data.priceMin,
          priceMax: data.priceMax,
          buyColor: colors.buyColor || '#22c55e',
          sellColor: colors.sellColor || '#ef4444',
          opacity: 0.9,
          maxSize: 50,
        },
        this.projection,
        pixelHeight
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

    // Then textures and context
    this.textureManager?.destroy();
    this.ctx?.destroy();
    this.overlay?.destroy();

    this.heatmapCommand = null;
    this.linesCommand = null;
    this.tradesBubblesCommand = null;
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
