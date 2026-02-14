/**
 * HEATMAP COLOR ENGINE - Professional Style
 *
 * Génère les gradients de couleurs professionnels pour la heatmap.
 * Supporte plusieurs schémas avec ajustements de contraste.
 */

import type { ColorScheme } from '@/types/heatmap';

interface GradientStop {
  stop: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

// Professional thermal style: Fond sombre → Bleu → Violet → Magenta → Rouge → Orange vif
const ATAS_GRADIENT: GradientStop[] = [
  { stop: 0.00, r: 6, g: 10, b: 16, a: 0.0 },       // Invisible (fond)
  { stop: 0.05, r: 10, g: 15, b: 35, a: 0.3 },      // Bleu très foncé
  { stop: 0.10, r: 20, g: 25, b: 60, a: 0.45 },     // Bleu foncé
  { stop: 0.18, r: 40, g: 35, b: 100, a: 0.55 },    // Bleu-violet
  { stop: 0.28, r: 70, g: 40, b: 130, a: 0.65 },    // Violet foncé
  { stop: 0.38, r: 110, g: 45, b: 145, a: 0.72 },   // Violet
  { stop: 0.48, r: 150, g: 50, b: 140, a: 0.78 },   // Violet-magenta
  { stop: 0.58, r: 190, g: 55, b: 120, a: 0.84 },   // Magenta
  { stop: 0.68, r: 220, g: 65, b: 90, a: 0.88 },    // Rouge-magenta
  { stop: 0.78, r: 245, g: 85, b: 60, a: 0.92 },    // Rouge-orange
  { stop: 0.88, r: 255, g: 130, b: 50, a: 0.95 },   // Orange
  { stop: 1.00, r: 255, g: 200, b: 80, a: 1.0 },    // Jaune-orange vif
];

// Depth visualization style: Bleu → Cyan → Vert → Jaune → Rouge
const BOOKMAP_GRADIENT: GradientStop[] = [
  { stop: 0.00, r: 0, g: 8, b: 20, a: 0.0 },
  { stop: 0.08, r: 0, g: 30, b: 60, a: 0.35 },
  { stop: 0.18, r: 0, g: 60, b: 100, a: 0.5 },
  { stop: 0.28, r: 0, g: 100, b: 130, a: 0.6 },
  { stop: 0.38, r: 0, g: 140, b: 140, a: 0.7 },
  { stop: 0.48, r: 30, g: 170, b: 110, a: 0.75 },
  { stop: 0.58, r: 100, g: 190, b: 70, a: 0.8 },
  { stop: 0.68, r: 180, g: 200, b: 40, a: 0.85 },
  { stop: 0.78, r: 230, g: 170, b: 30, a: 0.9 },
  { stop: 0.88, r: 250, g: 120, b: 30, a: 0.95 },
  { stop: 1.00, r: 255, g: 50, b: 50, a: 1.0 },
];

// Classic style: Dark teal → Green → Orange (warm earthy tones)
const SIERRA_GRADIENT: GradientStop[] = [
  { stop: 0.00, r: 26, g: 26, b: 46, a: 0.0 },
  { stop: 0.15, r: 31, g: 64, b: 55, a: 0.4 },
  { stop: 0.30, r: 45, g: 106, b: 79, a: 0.55 },
  { stop: 0.45, r: 64, g: 145, b: 108, a: 0.7 },
  { stop: 0.60, r: 82, g: 183, b: 136, a: 0.8 },
  { stop: 0.75, r: 187, g: 62, b: 3, a: 0.85 },
  { stop: 0.90, r: 232, g: 93, b: 4, a: 0.95 },
  { stop: 1.00, r: 244, g: 162, b: 97, a: 1.0 },
];

// High Contrast: Black → Green → Yellow (accessibility-focused)
const HIGHCONTRAST_GRADIENT: GradientStop[] = [
  { stop: 0.00, r: 0, g: 0, b: 0, a: 0.0 },
  { stop: 0.20, r: 0, g: 100, b: 0, a: 0.6 },
  { stop: 0.40, r: 0, g: 255, b: 0, a: 0.8 },
  { stop: 0.60, r: 127, g: 255, b: 0, a: 0.9 },
  { stop: 0.80, r: 255, g: 255, b: 0, a: 0.95 },
  { stop: 1.00, r: 255, g: 255, b: 255, a: 1.0 },
];

export class HeatmapColorEngine {
  private gradient: GradientStop[];
  private contrast: number = 1.5;
  private useTransparency: boolean = true;
  private cutoffPercent: number = 95;
  private cachedColors: Map<string, string> = new Map();

  constructor(scheme: ColorScheme = 'atas') {
    this.gradient = this.getGradientForScheme(scheme);
  }

  private getGradientForScheme(scheme: ColorScheme): GradientStop[] {
    switch (scheme) {
      case 'atas':
        return ATAS_GRADIENT;
      case 'bookmap':
        return BOOKMAP_GRADIENT;
      case 'sierra':
        return SIERRA_GRADIENT;
      case 'highcontrast':
        return HIGHCONTRAST_GRADIENT;
      default:
        return ATAS_GRADIENT;
    }
  }

  setScheme(scheme: ColorScheme): void {
    this.gradient = this.getGradientForScheme(scheme);
    this.cachedColors.clear();
  }

  setContrast(value: number): void {
    this.contrast = Math.max(0.5, Math.min(3.0, value));
    this.cachedColors.clear();
  }

  setCutoffPercent(percent: number): void {
    this.cutoffPercent = Math.max(0, Math.min(100, percent));
    this.cachedColors.clear();
  }

  setUseTransparency(enabled: boolean): void {
    this.useTransparency = enabled;
    this.cachedColors.clear();
  }

  /**
   * Applique une courbe de contraste non-linéaire
   */
  private applyContrast(intensity: number): number {
    // Utilise une courbe en S (sigmoid-like) pour le contraste
    const power = 2 / this.contrast;
    if (intensity < 0.5) {
      return Math.pow(2 * intensity, power) / 2;
    } else {
      return 1 - Math.pow(2 * (1 - intensity), power) / 2;
    }
  }

  /**
   * Interpole entre deux couleurs
   */
  private interpolate(
    c1: GradientStop,
    c2: GradientStop,
    t: number
  ): { r: number; g: number; b: number; a: number } {
    // Utilise une interpolation smooth (ease in-out)
    const smoothT = t * t * (3 - 2 * t);

    return {
      r: Math.round(c1.r + (c2.r - c1.r) * smoothT),
      g: Math.round(c1.g + (c2.g - c1.g) * smoothT),
      b: Math.round(c1.b + (c2.b - c1.b) * smoothT),
      a: c1.a + (c2.a - c1.a) * smoothT,
    };
  }

  /**
   * Obtient la couleur pour une intensité donnée (0-1)
   */
  getColor(intensity: number): string {
    // Clamp et applique le cut-off
    intensity = Math.max(0, Math.min(1, intensity));
    const cutoff = this.cutoffPercent / 100;
    const normalizedIntensity = Math.min(intensity / cutoff, 1);

    // Applique le contraste
    const adjusted = this.applyContrast(normalizedIntensity);

    // Cache key avec précision réduite pour meilleure performance
    const cacheKey = `${(adjusted * 100).toFixed(0)}-${this.useTransparency ? 1 : 0}`;
    const cached = this.cachedColors.get(cacheKey);
    if (cached) return cached;

    // Trouve les deux stops encadrant l'intensité
    let lower = this.gradient[0];
    let upper = this.gradient[this.gradient.length - 1];

    for (let i = 0; i < this.gradient.length - 1; i++) {
      if (adjusted >= this.gradient[i].stop && adjusted <= this.gradient[i + 1].stop) {
        lower = this.gradient[i];
        upper = this.gradient[i + 1];
        break;
      }
    }

    // Calcule le facteur d'interpolation
    const range = upper.stop - lower.stop;
    const t = range > 0 ? (adjusted - lower.stop) / range : 0;

    // Interpole les couleurs
    const color = this.interpolate(lower, upper, t);

    // Formate en rgba
    const alpha = this.useTransparency ? color.a : 1;
    const result = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha.toFixed(2)})`;

    this.cachedColors.set(cacheKey, result);
    return result;
  }

  /**
   * Obtient une couleur pour les barres DOM
   */
  getDOMColor(side: 'bid' | 'ask', intensity: number): string {
    const base = side === 'bid'
      ? { r: 34, g: 211, b: 238 }   // Cyan
      : { r: 244, g: 114, b: 182 }; // Pink

    const alpha = Math.min(0.4 + intensity * 0.5, 0.9);
    return `rgba(${base.r}, ${base.g}, ${base.b}, ${alpha.toFixed(2)})`;
  }

  /**
   * Génère un canvas gradient pour la légende
   */
  createLegendGradient(ctx: CanvasRenderingContext2D, width: number, height: number): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, height, 0, 0);

    for (const stop of this.gradient) {
      const alpha = this.useTransparency ? stop.a : 1;
      gradient.addColorStop(stop.stop, `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${alpha})`);
    }

    return gradient;
  }

  /**
   * Retourne les couleurs pour prévisualisation
   */
  getGradientPreview(): string[] {
    return this.gradient.map(stop =>
      `rgba(${stop.r}, ${stop.g}, ${stop.b}, ${stop.a})`
    );
  }

  /**
   * Retourne les statistiques du cache
   */
  getCacheStats(): { size: number } {
    return { size: this.cachedColors.size };
  }

  /**
   * Vide le cache
   */
  clearCache(): void {
    this.cachedColors.clear();
  }
}

// Export singleton par défaut
let defaultInstance: HeatmapColorEngine | null = null;

export function getHeatmapColorEngine(): HeatmapColorEngine {
  if (!defaultInstance) {
    defaultInstance = new HeatmapColorEngine('atas');
  }
  return defaultInstance;
}

export function resetHeatmapColorEngine(scheme: ColorScheme = 'atas'): HeatmapColorEngine {
  defaultInstance = new HeatmapColorEngine(scheme);
  return defaultInstance;
}
