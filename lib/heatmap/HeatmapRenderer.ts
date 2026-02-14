/**
 * HEATMAP RENDERER - Professional Style
 *
 * Moteur de rendu Canvas pour la Liquidity Heatmap Pro.
 * Professional design with:
 * - Gradient heatmap (bleu → violet → magenta → rouge)
 * - DOM bars horizontaux (cyan bid / rose ask)
 * - Price ladder professionnel
 * - Stats bar avec couleurs
 * - Crosshair élégant
 */

import { HeatmapColorEngine } from './HeatmapColorEngine';
import { AbsorptionBarRenderer, type AbsorptionBarSettings } from './rendering/AbsorptionBarRenderer';
import { AbsorptionLevelMarker, type AbsorptionLevelEvent, type AbsorptionLevelMarkerSettings } from './rendering/AbsorptionLevelMarker';
import type { HeatmapProSettings, PriceRange, HeatmapStats } from '@/types/heatmap';
import type { HeatmapLayout, RenderConfig, OrderbookSnapshot, Point } from '@/components/charts/LiquidityHeatmapPro/types';
import type { PassiveOrderLevel } from '@/types/passive-liquidity';

// Tick data interface - simple price ticks
export interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
}

// Passive order that can be broken/absorbed
export interface PassiveOrder {
  id: string;
  price: number;
  quantity: number;
  initialQuantity: number;
  side: 'bid' | 'ask';
  timestamp: number;
  status: 'active' | 'absorbed' | 'broken' | 'cancelled';
}

export interface HeatmapRenderConfig extends RenderConfig {
  settings: HeatmapProSettings;
}

export class HeatmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private colorEngine: HeatmapColorEngine;
  private absorptionBarRenderer: AbsorptionBarRenderer;
  private absorptionLevelMarker: AbsorptionLevelMarker;
  private config: HeatmapRenderConfig;
  private layout: HeatmapLayout;

  // Dimensions
  private width: number = 0;
  private height: number = 0;

  // State
  private currentPriceRange: PriceRange = { min: 0, max: 0 };
  private tickSize: number = 0.25;

  // Tick data (price history)
  private ticks: TickData[] = [];
  private lastTickTime: number = 0;

  // Tracked passive orders (for visualization)
  private passiveOrders: Map<string, PassiveOrder> = new Map();
  private lastOrderbookSnapshot: { bids: Map<number, number>; asks: Map<number, number> } | null = null;
  private previousPassiveOrders: Map<string, PassiveOrder> = new Map();
  private lastBestBid: number = 0;
  private lastBestAsk: number = 0;

  // Colors - Professional Style
  private colors = {
    background: '#0a0e14',
    gridLine: 'rgba(255, 255, 255, 0.04)',
    gridLineMajor: 'rgba(255, 255, 255, 0.08)',
    priceLadderBg: '#080c12',
    priceLadderBorder: '#1e2430',
    statsBarBg: '#080c12',
    statsBarBorder: '#1e2430',
    timelineBg: '#080c12',
    timelineBorder: '#1e2430',
    timeText: '#6b7280',
    priceText: '#6b7280',
    priceTextHighlight: '#ffffff',
    currentPriceBg: '#2563eb',
    currentPriceLine: 'rgba(255, 255, 255, 0.5)',
    crosshair: 'rgba(255, 255, 255, 0.6)',
    crosshairLabel: '#3b82f6',
    // DOM bars
    bidBar: 'rgba(34, 211, 238, 0.75)',  // Cyan
    askBar: 'rgba(239, 68, 68, 0.75)',    // Red (changed from pink)
    bidBarBright: 'rgba(34, 211, 238, 0.95)',
    askBarBright: 'rgba(239, 68, 68, 0.95)',
    // Walls
    wallBid: '#22d3ee',
    wallAsk: '#ef4444',
    // Stats
    statAsk: '#ef4444',
    statBid: '#22c55e',
    statVolume: '#ffffff',
    statLabel: '#6b7280',
    // Tick lines (behind bubbles) - professional style
    tickLineBid: 'rgba(34, 197, 94, 0.6)',   // Green
    tickLineAsk: 'rgba(239, 68, 68, 0.6)',    // Red
    tickLineBidBright: '#22c55e',
    tickLineAskBright: '#ef4444',
    // Best bid/ask
    bestBidLine: '#22d3ee',
    bestAskLine: '#ef4444',
    bestBidBg: 'rgba(34, 211, 238, 0.12)',
    bestAskBg: 'rgba(239, 68, 68, 0.12)',
    // Candles
    candleBullBody: '#22c55e',
    candleBearBody: '#ef4444',
    candleBullWick: '#22c55e',
    candleBearWick: '#ef4444',
    candleBullBodyFill: 'rgba(34, 197, 94, 0.8)',
    candleBearBodyFill: 'rgba(239, 68, 68, 0.8)',
  };

  // Time zoom state
  private timeZoom: number = 1;
  private timeOffset: number = 0;

  constructor(canvas: HTMLCanvasElement, config: HeatmapRenderConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;

    this.dpr = config.dpr;
    this.config = config;
    this.colorEngine = new HeatmapColorEngine(config.settings.colorScheme);
    this.absorptionBarRenderer = new AbsorptionBarRenderer();
    this.absorptionLevelMarker = new AbsorptionLevelMarker();
    this.layout = this.calculateLayout();

    this.resize();
    this.applySettings(config.settings);
  }

  /**
   * Redimensionne le canvas
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    // Reset transform before applying new scale (prevents accumulation)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
    this.layout = this.calculateLayout();
  }

  /**
   * Calcule le layout des zones
   */
  private calculateLayout(): HeatmapLayout {
    const priceLadderWidth = 70;
    const statsBarHeight = 38;
    const timelineHeight = 24;
    const domWidth = 90;
    const totalBottomHeight = statsBarHeight + timelineHeight;

    return {
      domArea: {
        x: 0,
        y: 0,
        width: domWidth,
        height: this.height - totalBottomHeight,
      },
      heatmapArea: {
        x: domWidth,
        y: 0,
        width: this.width - domWidth - priceLadderWidth,
        height: this.height - totalBottomHeight,
      },
      priceLadder: {
        x: this.width - priceLadderWidth,
        y: 0,
        width: priceLadderWidth,
        height: this.height - totalBottomHeight,
      },
      timeline: {
        x: 0,
        y: this.height - totalBottomHeight,
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
   * Setters pour le zoom/offset temporel
   */
  setTimeZoom(zoom: number): void {
    this.timeZoom = Math.max(0.1, Math.min(10, zoom));
  }

  setTimeOffset(offset: number): void {
    this.timeOffset = offset;
  }

  /**
   * Add a tick (price update)
   */
  addTick(price: number, volume: number, side: 'buy' | 'sell'): void {
    const now = Date.now();

    // Throttle ticks (50ms for better tracking)
    if (now - this.lastTickTime < 50) return;
    this.lastTickTime = now;

    // Only add if price actually changed
    const lastTick = this.ticks[this.ticks.length - 1];
    if (lastTick && Math.abs(lastTick.price - price) < this.tickSize * 0.1) {
      return; // Skip if price hasn't changed significantly
    }

    this.ticks.push({
      timestamp: now,
      price,
      volume,
      side,
    });

    // Keep only last 300 ticks for performance
    if (this.ticks.length > 300) {
      this.ticks.shift();
    }
  }

  /**
   * Update passive orders - simple tracking, remove when gone
   */
  updatePassiveOrders(
    bids: Map<number, number>,
    asks: Map<number, number>,
    currentPrice: number,
    bestBid: number,
    bestAsk: number
  ): void {
    const now = Date.now();
    const minWallSize = 40; // Minimum size to show

    // Clear and rebuild each frame - orders disappear immediately when gone
    this.passiveOrders.clear();

    // Track significant bid levels (walls)
    const sortedBids = Array.from(bids.entries())
      .filter(([, qty]) => qty > minWallSize)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    // Track significant ask levels (walls)
    const sortedAsks = Array.from(asks.entries())
      .filter(([, qty]) => qty > minWallSize)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    // Add bid walls
    for (const [price, qty] of sortedBids) {
      const id = `bid-${price}`;
      this.passiveOrders.set(id, {
        id,
        price,
        quantity: qty,
        initialQuantity: qty,
        side: 'bid',
        timestamp: now,
        status: 'active',
      });
    }

    // Add ask walls
    for (const [price, qty] of sortedAsks) {
      const id = `ask-${price}`;
      this.passiveOrders.set(id, {
        id,
        price,
        quantity: qty,
        initialQuantity: qty,
        side: 'ask',
        timestamp: now,
        status: 'active',
      });
    }

    this.lastBestBid = bestBid;
    this.lastBestAsk = bestAsk;
  }

  /**
   * Get ticks
   */
  getTicks(): TickData[] {
    return this.ticks;
  }

  /**
   * Applique les settings au color engine
   */
  applySettings(settings: HeatmapProSettings): void {
    this.config.settings = settings;
    this.colorEngine.setScheme(settings.colorScheme);
    this.colorEngine.setContrast(settings.contrast);
    this.colorEngine.setCutoffPercent(settings.upperCutoffPercent);
    this.colorEngine.setUseTransparency(settings.useTransparency);
  }

  /**
   * Render principal
   */
  render(data: {
    history: OrderbookSnapshot[];
    currentBids: Map<number, number>;
    currentAsks: Map<number, number>;
    bestBid: number;
    bestAsk: number;
    midPrice: number;
    trades: any[];
    priceRange: PriceRange;
    tickSize: number;
    mousePosition: Point | null;
    stats: HeatmapStats;
    // Absorption visualization data
    passiveLevels?: Map<string, PassiveOrderLevel>;
    maxBidVolume?: number;
    maxAskVolume?: number;
  }): void {
    this.currentPriceRange = data.priceRange;
    this.tickSize = data.tickSize;

    // Update ticks and passive orders
    if (data.midPrice > 0) {
      const side = data.trades.length > 0 ? data.trades[data.trades.length - 1]?.side || 'buy' : 'buy';
      this.addTick(data.midPrice, 1, side);
      this.updatePassiveOrders(data.currentBids, data.currentAsks, data.midPrice, data.bestBid, data.bestAsk);
    }

    // Clear
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 1. Grille subtile
    this.renderGrid(data.priceRange, data.tickSize);

    // 2. DÉSACTIVÉ: Heatmap cells (historique liquidité) - retirés car dérangent
    // this.renderHeatmapCells(data.history, data.priceRange);

    // 3. DÉSACTIVÉ: Current liquidity bars near price ladder - retirés car dérangent
    // this.renderLiquidityBars(data.currentBids, data.currentAsks, data.priceRange, data.bestBid, data.bestAsk);

    // 4. DÉSACTIVÉ: DOM bars à gauche - retirés car dérangent
    // this.renderDOMArea(data.currentBids, data.currentAsks, data.priceRange, data.bestBid, data.bestAsk);

    // 5. DÉSACTIVÉ: Best Bid/Ask highlight lines - retirées au cas où ce seraient les rectangles
    // this.renderBestBidAskLines(data.currentBids, data.currentAsks, data.priceRange, data.bestBid, data.bestAsk);

    // 6. Ligne prix actuel (thin line)
    this.renderCurrentPriceLine(data.midPrice, data.priceRange);

    // 6.5 ABSORPTION BARS - Visualize passive order absorption
    if (data.passiveLevels && data.passiveLevels.size > 0) {
      const { heatmapArea } = this.layout;
      this.absorptionBarRenderer.render(
        this.ctx,
        data.passiveLevels,
        data.priceRange,
        heatmapArea.x,
        heatmapArea.y,
        heatmapArea.width,
        heatmapArea.height,
        data.tickSize,
        data.maxBidVolume || 100,
        data.maxAskVolume || 100
      );

      // 6.6 ABSORPTION LEVEL MARKERS - Bounce/Break/Retest indicators
      this.absorptionLevelMarker.render(
        this.ctx,
        data.priceRange,
        heatmapArea.x,
        heatmapArea.y,
        heatmapArea.width,
        heatmapArea.height
      );
    }

    // 7. Price ladder
    this.renderPriceLadder(data.priceRange, data.tickSize, data.midPrice, data.bestBid, data.bestAsk);

    // 8. Timeline
    this.renderTimeline(data.history, Date.now());

    // 9. Stats bar
    this.renderStatsBar(data.stats, data.midPrice);

    // 10. Crosshair
    if (data.mousePosition) {
      this.renderCrosshair(data.mousePosition, data.priceRange);
    }
  }

  /**
   * Render price ticks - step style (X then Y, no diagonal)
   * Thick lines that overlay on bubbles
   */
  private renderPriceTicks(priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;
    if (this.ticks.length < 2) return;

    const tickSpacing = Math.max(3, 5 * this.timeZoom);
    const visibleTicks = Math.floor(heatmapArea.width / tickSpacing);
    const startIdx = Math.max(0, this.ticks.length - visibleTicks);

    // Step-style line (X then Y movement, not diagonal)
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'square';

    let prevX = 0;
    let prevY = 0;
    let isFirst = true;

    for (let i = startIdx; i < this.ticks.length; i++) {
      const tick = this.ticks[i];
      const x = heatmapArea.x + heatmapArea.width - (this.ticks.length - i) * tickSpacing;
      if (x < heatmapArea.x) continue;

      const y = this.priceToY(tick.price, priceRange, heatmapArea.height);

      if (isFirst) {
        this.ctx.moveTo(x, y);
        isFirst = false;
      } else {
        // Step: first move horizontally (X), then vertically (Y)
        this.ctx.lineTo(x, prevY); // Horizontal to new X at old Y
        this.ctx.lineTo(x, y);      // Vertical to new Y
      }

      prevX = x;
      prevY = y;
    }
    this.ctx.stroke();

    // Draw current price marker at the end
    if (this.ticks.length > 0) {
      const lastTick = this.ticks[this.ticks.length - 1];
      const lastX = heatmapArea.x + heatmapArea.width - tickSpacing;
      const lastY = this.priceToY(lastTick.price, priceRange, heatmapArea.height);

      // Bright marker for current price
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * Render current liquidity bars - depth visualization style
   */
  private renderLiquidityBars(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange,
    bestBid: number,
    bestAsk: number
  ): void {
    const { heatmapArea } = this.layout;

    // Calculate max quantity for normalization
    let maxQty = 0;
    for (const [, qty] of bids) maxQty = Math.max(maxQty, qty);
    for (const [, qty] of asks) maxQty = Math.max(maxQty, qty);
    if (maxQty === 0) return;

    // DÉSACTIVÉ: Barres de liquidité cyan et rouge sur le bord droit (dérangent)
    // Si vous voulez les réactiver, décommentez le code ci-dessous

    /*
    const priceSpan = priceRange.max - priceRange.min;
    const pixelsPerTick = (heatmapArea.height / priceSpan) * this.tickSize;
    const barHeight = Math.max(2, Math.min(pixelsPerTick * 0.85, 8));
    const maxBarWidth = 80;

    // Draw from right edge of heatmap
    const rightEdge = heatmapArea.x + heatmapArea.width;

    // Bid liquidity bars (cyan, below mid price)
    for (const [price, qty] of bids) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = qty / maxQty;
      const barWidth = maxBarWidth * Math.sqrt(intensity);

      // Gradient effect - brighter = more liquidity
      const alpha = 0.2 + intensity * 0.6;
      this.ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`;
      this.ctx.fillRect(rightEdge - barWidth, y - barHeight / 2, barWidth, barHeight);
    }

    // Ask liquidity bars (red, above mid price)
    for (const [price, qty] of asks) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = qty / maxQty;
      const barWidth = maxBarWidth * Math.sqrt(intensity);

      const alpha = 0.2 + intensity * 0.6;
      this.ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      this.ctx.fillRect(rightEdge - barWidth, y - barHeight / 2, barWidth, barHeight);
    }
    */
  }

  /**
   * Grille de prix
   */
  private renderGrid(priceRange: PriceRange, tickSize: number): void {
    const { heatmapArea } = this.layout;
    const gridStep = tickSize * Math.max(1, Math.floor(5 / this.config.settings.zoomLevel));
    const majorGridStep = gridStep * 5;

    // Lignes horizontales
    const startPrice = Math.floor(priceRange.min / gridStep) * gridStep;
    for (let price = startPrice; price <= priceRange.max; price += gridStep) {
      const y = this.priceToY(price, priceRange, heatmapArea.height);
      if (y >= 0 && y <= heatmapArea.height) {
        const isMajor = Math.abs(price % majorGridStep) < tickSize / 2;
        this.ctx.strokeStyle = isMajor ? this.colors.gridLineMajor : this.colors.gridLine;
        this.ctx.lineWidth = isMajor ? 1 : 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(this.layout.domArea.width, y);
        this.ctx.lineTo(this.width, y);
        this.ctx.stroke();
      }
    }
  }

  /**
   * Cellules heatmap (historique liquidité)
   */
  private renderHeatmapCells(history: OrderbookSnapshot[], priceRange: PriceRange): void {
    const { heatmapArea } = this.layout;
    const columnWidth = this.config.columnWidth;
    const cellHeight = Math.max(2, this.config.cellHeight * this.config.settings.zoomLevel);

    // Calcule le max pour normaliser
    let maxQty = 0;
    for (const snapshot of history) {
      for (const [, qty] of snapshot.bids) maxQty = Math.max(maxQty, qty);
      for (const [, qty] of snapshot.asks) maxQty = Math.max(maxQty, qty);
    }
    if (maxQty === 0) maxQty = 1;

    // Render chaque colonne
    const visibleColumns = Math.floor(heatmapArea.width / columnWidth);
    const startIdx = Math.max(0, history.length - visibleColumns);

    for (let i = startIdx; i < history.length; i++) {
      const snapshot = history[i];
      const x = heatmapArea.x + heatmapArea.width - (history.length - i) * columnWidth;

      if (x < heatmapArea.x - columnWidth) continue;

      // DÉSACTIVÉ: Petits carrés de heatmap historique retirés car ils dérangent
      // Si vous voulez les réactiver, décommentez le code ci-dessous

      /*
      // Render bids
      for (const [price, qty] of snapshot.bids) {
        if (price < priceRange.min || price > priceRange.max) continue;
        const y = this.priceToY(price, priceRange, heatmapArea.height);
        const intensity = qty / maxQty;
        this.ctx.fillStyle = this.colorEngine.getColor(intensity);
        this.ctx.fillRect(x, y - cellHeight / 2, columnWidth - 0.5, cellHeight);
      }

      // Render asks
      for (const [price, qty] of snapshot.asks) {
        if (price < priceRange.min || price > priceRange.max) continue;
        const y = this.priceToY(price, priceRange, heatmapArea.height);
        const intensity = qty / maxQty;
        this.ctx.fillStyle = this.colorEngine.getColor(intensity);
        this.ctx.fillRect(x, y - cellHeight / 2, columnWidth - 0.5, cellHeight);
      }
      */
    }
  }

  /**
   * Zone DOM avec barres horizontales - Design simple et sans chevauchement
   */
  private renderDOMArea(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange,
    bestBid: number,
    bestAsk: number
  ): void {
    const { domArea } = this.layout;
    const { maxVolumePixelSize } = this.config.settings;

    // Fond de la zone DOM
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    this.ctx.fillRect(domArea.x, domArea.y, domArea.width, domArea.height);

    // Bordure droite
    this.ctx.strokeStyle = this.colors.priceLadderBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.x + domArea.width, 0);
    this.ctx.lineTo(domArea.x + domArea.width, domArea.height);
    this.ctx.stroke();

    // Calcule le max
    let maxQty = 0;
    for (const [, qty] of bids) maxQty = Math.max(maxQty, qty);
    for (const [, qty] of asks) maxQty = Math.max(maxQty, qty);
    if (maxQty === 0) return;

    // DÉSACTIVÉ: Petites barres DOM bleu cyan et rouge retirées (dérangent)
    // Si vous voulez les réactiver, décommentez le code ci-dessous

    /*
    // Calculate bar dimensions - half width for each side
    const halfWidth = (domArea.width - 6) / 2;
    const priceSpan = priceRange.max - priceRange.min;
    const pixelsPerTick = (domArea.height / priceSpan) * this.tickSize;
    const barHeight = Math.max(1.5, Math.min(pixelsPerTick * 0.75, 10));

    // Render BIDS on LEFT half (cyan)
    for (const [price, qty] of bids) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, domArea.height);
      const barWidth = (qty / maxQty) * halfWidth;
      const isBest = Math.abs(price - bestBid) < this.tickSize / 2;
      const intensity = qty / maxQty;

      // Bar from center towards left
      const barX = domArea.x + halfWidth + 2 - barWidth;
      this.ctx.fillStyle = isBest
        ? 'rgba(34, 211, 238, 0.9)'
        : `rgba(34, 211, 238, ${0.3 + intensity * 0.5})`;

      this.ctx.fillRect(barX, y - barHeight / 2, barWidth, barHeight);
    }

    // Render ASKS on RIGHT half (red)
    for (const [price, qty] of asks) {
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, domArea.height);
      const barWidth = (qty / maxQty) * halfWidth;
      const isBest = Math.abs(price - bestAsk) < this.tickSize / 2;
      const intensity = qty / maxQty;

      // Bar from center towards right
      const barX = domArea.x + halfWidth + 4;
      this.ctx.fillStyle = isBest
        ? 'rgba(239, 68, 68, 0.9)'
        : `rgba(239, 68, 68, ${0.3 + intensity * 0.5})`;

      this.ctx.fillRect(barX, y - barHeight / 2, barWidth, barHeight);
    }
    */

    // DÉSACTIVÉ: Center divider line (aussi désactivée avec les barres DOM)
    /*
    // Center divider line
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.x + halfWidth + 3, 0);
    this.ctx.lineTo(domArea.x + halfWidth + 3, domArea.height);
    this.ctx.stroke();
    */
  }

  /**
   * Render les lignes Best Bid/Ask - Design propre et minimaliste
   */
  private renderBestBidAskLines(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange,
    bestBid: number,
    bestAsk: number
  ): void {
    const { heatmapArea, domArea } = this.layout;

    if (bestBid === 0 && bestAsk === 0) return;

    const bestBidQty = bids.get(bestBid) || 0;
    const bestAskQty = asks.get(bestAsk) || 0;

    // Best Bid line (cyan/green)
    if (bestBid >= priceRange.min && bestBid <= priceRange.max) {
      const y = this.priceToY(bestBid, priceRange, heatmapArea.height);

      // Subtle gradient background
      const gradient = this.ctx.createLinearGradient(domArea.width, y - 8, this.width, y - 8);
      gradient.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
      gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.08)');
      gradient.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(domArea.width, y - 8, heatmapArea.width, 16);

      // Clean line
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(domArea.width, y);
      this.ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
      this.ctx.stroke();

      // Volume tag - compact and clean
      this.renderBestPriceTag(heatmapArea.x + heatmapArea.width - 60, y, bestBidQty, 'bid');
    }

    // Best Ask line (red)
    if (bestAsk >= priceRange.min && bestAsk <= priceRange.max) {
      const y = this.priceToY(bestAsk, priceRange, heatmapArea.height);

      // Subtle gradient background
      const gradient = this.ctx.createLinearGradient(domArea.width, y - 8, this.width, y - 8);
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.15)');
      gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.08)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(domArea.width, y - 8, heatmapArea.width, 16);

      // Clean line
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(domArea.width, y);
      this.ctx.lineTo(heatmapArea.x + heatmapArea.width, y);
      this.ctx.stroke();

      // Volume tag - compact and clean
      this.renderBestPriceTag(heatmapArea.x + heatmapArea.width - 60, y, bestAskQty, 'ask');
    }
  }

  /**
   * Render un tag de prix compact
   */
  private renderBestPriceTag(
    x: number,
    y: number,
    volume: number,
    side: 'bid' | 'ask'
  ): void {
    const volumeText = volume >= 1000 ? (volume / 1000).toFixed(1) + 'K' : Math.floor(volume).toString();

    this.ctx.font = 'bold 9px JetBrains Mono, monospace';
    const textWidth = this.ctx.measureText(volumeText).width;
    const padding = 4;
    const tagWidth = textWidth + padding * 2;
    const tagHeight = 14;

    // Background pill
    const bgColor = side === 'bid' ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
    this.ctx.fillStyle = bgColor;
    this.ctx.beginPath();
    this.ctx.roundRect(x, y - tagHeight / 2, tagWidth, tagHeight, 3);
    this.ctx.fill();

    // Text
    this.ctx.fillStyle = '#fff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(volumeText, x + tagWidth / 2, y);
  }

  /**
   * Ligne du prix actuel
   */
  private renderCurrentPriceLine(midPrice: number, priceRange: PriceRange): void {
    const { heatmapArea, priceLadder, domArea } = this.layout;

    if (midPrice < priceRange.min || midPrice > priceRange.max) return;

    const y = this.priceToY(midPrice, priceRange, heatmapArea.height);

    // Ligne pointillée blanche
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeStyle = this.colors.currentPriceLine;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.width, y);
    this.ctx.lineTo(this.width, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  /**
   * Échelle des prix professionnelle
   */
  private renderPriceLadder(
    priceRange: PriceRange,
    tickSize: number,
    currentPrice: number,
    bestBid: number,
    bestAsk: number
  ): void {
    const { priceLadder, heatmapArea } = this.layout;

    // Fond de la ladder
    this.ctx.fillStyle = this.colors.priceLadderBg;
    this.ctx.fillRect(priceLadder.x, 0, priceLadder.width, priceLadder.height);

    // Bordure gauche
    this.ctx.strokeStyle = this.colors.priceLadderBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(priceLadder.x, 0);
    this.ctx.lineTo(priceLadder.x, priceLadder.height);
    this.ctx.stroke();

    // Calcule l'intervalle des labels
    const pixelsPerPrice = heatmapArea.height / (priceRange.max - priceRange.min);
    const minLabelSpacing = 22;
    let labelStep = tickSize;
    while (labelStep * pixelsPerPrice < minLabelSpacing) {
      labelStep *= 2;
    }

    this.ctx.font = `11px JetBrains Mono, Consolas, monospace`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    const startPrice = Math.floor(priceRange.min / labelStep) * labelStep;
    const decimals = this.getDecimalPlaces(tickSize);

    for (let price = startPrice; price <= priceRange.max; price += labelStep) {
      const y = this.priceToY(price, priceRange, heatmapArea.height);
      if (y < 8 || y > heatmapArea.height - 8) continue;

      const isCurrentPrice = Math.abs(price - currentPrice) < tickSize;
      const isBestBid = Math.abs(price - bestBid) < tickSize / 2;
      const isBestAsk = Math.abs(price - bestAsk) < tickSize / 2;

      // Highlight prix actuel
      if (isCurrentPrice) {
        this.ctx.fillStyle = this.colors.currentPriceBg;
        this.ctx.fillRect(priceLadder.x + 3, y - 10, priceLadder.width - 6, 20);
        this.ctx.fillStyle = this.colors.priceTextHighlight;
      } else if (isBestBid) {
        this.ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        this.ctx.fillRect(priceLadder.x + 3, y - 9, priceLadder.width - 6, 18);
        this.ctx.fillStyle = this.colors.statBid;
      } else if (isBestAsk) {
        this.ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        this.ctx.fillRect(priceLadder.x + 3, y - 9, priceLadder.width - 6, 18);
        this.ctx.fillStyle = this.colors.statAsk;
      } else {
        this.ctx.fillStyle = this.colors.priceText;
      }

      const priceText = price.toFixed(decimals);
      this.ctx.fillText(priceText, priceLadder.x + priceLadder.width - 8, y);
    }
  }

  /**
   * Barre de statistiques professionnelle
   */
  private renderStatsBar(stats: HeatmapStats, currentPrice: number): void {
    const { statsBar } = this.layout;

    // Fond
    this.ctx.fillStyle = this.colors.statsBarBg;
    this.ctx.fillRect(statsBar.x, statsBar.y, statsBar.width, statsBar.height);

    // Bordure supérieure
    this.ctx.strokeStyle = this.colors.statsBarBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, statsBar.y);
    this.ctx.lineTo(statsBar.width, statsBar.y);
    this.ctx.stroke();

    // Barre de ratio bid/ask
    const total = stats.askTotal + stats.bidTotal;
    if (total > 0) {
      const bidRatio = stats.bidTotal / total;
      const barY = statsBar.y + 3;
      const barHeight = 4;

      // Barre bid (gauche)
      this.ctx.fillStyle = this.colors.statBid;
      this.ctx.fillRect(0, barY, statsBar.width * bidRatio, barHeight);

      // Barre ask (droite)
      this.ctx.fillStyle = this.colors.statAsk;
      this.ctx.fillRect(statsBar.width * bidRatio, barY, statsBar.width * (1 - bidRatio), barHeight);
    }

    // Stats texte
    const padding = 25;
    const statWidth = (statsBar.width - padding * 2) / 5;
    const centerY = statsBar.y + statsBar.height / 2 + 5;

    this.ctx.font = '10px JetBrains Mono, Consolas, monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';

    // Price
    this.ctx.fillStyle = this.colors.statLabel;
    this.ctx.fillText('Price', padding, centerY - 10);
    this.ctx.fillStyle = this.colors.priceTextHighlight;
    this.ctx.font = 'bold 12px JetBrains Mono, Consolas, monospace';
    this.ctx.fillText(currentPrice.toFixed(2), padding, centerY + 6);

    // Ask
    this.ctx.font = '10px JetBrains Mono, Consolas, monospace';
    this.ctx.fillStyle = this.colors.statLabel;
    this.ctx.fillText('Ask', padding + statWidth, centerY - 10);
    this.ctx.fillStyle = this.colors.statAsk;
    this.ctx.fillText(this.formatNumber(stats.askTotal), padding + statWidth, centerY + 6);

    // Bid
    this.ctx.fillStyle = this.colors.statLabel;
    this.ctx.fillText('Bid', padding + statWidth * 2, centerY - 10);
    this.ctx.fillStyle = this.colors.statBid;
    this.ctx.fillText(this.formatNumber(stats.bidTotal), padding + statWidth * 2, centerY + 6);

    // Delta
    this.ctx.fillStyle = this.colors.statLabel;
    this.ctx.fillText('Delta', padding + statWidth * 3, centerY - 10);
    this.ctx.fillStyle = stats.delta >= 0 ? this.colors.statBid : this.colors.statAsk;
    this.ctx.fillText(
      (stats.delta >= 0 ? '+' : '') + this.formatNumber(stats.delta),
      padding + statWidth * 3,
      centerY + 6
    );

    // Volume
    this.ctx.fillStyle = this.colors.statLabel;
    this.ctx.fillText('Volume', padding + statWidth * 4, centerY - 10);
    this.ctx.fillStyle = this.colors.statVolume;
    this.ctx.fillText(this.formatNumber(stats.volume), padding + statWidth * 4, centerY + 6);
  }

  /**
   * Crosshair élégant
   */
  private renderCrosshair(mousePos: Point, priceRange: PriceRange): void {
    const { heatmapArea, priceLadder, domArea } = this.layout;

    // Vérifie si la souris est dans la zone active
    if (mousePos.y < 0 || mousePos.y > heatmapArea.height) {
      return;
    }

    // Ligne horizontale
    this.ctx.setLineDash([2, 2]);
    this.ctx.strokeStyle = this.colors.crosshair;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(domArea.width, mousePos.y);
    this.ctx.lineTo(this.width, mousePos.y);
    this.ctx.stroke();

    // Ligne verticale (seulement dans la zone heatmap)
    if (mousePos.x >= heatmapArea.x && mousePos.x <= heatmapArea.x + heatmapArea.width) {
      this.ctx.beginPath();
      this.ctx.moveTo(mousePos.x, 0);
      this.ctx.lineTo(mousePos.x, heatmapArea.height);
      this.ctx.stroke();
    }

    this.ctx.setLineDash([]);

    // Label prix sur la ladder
    const price = this.yToPrice(mousePos.y, priceRange, heatmapArea.height);
    const priceText = price.toFixed(this.getDecimalPlaces(this.tickSize));

    // Background du label
    this.ctx.fillStyle = this.colors.crosshairLabel;
    const textWidth = this.ctx.measureText(priceText).width + 12;
    this.ctx.fillRect(priceLadder.x + 3, mousePos.y - 10, priceLadder.width - 6, 20);

    // Texte du prix
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '11px JetBrains Mono, Consolas, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(priceText, priceLadder.x + priceLadder.width - 8, mousePos.y);
  }

  /**
   * Formate un nombre pour l'affichage
   */
  private formatNumber(num: number): string {
    if (Math.abs(num) >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (Math.abs(num) >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  }

  /**
   * Conversion prix → Y
   */
  private priceToY(price: number, priceRange: PriceRange, height: number): number {
    const ratio = (price - priceRange.min) / (priceRange.max - priceRange.min);
    return height * (1 - ratio);
  }

  /**
   * Conversion Y → prix
   */
  private yToPrice(y: number, priceRange: PriceRange, height: number): number {
    const ratio = 1 - y / height;
    return priceRange.min + ratio * (priceRange.max - priceRange.min);
  }

  /**
   * Obtient le nombre de décimales
   */
  private getDecimalPlaces(tickSize: number): number {
    if (tickSize >= 1) return 0;
    return Math.max(0, Math.ceil(-Math.log10(tickSize)));
  }

  /**
   * Obtient le prix à une position Y
   */
  getPriceAtY(y: number): number {
    return this.yToPrice(y, this.currentPriceRange, this.layout.heatmapArea.height);
  }

  /**
   * Retourne le layout
   */
  getLayout(): HeatmapLayout {
    return this.layout;
  }

  /**
   * Vérifie si dans l'axe des prix
   */
  isInPriceAxis(x: number): boolean {
    return x >= this.layout.priceLadder.x;
  }

  /**
   * Render timeline with intelligent timestamps
   */
  renderTimeline(history: { timestamp: number }[], currentTime: number): void {
    const { heatmapArea, domArea } = this.layout;
    const timelineY = heatmapArea.height;
    const timelineHeight = 24;
    const columnWidth = this.config.columnWidth;

    // Fond de la timeline
    this.ctx.fillStyle = this.colors.timelineBg;
    this.ctx.fillRect(0, timelineY, this.width, timelineHeight);

    // Bordure supérieure
    this.ctx.strokeStyle = this.colors.timelineBorder;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, timelineY);
    this.ctx.lineTo(this.width, timelineY);
    this.ctx.stroke();

    if (history.length === 0) return;

    // Calcule l'intervalle intelligent pour les labels
    const visibleColumns = Math.floor(heatmapArea.width / columnWidth);
    const minLabelSpacing = 80; // pixels minimum entre les labels
    const labelInterval = Math.max(1, Math.floor(minLabelSpacing / columnWidth));

    this.ctx.font = '10px JetBrains Mono, Consolas, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = this.colors.timeText;

    const startIdx = Math.max(0, history.length - visibleColumns);

    for (let i = startIdx; i < history.length; i += labelInterval) {
      const snapshot = history[i];
      if (!snapshot || !snapshot.timestamp) continue;

      const x = heatmapArea.x + heatmapArea.width - (history.length - i) * columnWidth;

      if (x < domArea.width + 30 || x > heatmapArea.x + heatmapArea.width - 30) continue;

      // Format intelligent: HH:MM:SS ou HH:MM selon le zoom
      const date = new Date(snapshot.timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');

      // Affiche les secondes si le zoom permet
      const timeText = this.timeZoom > 0.5 ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;

      // Tick mark
      this.ctx.strokeStyle = this.colors.gridLine;
      this.ctx.beginPath();
      this.ctx.moveTo(x, timelineY);
      this.ctx.lineTo(x, timelineY + 4);
      this.ctx.stroke();

      // Time label
      this.ctx.fillText(timeText, x, timelineY + 14);
    }

    // Current time on the right
    const now = new Date(currentTime || Date.now());
    const currentTimeText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    this.ctx.fillStyle = this.colors.priceTextHighlight;
    this.ctx.font = 'bold 10px JetBrains Mono, Consolas, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(currentTimeText, this.width - 10, timelineY + 14);
  }

  /**
   * Update absorption bar settings
   */
  updateAbsorptionSettings(settings: Partial<AbsorptionBarSettings>): void {
    this.absorptionBarRenderer.updateSettings(settings);
  }

  /**
   * Mark an iceberg order as just refilled (for flash effect)
   */
  markIcebergRefill(levelKey: string): void {
    this.absorptionBarRenderer.markIcebergRefill(levelKey);
  }

  /**
   * Record an absorption level event (bounce/break/retest)
   */
  recordAbsorptionEvent(event: AbsorptionLevelEvent): void {
    this.absorptionLevelMarker.recordEvent(event);
  }

  /**
   * Update level marker settings
   */
  updateLevelMarkerSettings(settings: Partial<AbsorptionLevelMarkerSettings>): void {
    this.absorptionLevelMarker.updateSettings(settings);
  }

  /**
   * Détruit le renderer
   */
  destroy(): void {
    // Cleanup
  }
}
