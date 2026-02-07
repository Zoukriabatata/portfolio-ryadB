/**
 * INSTITUTIONAL RENDERER - Professional Grade Heatmap Rendering
 *
 * High-performance canvas renderer with batched drawing,
 * dirty rect optimization, and professional visual quality.
 */

import type {
  LiquidityColumn,
  LiquidityCell,
  Trade,
  WallInfo,
  SpoofPattern,
  AbsorptionEvent,
  HeatmapSettings,
  LiquidityStats,
  PriceRange,
  Viewport,
  Rect,
  Point,
} from '../core/types';

import { HistoryBuffer } from '../core/HistoryBuffer';
import { InstitutionalColorEngine } from './InstitutionalColorEngine';

export interface RenderContext {
  history: HistoryBuffer;
  currentBids: Map<number, number>;
  currentAsks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  trades: Trade[];
  walls: WallInfo[];
  spoofPatterns: SpoofPattern[];
  absorptionEvents: AbsorptionEvent[];
  mousePosition: Point | null;
  settings: HeatmapSettings;
}

interface Layout {
  heatmapArea: Rect;
  domArea: Rect;
  priceLadder: Rect;
  timeline: Rect;
  statsBar: Rect;
}

export class InstitutionalRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private colorEngine: InstitutionalColorEngine;
  private layout: Layout;
  private width: number = 0;
  private height: number = 0;
  private tickSize: number = 0.01;

  // Performance
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;

  // Colors
  private colors = {
    background: '#06080d',
    gridLine: 'rgba(255, 255, 255, 0.03)',
    gridLineMajor: 'rgba(255, 255, 255, 0.06)',
    priceLadderBg: '#070a10',
    border: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#e4e4e7',
    textSecondary: '#71717a',
    textMuted: '#52525b',
    bidColor: '#22d3ee',
    askColor: '#ef4444',
    priceLineBid: 'rgba(34, 211, 238, 0.4)',
    priceLineAsk: 'rgba(239, 68, 68, 0.4)',
    currentPrice: 'rgba(255, 255, 255, 0.5)',
    crosshair: 'rgba(255, 255, 255, 0.4)',
  };

  constructor(canvas: HTMLCanvasElement, settings?: Partial<HeatmapSettings>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.colorEngine = new InstitutionalColorEngine({
      scheme: settings?.colorScheme || 'bookmap',
      useLogScale: settings?.useLogScale ?? true,
      gamma: settings?.gamma ?? 1.2,
    });

    this.resize();
    this.layout = this.calculateLayout();
  }

  /**
   * Resize canvas
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    this.ctx.scale(this.dpr, this.dpr);
    this.layout = this.calculateLayout();
  }

  /**
   * Calculate layout regions
   */
  private calculateLayout(): Layout {
    const domWidth = 80;
    const priceLadderWidth = 65;
    const timelineHeight = 22;
    const statsBarHeight = 32;

    return {
      domArea: {
        x: 0,
        y: 0,
        width: domWidth,
        height: this.height - timelineHeight - statsBarHeight,
      },
      heatmapArea: {
        x: domWidth,
        y: 0,
        width: this.width - domWidth - priceLadderWidth,
        height: this.height - timelineHeight - statsBarHeight,
      },
      priceLadder: {
        x: this.width - priceLadderWidth,
        y: 0,
        width: priceLadderWidth,
        height: this.height - timelineHeight - statsBarHeight,
      },
      timeline: {
        x: 0,
        y: this.height - timelineHeight - statsBarHeight,
        width: this.width,
        height: timelineHeight,
      },
      statsBar: {
        x: 0,
        y: this.height - statsBarHeight,
        width: this.width,
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
   * Update color scheme
   */
  setColorScheme(scheme: 'bookmap' | 'atas' | 'thermal'): void {
    this.colorEngine.setScheme(scheme);
  }

  /**
   * Main render function
   */
  render(context: RenderContext, priceRange: PriceRange): void {
    const startTime = performance.now();

    // Get stats for color normalization
    const stats = context.history.getStats();

    // Clear canvas
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Calculate viewport
    const columns = context.history.getLatest(
      Math.ceil(this.layout.heatmapArea.width / 4) // ~4px per column
    );

    // 1. Render grid
    this.renderGrid(priceRange);

    // 2. Render heatmap cells
    this.renderHeatmapCells(columns, priceRange, stats, context.settings);

    // 3. Render current depth (live order book)
    this.renderCurrentDepth(
      context.currentBids,
      context.currentAsks,
      priceRange,
      stats
    );

    // 4. Render DOM area
    this.renderDOM(
      context.currentBids,
      context.currentAsks,
      priceRange,
      context.bestBid,
      context.bestAsk
    );

    // 5. Render walls
    if (context.settings.showWalls && context.walls.length > 0) {
      this.renderWalls(context.walls, priceRange);
    }

    // 6. Render absorption events
    if (context.settings.showAbsorption && context.absorptionEvents.length > 0) {
      this.renderAbsorption(context.absorptionEvents, priceRange);
    }

    // 7. Render spoofing indicators
    if (context.settings.showSpoofing && context.spoofPatterns.length > 0) {
      this.renderSpoofing(context.spoofPatterns, priceRange);
    }

    // 8. Render trades (bubbles)
    if (context.settings.showTrades && context.trades.length > 0) {
      this.renderTrades(context.trades, priceRange, columns, context.settings);
    }

    // 9. Render best bid/ask lines
    this.renderBestPriceLines(context.bestBid, context.bestAsk, priceRange);

    // 10. Render current price line
    this.renderCurrentPriceLine(context.midPrice, priceRange);

    // 11. Render price ladder
    this.renderPriceLadder(priceRange, context.midPrice, context.bestBid, context.bestAsk);

    // 12. Render timeline
    this.renderTimeline(columns);

    // 13. Render stats bar
    this.renderStatsBar(context);

    // 14. Render crosshair
    if (context.mousePosition) {
      this.renderCrosshair(context.mousePosition, priceRange);
    }

    // Update FPS
    this.frameCount++;
    const elapsed = startTime - this.lastRenderTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastRenderTime = startTime;
    }
  }

  /**
   * Render grid
   */
  private renderGrid(priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;
    const gridStep = this.tickSize * 5;
    const majorStep = this.tickSize * 25;

    const startPrice = Math.floor(priceRange.min / gridStep) * gridStep;

    for (let price = startPrice; price <= priceRange.max; price += gridStep) {
      const y = this.priceToY(price, priceRange, heatmapArea.height);
      if (y < 0 || y > heatmapArea.height) continue;

      const isMajor = Math.abs(price % majorStep) < this.tickSize / 2;
      this.ctx.strokeStyle = isMajor ? this.colors.gridLineMajor : this.colors.gridLine;
      this.ctx.lineWidth = isMajor ? 1 : 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(this.layout.domArea.width, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  /**
   * Render heatmap cells
   */
  private renderHeatmapCells(
    columns: LiquidityColumn[],
    priceRange: PriceRange,
    stats: LiquidityStats,
    settings: HeatmapSettings
  ): void {
    const { heatmapArea } = this.layout;
    if (columns.length === 0) return;

    const columnWidth = Math.max(2, heatmapArea.width / columns.length);
    const priceSpan = priceRange.max - priceRange.min;
    const cellHeight = Math.max(2, (heatmapArea.height / priceSpan) * this.tickSize);

    // Batch by color for performance
    const colorBatches = new Map<string, Rect[]>();

    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const x = heatmapArea.x + (i * columnWidth);

      for (const [price, cell] of column.cells) {
        if (price < priceRange.min || price > priceRange.max) continue;

        const y = this.priceToY(price, priceRange, heatmapArea.height);

        // Render bid liquidity
        if (settings.showBids && cell.bidDecay > 0) {
          const color = this.colorEngine.getColor(cell.bidDecay, 'bid', stats);
          if (color !== 'transparent') {
            const batch = colorBatches.get(color) || [];
            batch.push({ x, y: y - cellHeight / 2, width: columnWidth, height: cellHeight });
            colorBatches.set(color, batch);
          }
        }

        // Render ask liquidity
        if (settings.showAsks && cell.askDecay > 0) {
          const color = this.colorEngine.getColor(cell.askDecay, 'ask', stats);
          if (color !== 'transparent') {
            const batch = colorBatches.get(color) || [];
            batch.push({ x, y: y - cellHeight / 2, width: columnWidth, height: cellHeight });
            colorBatches.set(color, batch);
          }
        }
      }
    }

    // Render batched
    for (const [color, rects] of colorBatches) {
      this.ctx.fillStyle = color;
      for (const rect of rects) {
        this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  /**
   * Render current depth (live column)
   */
  private renderCurrentDepth(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange,
    stats: LiquidityStats
  ): void {
    const { heatmapArea } = this.layout;
    const rightEdge = heatmapArea.x + heatmapArea.width;
    const barWidth = 60;
    const priceSpan = priceRange.max - priceRange.min;
    const barHeight = Math.max(2, (heatmapArea.height / priceSpan) * this.tickSize);

    // Find max for this column
    let maxQty = 0;
    for (const qty of bids.values()) maxQty = Math.max(maxQty, qty);
    for (const qty of asks.values()) maxQty = Math.max(maxQty, qty);
    if (maxQty === 0) return;

    // Render bids
    for (const [price, qty] of bids) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = qty / maxQty;
      const width = barWidth * Math.sqrt(intensity);

      this.ctx.fillStyle = this.colorEngine.getColor(qty, 'bid', stats);
      this.ctx.fillRect(rightEdge - width, y - barHeight / 2, width, barHeight);
    }

    // Render asks
    for (const [price, qty] of asks) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = qty / maxQty;
      const width = barWidth * Math.sqrt(intensity);

      this.ctx.fillStyle = this.colorEngine.getColor(qty, 'ask', stats);
      this.ctx.fillRect(rightEdge - width, y - barHeight / 2, width, barHeight);
    }
  }

  /**
   * Render DOM (Depth of Market) area
   */
  private renderDOM(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange,
    bestBid: number,
    bestAsk: number
  ): void {
    const { domArea, heatmapArea } = this.layout;

    // Background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(domArea.x, domArea.y, domArea.width, domArea.height);

    // Border
    this.ctx.strokeStyle = this.colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.width, 0);
    this.ctx.lineTo(domArea.width, domArea.height);
    this.ctx.stroke();

    // Calculate max
    let maxQty = 0;
    for (const qty of bids.values()) maxQty = Math.max(maxQty, qty);
    for (const qty of asks.values()) maxQty = Math.max(maxQty, qty);
    if (maxQty === 0) return;

    const priceSpan = priceRange.max - priceRange.min;
    const barHeight = Math.max(1.5, (heatmapArea.height / priceSpan) * this.tickSize * 0.8);
    const maxBarWidth = domArea.width - 4;

    // Render bids
    for (const [price, qty] of bids) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const barWidth = (qty / maxQty) * maxBarWidth;
      const isBest = Math.abs(price - bestBid) < this.tickSize / 2;

      this.ctx.fillStyle = isBest
        ? 'rgba(34, 211, 238, 0.8)'
        : `rgba(34, 211, 238, ${0.2 + (qty / maxQty) * 0.5})`;
      this.ctx.fillRect(domArea.x + 2, y - barHeight / 2, barWidth, barHeight);
    }

    // Render asks
    for (const [price, qty] of asks) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const barWidth = (qty / maxQty) * maxBarWidth;
      const isBest = Math.abs(price - bestAsk) < this.tickSize / 2;

      this.ctx.fillStyle = isBest
        ? 'rgba(239, 68, 68, 0.8)'
        : `rgba(239, 68, 68, ${0.2 + (qty / maxQty) * 0.5})`;
      this.ctx.fillRect(domArea.x + 2, y - barHeight / 2, barWidth, barHeight);
    }
  }

  /**
   * Render walls
   */
  private renderWalls(walls: WallInfo[], priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;

    for (const wall of walls) {
      if (wall.price < priceRange.min || wall.price > priceRange.max) continue;

      const y = this.priceToY(wall.price, priceRange, heatmapArea.height);
      const color = this.colorEngine.getWallColor(wall.strength, wall.side, wall.isDefending);

      // Draw wall indicator line
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = wall.isDefending ? 3 : 2;
      this.ctx.setLineDash(wall.isDefending ? [] : [5, 3]);

      this.ctx.beginPath();
      this.ctx.moveTo(heatmapArea.x, y);
      this.ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
      this.ctx.stroke();

      // Draw wall strength indicator
      if (wall.isDefending) {
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 9px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(
          `WALL ${wall.absorptionRatio > 0.5 ? '🛡️' : ''}`,
          heatmapArea.x + 5,
          y - 4
        );
      }

      this.ctx.setLineDash([]);
    }
  }

  /**
   * Render absorption events
   */
  private renderAbsorption(events: AbsorptionEvent[], priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;

    for (const event of events) {
      if (event.price < priceRange.min || event.price > priceRange.max) continue;

      const y = this.priceToY(event.price, priceRange, heatmapArea.height);
      const color = this.colorEngine.getAbsorptionColor(
        event.strength,
        event.side,
        event.priceAction
      );

      // Draw absorption indicator
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(
        heatmapArea.x + heatmapArea.width - 20,
        y,
        8 + event.strength * 6,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Label
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 8px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(
        event.priceAction === 'bounce' ? '↑' : event.priceAction === 'break' ? '↓' : '◉',
        heatmapArea.x + heatmapArea.width - 20,
        y + 3
      );
    }
  }

  /**
   * Render spoofing indicators
   */
  private renderSpoofing(patterns: SpoofPattern[], priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;

    for (const pattern of patterns) {
      if (pattern.price < priceRange.min || pattern.price > priceRange.max) continue;

      const y = this.priceToY(pattern.price, priceRange, heatmapArea.height);
      const color = this.colorEngine.getSpoofColor(pattern.confidence);

      // Draw warning indicator
      this.ctx.fillStyle = color;
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚠', heatmapArea.x + 15, y + 4);

      // Draw dotted line
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([3, 3]);
      this.ctx.beginPath();
      this.ctx.moveTo(heatmapArea.x + 25, y);
      this.ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  /**
   * Render trade bubbles
   */
  private renderTrades(
    trades: Trade[],
    priceRange: PriceRange,
    columns: LiquidityColumn[],
    settings: HeatmapSettings
  ): void {
    const { heatmapArea } = this.layout;
    const now = Date.now();
    const timeWindow = 60000; // 60 seconds

    // Filter trades
    const filteredTrades = trades.filter(
      t =>
        t.timestamp > now - timeWindow &&
        t.price >= priceRange.min &&
        t.price <= priceRange.max &&
        t.quantity >= settings.tradeMinSize
    );

    if (filteredTrades.length === 0) return;

    // Find max volume for sizing
    const maxVol = Math.max(...filteredTrades.map(t => t.quantity));

    for (const trade of filteredTrades) {
      // Calculate position
      const age = (now - trade.timestamp) / timeWindow;
      const x = heatmapArea.x + (1 - age) * heatmapArea.width;
      const y = this.priceToY(trade.price, priceRange, heatmapArea.height);

      // Calculate size
      const normalizedVol = trade.quantity / maxVol;
      const radius = (3 + Math.sqrt(normalizedVol) * 15) * settings.tradeBubbleScale;

      // Get color
      const color = this.colorEngine.getTradeColor(trade.side, normalizedVol);

      // Draw bubble
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();

      // Border
      this.ctx.strokeStyle = trade.side === 'buy'
        ? 'rgba(34, 197, 94, 0.8)'
        : 'rgba(239, 68, 68, 0.8)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  /**
   * Render best bid/ask price lines
   */
  private renderBestPriceLines(
    bestBid: number,
    bestAsk: number,
    priceRange: PriceRange
  ): void {
    const { heatmapArea, domArea } = this.layout;

    // Best bid line
    if (bestBid >= priceRange.min && bestBid <= priceRange.max) {
      const y = this.priceToY(bestBid, priceRange, heatmapArea.height);

      this.ctx.strokeStyle = this.colors.priceLineBid;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(domArea.width, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Best ask line
    if (bestAsk >= priceRange.min && bestAsk <= priceRange.max) {
      const y = this.priceToY(bestAsk, priceRange, heatmapArea.height);

      this.ctx.strokeStyle = this.colors.priceLineAsk;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(domArea.width, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  /**
   * Render current price line
   */
  private renderCurrentPriceLine(midPrice: number, priceRange: PriceRange): void {
    const { heatmapArea, domArea } = this.layout;

    if (midPrice < priceRange.min || midPrice > priceRange.max) return;

    const y = this.priceToY(midPrice, priceRange, heatmapArea.height);

    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeStyle = this.colors.currentPrice;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.width, y);
    this.ctx.lineTo(this.width, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Render price ladder
   */
  private renderPriceLadder(
    priceRange: PriceRange,
    currentPrice: number,
    bestBid: number,
    bestAsk: number
  ): void {
    const { priceLadder, heatmapArea } = this.layout;

    // Background
    this.ctx.fillStyle = this.colors.priceLadderBg;
    this.ctx.fillRect(priceLadder.x, 0, priceLadder.width, priceLadder.height);

    // Border
    this.ctx.strokeStyle = this.colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(priceLadder.x, 0);
    this.ctx.lineTo(priceLadder.x, priceLadder.height);
    this.ctx.stroke();

    // Calculate label spacing
    const pixelsPerPrice = heatmapArea.height / (priceRange.max - priceRange.min);
    const minSpacing = 20;
    let labelStep = this.tickSize;
    while (labelStep * pixelsPerPrice < minSpacing) {
      labelStep *= 2;
    }

    this.ctx.font = '10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    const decimals = this.getDecimalPlaces(this.tickSize);
    const startPrice = Math.floor(priceRange.min / labelStep) * labelStep;

    for (let price = startPrice; price <= priceRange.max; price += labelStep) {
      const y = this.priceToY(price, priceRange, heatmapArea.height);
      if (y < 10 || y > heatmapArea.height - 10) continue;

      const isCurrentPrice = Math.abs(price - currentPrice) < this.tickSize;
      const isBestBid = Math.abs(price - bestBid) < this.tickSize / 2;
      const isBestAsk = Math.abs(price - bestAsk) < this.tickSize / 2;

      // Highlight current price
      if (isCurrentPrice) {
        this.ctx.fillStyle = '#2563eb';
        this.ctx.fillRect(priceLadder.x + 2, y - 9, priceLadder.width - 4, 18);
        this.ctx.fillStyle = '#ffffff';
      } else if (isBestBid) {
        this.ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        this.ctx.fillRect(priceLadder.x + 2, y - 8, priceLadder.width - 4, 16);
        this.ctx.fillStyle = this.colors.bidColor;
      } else if (isBestAsk) {
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        this.ctx.fillRect(priceLadder.x + 2, y - 8, priceLadder.width - 4, 16);
        this.ctx.fillStyle = this.colors.askColor;
      } else {
        this.ctx.fillStyle = this.colors.textSecondary;
      }

      this.ctx.fillText(
        price.toFixed(decimals),
        priceLadder.x + priceLadder.width - 5,
        y
      );
    }
  }

  /**
   * Render timeline
   */
  private renderTimeline(columns: LiquidityColumn[]): void {
    const { timeline, heatmapArea } = this.layout;

    // Background
    this.ctx.fillStyle = this.colors.priceLadderBg;
    this.ctx.fillRect(0, timeline.y, this.width, timeline.height);

    // Border
    this.ctx.strokeStyle = this.colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, timeline.y);
    this.ctx.lineTo(this.width, timeline.y);
    this.ctx.stroke();

    if (columns.length === 0) return;

    // Time labels
    this.ctx.font = '9px JetBrains Mono, monospace';
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.textAlign = 'center';

    const columnWidth = heatmapArea.width / columns.length;
    const labelInterval = Math.max(1, Math.floor(60 / columnWidth));

    for (let i = 0; i < columns.length; i += labelInterval) {
      const x = heatmapArea.x + i * columnWidth;
      if (x < heatmapArea.x + 30 || x > heatmapArea.x + heatmapArea.width - 30) continue;

      const time = new Date(columns[i].timestamp);
      const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

      this.ctx.fillText(label, x, timeline.y + 13);
    }

    // Current time
    const now = new Date();
    const currentTimeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    this.ctx.fillStyle = this.colors.textPrimary;
    this.ctx.font = 'bold 9px JetBrains Mono, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(currentTimeLabel, this.width - 5, timeline.y + 13);
  }

  /**
   * Render stats bar
   */
  private renderStatsBar(context: RenderContext): void {
    const { statsBar } = this.layout;

    // Background
    this.ctx.fillStyle = this.colors.priceLadderBg;
    this.ctx.fillRect(0, statsBar.y, this.width, statsBar.height);

    // Border
    this.ctx.strokeStyle = this.colors.border;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, statsBar.y);
    this.ctx.lineTo(this.width, statsBar.y);
    this.ctx.stroke();

    // Calculate stats
    let bidTotal = 0;
    let askTotal = 0;
    for (const qty of context.currentBids.values()) bidTotal += qty;
    for (const qty of context.currentAsks.values()) askTotal += qty;
    const total = bidTotal + askTotal;
    const delta = bidTotal - askTotal;

    // Imbalance bar
    if (total > 0) {
      const bidRatio = bidTotal / total;
      const barWidth = statsBar.width - 20;
      const barY = statsBar.y + 4;
      const barHeight = 3;

      this.ctx.fillStyle = this.colors.bidColor;
      this.ctx.fillRect(10, barY, barWidth * bidRatio, barHeight);

      this.ctx.fillStyle = this.colors.askColor;
      this.ctx.fillRect(10 + barWidth * bidRatio, barY, barWidth * (1 - bidRatio), barHeight);
    }

    // Stats text
    const padding = 15;
    const statWidth = (statsBar.width - padding * 2) / 5;
    const textY = statsBar.y + 20;

    this.ctx.font = '10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'left';

    // Price
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText('Price', padding, textY - 8);
    this.ctx.fillStyle = this.colors.textPrimary;
    this.ctx.font = 'bold 11px JetBrains Mono, monospace';
    this.ctx.fillText(context.midPrice.toFixed(2), padding, textY + 4);

    // Bid
    this.ctx.font = '10px JetBrains Mono, monospace';
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText('Bid', padding + statWidth, textY - 8);
    this.ctx.fillStyle = this.colors.bidColor;
    this.ctx.fillText(this.formatNumber(bidTotal), padding + statWidth, textY + 4);

    // Ask
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText('Ask', padding + statWidth * 2, textY - 8);
    this.ctx.fillStyle = this.colors.askColor;
    this.ctx.fillText(this.formatNumber(askTotal), padding + statWidth * 2, textY + 4);

    // Delta
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText('Delta', padding + statWidth * 3, textY - 8);
    this.ctx.fillStyle = delta >= 0 ? this.colors.bidColor : this.colors.askColor;
    this.ctx.fillText((delta >= 0 ? '+' : '') + this.formatNumber(delta), padding + statWidth * 3, textY + 4);

    // FPS
    this.ctx.fillStyle = this.colors.textMuted;
    this.ctx.fillText('FPS', padding + statWidth * 4, textY - 8);
    this.ctx.fillStyle = this.colors.textSecondary;
    this.ctx.fillText(this.fps.toString(), padding + statWidth * 4, textY + 4);
  }

  /**
   * Render crosshair
   */
  private renderCrosshair(mousePos: Point, priceRange: PriceRange): void {
    const { heatmapArea, priceLadder, domArea } = this.layout;

    if (mousePos.y < 0 || mousePos.y > heatmapArea.height) return;

    // Horizontal line
    this.ctx.setLineDash([2, 2]);
    this.ctx.strokeStyle = this.colors.crosshair;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.width, mousePos.y);
    this.ctx.lineTo(this.width, mousePos.y);
    this.ctx.stroke();

    // Vertical line
    if (mousePos.x >= heatmapArea.x && mousePos.x <= heatmapArea.x + heatmapArea.width) {
      this.ctx.beginPath();
      this.ctx.moveTo(mousePos.x, 0);
      this.ctx.lineTo(mousePos.x, heatmapArea.height);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]);

    // Price label
    const price = this.yToPrice(mousePos.y, priceRange, heatmapArea.height);
    const priceText = price.toFixed(this.getDecimalPlaces(this.tickSize));

    this.ctx.fillStyle = '#3b82f6';
    this.ctx.fillRect(priceLadder.x + 2, mousePos.y - 9, priceLadder.width - 4, 18);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(priceText, priceLadder.x + priceLadder.width - 5, mousePos.y);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private priceToY(price: number, priceRange: PriceRange, height: number): number {
    const ratio = (price - priceRange.min) / (priceRange.max - priceRange.min);
    return height * (1 - ratio);
  }

  private yToPrice(y: number, priceRange: PriceRange, height: number): number {
    const ratio = 1 - y / height;
    return priceRange.min + ratio * (priceRange.max - priceRange.min);
  }

  private getDecimalPlaces(tickSize: number): number {
    if (tickSize >= 1) return 0;
    return Math.max(0, Math.ceil(-Math.log10(tickSize)));
  }

  private formatNumber(num: number): string {
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
  }

  /**
   * Get layout
   */
  getLayout(): Layout {
    return this.layout;
  }

  /**
   * Get price at Y position
   */
  getPriceAtY(y: number, priceRange: PriceRange): number {
    return this.yToPrice(y, priceRange, this.layout.heatmapArea.height);
  }

  /**
   * Check if point is in price ladder
   */
  isInPriceLadder(x: number): boolean {
    return x >= this.layout.priceLadder.x;
  }

  /**
   * Destroy renderer
   */
  destroy(): void {
    this.colorEngine.clearCache();
  }
}
