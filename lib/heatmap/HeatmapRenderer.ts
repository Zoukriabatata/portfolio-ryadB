/**
 * HEATMAP RENDERER - ATAS Style
 *
 * Moteur de rendu Canvas pour la Liquidity Heatmap Pro.
 * Design inspiré d'ATAS/Bookmap avec:
 * - Gradient heatmap (bleu → violet → magenta → rouge)
 * - DOM bars horizontaux (cyan bid / rose ask)
 * - Price ladder professionnel
 * - Stats bar avec couleurs
 * - Crosshair élégant
 */

import { HeatmapColorEngine } from './HeatmapColorEngine';
import type { HeatmapProSettings, PriceRange, HeatmapStats } from '@/types/heatmap';
import type { HeatmapLayout, RenderConfig, OrderbookSnapshot, Point } from '@/components/charts/LiquidityHeatmapPro/types';

export interface HeatmapRenderConfig extends RenderConfig {
  settings: HeatmapProSettings;
}

export class HeatmapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private colorEngine: HeatmapColorEngine;
  private config: HeatmapRenderConfig;
  private layout: HeatmapLayout;

  // Dimensions
  private width: number = 0;
  private height: number = 0;

  // State
  private currentPriceRange: PriceRange = { min: 0, max: 0 };
  private tickSize: number = 0.25;

  // Colors - ATAS Style
  private colors = {
    background: '#060a10',
    gridLine: 'rgba(255, 255, 255, 0.03)',
    gridLineMajor: 'rgba(255, 255, 255, 0.06)',
    priceLadderBg: '#080c14',
    priceLadderBorder: '#1a1f2e',
    statsBarBg: '#080c14',
    statsBarBorder: '#1a1f2e',
    priceText: '#6b7280',
    priceTextHighlight: '#ffffff',
    currentPriceBg: '#2563eb',
    currentPriceLine: 'rgba(255, 255, 255, 0.4)',
    crosshair: 'rgba(255, 255, 255, 0.5)',
    crosshairLabel: '#3b82f6',
    bidBar: 'rgba(34, 211, 238, 0.7)',  // Cyan
    askBar: 'rgba(244, 114, 182, 0.7)',  // Pink
    bidBarBright: 'rgba(34, 211, 238, 0.9)',
    askBarBright: 'rgba(244, 114, 182, 0.9)',
    wallBid: '#22d3ee',
    wallAsk: '#ef4444',
    statAsk: '#f43f5e',
    statBid: '#22c55e',
    statVolume: '#ffffff',
    statLabel: '#6b7280',
  };

  constructor(canvas: HTMLCanvasElement, config: HeatmapRenderConfig) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2d context');
    this.ctx = ctx;

    this.dpr = config.dpr;
    this.config = config;
    this.colorEngine = new HeatmapColorEngine(config.settings.colorScheme);
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

    this.ctx.scale(this.dpr, this.dpr);
    this.layout = this.calculateLayout();
  }

  /**
   * Calcule le layout des zones
   */
  private calculateLayout(): HeatmapLayout {
    const priceLadderWidth = 85;
    const statsBarHeight = 45;
    const domWidth = 120; // Largeur de la zone DOM

    return {
      domArea: {
        x: 0,
        y: 0,
        width: domWidth,
        height: this.height - statsBarHeight,
      },
      heatmapArea: {
        x: domWidth,
        y: 0,
        width: this.width - domWidth - priceLadderWidth,
        height: this.height - statsBarHeight,
      },
      priceLadder: {
        x: this.width - priceLadderWidth,
        y: 0,
        width: priceLadderWidth,
        height: this.height - statsBarHeight,
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
  }): void {
    this.currentPriceRange = data.priceRange;
    this.tickSize = data.tickSize;

    // Clear
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // 1. Grille
    this.renderGrid(data.priceRange, data.tickSize);

    // 2. Heatmap cells (historique liquidité)
    this.renderHeatmapCells(data.history, data.priceRange);

    // 3. DOM bars à gauche
    this.renderDOMArea(data.currentBids, data.currentAsks, data.priceRange, data.bestBid, data.bestAsk);

    // 4. Walls (grandes liquidités)
    this.renderWalls(data.currentBids, data.currentAsks, data.priceRange);

    // 5. Ligne prix actuel
    this.renderCurrentPriceLine(data.midPrice, data.priceRange);

    // 6. Price ladder
    this.renderPriceLadder(data.priceRange, data.tickSize, data.midPrice, data.bestBid, data.bestAsk);

    // 7. Stats bar
    this.renderStatsBar(data.stats, data.midPrice);

    // 8. Crosshair
    if (data.mousePosition) {
      this.renderCrosshair(data.mousePosition, data.priceRange);
    }
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
    }
  }

  /**
   * Zone DOM avec barres horizontales style ATAS
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
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
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

    const barHeight = Math.max(3, this.config.cellHeight * this.config.settings.zoomLevel * 1.5);
    const maxBarWidth = Math.min(maxVolumePixelSize, domArea.width - 10);

    // Bids (barres cyan vers la droite)
    for (const [price, qty] of bids) {
      if (price < priceRange.min || price > priceRange.max) continue;
      const y = this.priceToY(price, priceRange, domArea.height);
      const barWidth = (qty / maxQty) * maxBarWidth;
      const isBest = Math.abs(price - bestBid) < this.tickSize / 2;

      this.ctx.fillStyle = isBest ? this.colors.bidBarBright : this.colors.bidBar;
      this.ctx.fillRect(domArea.x + 5, y - barHeight / 2, barWidth, barHeight);
    }

    // Asks (barres rose vers la droite)
    for (const [price, qty] of asks) {
      if (price < priceRange.min || price > priceRange.max) continue;
      const y = this.priceToY(price, priceRange, domArea.height);
      const barWidth = (qty / maxQty) * maxBarWidth;
      const isBest = Math.abs(price - bestAsk) < this.tickSize / 2;

      this.ctx.fillStyle = isBest ? this.colors.askBarBright : this.colors.askBar;
      this.ctx.fillRect(domArea.x + 5, y - barHeight / 2, barWidth, barHeight);
    }
  }

  /**
   * Render les walls (grandes liquidités) comme des barres rouges épaisses
   */
  private renderWalls(
    bids: Map<number, number>,
    asks: Map<number, number>,
    priceRange: PriceRange
  ): void {
    const { heatmapArea } = this.layout;

    // Calcule moyenne et écart-type
    const quantities: number[] = [];
    for (const [, qty] of bids) quantities.push(qty);
    for (const [, qty] of asks) quantities.push(qty);

    if (quantities.length < 5) return;

    const mean = quantities.reduce((a, b) => a + b, 0) / quantities.length;
    const variance = quantities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / quantities.length;
    const stdDev = Math.sqrt(variance);
    const wallThreshold = mean + stdDev * 2.5; // 2.5 écarts-types

    const barHeight = Math.max(4, this.config.cellHeight * this.config.settings.zoomLevel * 2);
    const rightEdge = heatmapArea.x + heatmapArea.width;

    // Walls bid (cyan vif)
    for (const [price, qty] of bids) {
      if (qty < wallThreshold) continue;
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = Math.min(1, (qty - wallThreshold) / (stdDev * 3));
      const barWidth = 40 + intensity * 60;

      this.ctx.fillStyle = this.colors.wallBid;
      this.ctx.globalAlpha = 0.6 + intensity * 0.4;
      this.ctx.fillRect(rightEdge - barWidth, y - barHeight / 2, barWidth, barHeight);
      this.ctx.globalAlpha = 1;
    }

    // Walls ask (rouge vif)
    for (const [price, qty] of asks) {
      if (qty < wallThreshold) continue;
      if (price < priceRange.min || price > priceRange.max) continue;

      const y = this.priceToY(price, priceRange, heatmapArea.height);
      const intensity = Math.min(1, (qty - wallThreshold) / (stdDev * 3));
      const barWidth = 40 + intensity * 60;

      this.ctx.fillStyle = this.colors.wallAsk;
      this.ctx.globalAlpha = 0.6 + intensity * 0.4;
      this.ctx.fillRect(rightEdge - barWidth, y - barHeight / 2, barWidth, barHeight);
      this.ctx.globalAlpha = 1;
    }
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
   * Échelle des prix style ATAS
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
   * Barre de statistiques style ATAS
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
   * Détruit le renderer
   */
  destroy(): void {
    // Cleanup
  }
}
