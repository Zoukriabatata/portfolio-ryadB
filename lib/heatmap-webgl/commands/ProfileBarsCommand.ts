/**
 * Profile Bars Rendering Command
 * Renders delta profile and volume profile bars using GPU instanced rendering
 * Supports mirrored, stacked, and net visualization modes
 */

import type { RenderContext } from '../core/RenderContext';
import { TextureManager } from '../core/TextureManager';

// Instanced vertex shader: per-instance offset, width, side
const instancedVert = `
precision highp float;

attribute vec2 position;
attribute vec2 instanceOffset;
attribute float instanceWidth;
attribute float instanceSide;

uniform mat4 projection;
uniform float barHeight;

varying float vSide;
varying vec2 vUV;

void main() {
  float x = instanceOffset.x + position.x * instanceWidth;
  float y = instanceOffset.y + position.y * barHeight;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vSide = instanceSide;
  vUV = position;
}
`;

// Fallback (non-instanced) vertex shader
const fallbackVert = `
precision highp float;

attribute vec2 position;

uniform mat4 projection;
uniform vec2 offset;
uniform float barWidth;
uniform float barHeight;
uniform float side;

varying float vSide;
varying vec2 vUV;

void main() {
  float x = offset.x + position.x * barWidth;
  float y = offset.y + position.y * barHeight;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vSide = side;
  vUV = position;
}
`;

// Shared fragment shader
const profileBarFrag = `
precision highp float;

varying float vSide;
varying vec2 vUV;

uniform vec3 bidColor;
uniform vec3 askColor;
uniform float opacity;

void main() {
  vec3 color = vSide < 0.5 ? bidColor : askColor;

  // Gradient effect: brighter at the edge, darker towards base
  float gradientX = 0.7 + 0.3 * vUV.x;

  // Subtle vertical gradient for depth
  float gradientY = 0.95 + 0.05 * (1.0 - abs(vUV.y - 0.5) * 2.0);

  color *= gradientX * gradientY;

  // Soft edge at the tip of the bar
  float edgeSoftness = smoothstep(0.0, 0.05, vUV.x) * smoothstep(1.0, 0.95, vUV.x);
  float verticalSoftness = smoothstep(0.0, 0.08, vUV.y) * smoothstep(1.0, 0.92, vUV.y);

  float alpha = opacity * edgeSoftness * verticalSoftness;

  gl_FragColor = vec4(color, alpha);
}
`;

export interface ProfileBarData {
  price: number;
  bidValue: number;
  askValue: number;
}

export interface ProfileBarsRenderProps {
  bars: ProfileBarData[];
  priceMin: number;
  priceMax: number;
  tickSize: number;
  maxValue: number;
  baseX: number;
  maxWidth: number;
  bidColor: string;
  askColor: string;
  opacity: number;
  side: 'left' | 'right';
  mode?: 'mirrored' | 'stacked' | 'net';
}

export class ProfileBarsCommand {
  private ctx: RenderContext;
  private useInstancing: boolean;
  private maxInstances: number;

  // Quad geometry
  private positionBuffer: Float32Array;

  // Instance data buffers (pre-allocated)
  private offsetBuffer: Float32Array;
  private widthBuffer: Float32Array;
  private sideBuffer: Float32Array;

  // Regl buffers
  private reglOffsetBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglWidthBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglSideBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;

  // Commands
  private instancedCommand: ReturnType<RenderContext['regl']> | null = null;
  private fallbackCommand: ReturnType<RenderContext['regl']> | null = null;

  constructor(ctx: RenderContext, maxBars: number = 500) {
    this.ctx = ctx;
    // Each bar can produce up to 2 instances (bid + ask)
    this.maxInstances = maxBars * 2;
    this.useInstancing = ctx.supportsInstancing;

    // Quad positions (two triangles)
    this.positionBuffer = new Float32Array([
      0, 0, 1, 0, 1, 1,
      0, 0, 1, 1, 0, 1,
    ]);

    // Pre-allocate instance buffers
    this.offsetBuffer = new Float32Array(this.maxInstances * 2);
    this.widthBuffer = new Float32Array(this.maxInstances);
    this.sideBuffer = new Float32Array(this.maxInstances);

    if (this.useInstancing) {
      try {
        this.createInstancedCommand();
      } catch (e) {
        console.warn('[ProfileBarsCommand] Instanced rendering failed, falling back:', e);
        this.useInstancing = false;
        this.createFallbackCommand();
      }
    } else {
      this.createFallbackCommand();
    }
  }

  private createInstancedCommand(): void {
    const { regl } = this.ctx;

    this.reglOffsetBuf = regl.buffer({ data: this.offsetBuffer, usage: 'dynamic' });
    this.reglWidthBuf = regl.buffer({ data: this.widthBuffer, usage: 'dynamic' });
    this.reglSideBuf = regl.buffer({ data: this.sideBuffer, usage: 'dynamic' });

    this.instancedCommand = regl({
      vert: instancedVert,
      frag: profileBarFrag,

      attributes: {
        position: this.positionBuffer,
        instanceOffset: {
          buffer: this.reglOffsetBuf,
          divisor: 1,
          size: 2,
        },
        instanceWidth: {
          buffer: this.reglWidthBuf,
          divisor: 1,
          size: 1,
        },
        instanceSide: {
          buffer: this.reglSideBuf,
          divisor: 1,
          size: 1,
        },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        barHeight: regl.prop<{ barHeight: number }, 'barHeight'>('barHeight'),
        bidColor: regl.prop<{ bidColor: [number, number, number] }, 'bidColor'>('bidColor'),
        askColor: regl.prop<{ askColor: [number, number, number] }, 'askColor'>('askColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      count: 6,
      instances: regl.prop<{ instances: number }, 'instances'>('instances'),

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1,
        },
      },

      depth: { enable: false },
    });
  }

  private createFallbackCommand(): void {
    const { regl } = this.ctx;

    this.fallbackCommand = regl({
      vert: fallbackVert,
      frag: profileBarFrag,

      attributes: {
        position: this.positionBuffer,
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        offset: regl.prop<{ offset: [number, number] }, 'offset'>('offset'),
        barWidth: regl.prop<{ barWidth: number }, 'barWidth'>('barWidth'),
        barHeight: regl.prop<{ barHeight: number }, 'barHeight'>('barHeight'),
        side: regl.prop<{ side: number }, 'side'>('side'),
        bidColor: regl.prop<{ bidColor: [number, number, number] }, 'bidColor'>('bidColor'),
        askColor: regl.prop<{ askColor: [number, number, number] }, 'askColor'>('askColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      count: 6,

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 1,
          dstRGB: 'one minus src alpha',
          dstAlpha: 1,
        },
      },

      depth: { enable: false },
    });
  }

  /**
   * Fill instance buffers based on mode, returns instance count
   */
  private fillBuffers(
    bars: ProfileBarData[],
    count: number,
    priceMin: number,
    priceRange: number,
    barHeight: number,
    viewportHeight: number,
    maxValue: number,
    baseX: number,
    maxWidth: number,
    mode: 'mirrored' | 'stacked' | 'net',
  ): number {
    let idx = 0;

    if (mode === 'mirrored') {
      const centerX = baseX + maxWidth / 2;
      const halfWidth = maxWidth / 2;

      for (let i = 0; i < count; i++) {
        const bar = bars[i];
        const y = viewportHeight - ((bar.price - priceMin) / priceRange) * viewportHeight - barHeight;

        if (bar.bidValue > 0) {
          const bidWidth = (bar.bidValue / maxValue) * halfWidth;
          this.offsetBuffer[idx * 2] = centerX - bidWidth;
          this.offsetBuffer[idx * 2 + 1] = y;
          this.widthBuffer[idx] = bidWidth;
          this.sideBuffer[idx] = 0;
          idx++;
        }

        if (bar.askValue > 0) {
          const askWidth = (bar.askValue / maxValue) * halfWidth;
          this.offsetBuffer[idx * 2] = centerX;
          this.offsetBuffer[idx * 2 + 1] = y;
          this.widthBuffer[idx] = askWidth;
          this.sideBuffer[idx] = 1;
          idx++;
        }
      }
    } else if (mode === 'net') {
      const centerX = baseX + maxWidth / 2;
      const halfWidth = maxWidth / 2;

      for (let i = 0; i < count; i++) {
        const bar = bars[i];
        const y = viewportHeight - ((bar.price - priceMin) / priceRange) * viewportHeight - barHeight;
        const netDelta = bar.bidValue - bar.askValue;

        if (Math.abs(netDelta) > 0) {
          const barW = (Math.abs(netDelta) / maxValue) * halfWidth;
          const isBullish = netDelta > 0;
          this.offsetBuffer[idx * 2] = isBullish ? centerX : centerX - barW;
          this.offsetBuffer[idx * 2 + 1] = y;
          this.widthBuffer[idx] = barW;
          this.sideBuffer[idx] = isBullish ? 0 : 1;
          idx++;
        }
      }
    } else {
      // Stacked mode
      for (let i = 0; i < count; i++) {
        const bar = bars[i];
        const y = viewportHeight - ((bar.price - priceMin) / priceRange) * viewportHeight - barHeight;

        if (bar.bidValue > 0) {
          const bidWidth = (bar.bidValue / maxValue) * maxWidth;
          this.offsetBuffer[idx * 2] = baseX;
          this.offsetBuffer[idx * 2 + 1] = y;
          this.widthBuffer[idx] = bidWidth;
          this.sideBuffer[idx] = 0;
          idx++;
        }

        if (bar.askValue > 0) {
          const bidWidth = (bar.bidValue / maxValue) * maxWidth;
          const askWidth = (bar.askValue / maxValue) * maxWidth;
          this.offsetBuffer[idx * 2] = baseX + bidWidth;
          this.offsetBuffer[idx * 2 + 1] = y;
          this.widthBuffer[idx] = askWidth;
          this.sideBuffer[idx] = 1;
          idx++;
        }
      }
    }

    return idx;
  }

  /**
   * Render profile bars
   */
  render(props: ProfileBarsRenderProps, projection: number[], viewportHeight: number): void {
    const {
      bars,
      priceMin,
      priceMax,
      tickSize,
      maxValue,
      baseX,
      maxWidth,
      bidColor,
      askColor,
      opacity,
      side,
      mode = side === 'left' ? 'mirrored' : 'stacked',
    } = props;

    if (bars.length === 0 || maxValue === 0) return;

    const priceRange = priceMax - priceMin;
    const barHeight = (tickSize / priceRange) * viewportHeight;
    const renderBarHeight = barHeight * 0.9;
    const bidColorRGB = TextureManager.parseColorRGB(bidColor);
    const askColorRGB = TextureManager.parseColorRGB(askColor);
    const count = Math.min(bars.length, this.maxInstances / 2);

    if (this.useInstancing && this.instancedCommand) {
      // Fill instance buffers
      const instanceCount = this.fillBuffers(
        bars, count, priceMin, priceRange, barHeight, viewportHeight,
        maxValue, baseX, maxWidth, mode,
      );

      if (instanceCount === 0) return;

      // Upload sub-arrays to GPU
      this.reglOffsetBuf!.subdata(this.offsetBuffer.subarray(0, instanceCount * 2));
      this.reglWidthBuf!.subdata(this.widthBuffer.subarray(0, instanceCount));
      this.reglSideBuf!.subdata(this.sideBuffer.subarray(0, instanceCount));

      // Single instanced draw call
      this.instancedCommand({
        projection,
        barHeight: renderBarHeight,
        bidColor: bidColorRGB,
        askColor: askColorRGB,
        opacity,
        instances: instanceCount,
      });
    } else if (this.fallbackCommand) {
      // Fallback: array of props (one draw call per bar via regl batching)
      const drawCalls: {
        projection: number[];
        offset: [number, number];
        barWidth: number;
        barHeight: number;
        side: number;
        bidColor: [number, number, number];
        askColor: [number, number, number];
        opacity: number;
      }[] = [];

      // Fill the same way but into drawCalls
      const instanceCount = this.fillBuffers(
        bars, count, priceMin, priceRange, barHeight, viewportHeight,
        maxValue, baseX, maxWidth, mode,
      );

      for (let i = 0; i < instanceCount; i++) {
        drawCalls.push({
          projection,
          offset: [this.offsetBuffer[i * 2], this.offsetBuffer[i * 2 + 1]],
          barWidth: this.widthBuffer[i],
          barHeight: renderBarHeight,
          side: this.sideBuffer[i],
          bidColor: bidColorRGB,
          askColor: askColorRGB,
          opacity,
        });
      }

      if (drawCalls.length > 0) {
        (this.fallbackCommand as (props: typeof drawCalls) => void)(drawCalls);
      }
    }
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    this.reglOffsetBuf?.destroy();
    this.reglWidthBuf?.destroy();
    this.reglSideBuf?.destroy();
    this.reglOffsetBuf = null;
    this.reglWidthBuf = null;
    this.reglSideBuf = null;
    this.instancedCommand = null;
    this.fallbackCommand = null;
  }
}
