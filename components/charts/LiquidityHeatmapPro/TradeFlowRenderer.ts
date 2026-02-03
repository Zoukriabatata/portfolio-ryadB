/**
 * TRADE FLOW RENDERER - ATAS Style
 *
 * Rendu des bulles de trades sur la heatmap style ATAS.
 * - Cercles gris semi-transparents avec glow
 * - Camembert (pie chart) quand buy+sell au même prix/moment
 * - Mode cumulatif pour agréger les trades
 */

import type { TradeEvent, TradeFlowSettings, PriceRange } from '@/types/heatmap';

interface TradeFlowConfig extends TradeFlowSettings {
  minBubbleRadius: number;
  maxBubbleRadius: number;
  timeBucketMs: number;
  priceBucketTicks: number;
}

interface TradeBucket {
  price: number;
  timestamp: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
}

const DEFAULT_CONFIG: TradeFlowConfig = {
  enabled: true,
  buyColor: 'rgba(120, 255, 180, 0.6)',  // Vert clair
  sellColor: 'rgba(255, 120, 120, 0.6)', // Rouge clair
  bubbleShape: 'circle',
  cumulativeMode: false,
  filterThreshold: 0.5,
  showTextLabels: false,
  minBubbleRadius: 5,
  maxBubbleRadius: 35,
  timeBucketMs: 1000,
  priceBucketTicks: 1,
};

export class TradeFlowRenderer {
  private config: TradeFlowConfig;

  constructor(settings?: Partial<TradeFlowSettings>) {
    this.config = { ...DEFAULT_CONFIG, ...settings };
  }

  updateSettings(settings: Partial<TradeFlowSettings>): void {
    this.config = { ...this.config, ...settings };
  }

  /**
   * Rend les bulles de trades style ATAS
   */
  render(
    ctx: CanvasRenderingContext2D,
    trades: TradeEvent[],
    priceRange: PriceRange,
    areaWidth: number,
    areaHeight: number,
    tickSize: number,
    timeWindowMs: number,
    areaX: number = 0
  ): void {
    if (!this.config.enabled || trades.length === 0) return;

    const filteredTrades = this.filterTrades(trades);
    if (filteredTrades.length === 0) return;

    const maxVolume = Math.max(...filteredTrades.map(t => t.volume));
    if (maxVolume === 0) return;

    // Groupe les trades si mode cumulatif
    const tradesToRender = this.config.cumulativeMode
      ? this.groupTrades(filteredTrades, tickSize)
      : filteredTrades.map(t => ({
          price: t.price,
          timestamp: t.timestamp,
          buyVolume: t.side === 'buy' ? t.volume : 0,
          sellVolume: t.side === 'sell' ? t.volume : 0,
          totalVolume: t.volume,
        }));

    const maxGroupedVolume = Math.max(...tradesToRender.map(t => t.totalVolume));
    const now = Date.now();
    const windowStart = now - timeWindowMs;

    // Render chaque bulle
    for (const trade of tradesToRender) {
      if (trade.timestamp < windowStart) continue;
      if (trade.price < priceRange.min || trade.price > priceRange.max) continue;

      const x = this.timeToX(trade.timestamp, windowStart, now, areaWidth) + areaX;
      const y = this.priceToY(trade.price, priceRange, areaHeight);
      const radius = this.calculateRadius(trade.totalVolume, maxGroupedVolume);

      // Fade basé sur l'âge du trade
      const age = (now - trade.timestamp) / timeWindowMs;
      const opacity = Math.max(0.3, 1 - age * 0.6);

      const hasBothSides = trade.buyVolume > 0 && trade.sellVolume > 0;

      if (this.config.bubbleShape === 'pie' && hasBothSides) {
        this.renderPieChart(ctx, x, y, radius, trade.buyVolume, trade.sellVolume, opacity);
      } else {
        const side = trade.buyVolume >= trade.sellVolume ? 'buy' : 'sell';
        this.renderBubble(ctx, x, y, radius, side, opacity);
      }

      // Label si activé et bulle assez grande
      if (this.config.showTextLabels && radius > 12) {
        this.renderLabel(ctx, x, y, trade.totalVolume, opacity);
      }
    }
  }

  /**
   * Filtre les trades selon le seuil
   */
  private filterTrades(trades: TradeEvent[]): TradeEvent[] {
    if (this.config.filterThreshold <= 0) return trades;

    const avgVolume = trades.reduce((sum, t) => sum + t.volume, 0) / trades.length;
    const threshold = avgVolume * this.config.filterThreshold;

    return trades.filter(t => t.volume >= threshold);
  }

  /**
   * Groupe les trades par bucket
   */
  private groupTrades(trades: TradeEvent[], tickSize: number): TradeBucket[] {
    const buckets = new Map<string, TradeBucket>();

    for (const trade of trades) {
      const timeBucket = Math.floor(trade.timestamp / this.config.timeBucketMs) * this.config.timeBucketMs;
      const priceBucket = Math.round(trade.price / (tickSize * this.config.priceBucketTicks)) *
        (tickSize * this.config.priceBucketTicks);

      const key = `${timeBucket}-${priceBucket}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          price: priceBucket,
          timestamp: timeBucket,
          buyVolume: 0,
          sellVolume: 0,
          totalVolume: 0,
        });
      }

      const bucket = buckets.get(key)!;
      if (trade.side === 'buy') {
        bucket.buyVolume += trade.volume;
      } else {
        bucket.sellVolume += trade.volume;
      }
      bucket.totalVolume = bucket.buyVolume + bucket.sellVolume;
    }

    return Array.from(buckets.values());
  }

  /**
   * Calcule le rayon de la bulle
   */
  private calculateRadius(volume: number, maxVolume: number): number {
    const normalized = volume / maxVolume;
    const { minBubbleRadius, maxBubbleRadius } = this.config;
    return minBubbleRadius + Math.sqrt(normalized) * (maxBubbleRadius - minBubbleRadius);
  }

  /**
   * Rend une bulle style ATAS (gris avec glow)
   */
  private renderBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    side: 'buy' | 'sell',
    opacity: number
  ): void {
    ctx.save();

    // Glow effect
    const glowColor = side === 'buy' ? 'rgba(100, 255, 150, 0.3)' : 'rgba(255, 100, 100, 0.3)';
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Bulle principale (gris semi-transparent style ATAS)
    ctx.globalAlpha = opacity * 0.7;
    ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner gradient pour effet 3D
    const innerGradient = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.3,
      0,
      x,
      y,
      radius
    );
    innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    innerGradient.addColorStop(0.5, 'rgba(200, 200, 200, 0.2)');
    innerGradient.addColorStop(1, 'rgba(100, 100, 100, 0.1)');

    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bordure colorée selon le side
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = side === 'buy' ? 'rgba(100, 255, 150, 0.8)' : 'rgba(255, 100, 100, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Rend un camembert style ATAS
   */
  private renderPieChart(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    buyVolume: number,
    sellVolume: number,
    opacity: number
  ): void {
    const total = buyVolume + sellVolume;
    if (total === 0) return;

    const buyAngle = (buyVolume / total) * Math.PI * 2;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.5);
    gradient.addColorStop(0, 'rgba(200, 200, 200, 0.3)');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Portion buy (vert)
    ctx.globalAlpha = opacity * 0.85;
    ctx.fillStyle = 'rgba(100, 255, 150, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + buyAngle);
    ctx.closePath();
    ctx.fill();

    // Portion sell (rouge)
    ctx.fillStyle = 'rgba(255, 100, 100, 0.7)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2 + buyAngle, -Math.PI / 2 + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Bordure blanche
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Ligne de séparation
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + Math.cos(-Math.PI / 2 + buyAngle) * radius,
      y + Math.sin(-Math.PI / 2 + buyAngle) * radius
    );
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Rend le label de volume
   */
  private renderLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    volume: number,
    opacity: number
  ): void {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = 'bold 10px JetBrains Mono, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = volume >= 1000
      ? (volume / 1000).toFixed(1) + 'K'
      : volume.toFixed(0);

    // Ombre du texte
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(text, x + 1, y + 1);

    // Texte principal
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  /**
   * Conversion timestamp → X
   */
  private timeToX(
    timestamp: number,
    windowStart: number,
    windowEnd: number,
    width: number
  ): number {
    const ratio = (timestamp - windowStart) / (windowEnd - windowStart);
    return ratio * width;
  }

  /**
   * Conversion prix → Y
   */
  private priceToY(price: number, priceRange: PriceRange, height: number): number {
    const ratio = (price - priceRange.min) / (priceRange.max - priceRange.min);
    return height * (1 - ratio);
  }
}
