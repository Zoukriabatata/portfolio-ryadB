/**
 * Heatmap Rendering Command - Enhanced with Instancing, Glow, Pulse, States
 *
 * Features:
 * - True GPU instancing for 10x performance
 * - Glow effect for high-intensity orders
 * - Pulse animation for new orders
 * - Visual states (new, stable, absorbed, fading, iceberg)
 * - Iceberg detection highlight
 */

import type { RenderContext } from '../core/RenderContext';
import type { TextureManager } from '../core/TextureManager';
import type { PassiveOrderData, OrderState } from '../types';
import { heatmapInstancedVert, heatmapInstancedFrag, heatmapFrag } from '../shaders/heatmap';

export interface HeatmapRenderProps {
  orders: PassiveOrderData[];
  priceMin: number;
  priceMax: number;
  cellHeight: number;
  contrast: number;
  upperCutoff: number;
  opacity: number;
  baseX: number;
  // Enhanced options
  glowEnabled?: boolean;
  glowIntensity?: number;
  animationTime?: number;
}

// State to number mapping
const STATE_MAP: Record<OrderState, number> = {
  new: 0,
  stable: 1,
  absorbed: 2,
  fading: 3,
  iceberg: 4,
};

// Simple non-instanced vertex shader (fallback)
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
uniform float age;
uniform float state;
uniform float pulsePhase;
uniform float time;

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

void main() {
  float x = baseX + offset.x + position.x * cellWidth;
  float y = offset.y + position.y * cellHeight;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vIntensity = intensity;
  vSide = side;
  vAge = age;
  vState = state;
  vUV = position;

  // Pulse animation for new orders
  float pulse = 0.0;
  if (state < 0.5) {
    pulse = sin((time + pulsePhase) * 6.28318 * 2.0) * 0.5 + 0.5;
  }
  vPulse = pulse;
}
`;

export class HeatmapCommand {
  private ctx: RenderContext;
  private textureManager: TextureManager;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;
  private instancedCommand: ReturnType<RenderContext['regl']> | null = null;
  private useInstancing: boolean;
  private maxOrders: number;

  // Quad geometry (shared for all instances)
  private positionBuffer: Float32Array;

  // Instance data buffers
  private offsetBuffer: Float32Array;
  private intensityBuffer: Float32Array;
  private sideBuffer: Float32Array;
  private widthBuffer: Float32Array;
  private ageBuffer: Float32Array;
  private stateBuffer: Float32Array;
  private pulsePhaseBuffer: Float32Array;

  // Regl buffers
  private reglOffsetBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglIntensityBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglSideBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglWidthBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglAgeBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglStateBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglPulseBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;

  // Animation
  private animationStartTime: number = performance.now();

  constructor(ctx: RenderContext, textureManager: TextureManager, maxOrders: number = 20000) {
    this.ctx = ctx;
    this.textureManager = textureManager;
    this.maxOrders = maxOrders;
    this.useInstancing = ctx.supportsInstancing;

    // Quad positions (two triangles)
    this.positionBuffer = new Float32Array([
      0, 0, 1, 0, 1, 1, // First triangle
      0, 0, 1, 1, 0, 1, // Second triangle
    ]);

    // Pre-allocate instance buffers
    this.offsetBuffer = new Float32Array(maxOrders * 2);
    this.intensityBuffer = new Float32Array(maxOrders);
    this.sideBuffer = new Float32Array(maxOrders);
    this.widthBuffer = new Float32Array(maxOrders);
    this.ageBuffer = new Float32Array(maxOrders);
    this.stateBuffer = new Float32Array(maxOrders);
    this.pulsePhaseBuffer = new Float32Array(maxOrders);

    console.debug(`[HeatmapCommand] Instancing: ${this.useInstancing}, Max orders: ${maxOrders}`);

    if (this.useInstancing) {
      try {
        this.createInstancedCommand();
      } catch (e) {
        console.warn('[HeatmapCommand] Instanced rendering failed, falling back:', e);
        this.useInstancing = false;
        this.createFallbackCommand();
      }
    } else {
      this.createFallbackCommand();
    }
  }

  /**
   * Create instanced rendering command (high performance)
   */
  private createInstancedCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) {
      console.error('[HeatmapCommand] Missing gradient textures');
      return;
    }

    // Create regl buffers
    this.reglOffsetBuf = regl.buffer({ data: this.offsetBuffer, usage: 'dynamic' });
    this.reglIntensityBuf = regl.buffer({ data: this.intensityBuffer, usage: 'dynamic' });
    this.reglSideBuf = regl.buffer({ data: this.sideBuffer, usage: 'dynamic' });
    this.reglWidthBuf = regl.buffer({ data: this.widthBuffer, usage: 'dynamic' });
    this.reglAgeBuf = regl.buffer({ data: this.ageBuffer, usage: 'dynamic' });
    this.reglStateBuf = regl.buffer({ data: this.stateBuffer, usage: 'dynamic' });
    this.reglPulseBuf = regl.buffer({ data: this.pulsePhaseBuffer, usage: 'dynamic' });

    this.instancedCommand = regl({
      vert: heatmapInstancedVert,
      frag: heatmapInstancedFrag,

      attributes: {
        // Per-vertex (quad geometry)
        position: this.positionBuffer,
        // Per-instance
        offset: {
          buffer: this.reglOffsetBuf,
          divisor: 1,
          size: 2,
        },
        intensity: {
          buffer: this.reglIntensityBuf,
          divisor: 1,
          size: 1,
        },
        side: {
          buffer: this.reglSideBuf,
          divisor: 1,
          size: 1,
        },
        cellWidth: {
          buffer: this.reglWidthBuf,
          divisor: 1,
          size: 1,
        },
        age: {
          buffer: this.reglAgeBuf,
          divisor: 1,
          size: 1,
        },
        state: {
          buffer: this.reglStateBuf,
          divisor: 1,
          size: 1,
        },
        pulsePhase: {
          buffer: this.reglPulseBuf,
          divisor: 1,
          size: 1,
        },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        cellHeight: regl.prop<{ cellHeight: number }, 'cellHeight'>('cellHeight'),
        baseX: regl.prop<{ baseX: number }, 'baseX'>('baseX'),
        bidGradient: bidGradient,
        askGradient: askGradient,
        contrast: regl.prop<{ contrast: number }, 'contrast'>('contrast'),
        upperCutoff: regl.prop<{ upperCutoff: number }, 'upperCutoff'>('upperCutoff'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        time: regl.prop<{ time: number }, 'time'>('time'),
        glowEnabled: regl.prop<{ glowEnabled: number }, 'glowEnabled'>('glowEnabled'),
        glowIntensity: regl.prop<{ glowIntensity: number }, 'glowIntensity'>('glowIntensity'),
      },

      count: 6, // 6 vertices per quad
      instances: regl.prop<{ instances: number }, 'instances'>('instances'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },

      depth: { enable: false },
    });

    console.debug('[HeatmapCommand] Instanced command created');
  }

  /**
   * Create fallback non-instanced command
   */
  private createFallbackCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) {
      console.error('[HeatmapCommand] Missing gradient textures');
      return;
    }

    this.drawCommand = regl({
      vert: simpleVert,
      frag: heatmapInstancedFrag, // Use enhanced fragment shader

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
        age: regl.prop<{ age: number }, 'age'>('age'),
        state: regl.prop<{ state: number }, 'state'>('state'),
        pulsePhase: regl.prop<{ pulsePhase: number }, 'pulsePhase'>('pulsePhase'),
        time: regl.prop<{ time: number }, 'time'>('time'),
        bidGradient: bidGradient,
        askGradient: askGradient,
        contrast: regl.prop<{ contrast: number }, 'contrast'>('contrast'),
        upperCutoff: regl.prop<{ upperCutoff: number }, 'upperCutoff'>('upperCutoff'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        glowEnabled: regl.prop<{ glowEnabled: number }, 'glowEnabled'>('glowEnabled'),
        glowIntensity: regl.prop<{ glowIntensity: number }, 'glowIntensity'>('glowIntensity'),
      },

      count: 6,

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },

      depth: { enable: false },
    });

    console.debug('[HeatmapCommand] Fallback command created');
  }

  /**
   * Render passive orders
   */
  render(props: HeatmapRenderProps, projection: number[], viewport: [number, number]): void {
    const {
      orders,
      priceMin,
      priceMax,
      cellHeight,
      contrast,
      upperCutoff,
      opacity,
      baseX,
      glowEnabled = true,
      glowIntensity = 0.8,
      animationTime,
    } = props;

    const priceRange = priceMax - priceMin;
    if (orders.length === 0 || priceRange === 0) return;

    const count = Math.min(orders.length, this.maxOrders);

    // Calculate animation time
    const time = animationTime ?? ((performance.now() - this.animationStartTime) / 1000);

    if (this.useInstancing && this.instancedCommand) {
      this.renderInstanced(orders, count, projection, viewport, priceMin, priceRange, cellHeight, contrast, upperCutoff, opacity, baseX, time, glowEnabled, glowIntensity);
    } else if (this.drawCommand) {
      this.renderFallback(orders, count, projection, viewport, priceMin, priceRange, cellHeight, contrast, upperCutoff, opacity, baseX, time, glowEnabled, glowIntensity);
    }
  }

  /**
   * Instanced rendering (high performance)
   */
  private renderInstanced(
    orders: PassiveOrderData[],
    count: number,
    projection: number[],
    viewport: [number, number],
    priceMin: number,
    priceRange: number,
    cellHeight: number,
    contrast: number,
    upperCutoff: number,
    opacity: number,
    baseX: number,
    time: number,
    glowEnabled: boolean,
    glowIntensity: number
  ): void {
    // Fill instance buffers
    for (let i = 0; i < count; i++) {
      const order = orders[i];
      const y = viewport[1] - ((order.price - priceMin) / priceRange) * viewport[1];
      const cellWidth = order.cellWidth ?? Math.max(2, Math.min(150, order.size * 0.5));

      this.offsetBuffer[i * 2] = order.x;
      this.offsetBuffer[i * 2 + 1] = y;
      this.intensityBuffer[i] = order.intensity;
      this.sideBuffer[i] = order.side === 'bid' ? 0 : 1;
      this.widthBuffer[i] = cellWidth;
      this.ageBuffer[i] = order.age ?? 0;
      this.stateBuffer[i] = STATE_MAP[order.state ?? 'stable'];
      this.pulsePhaseBuffer[i] = order.pulsePhase ?? Math.random();
    }

    // Upload to GPU
    this.reglOffsetBuf?.subdata(this.offsetBuffer.subarray(0, count * 2));
    this.reglIntensityBuf?.subdata(this.intensityBuffer.subarray(0, count));
    this.reglSideBuf?.subdata(this.sideBuffer.subarray(0, count));
    this.reglWidthBuf?.subdata(this.widthBuffer.subarray(0, count));
    this.reglAgeBuf?.subdata(this.ageBuffer.subarray(0, count));
    this.reglStateBuf?.subdata(this.stateBuffer.subarray(0, count));
    this.reglPulseBuf?.subdata(this.pulsePhaseBuffer.subarray(0, count));

    // Single draw call for all instances
    this.instancedCommand!({
      projection,
      cellHeight,
      baseX,
      contrast,
      upperCutoff,
      opacity,
      time,
      glowEnabled: glowEnabled ? 1 : 0,
      glowIntensity,
      instances: count,
    });
  }

  /**
   * Fallback non-instanced rendering
   */
  private renderFallback(
    orders: PassiveOrderData[],
    count: number,
    projection: number[],
    viewport: [number, number],
    priceMin: number,
    priceRange: number,
    cellHeight: number,
    contrast: number,
    upperCutoff: number,
    opacity: number,
    baseX: number,
    time: number,
    glowEnabled: boolean,
    glowIntensity: number
  ): void {
    const drawCalls: {
      projection: number[];
      offset: [number, number];
      cellWidth: number;
      cellHeight: number;
      baseX: number;
      intensity: number;
      side: number;
      age: number;
      state: number;
      pulsePhase: number;
      time: number;
      contrast: number;
      upperCutoff: number;
      opacity: number;
      glowEnabled: number;
      glowIntensity: number;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const order = orders[i];
      const y = viewport[1] - ((order.price - priceMin) / priceRange) * viewport[1];
      const cellWidth = order.cellWidth ?? Math.max(2, Math.min(150, order.size * 0.5));

      drawCalls.push({
        projection,
        offset: [order.x, y],
        cellWidth,
        cellHeight,
        baseX,
        intensity: order.intensity,
        side: order.side === 'bid' ? 0 : 1,
        age: order.age ?? 0,
        state: STATE_MAP[order.state ?? 'stable'],
        pulsePhase: order.pulsePhase ?? Math.random(),
        time,
        contrast,
        upperCutoff,
        opacity,
        glowEnabled: glowEnabled ? 1 : 0,
        glowIntensity,
      });
    }

    // Batch draw
    (this.drawCommand as (props: typeof drawCalls) => void)(drawCalls);
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    this.reglOffsetBuf?.destroy();
    this.reglIntensityBuf?.destroy();
    this.reglSideBuf?.destroy();
    this.reglWidthBuf?.destroy();
    this.reglAgeBuf?.destroy();
    this.reglStateBuf?.destroy();
    this.reglPulseBuf?.destroy();

    this.drawCommand = null;
    this.instancedCommand = null;
  }
}
