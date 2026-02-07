/**
 * INSTITUTIONAL COLOR ENGINE - Professional Grade Color Mapping
 *
 * Implements dynamic color scaling with percentile-based cutoffs,
 * logarithmic scaling, and gamma correction for optimal visualization.
 */

import type { ColorStop, ColorConfig, LiquidityStats } from '../core/types';

// Bookmap-inspired gradient: Blue → Cyan → Green → Yellow → Orange → Red
const BOOKMAP_BID_GRADIENT: ColorStop[] = [
  { position: 0.00, r: 8, g: 12, b: 20, a: 0.0 },
  { position: 0.05, r: 10, g: 30, b: 50, a: 0.25 },
  { position: 0.15, r: 20, g: 60, b: 90, a: 0.4 },
  { position: 0.25, r: 30, g: 100, b: 130, a: 0.55 },
  { position: 0.35, r: 34, g: 140, b: 160, a: 0.65 },
  { position: 0.45, r: 34, g: 180, b: 180, a: 0.72 },
  { position: 0.55, r: 34, g: 211, b: 180, a: 0.78 },
  { position: 0.65, r: 80, g: 220, b: 150, a: 0.82 },
  { position: 0.75, r: 140, g: 230, b: 100, a: 0.86 },
  { position: 0.85, r: 200, g: 230, b: 60, a: 0.9 },
  { position: 0.95, r: 240, g: 200, b: 40, a: 0.95 },
  { position: 1.00, r: 255, g: 255, b: 100, a: 1.0 },
];

const BOOKMAP_ASK_GRADIENT: ColorStop[] = [
  { position: 0.00, r: 20, g: 8, b: 12, a: 0.0 },
  { position: 0.05, r: 50, g: 15, b: 20, a: 0.25 },
  { position: 0.15, r: 90, g: 25, b: 35, a: 0.4 },
  { position: 0.25, r: 130, g: 35, b: 45, a: 0.55 },
  { position: 0.35, r: 170, g: 45, b: 55, a: 0.65 },
  { position: 0.45, r: 200, g: 55, b: 60, a: 0.72 },
  { position: 0.55, r: 220, g: 70, b: 70, a: 0.78 },
  { position: 0.65, r: 235, g: 90, b: 80, a: 0.82 },
  { position: 0.75, r: 245, g: 120, b: 90, a: 0.86 },
  { position: 0.85, r: 250, g: 160, b: 100, a: 0.9 },
  { position: 0.95, r: 255, g: 200, b: 120, a: 0.95 },
  { position: 1.00, r: 255, g: 240, b: 150, a: 1.0 },
];

// ATAS-style thermal gradient
const ATAS_BID_GRADIENT: ColorStop[] = [
  { position: 0.00, r: 6, g: 10, b: 16, a: 0.0 },
  { position: 0.10, r: 15, g: 25, b: 50, a: 0.3 },
  { position: 0.20, r: 30, g: 40, b: 90, a: 0.45 },
  { position: 0.30, r: 50, g: 50, b: 130, a: 0.55 },
  { position: 0.40, r: 80, g: 60, b: 160, a: 0.65 },
  { position: 0.50, r: 120, g: 70, b: 180, a: 0.72 },
  { position: 0.60, r: 160, g: 80, b: 180, a: 0.78 },
  { position: 0.70, r: 200, g: 90, b: 160, a: 0.84 },
  { position: 0.80, r: 230, g: 100, b: 120, a: 0.88 },
  { position: 0.90, r: 250, g: 130, b: 80, a: 0.92 },
  { position: 1.00, r: 255, g: 180, b: 50, a: 1.0 },
];

const ATAS_ASK_GRADIENT: ColorStop[] = ATAS_BID_GRADIENT; // Same for ATAS

// Thermal gradient (fire)
const THERMAL_GRADIENT: ColorStop[] = [
  { position: 0.00, r: 0, g: 0, b: 0, a: 0.0 },
  { position: 0.15, r: 30, g: 0, b: 10, a: 0.35 },
  { position: 0.30, r: 100, g: 10, b: 10, a: 0.5 },
  { position: 0.45, r: 180, g: 40, b: 10, a: 0.65 },
  { position: 0.60, r: 230, g: 90, b: 20, a: 0.78 },
  { position: 0.75, r: 255, g: 160, b: 50, a: 0.88 },
  { position: 0.90, r: 255, g: 220, b: 120, a: 0.95 },
  { position: 1.00, r: 255, g: 255, b: 200, a: 1.0 },
];

export class InstitutionalColorEngine {
  private config: ColorConfig;
  private bidGradient: ColorStop[] = [];
  private askGradient: ColorStop[] = [];
  private colorCache: Map<string, string> = new Map();
  private maxCacheSize: number = 1000;

  constructor(config?: Partial<ColorConfig>) {
    this.config = {
      scheme: 'bookmap',
      bidGradient: BOOKMAP_BID_GRADIENT,
      askGradient: BOOKMAP_ASK_GRADIENT,
      upperCutoffPercentile: 97,
      lowerCutoffPercentile: 5,
      useLogScale: true,
      gamma: 1.2,
      ...config,
    };
    this.bidGradient = this.config.bidGradient;
    this.askGradient = this.config.askGradient;

    this.setScheme(this.config.scheme);
  }

  /**
   * Set color scheme
   */
  setScheme(scheme: 'bookmap' | 'atas' | 'thermal' | 'custom'): void {
    this.config.scheme = scheme;
    this.colorCache.clear();

    switch (scheme) {
      case 'bookmap':
        this.bidGradient = BOOKMAP_BID_GRADIENT;
        this.askGradient = BOOKMAP_ASK_GRADIENT;
        break;
      case 'atas':
        this.bidGradient = ATAS_BID_GRADIENT;
        this.askGradient = ATAS_ASK_GRADIENT;
        break;
      case 'thermal':
        this.bidGradient = THERMAL_GRADIENT;
        this.askGradient = THERMAL_GRADIENT;
        break;
      case 'custom':
        // Keep current gradients
        break;
    }
  }

  /**
   * Set custom gradients
   */
  setCustomGradients(bid: ColorStop[], ask: ColorStop[]): void {
    this.bidGradient = bid;
    this.askGradient = ask;
    this.config.scheme = 'custom';
    this.colorCache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ColorConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.scheme) {
      this.setScheme(config.scheme);
    }
    this.colorCache.clear();
  }

  /**
   * Get color for a liquidity value
   */
  getColor(
    value: number,
    side: 'bid' | 'ask',
    stats: LiquidityStats
  ): string {
    if (value <= 0) {
      return 'transparent';
    }

    // Apply percentile cutoffs
    const lowerCutoff = stats.p5 || 0;
    const upperCutoff = stats.p97 || stats.max || 1;

    // Normalize value to 0-1 range
    let normalized = (value - lowerCutoff) / (upperCutoff - lowerCutoff);
    normalized = Math.max(0, Math.min(1, normalized));

    // Apply logarithmic scaling if enabled
    if (this.config.useLogScale && normalized > 0) {
      // Log scale: log(1 + x * 9) / log(10) maps 0-1 to 0-1 with more resolution at low values
      normalized = Math.log1p(normalized * 9) / Math.log(10);
    }

    // Apply gamma correction
    normalized = Math.pow(normalized, 1 / this.config.gamma);

    // Cache lookup
    const cacheKey = `${side}-${(normalized * 1000).toFixed(0)}`;
    const cached = this.colorCache.get(cacheKey);
    if (cached) return cached;

    // Interpolate gradient
    const gradient = side === 'bid' ? this.bidGradient : this.askGradient;
    const color = this.interpolateGradient(gradient, normalized);

    // Convert to rgba string
    const result = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a.toFixed(3)})`;

    // Cache result
    if (this.colorCache.size >= this.maxCacheSize) {
      // Clear half the cache when full
      const keys = Array.from(this.colorCache.keys()).slice(0, this.maxCacheSize / 2);
      for (const key of keys) {
        this.colorCache.delete(key);
      }
    }
    this.colorCache.set(cacheKey, result);

    return result;
  }

  /**
   * Interpolate between gradient stops
   */
  private interpolateGradient(
    gradient: ColorStop[],
    position: number
  ): { r: number; g: number; b: number; a: number } {
    // Find surrounding stops
    let lower = gradient[0];
    let upper = gradient[gradient.length - 1];

    for (let i = 0; i < gradient.length - 1; i++) {
      if (position >= gradient[i].position && position <= gradient[i + 1].position) {
        lower = gradient[i];
        upper = gradient[i + 1];
        break;
      }
    }

    // Calculate interpolation factor
    const range = upper.position - lower.position;
    const t = range > 0 ? (position - lower.position) / range : 0;

    // Smooth interpolation (ease in-out)
    const smoothT = t * t * (3 - 2 * t);

    // Interpolate each channel
    return {
      r: Math.round(lower.r + (upper.r - lower.r) * smoothT),
      g: Math.round(lower.g + (upper.g - lower.g) * smoothT),
      b: Math.round(lower.b + (upper.b - lower.b) * smoothT),
      a: lower.a + (upper.a - lower.a) * smoothT,
    };
  }

  /**
   * Get color for walls
   */
  getWallColor(strength: number, side: 'bid' | 'ask', isDefending: boolean): string {
    const baseColor = side === 'bid'
      ? { r: 34, g: 211, b: 238 }   // Cyan
      : { r: 239, g: 68, b: 68 };    // Red

    const alpha = isDefending
      ? 0.6 + strength * 0.3
      : 0.4 + strength * 0.3;

    // Add yellow tint for defending walls
    if (isDefending) {
      return `rgba(${Math.min(255, baseColor.r + 60)}, ${Math.min(255, baseColor.g + 40)}, ${baseColor.b}, ${alpha.toFixed(2)})`;
    }

    return `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${alpha.toFixed(2)})`;
  }

  /**
   * Get color for spoofing indicator
   */
  getSpoofColor(confidence: number): string {
    // Yellow to orange based on confidence
    const r = 250;
    const g = Math.round(220 - confidence * 80);
    const b = Math.round(50 - confidence * 30);
    const a = 0.6 + confidence * 0.3;

    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  }

  /**
   * Get color for absorption indicator
   */
  getAbsorptionColor(
    strength: number,
    side: 'bid' | 'ask',
    action: 'bounce' | 'break' | 'ongoing'
  ): string {
    if (action === 'bounce') {
      // Green for successful defense
      const alpha = 0.5 + strength * 0.4;
      return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
    } else if (action === 'break') {
      // Red for broken level
      const alpha = 0.5 + strength * 0.4;
      return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
    } else {
      // Orange for ongoing
      const alpha = 0.4 + strength * 0.3;
      return `rgba(251, 146, 60, ${alpha.toFixed(2)})`;
    }
  }

  /**
   * Get trade bubble color
   */
  getTradeColor(side: 'buy' | 'sell', intensity: number = 1): string {
    if (side === 'buy') {
      const alpha = 0.5 + intensity * 0.4;
      return `rgba(34, 197, 94, ${alpha.toFixed(2)})`;
    } else {
      const alpha = 0.5 + intensity * 0.4;
      return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
    }
  }

  /**
   * Create canvas gradient for legend
   */
  createLegendGradient(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    side: 'bid' | 'ask'
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(x, y + height, x, y);
    const stops = side === 'bid' ? this.bidGradient : this.askGradient;

    for (const stop of stops) {
      gradient.addColorStop(
        stop.position,
        `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${stop.a})`
      );
    }

    return gradient;
  }

  /**
   * Get gradient preview colors
   */
  getGradientPreview(side: 'bid' | 'ask', steps: number = 10): string[] {
    const gradient = side === 'bid' ? this.bidGradient : this.askGradient;
    const colors: string[] = [];

    for (let i = 0; i < steps; i++) {
      const position = i / (steps - 1);
      const color = this.interpolateGradient(gradient, position);
      colors.push(`rgba(${color.r}, ${color.g}, ${color.b}, ${color.a.toFixed(2)})`);
    }

    return colors;
  }

  /**
   * Clear color cache
   */
  clearCache(): void {
    this.colorCache.clear();
  }

  /**
   * Get current config
   */
  getConfig(): ColorConfig {
    return { ...this.config };
  }
}
