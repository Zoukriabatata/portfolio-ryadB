/**
 * Texture Manager
 * Manages gradient textures for heatmap coloring
 */

import type { RenderContext } from './RenderContext';
import type REGL from 'regl';

export class TextureManager {
  private ctx: RenderContext;
  private textures: Map<string, REGL.Texture2D> = new Map();
  private gradientCanvas: HTMLCanvasElement;
  private gradientCtx: CanvasRenderingContext2D;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;

    // Create offscreen canvas for gradient generation
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCanvas.width = 256;
    this.gradientCanvas.height = 1;
    this.gradientCtx = this.gradientCanvas.getContext('2d')!;
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
    console.log(`[TextureManager] Created gradient texture: ${name}`);

    return texture;
  }

  /**
   * Create ATAS-style bid gradient (cyan -> blue -> violet)
   */
  createBidGradient(): REGL.Texture2D {
    return this.createGradientTexture('bidGradient', [
      'rgba(0, 0, 0, 0)',      // Transparent at 0
      'rgba(0, 100, 150, 0.3)', // Dark cyan
      'rgba(0, 150, 200, 0.5)', // Cyan
      'rgba(50, 100, 200, 0.7)', // Blue
      'rgba(100, 50, 200, 0.85)', // Violet
      'rgba(150, 0, 255, 1)',   // Purple at max
    ]);
  }

  /**
   * Create ATAS-style ask gradient (orange -> red -> magenta)
   */
  createAskGradient(): REGL.Texture2D {
    return this.createGradientTexture('askGradient', [
      'rgba(0, 0, 0, 0)',       // Transparent at 0
      'rgba(150, 80, 0, 0.3)',  // Dark orange
      'rgba(200, 100, 0, 0.5)', // Orange
      'rgba(220, 50, 50, 0.7)', // Red-orange
      'rgba(200, 0, 100, 0.85)', // Magenta
      'rgba(255, 0, 150, 1)',    // Pink at max
    ]);
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

  /**
   * Parse CSS color to normalized RGBA
   */
  static parseColor(color: string): [number, number, number, number] {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0] / 255, data[1] / 255, data[2] / 255, data[3] / 255];
  }

  /**
   * Parse CSS color to RGB only (no alpha)
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
