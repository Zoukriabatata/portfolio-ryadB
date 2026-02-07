/**
 * ABSORPTION LEVEL MARKER
 *
 * Renders horizontal markers on the chart to indicate key absorption levels:
 * - HELD (bounce): Solid green line with checkmark - price bounced from this level
 * - BROKE (flip): Dashed red line with X - level was broken through
 * - RETEST: Double green line with arrows - price retested and held again
 */

import type { PassiveOrderLevel, PassiveOrderSide } from '@/types/passive-liquidity';
import type { PriceRange } from '@/types/heatmap';

export type LevelMarkerType = 'held' | 'broke' | 'retest' | 'absorbing';

export interface AbsorptionLevelEvent {
  price: number;
  side: PassiveOrderSide;
  type: LevelMarkerType;
  timestamp: number;
  volumeAbsorbed: number;
  bounceCount?: number;     // For retest tracking
}

export interface AbsorptionLevelMarkerSettings {
  enabled: boolean;
  showLabels: boolean;
  lineWidth: number;
  heldColor: string;
  brokeColor: string;
  retestColor: string;
  absorbingColor: string;
  fadeAfterMs: number;      // How long markers stay visible
}

export const DEFAULT_LEVEL_MARKER_SETTINGS: AbsorptionLevelMarkerSettings = {
  enabled: true,
  showLabels: true,
  lineWidth: 2,
  heldColor: '#22c55e',      // Green
  brokeColor: '#ef4444',     // Red
  retestColor: '#10b981',    // Emerald (double green)
  absorbingColor: '#f59e0b', // Amber
  fadeAfterMs: 60000,        // 1 minute
};

export class AbsorptionLevelMarker {
  private settings: AbsorptionLevelMarkerSettings;
  private events: AbsorptionLevelEvent[] = [];
  private maxEvents: number = 50;

  constructor(settings: Partial<AbsorptionLevelMarkerSettings> = {}) {
    this.settings = { ...DEFAULT_LEVEL_MARKER_SETTINGS, ...settings };
  }

  updateSettings(settings: Partial<AbsorptionLevelMarkerSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Record an absorption event
   */
  recordEvent(event: AbsorptionLevelEvent): void {
    // Check if we already have an event at this price
    const existingIdx = this.events.findIndex(
      e => Math.abs(e.price - event.price) < 0.01 && e.side === event.side
    );

    if (existingIdx >= 0) {
      // Update existing event
      const existing = this.events[existingIdx];

      // If it was held and now broke, update to broke
      if (existing.type === 'held' && event.type === 'broke') {
        this.events[existingIdx] = event;
      }
      // If held again, count as retest
      else if (existing.type === 'held' && event.type === 'held') {
        existing.type = 'retest';
        existing.bounceCount = (existing.bounceCount || 1) + 1;
        existing.timestamp = event.timestamp;
        existing.volumeAbsorbed += event.volumeAbsorbed;
      }
    } else {
      // Add new event
      this.events.push(event);

      // Keep only recent events
      if (this.events.length > this.maxEvents) {
        this.events.shift();
      }
    }
  }

  /**
   * Get active events within time window
   */
  getActiveEvents(): AbsorptionLevelEvent[] {
    const now = Date.now();
    return this.events.filter(e => now - e.timestamp < this.settings.fadeAfterMs);
  }

  /**
   * Render level markers
   */
  render(
    ctx: CanvasRenderingContext2D,
    priceRange: PriceRange,
    areaX: number,
    areaY: number,
    areaWidth: number,
    areaHeight: number
  ): void {
    if (!this.settings.enabled) return;

    const activeEvents = this.getActiveEvents();
    if (activeEvents.length === 0) return;

    const now = Date.now();

    for (const event of activeEvents) {
      // Skip if outside visible range
      if (event.price < priceRange.min || event.price > priceRange.max) continue;

      // Calculate Y position
      const priceRatio = (event.price - priceRange.min) / (priceRange.max - priceRange.min);
      const y = areaY + areaHeight - (priceRatio * areaHeight);

      // Calculate opacity based on age
      const age = now - event.timestamp;
      const opacity = Math.max(0.3, 1 - (age / this.settings.fadeAfterMs));

      ctx.globalAlpha = opacity;

      // Draw based on type
      switch (event.type) {
        case 'held':
          this.drawHeldLine(ctx, areaX, y, areaWidth, event);
          break;
        case 'broke':
          this.drawBrokeLine(ctx, areaX, y, areaWidth, event);
          break;
        case 'retest':
          this.drawRetestLine(ctx, areaX, y, areaWidth, event);
          break;
        case 'absorbing':
          this.drawAbsorbingLine(ctx, areaX, y, areaWidth, event);
          break;
      }

      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw HELD marker - solid line with checkmark
   */
  private drawHeldLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    event: AbsorptionLevelEvent
  ): void {
    const { heldColor, lineWidth } = this.settings;

    // Solid line
    ctx.strokeStyle = heldColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    // Checkmark icon
    const iconX = x + width / 2;
    ctx.strokeStyle = heldColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iconX - 6, y);
    ctx.lineTo(iconX - 2, y + 4);
    ctx.lineTo(iconX + 6, y - 6);
    ctx.stroke();

    // Label
    if (this.settings.showLabels) {
      ctx.fillStyle = heldColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('HELD', x + width - 10, y - 5);
    }
  }

  /**
   * Draw BROKE marker - dashed line with X
   */
  private drawBrokeLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    event: AbsorptionLevelEvent
  ): void {
    const { brokeColor, lineWidth } = this.settings;

    // Dashed line
    ctx.strokeStyle = brokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // X icon
    const iconX = x + width / 2;
    ctx.strokeStyle = brokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(iconX - 5, y - 5);
    ctx.lineTo(iconX + 5, y + 5);
    ctx.moveTo(iconX + 5, y - 5);
    ctx.lineTo(iconX - 5, y + 5);
    ctx.stroke();

    // Label
    if (this.settings.showLabels) {
      ctx.fillStyle = brokeColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('BROKE', x + width - 10, y - 5);
    }
  }

  /**
   * Draw RETEST marker - double line with circular arrows
   */
  private drawRetestLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    event: AbsorptionLevelEvent
  ): void {
    const { retestColor, lineWidth } = this.settings;

    // Double line
    ctx.strokeStyle = retestColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + width, y - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + width, y + 2);
    ctx.stroke();

    // Circular arrow icon (retest symbol)
    const iconX = x + width / 2;
    ctx.beginPath();
    ctx.arc(iconX, y, 6, 0, Math.PI * 1.5);
    ctx.stroke();
    // Arrow head
    ctx.beginPath();
    ctx.moveTo(iconX - 2, y - 6);
    ctx.lineTo(iconX, y - 10);
    ctx.lineTo(iconX + 2, y - 6);
    ctx.stroke();

    // Label with bounce count
    if (this.settings.showLabels) {
      ctx.fillStyle = retestColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      const label = event.bounceCount && event.bounceCount > 1
        ? `RETEST x${event.bounceCount}`
        : 'RETEST';
      ctx.fillText(label, x + width - 10, y - 8);
    }
  }

  /**
   * Draw ABSORBING marker - animated pulsing line
   */
  private drawAbsorbingLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    event: AbsorptionLevelEvent
  ): void {
    const { absorbingColor, lineWidth } = this.settings;

    // Pulsing effect
    const pulse = (Date.now() % 1000) / 1000;
    const pulseAlpha = 0.5 + Math.sin(pulse * Math.PI * 2) * 0.5;

    // Main line
    ctx.strokeStyle = absorbingColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([4, 2]);
    ctx.globalAlpha *= pulseAlpha;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glow effect
    ctx.shadowColor = absorbingColor;
    ctx.shadowBlur = 10 * pulseAlpha;
    ctx.strokeStyle = absorbingColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    if (this.settings.showLabels) {
      ctx.fillStyle = absorbingColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('ABSORBING', x + width - 10, y - 5);
    }
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
}
