/**
 * CLUSTER RENDERER — Lightweight footprint cluster overlay for /live chart
 *
 * Renders bid/ask volume bars per price level on each visible candle.
 * Designed to work with the RenderContext from useDrawingTools (priceToY, timeToX).
 */

import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';

export interface ClusterRenderConfig {
  opacity: number;
  tickSize: number;
  bidColor: string;
  askColor: string;
  pocColor: string;
  showPOC: boolean;
  showImbalances: boolean;
  showTextLabels: boolean;
  minZoomForText: number;
}

const DEFAULT_CONFIG: ClusterRenderConfig = {
  opacity: 0.8,
  tickSize: 10,
  bidColor: '#ef4444',
  askColor: '#22c55e',
  pocColor: '#fbbf24',
  showPOC: true,
  showImbalances: true,
  showTextLabels: true,
  minZoomForText: 40,
};

export class ClusterRenderer {
  private config: ClusterRenderConfig;

  constructor(config?: Partial<ClusterRenderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<ClusterRenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  renderClusters(
    ctx: CanvasRenderingContext2D,
    candles: FootprintCandle[],
    priceToY: (price: number) => number,
    timeToX: (time: number) => number,
    chartWidth: number,
    chartHeight: number,
    candleWidth: number,
  ): void {
    if (candles.length === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartWidth, chartHeight);
    ctx.clip();

    const showText = this.config.showTextLabels && candleWidth >= this.config.minZoomForText;
    const barMaxW = Math.max(4, (candleWidth / 2) - 4);

    for (const candle of candles) {
      const centerX = timeToX(candle.time);

      // Skip if outside visible area
      if (centerX < -candleWidth || centerX > chartWidth + candleWidth) continue;
      if (candle.levels.size === 0) continue;

      // Find max level volume for normalization within this candle
      let maxLevelVol = 1;
      candle.levels.forEach(level => {
        maxLevelVol = Math.max(maxLevelVol, level.bidVolume, level.askVolume);
      });

      // Calculate row height from tick size
      const rowH = Math.max(2, Math.abs(priceToY(0) - priceToY(this.config.tickSize)));

      candle.levels.forEach((level, price) => {
        const y = priceToY(price);
        if (y < -rowH || y > chartHeight + rowH) return;

        const cellY = y - rowH / 2;
        const barH = Math.max(1, rowH - 1);

        // Bid bar (left side, red)
        if (level.bidVolume > 0) {
          const intensity = level.bidVolume / maxLevelVol;
          const bidW = Math.max(1, intensity * barMaxW);
          ctx.fillStyle = this.config.bidColor;
          ctx.globalAlpha = this.config.opacity * (0.15 + intensity * 0.4);
          ctx.fillRect(centerX - 1 - bidW, cellY, bidW, barH);
        }

        // Ask bar (right side, green)
        if (level.askVolume > 0) {
          const intensity = level.askVolume / maxLevelVol;
          const askW = Math.max(1, intensity * barMaxW);
          ctx.fillStyle = this.config.askColor;
          ctx.globalAlpha = this.config.opacity * (0.15 + intensity * 0.4);
          ctx.fillRect(centerX + 1, cellY, askW, barH);
        }

        // POC highlight
        if (this.config.showPOC && price === candle.poc) {
          ctx.fillStyle = this.config.pocColor;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(centerX - candleWidth / 2 + 2, cellY, candleWidth - 4, barH);
          ctx.globalAlpha = 1;
        }

        // Imbalance markers
        if (this.config.showImbalances) {
          if (level.imbalanceBuy) {
            ctx.fillStyle = this.config.askColor;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(centerX + barMaxW + 3, cellY + 2, 2, Math.max(1, barH - 4));
          }
          if (level.imbalanceSell) {
            ctx.fillStyle = this.config.bidColor;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(centerX - barMaxW - 5, cellY + 2, 2, Math.max(1, barH - 4));
          }
        }

        // Text labels (only when zoomed in)
        if (showText && rowH >= 10) {
          ctx.globalAlpha = this.config.opacity * 0.85;
          const fontSize = Math.max(7, Math.min(10, rowH * 0.65));
          ctx.font = `${fontSize}px "Consolas", monospace`;
          const textY = y + fontSize / 3;

          if (level.bidVolume > 0) {
            ctx.fillStyle = price === candle.poc ? this.config.pocColor : this.config.bidColor;
            ctx.textAlign = 'right';
            ctx.fillText(this.formatVol(level.bidVolume), centerX - 3, textY);
          }
          if (level.askVolume > 0) {
            ctx.fillStyle = price === candle.poc ? this.config.pocColor : this.config.askColor;
            ctx.textAlign = 'left';
            ctx.fillText(this.formatVol(level.askVolume), centerX + 3, textY);
          }
        }
      });
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private formatVol(vol: number): string {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return Math.round(vol).toString();
  }
}
