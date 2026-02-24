/**
 * Texture Manager
 * Manages gradient textures for heatmap coloring
 */

import type { RenderContext } from './RenderContext';
import type REGL from 'regl';
import {
  type HeatmapGradient,
  type ThemeName,
  getTheme,
  generateGradientData,
  THEME_ATAS,
} from '../themes';

export class TextureManager {
  private ctx: RenderContext;
  private textures: Map<string, REGL.Texture2D> = new Map();
  private gradientCanvas: HTMLCanvasElement;
  private gradientCtx: CanvasRenderingContext2D;
  private currentTheme: ThemeName = 'magma';

  constructor(ctx: RenderContext) {
    this.ctx = ctx;

    // Create offscreen canvas for gradient generation
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCanvas.width = 256;
    this.gradientCanvas.height = 1;
    this.gradientCtx = this.gradientCanvas.getContext('2d')!;
  }

  /**
   * Set the current theme and regenerate gradients
   */
  setTheme(themeName: ThemeName): void {
    if (this.currentTheme === themeName) return;
    this.currentTheme = themeName;

    const theme = getTheme(themeName);

    // Regenerate gradients with new theme
    this.createGradientFromTheme('bidGradient', theme.colors.bidGradient);
    this.createGradientFromTheme('askGradient', theme.colors.askGradient);

    console.debug(`[TextureManager] Theme changed to: ${theme.name}`);
  }

  /**
   * Create gradient texture from theme gradient definition
   */
  createGradientFromTheme(name: string, gradient: HeatmapGradient): REGL.Texture2D {
    // Destroy existing
    const existing = this.textures.get(name);
    if (existing) {
      existing.destroy();
      this.textures.delete(name);
    }

    // Generate gradient data
    const data = generateGradientData(gradient);

    // Create WebGL texture
    const texture = this.ctx.regl.texture({
      data,
      width: 256,
      height: 1,
      format: 'rgba',
      type: 'uint8',
      min: 'linear',
      mag: 'linear',
      wrapS: 'clamp',
      wrapT: 'clamp',
    });

    this.textures.set(name, texture);
    console.debug(`[TextureManager] Created themed gradient: ${name} (${gradient.name})`);

    return texture;
  }

  /**
   * Create a 1D gradient texture from color stops
   */
  createGradientTexture(name: string, colors: string[]): REGL.Texture2D {
    // Check cache
    if (this.textures.has(name)) {
      return this.textures.get(name)!;
    }

    const width = 256;
    const { gradientCanvas, gradientCtx } = this;

    // Create gradient
    const gradient = gradientCtx.createLinearGradient(0, 0, width, 0);
    colors.forEach((color, i) => {
      gradient.addColorStop(i / (colors.length - 1), color);
    });

    // Draw gradient
    gradientCtx.fillStyle = gradient;
    gradientCtx.fillRect(0, 0, width, 1);

    // Get pixel data
    const imageData = gradientCtx.getImageData(0, 0, width, 1);

    // Create WebGL texture
    const texture = this.ctx.regl.texture({
      data: imageData.data,
      width,
      height: 1,
      format: 'rgba',
      type: 'uint8',
      min: 'linear',
      mag: 'linear',
      wrapS: 'clamp',
      wrapT: 'clamp',
    });

    this.textures.set(name, texture);
    console.debug(`[TextureManager] Created gradient texture: ${name}`);

    return texture;
  }

  /**
   * Create bid gradient using current theme
   */
  createBidGradient(): REGL.Texture2D {
    const theme = getTheme(this.currentTheme);
    return this.createGradientFromTheme('bidGradient', theme.colors.bidGradient);
  }

  /**
   * Create ask gradient using current theme
   */
  createAskGradient(): REGL.Texture2D {
    const theme = getTheme(this.currentTheme);
    return this.createGradientFromTheme('askGradient', theme.colors.askGradient);
  }

  /**
   * Get current theme
   */
  getTheme(): ThemeName {
    return this.currentTheme;
  }

  /**
   * Update an existing gradient texture
   */
  updateGradientTexture(name: string, colors: string[]): REGL.Texture2D {
    // Destroy existing texture
    const existing = this.textures.get(name);
    if (existing) {
      existing.destroy();
      this.textures.delete(name);
    }

    return this.createGradientTexture(name, colors);
  }

  /**
   * Get a texture by name
   */
  getTexture(name: string): REGL.Texture2D | undefined {
    return this.textures.get(name);
  }

  // Color parsing cache - avoids creating canvas elements on every call
  private static colorCache: Map<string, [number, number, number, number]> = new Map();
  private static colorParseCanvas: HTMLCanvasElement | null = null;
  private static colorParseCtx: CanvasRenderingContext2D | null = null;

  /**
   * Parse CSS color to normalized RGBA (cached)
   */
  static parseColor(color: string): [number, number, number, number] {
    const cached = TextureManager.colorCache.get(color);
    if (cached) return cached;

    // Lazy-init shared canvas for color parsing
    if (!TextureManager.colorParseCanvas) {
      TextureManager.colorParseCanvas = document.createElement('canvas');
      TextureManager.colorParseCanvas.width = 1;
      TextureManager.colorParseCanvas.height = 1;
      TextureManager.colorParseCtx = TextureManager.colorParseCanvas.getContext('2d')!;
    }

    const ctx = TextureManager.colorParseCtx!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const result: [number, number, number, number] = [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];

    // Cache the result (limit cache size to prevent unbounded growth)
    if (TextureManager.colorCache.size > 500) {
      const firstKey = TextureManager.colorCache.keys().next().value;
      if (firstKey !== undefined) TextureManager.colorCache.delete(firstKey);
    }
    TextureManager.colorCache.set(color, result);

    return result;
  }

  /**
   * Parse CSS color to RGB only (no alpha, cached)
   */
  static parseColorRGB(color: string): [number, number, number] {
    const [r, g, b] = TextureManager.parseColor(color);
    return [r, g, b];
  }

  /**
   * Destroy all textures
   */
  destroy(): void {
    for (const texture of this.textures.values()) {
      texture.destroy();
    }
    this.textures.clear();
  }
}
