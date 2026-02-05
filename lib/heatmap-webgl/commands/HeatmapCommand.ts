/**
 * Heatmap Rendering Command
 * Renders passive order cells - uses instancing if available, falls back to batched rendering
 */

import type { RenderContext } from '../core/RenderContext';
import type { TextureManager } from '../core/TextureManager';
import type { PassiveOrderData } from '../types';
import { heatmapVert, heatmapFrag } from '../shaders/heatmap';

export interface HeatmapRenderProps {
  orders: PassiveOrderData[];
  priceMin: number;
  priceMax: number;
  cellHeight: number;
  contrast: number;
  upperCutoff: number;
  opacity: number;
  baseX: number;
}

// Simple vertex shader for non-instanced rendering
const simpleVert = `
precision highp float;

attribute vec2 position;

uniform mat4 projection;
uniform vec2 offset;
uniform float cellWidth;
uniform float cellHeight;
uniform float baseX;
uniform float intensity;
uniform float side;

varying float vIntensity;
varying float vSide;
varying vec2 vUV;

void main() {
  float x = baseX + offset.x + position.x * cellWidth;
  float y = offset.y + position.y * cellHeight;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vIntensity = intensity;
  vSide = side;
  vUV = position;
}
`;

export class HeatmapCommand {
  private ctx: RenderContext;
  private textureManager: TextureManager;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;
  private useInstancing: boolean;
  private maxOrders: number;

  // Reusable buffers for non-instanced rendering
  private positionBuffer: Float32Array;

  constructor(ctx: RenderContext, textureManager: TextureManager, maxOrders: number = 2000) {
    this.ctx = ctx;
    this.textureManager = textureManager;
    this.maxOrders = maxOrders;
    this.useInstancing = ctx.supportsInstancing;

    // Quad positions (two triangles)
    this.positionBuffer = new Float32Array([
      0, 0, 1, 0, 1, 1, // First triangle
      0, 0, 1, 1, 0, 1, // Second triangle
    ]);

    console.log(`[HeatmapCommand] Instancing supported: ${this.useInstancing}`);
    this.createCommand();
  }

  private createCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) {
      console.error('[HeatmapCommand] Missing gradient textures');
      return;
    }

    // Use simple non-instanced rendering (one draw call per order, batched in render loop)
    this.drawCommand = regl({
      vert: simpleVert,
      frag: heatmapFrag,

      attributes: {
        position: this.positionBuffer,
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        offset: regl.prop<{ offset: [number, number] }, 'offset'>('offset'),
        cellWidth: regl.prop<{ cellWidth: number }, 'cellWidth'>('cellWidth'),
        cellHeight: regl.prop<{ cellHeight: number }, 'cellHeight'>('cellHeight'),
        baseX: regl.prop<{ baseX: number }, 'baseX'>('baseX'),
        intensity: regl.prop<{ intensity: number }, 'intensity'>('intensity'),
        side: regl.prop<{ side: number }, 'side'>('side'),
        bidGradient: bidGradient,
        askGradient: askGradient,
        contrast: regl.prop<{ contrast: number }, 'contrast'>('contrast'),
        upperCutoff: regl.prop<{ upperCutoff: number }, 'upperCutoff'>('upperCutoff'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      count: 6, // 6 vertices per quad

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1,
        },
      },

      depth: {
        enable: false,
      },
    });
  }

  /**
   * Render passive orders
   */
  render(props: HeatmapRenderProps, projection: number[], viewport: [number, number]): void {
    if (!this.drawCommand) return;

    const { orders, priceMin, priceMax, cellHeight, contrast, upperCutoff, opacity, baseX } = props;
    const priceRange = priceMax - priceMin;

    if (orders.length === 0 || priceRange === 0) return;

    const count = Math.min(orders.length, this.maxOrders);

    // Batch draw all orders
    const drawCalls: {
      projection: number[];
      offset: [number, number];
      cellWidth: number;
      cellHeight: number;
      baseX: number;
      intensity: number;
      side: number;
      contrast: number;
      upperCutoff: number;
      opacity: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const order = orders[i];
      const y = viewport[1] - ((order.price - priceMin) / priceRange) * viewport[1];
      const cellWidth = Math.max(2, Math.min(100, order.size * 0.5));

      drawCalls.push({
        projection,
        offset: [order.x, y],
        cellWidth,
        cellHeight,
        baseX,
        intensity: order.intensity,
        side: order.side === 'bid' ? 0 : 1,
        contrast,
        upperCutoff,
        opacity,
      });
    }

    // Execute batch draw
    (this.drawCommand as (props: typeof drawCalls) => void)(drawCalls);
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    this.drawCommand = null;
  }
}
