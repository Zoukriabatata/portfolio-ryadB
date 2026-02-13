/**
 * Passive Order Lines Command
 * Renders passive orders as horizontal lines (professional ATAS/Bookmap style)
 * Line thickness proportional to order size, gradient colors, glow for large orders
 * Uses GPU instanced rendering for performance
 */

import type { RenderContext } from '../core/RenderContext';
import type { TextureManager } from '../core/TextureManager';
import type { PassiveOrderData, OrderState } from '../types';

// State to number mapping
const STATE_MAP: Record<OrderState, number> = {
  new: 0,
  stable: 1,
  absorbed: 2,
  fading: 3,
  iceberg: 4,
};

// Instanced vertex shader - each instance is a horizontal line (thin quad)
const linesInstancedVert = `
precision highp float;

// Per-vertex (quad corner)
attribute vec2 position;

// Per-instance
attribute vec2 offset;         // (x, y) screen position
attribute float intensity;     // 0-1 normalized
attribute float side;          // 0 = bid, 1 = ask
attribute float lineWidth;     // Thickness in pixels (proportional to size)
attribute float cellWidth;     // Horizontal span of line
attribute float age;           // 0-1 for fade
attribute float state;         // Visual state

uniform mat4 projection;
uniform float baseX;
uniform float time;

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

void main() {
  // Horizontal line: width = cellWidth, height = lineWidth (centered on Y)
  float x = baseX + offset.x + position.x * cellWidth;
  float y = offset.y + (position.y - 0.5) * lineWidth;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vIntensity = intensity;
  vSide = side;
  vAge = age;
  vState = state;
  vUV = position;

  // Pulse animation for new orders
  float pulse = 0.0;
  if (state < 0.5) {
    pulse = sin((time + offset.y * 0.01) * 6.28318 * 2.0) * 0.5 + 0.5;
  }
  vPulse = pulse;
}
`;

// Fragment shader - gradient color, glow, states
const linesInstancedFrag = `
precision highp float;

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

uniform sampler2D bidGradient;
uniform sampler2D askGradient;
uniform float contrast;
uniform float upperCutoff;
uniform float opacity;
uniform float glowEnabled;
uniform float glowIntensity;

const vec3 newColor = vec3(1.0, 1.0, 0.5);
const vec3 absorbedColor = vec3(1.0, 0.5, 0.0);
const vec3 icebergColor = vec3(0.0, 1.0, 1.0);

void main() {
  // Apply contrast and cutoff
  float adjusted = pow(vIntensity, 1.0 / contrast);
  adjusted = clamp(adjusted / upperCutoff, 0.0, 1.0);

  // Sample base color from gradient
  vec4 baseColor;
  if (vSide < 0.5) {
    baseColor = texture2D(bidGradient, vec2(adjusted, 0.5));
  } else {
    baseColor = texture2D(askGradient, vec2(adjusted, 0.5));
  }

  vec3 color = baseColor.rgb;
  float alpha = baseColor.a;

  // State-based coloring
  if (vState < 0.5) {         // new
    color = mix(color, newColor, 0.3 + vPulse * 0.2);
    alpha *= 1.0 + vPulse * 0.3;
  } else if (vState < 2.5 && vState > 1.5) { // absorbed
    color = mix(color, absorbedColor, 0.4);
  } else if (vState < 3.5 && vState > 2.5) { // fading
    alpha *= 0.5;
    color *= 0.7;
  } else if (vState < 4.5 && vState > 3.5) { // iceberg
    color = mix(color, icebergColor, 0.3);
    alpha *= 1.2;
  }

  // Age-based fade
  alpha *= (1.0 - vAge * 0.3);

  // Vertical soft edges (line top/bottom) - gives smooth line appearance
  float distFromCenter = abs(vUV.y - 0.5) * 2.0;
  float lineSoftness = smoothstep(1.0, 0.6, distFromCenter);
  alpha *= lineSoftness;

  // Horizontal soft edges
  float edgeFade = smoothstep(0.0, 0.03, vUV.x) * smoothstep(1.0, 0.97, vUV.x);
  alpha *= edgeFade;

  // Glow for high intensity
  if (glowEnabled > 0.5 && adjusted > 0.5) {
    float glowAmount = (adjusted - 0.5) * 2.0 * glowIntensity;
    // Brighter center
    float centerGlow = smoothstep(1.0, 0.0, distFromCenter);
    color = mix(color, vec3(1.0), centerGlow * glowAmount * 0.25);
    alpha += centerGlow * glowAmount * 0.15;
  }

  // Iceberg border
  if (vState > 3.5 && vState < 4.5) {
    float borderW = 0.1;
    float border = 1.0 - smoothstep(0.0, borderW, vUV.x)
                 * smoothstep(0.0, borderW, 1.0 - vUV.x)
                 * smoothstep(0.0, borderW, vUV.y)
                 * smoothstep(0.0, borderW, 1.0 - vUV.y);
    if (border > 0.5) {
      color = icebergColor;
      alpha = 0.9;
    }
  }

  alpha *= opacity;
  gl_FragColor = vec4(color, alpha);
}
`;

// Fallback vertex shader (non-instanced)
const linesFallbackVert = `
precision highp float;

attribute vec2 position;

uniform mat4 projection;
uniform vec2 offset;
uniform float intensity;
uniform float side;
uniform float lineWidth;
uniform float cellWidth;
uniform float age;
uniform float state;
uniform float baseX;
uniform float time;

varying float vIntensity;
varying float vSide;
varying float vAge;
varying float vState;
varying float vPulse;
varying vec2 vUV;

void main() {
  float x = baseX + offset.x + position.x * cellWidth;
  float y = offset.y + (position.y - 0.5) * lineWidth;

  gl_Position = projection * vec4(x, y, 0.0, 1.0);

  vIntensity = intensity;
  vSide = side;
  vAge = age;
  vState = state;
  vUV = position;

  float pulse = 0.0;
  if (state < 0.5) {
    pulse = sin((time + offset.y * 0.01) * 6.28318 * 2.0) * 0.5 + 0.5;
  }
  vPulse = pulse;
}
`;

export interface PassiveOrderLinesRenderProps {
  orders: PassiveOrderData[];
  priceMin: number;
  priceMax: number;
  contrast: number;
  upperCutoff: number;
  opacity: number;
  baseX: number;
  minLineWidth: number;   // Min line thickness (px)
  maxLineWidth: number;   // Max line thickness (px)
  glowEnabled?: boolean;
  glowIntensity?: number;
  animationTime?: number;
}

export class PassiveOrderLinesCommand {
  private ctx: RenderContext;
  private textureManager: TextureManager;
  private useInstancing: boolean;
  private maxOrders: number;

  // Quad geometry
  private positionBuffer: Float32Array;

  // Instance buffers
  private offsetBuffer: Float32Array;
  private intensityBuffer: Float32Array;
  private sideBuffer: Float32Array;
  private lineWidthBuffer: Float32Array;
  private cellWidthBuffer: Float32Array;
  private ageBuffer: Float32Array;
  private stateBuffer: Float32Array;

  // Regl buffers
  private reglOffsetBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglIntensityBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglSideBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglLineWidthBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglCellWidthBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglAgeBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private reglStateBuf: ReturnType<RenderContext['regl']['buffer']> | null = null;

  // Commands
  private instancedCommand: ReturnType<RenderContext['regl']> | null = null;
  private fallbackCommand: ReturnType<RenderContext['regl']> | null = null;

  constructor(ctx: RenderContext, textureManager: TextureManager, maxOrders: number = 20000) {
    this.ctx = ctx;
    this.textureManager = textureManager;
    this.maxOrders = maxOrders;
    this.useInstancing = ctx.supportsInstancing;

    this.positionBuffer = new Float32Array([
      0, 0, 1, 0, 1, 1,
      0, 0, 1, 1, 0, 1,
    ]);

    this.offsetBuffer = new Float32Array(maxOrders * 2);
    this.intensityBuffer = new Float32Array(maxOrders);
    this.sideBuffer = new Float32Array(maxOrders);
    this.lineWidthBuffer = new Float32Array(maxOrders);
    this.cellWidthBuffer = new Float32Array(maxOrders);
    this.ageBuffer = new Float32Array(maxOrders);
    this.stateBuffer = new Float32Array(maxOrders);

    if (this.useInstancing) {
      try {
        this.createInstancedCommand();
      } catch (e) {
        console.warn('[PassiveOrderLinesCommand] Instancing failed, falling back:', e);
        this.useInstancing = false;
        this.createFallbackCommand();
      }
    } else {
      this.createFallbackCommand();
    }
  }

  private createInstancedCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) {
      console.error('[PassiveOrderLinesCommand] Missing gradient textures');
      return;
    }

    this.reglOffsetBuf = regl.buffer({ data: this.offsetBuffer, usage: 'dynamic' });
    this.reglIntensityBuf = regl.buffer({ data: this.intensityBuffer, usage: 'dynamic' });
    this.reglSideBuf = regl.buffer({ data: this.sideBuffer, usage: 'dynamic' });
    this.reglLineWidthBuf = regl.buffer({ data: this.lineWidthBuffer, usage: 'dynamic' });
    this.reglCellWidthBuf = regl.buffer({ data: this.cellWidthBuffer, usage: 'dynamic' });
    this.reglAgeBuf = regl.buffer({ data: this.ageBuffer, usage: 'dynamic' });
    this.reglStateBuf = regl.buffer({ data: this.stateBuffer, usage: 'dynamic' });

    this.instancedCommand = regl({
      vert: linesInstancedVert,
      frag: linesInstancedFrag,

      attributes: {
        position: this.positionBuffer,
        offset: { buffer: this.reglOffsetBuf, divisor: 1, size: 2 },
        intensity: { buffer: this.reglIntensityBuf, divisor: 1, size: 1 },
        side: { buffer: this.reglSideBuf, divisor: 1, size: 1 },
        lineWidth: { buffer: this.reglLineWidthBuf, divisor: 1, size: 1 },
        cellWidth: { buffer: this.reglCellWidthBuf, divisor: 1, size: 1 },
        age: { buffer: this.reglAgeBuf, divisor: 1, size: 1 },
        state: { buffer: this.reglStateBuf, divisor: 1, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
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

      count: 6,
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
  }

  private createFallbackCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) return;

    this.fallbackCommand = regl({
      vert: linesFallbackVert,
      frag: linesInstancedFrag,

      attributes: {
        position: this.positionBuffer,
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        offset: regl.prop<{ offset: [number, number] }, 'offset'>('offset'),
        intensity: regl.prop<{ intensity: number }, 'intensity'>('intensity'),
        side: regl.prop<{ side: number }, 'side'>('side'),
        lineWidth: regl.prop<{ lineWidth: number }, 'lineWidth'>('lineWidth'),
        cellWidth: regl.prop<{ cellWidth: number }, 'cellWidth'>('cellWidth'),
        age: regl.prop<{ age: number }, 'age'>('age'),
        state: regl.prop<{ state: number }, 'state'>('state'),
        baseX: regl.prop<{ baseX: number }, 'baseX'>('baseX'),
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
  }

  render(props: PassiveOrderLinesRenderProps, projection: number[], viewport: [number, number]): void {
    const {
      orders,
      priceMin,
      priceMax,
      contrast,
      upperCutoff,
      opacity,
      baseX,
      minLineWidth = 2,
      maxLineWidth = 16,
      glowEnabled = true,
      glowIntensity = 0.8,
      animationTime = 0,
    } = props;

    const priceRange = priceMax - priceMin;
    if (orders.length === 0 || priceRange === 0) return;

    // Find max intensity for line width scaling
    let maxIntensity = 0;
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].intensity > maxIntensity) maxIntensity = orders[i].intensity;
    }
    if (maxIntensity === 0) maxIntensity = 1;

    const count = Math.min(orders.length, this.maxOrders);

    // Fill instance buffers
    for (let i = 0; i < count; i++) {
      const order = orders[i];
      const y = viewport[1] - ((order.price - priceMin) / priceRange) * viewport[1];

      this.offsetBuffer[i * 2] = order.x;
      this.offsetBuffer[i * 2 + 1] = y;
      this.intensityBuffer[i] = order.intensity;
      this.sideBuffer[i] = order.side === 'bid' ? 0 : 1;

      // Line width proportional to intensity (sqrt scaling for better visual distribution)
      const normalizedIntensity = order.intensity / maxIntensity;
      this.lineWidthBuffer[i] = minLineWidth + Math.sqrt(normalizedIntensity) * (maxLineWidth - minLineWidth);

      this.cellWidthBuffer[i] = order.cellWidth || 10;
      this.ageBuffer[i] = order.age || 0;
      this.stateBuffer[i] = STATE_MAP[order.state || 'stable'];
    }

    if (this.useInstancing && this.instancedCommand) {
      // Upload sub-arrays
      this.reglOffsetBuf!.subdata(this.offsetBuffer.subarray(0, count * 2));
      this.reglIntensityBuf!.subdata(this.intensityBuffer.subarray(0, count));
      this.reglSideBuf!.subdata(this.sideBuffer.subarray(0, count));
      this.reglLineWidthBuf!.subdata(this.lineWidthBuffer.subarray(0, count));
      this.reglCellWidthBuf!.subdata(this.cellWidthBuffer.subarray(0, count));
      this.reglAgeBuf!.subdata(this.ageBuffer.subarray(0, count));
      this.reglStateBuf!.subdata(this.stateBuffer.subarray(0, count));

      this.instancedCommand({
        projection,
        baseX,
        contrast,
        upperCutoff,
        opacity,
        time: animationTime,
        glowEnabled: glowEnabled ? 1 : 0,
        glowIntensity,
        instances: count,
      });
    } else if (this.fallbackCommand) {
      const drawCalls: Record<string, unknown>[] = [];

      for (let i = 0; i < count; i++) {
        drawCalls.push({
          projection,
          offset: [this.offsetBuffer[i * 2], this.offsetBuffer[i * 2 + 1]],
          intensity: this.intensityBuffer[i],
          side: this.sideBuffer[i],
          lineWidth: this.lineWidthBuffer[i],
          cellWidth: this.cellWidthBuffer[i],
          age: this.ageBuffer[i],
          state: this.stateBuffer[i],
          baseX,
          time: animationTime,
          contrast,
          upperCutoff,
          opacity,
          glowEnabled: glowEnabled ? 1 : 0,
          glowIntensity,
        });
      }

      if (drawCalls.length > 0) {
        (this.fallbackCommand as (props: typeof drawCalls) => void)(drawCalls);
      }
    }
  }

  destroy(): void {
    this.reglOffsetBuf?.destroy();
    this.reglIntensityBuf?.destroy();
    this.reglSideBuf?.destroy();
    this.reglLineWidthBuf?.destroy();
    this.reglCellWidthBuf?.destroy();
    this.reglAgeBuf?.destroy();
    this.reglStateBuf?.destroy();

    this.reglOffsetBuf = null;
    this.reglIntensityBuf = null;
    this.reglSideBuf = null;
    this.reglLineWidthBuf = null;
    this.reglCellWidthBuf = null;
    this.reglAgeBuf = null;
    this.reglStateBuf = null;
    this.instancedCommand = null;
    this.fallbackCommand = null;
  }
}
