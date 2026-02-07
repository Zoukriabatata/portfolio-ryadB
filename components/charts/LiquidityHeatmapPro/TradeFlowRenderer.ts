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
  buyColor: 'rgba(34, 197, 94, 0.7)',
  sellColor: 'rgba(239, 68, 68, 0.7)',
  bubbleShape: 'circle',
  cumulativeMode: true,
  filterThreshold: 0.3,
  showTextLabels: false,
  bubbleSize: 0.6,
  bubbleOpacity: 0.7,
  bubbleBorderWidth: 1.5,
  bubbleBorderColor: 'auto',
  // Enhanced effects
  glowEnabled: true,
  glowIntensity: 0.6,
  showGradient: true,
  rippleEnabled: true,
  largeTradeThreshold: 2.0,
  sizeScaling: 'sqrt',
  popInAnimation: true,
  // Config-specific
  minBubbleRadius: 2,
  maxBubbleRadius: 18,
  timeBucketMs: 500,
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
   * Rend les bulles de trades style ATAS - FIXÉ: position fixe par rapport au temps absolu
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

    // FIXÉ: Utiliser les timestamps des trades pour calculer la fenêtre temporelle
    if (tradesToRender.length === 0) return;

    const timestamps = tradesToRender.map(t => t.timestamp);
    const oldestTimestamp = Math.min(...timestamps);
    const newestTimestamp = Math.max(...timestamps);

    // Render chaque bulle - TOUTES les bulles, pas de filtrage temporel
    for (const trade of tradesToRender) {
      // Seulement filtrer par prix (garder toutes les bulles dans le temps)
      if (trade.price < priceRange.min || trade.price > priceRange.max) continue;

      // FIXÉ: Position X fixe basée sur le timestamp absolu du trade
      // La bulle reste DÉFINITIVEMENT à sa position temporelle d'origine
      const x = this.timeToX(trade.timestamp, oldestTimestamp, newestTimestamp, areaWidth) + areaX;
      const y = this.priceToY(trade.price, priceRange, areaHeight);
      const radius = this.calculateRadius(trade.totalVolume, maxGroupedVolume);

      // Opacité complète - les bulles ne disparaissent JAMAIS
      const opacity = 1.0;

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
   * Calcule le rayon de la bulle avec le multiplicateur de taille
   */
  private calculateRadius(volume: number, maxVolume: number): number {
    const normalized = volume / maxVolume;
    const { minBubbleRadius, maxBubbleRadius, bubbleSize = 0.6 } = this.config;
    const baseRadius = minBubbleRadius + Math.sqrt(normalized) * (maxBubbleRadius - minBubbleRadius);
    return baseRadius * bubbleSize;
  }

  /**
   * Rend une bulle simple et propre (optimisé FPS)
   */
  private renderBubble(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    side: 'buy' | 'sell',
    opacity: number
  ): void {
    if (radius < 1) return; // Skip tiny bubbles

    const bubbleOpacity = this.config.bubbleOpacity || 0.7;
    const borderWidth = this.config.bubbleBorderWidth ?? 1.5;
    const finalOpacity = opacity * bubbleOpacity;

    const color = side === 'buy'
      ? { r: 34, g: 197, b: 94 }   // Green
      : { r: 239, g: 68, b: 68 };  // Red

    ctx.save();
    ctx.globalAlpha = finalOpacity;

    // Simple filled circle
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.45)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border (configurable)
    if (borderWidth > 0) {
      ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.85)`;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Rend un camembert simple (optimisé FPS)
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
    if (radius < 2) return;

    const total = buyVolume + sellVolume;
    if (total === 0) return;

    const bubbleOpacity = this.config.bubbleOpacity || 0.7;
    const finalOpacity = opacity * bubbleOpacity;
    const buyAngle = (buyVolume / total) * Math.PI * 2;

    ctx.save();
    ctx.globalAlpha = finalOpacity;

    // Buy portion (green)
    ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + buyAngle);
    ctx.closePath();
    ctx.fill();

    // Sell portion (red)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, -Math.PI / 2 + buyAngle, -Math.PI / 2 + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Border
    const dominant = buyVolume > sellVolume;
    ctx.strokeStyle = dominant ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)';
    ctx.lineWidth = Math.max(1, radius * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
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
    const range = windowEnd - windowStart;
    if (range === 0) return width * 0.5; // Center if all trades at same timestamp
    const ratio = (timestamp - windowStart) / range;
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
