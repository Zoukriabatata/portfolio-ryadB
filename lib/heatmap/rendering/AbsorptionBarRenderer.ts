/**
 * ABSORPTION BAR RENDERER
 *
 * Renders passive order bars that SHRINK when absorbed by aggressive trades.
 * Visual feedback for orderflow traders:
 * - Active orders: Full bar width
 * - Absorbing orders: Shrinking bar with pulse glow
 * - Executed orders: Fade out animation
 * - Spoofed orders: Yellow flash then disappear
 * - Iceberg orders: Dotted border, flash on refill
 */

import type { PassiveOrderLevel, PassiveOrderStatus, PassiveOrderSide } from '@/types/passive-liquidity';
import type { PriceRange } from '@/types/heatmap';

export interface AbsorptionBarSettings {
  enabled: boolean;
  barWidth: number;           // Max bar width in pixels
  showLabels: boolean;        // Show volume labels
  pulseEnabled: boolean;      // Pulse animation on absorbing
  fadeOutDuration: number;    // ms for executed fade out
  icebergBorderStyle: 'dotted' | 'dashed';
}

export const DEFAULT_ABSORPTION_BAR_SETTINGS: AbsorptionBarSettings = {
  enabled: true,
  barWidth: 80,
  showLabels: true,
  pulseEnabled: true,
  fadeOutDuration: 800,
  icebergBorderStyle: 'dotted',
};

// Colors for different states
const COLORS = {
  // Bid (passive buyers above price)
  bidActive: 'rgba(34, 211, 238, 0.75)',        // Cyan
  bidAbsorbing: 'rgba(0, 229, 255, 0.95)',      // Bright cyan + glow
  bidExecuted: 'rgba(38, 166, 154, 0.5)',       // Teal 50% opacity
  bidGlow: 'rgba(0, 229, 255, 0.4)',            // Cyan glow

  // Ask (passive sellers below price)
  askActive: 'rgba(239, 83, 80, 0.75)',         // Red
  askAbsorbing: 'rgba(255, 82, 82, 0.95)',      // Bright red + glow
  askExecuted: 'rgba(229, 115, 115, 0.5)',      // Light red 50% opacity
  askGlow: 'rgba(255, 82, 82, 0.4)',            // Red glow

  // Spoofed
  spoofed: 'rgba(255, 235, 59, 0.9)',           // Yellow
  spoofedGlow: 'rgba(255, 235, 59, 0.5)',

  // Iceberg
  icebergBorder: 'rgba(255, 255, 255, 0.6)',
  icebergRefillFlash: 'rgba(255, 255, 255, 0.8)',

  // Labels
  labelText: 'rgba(255, 255, 255, 0.9)',
  labelBg: 'rgba(0, 0, 0, 0.6)',
};

export class AbsorptionBarRenderer {
  private settings: AbsorptionBarSettings;
  private animationTime: number = 0;

  // Track recently refilled icebergs for flash effect
  private recentRefills: Map<string, number> = new Map();

  constructor(settings: Partial<AbsorptionBarSettings> = {}) {
    this.settings = { ...DEFAULT_ABSORPTION_BAR_SETTINGS, ...settings };
  }

  updateSettings(settings: Partial<AbsorptionBarSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Mark a level as recently refilled (iceberg)
   */
  markIcebergRefill(levelKey: string): void {
    this.recentRefills.set(levelKey, Date.now());
  }

  /**
   * Render absorption bars for all passive levels
   */
  render(
    ctx: CanvasRenderingContext2D,
    levels: Map<string, PassiveOrderLevel>,
    priceRange: PriceRange,
    areaX: number,
    areaY: number,
    areaWidth: number,
    areaHeight: number,
    tickSize: number,
    maxBidVolume: number,
    maxAskVolume: number
  ): void {
    if (!this.settings.enabled || levels.size === 0) return;

    this.animationTime = Date.now();

    // Clean up old refill markers (500ms flash)
    for (const [key, time] of this.recentRefills) {
      if (this.animationTime - time > 500) {
        this.recentRefills.delete(key);
      }
    }

    const pricePerPixel = (priceRange.max - priceRange.min) / areaHeight;
    const barHeight = Math.max(2, tickSize / pricePerPixel * 0.8);

    // Draw bars from furthest to nearest price (painters algorithm)
    const sortedLevels = Array.from(levels.values()).sort((a, b) => {
      const aDist = Math.abs(a.price - (priceRange.min + priceRange.max) / 2);
      const bDist = Math.abs(b.price - (priceRange.min + priceRange.max) / 2);
      return bDist - aDist;
    });

    for (const level of sortedLevels) {
      this.renderBar(
        ctx,
        level,
        priceRange,
        areaX,
        areaY,
        areaWidth,
        areaHeight,
        barHeight,
        level.side === 'bid' ? maxBidVolume : maxAskVolume
      );
    }
  }

  /**
   * Render a single absorption bar
   */
  private renderBar(
    ctx: CanvasRenderingContext2D,
    level: PassiveOrderLevel,
    priceRange: PriceRange,
    areaX: number,
    areaY: number,
    areaWidth: number,
    areaHeight: number,
    barHeight: number,
    maxVolume: number
  ): void {
    // Skip if outside visible range
    if (level.price < priceRange.min || level.price > priceRange.max) return;

    // Skip if fully faded
    if (level.opacity <= 0) return;

    // Calculate Y position (price increases upward)
    const priceRatio = (level.price - priceRange.min) / (priceRange.max - priceRange.min);
    const y = areaY + areaHeight - (priceRatio * areaHeight) - barHeight / 2;

    // Calculate bar width based on displayWidth (shrinks during absorption)
    const normalizedVolume = maxVolume > 0 ? level.initialVolume / maxVolume : 0.5;
    const maxBarWidth = Math.min(this.settings.barWidth, areaWidth * 0.3) * normalizedVolume;
    const currentWidth = maxBarWidth * level.displayWidth;

    // Position: Bids on right side of heatmap, Asks on left
    const x = level.side === 'bid'
      ? areaX + areaWidth - currentWidth - 10  // Right side for bids
      : areaX + 10;                             // Left side for asks

    // Get colors based on status and side
    const { fillColor, glowColor } = this.getColors(level);

    // Apply opacity
    ctx.globalAlpha = level.opacity;

    // Draw glow for absorbing state
    if (level.status === 'absorbing' && this.settings.pulseEnabled) {
      const pulsePhase = (this.animationTime % 500) / 500;
      const pulseIntensity = 0.5 + Math.sin(pulsePhase * Math.PI * 2) * 0.5;

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 15 * pulseIntensity;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Draw main bar
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, currentWidth, barHeight);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw iceberg border
    if (level.isIceberg && level.hiddenVolume > 0) {
      ctx.strokeStyle = COLORS.icebergBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash(this.settings.icebergBorderStyle === 'dotted' ? [2, 2] : [4, 4]);
      ctx.strokeRect(x, y, currentWidth, barHeight);
      ctx.setLineDash([]);

      // Flash effect on refill
      const levelKey = `${level.price}_${level.side}`;
      if (this.recentRefills.has(levelKey)) {
        const flashAge = this.animationTime - this.recentRefills.get(levelKey)!;
        const flashOpacity = 1 - (flashAge / 500);
        ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity * 0.8})`;
        ctx.fillRect(x, y, currentWidth, barHeight);
      }
    }

    // Draw remaining bar segment (ghost of consumed portion)
    if (level.displayWidth < 1 && level.displayWidth > 0) {
      const consumedWidth = maxBarWidth - currentWidth;
      const ghostX = level.side === 'bid'
        ? areaX + areaWidth - maxBarWidth - 10
        : areaX + 10 + currentWidth;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(ghostX, y, consumedWidth, barHeight);
    }

    // Draw volume label
    if (this.settings.showLabels && currentWidth > 30) {
      this.drawVolumeLabel(ctx, level, x, y, currentWidth, barHeight);
    }

    ctx.globalAlpha = 1;
  }

  /**
   * Get colors based on level status and side
   */
  private getColors(level: PassiveOrderLevel): { fillColor: string; glowColor: string } {
    const { status, side } = level;

    if (status === 'spoofed') {
      return { fillColor: COLORS.spoofed, glowColor: COLORS.spoofedGlow };
    }

    if (side === 'bid') {
      switch (status) {
        case 'absorbing':
          return { fillColor: COLORS.bidAbsorbing, glowColor: COLORS.bidGlow };
        case 'executed':
          return { fillColor: COLORS.bidExecuted, glowColor: 'transparent' };
        default:
          return { fillColor: COLORS.bidActive, glowColor: 'transparent' };
      }
    } else {
      switch (status) {
        case 'absorbing':
          return { fillColor: COLORS.askAbsorbing, glowColor: COLORS.askGlow };
        case 'executed':
          return { fillColor: COLORS.askExecuted, glowColor: 'transparent' };
        default:
          return { fillColor: COLORS.askActive, glowColor: 'transparent' };
      }
    }
  }

  /**
   * Draw volume label on bar
   */
  private drawVolumeLabel(
    ctx: CanvasRenderingContext2D,
    level: PassiveOrderLevel,
    x: number,
    y: number,
    barWidth: number,
    barHeight: number
  ): void {
    const volume = level.remainingVolume;
    const text = this.formatVolume(volume);

    ctx.font = '10px monospace';
    const textWidth = ctx.measureText(text).width;

    // Position label inside or outside bar depending on space
    const labelX = level.side === 'bid'
      ? x + barWidth - textWidth - 4
      : x + 4;
    const labelY = y + barHeight / 2 + 3;

    // Background
    ctx.fillStyle = COLORS.labelBg;
    ctx.fillRect(labelX - 2, y + 2, textWidth + 4, barHeight - 4);

    // Text
    ctx.fillStyle = COLORS.labelText;
    ctx.fillText(text, labelX, labelY);

    // Show iceberg indicator
    if (level.isIceberg && level.hiddenVolume > 0) {
      const iceText = `+${this.formatVolume(level.hiddenVolume)}`;
      const iceX = level.side === 'bid'
        ? labelX - ctx.measureText(iceText).width - 6
        : labelX + textWidth + 6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(iceText, iceX, labelY);
    }
  }

  /**
   * Format volume for display
   */
  private formatVolume(volume: number): string {
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    if (volume >= 100) return Math.round(volume).toString();
    if (volume >= 10) return volume.toFixed(1);
    return volume.toFixed(2);
  }
}
