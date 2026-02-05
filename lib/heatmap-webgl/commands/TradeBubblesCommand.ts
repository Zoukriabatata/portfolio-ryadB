/**
 * Trade Bubbles Rendering Command
 * Point sprites with pie chart effect for trade visualization
 */

import type { RenderContext } from '../core/RenderContext';
import type { TradeData } from '../types';
import { TextureManager } from '../core/TextureManager';

// Trade bubble shaders
const tradeBubbleVert = `
precision highp float;

attribute vec2 position;
attribute float size;
attribute float buyRatio;
attribute float age;

uniform mat4 projection;
uniform float maxSize;

varying float vBuyRatio;
varying float vAge;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);

  // Point size with age fadeout
  float fadeScale = 1.0 - age * 0.3;
  gl_PointSize = min(size, maxSize) * fadeScale;

  vBuyRatio = buyRatio;
  vAge = age;
}
`;

const tradeBubbleFrag = `
precision highp float;

varying float vBuyRatio;
varying float vAge;

uniform vec3 buyColor;
uniform vec3 sellColor;
uniform float opacity;

const float PI = 3.14159265359;

void main() {
  // Distance from center
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord) * 2.0;

  // Discard outside circle
  if (dist > 1.0) discard;

  // Anti-aliased edge
  float alpha = 1.0 - smoothstep(0.9, 1.0, dist);

  // Pie chart angle
  float angle = atan(coord.y, coord.x) / PI * 0.5 + 0.5; // 0-1

  // Color based on buy/sell ratio
  vec3 color;
  if (angle < vBuyRatio) {
    color = buyColor;
  } else {
    color = sellColor;
  }

  // Apply age fade
  float ageFade = 1.0 - vAge * 0.5;

  gl_FragColor = vec4(color, alpha * opacity * ageFade);
}
`;

export interface TradeBubbleRenderProps {
  trades: TradeData[];
  priceMin: number;
  priceMax: number;
  buyColor: string;
  sellColor: string;
  opacity: number;
  maxSize: number;
}

export class TradeBubblesCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  // Reusable buffers
  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private buyRatioBuffer: Float32Array;
  private ageBuffer: Float32Array;
  private maxTrades: number;

  constructor(ctx: RenderContext, maxTrades: number = 1000) {
    this.ctx = ctx;
    this.maxTrades = maxTrades;

    // Pre-allocate buffers
    this.positionBuffer = new Float32Array(maxTrades * 2);
    this.sizeBuffer = new Float32Array(maxTrades);
    this.buyRatioBuffer = new Float32Array(maxTrades);
    this.ageBuffer = new Float32Array(maxTrades);

    this.createCommand();
  }

  private createCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({
      data: this.positionBuffer,
      usage: 'dynamic',
    });

    const sizeBuf = regl.buffer({
      data: this.sizeBuffer,
      usage: 'dynamic',
    });

    const buyRatioBuf = regl.buffer({
      data: this.buyRatioBuffer,
      usage: 'dynamic',
    });

    const ageBuf = regl.buffer({
      data: this.ageBuffer,
      usage: 'dynamic',
    });

    this.drawCommand = regl({
      vert: tradeBubbleVert,
      frag: tradeBubbleFrag,

      attributes: {
        position: {
          buffer: positionBuf,
          size: 2,
        },
        size: {
          buffer: sizeBuf,
          size: 1,
        },
        buyRatio: {
          buffer: buyRatioBuf,
          size: 1,
        },
        age: {
          buffer: ageBuf,
          size: 1,
        },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        buyColor: regl.prop<{ buyColor: [number, number, number] }, 'buyColor'>('buyColor'),
        sellColor: regl.prop<{ sellColor: [number, number, number] }, 'sellColor'>('sellColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        maxSize: regl.prop<{ maxSize: number }, 'maxSize'>('maxSize'),
      },

      primitive: 'points',
      count: regl.prop<{ count: number }, 'count'>('count'),

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

    (this.drawCommand as any)._positionBuf = positionBuf;
    (this.drawCommand as any)._sizeBuf = sizeBuf;
    (this.drawCommand as any)._buyRatioBuf = buyRatioBuf;
    (this.drawCommand as any)._ageBuf = ageBuf;
  }

  /**
   * Render trade bubbles
   */
  render(props: TradeBubbleRenderProps, projection: number[], viewportHeight: number): void {
    if (!this.drawCommand) return;

    const { trades, priceMin, priceMax, buyColor, sellColor, opacity, maxSize } = props;
    const priceRange = priceMax - priceMin;

    if (trades.length === 0 || priceRange === 0) return;

    const count = Math.min(trades.length, this.maxTrades);

    // Update buffers
    for (let i = 0; i < count; i++) {
      const trade = trades[i];
      const y = viewportHeight - ((trade.price - priceMin) / priceRange) * viewportHeight;

      this.positionBuffer[i * 2] = trade.x;
      this.positionBuffer[i * 2 + 1] = y;
      // Size based on trade volume (sqrt for better visual scaling)
      this.sizeBuffer[i] = Math.sqrt(trade.size) * 3;
      this.buyRatioBuffer[i] = trade.buyRatio;
      this.ageBuffer[i] = trade.age;
    }

    // Upload
    const cmd = this.drawCommand as any;
    cmd._positionBuf.subdata(this.positionBuffer.subarray(0, count * 2));
    cmd._sizeBuf.subdata(this.sizeBuffer.subarray(0, count));
    cmd._buyRatioBuf.subdata(this.buyRatioBuffer.subarray(0, count));
    cmd._ageBuf.subdata(this.ageBuffer.subarray(0, count));

    // Draw
    this.drawCommand({
      projection,
      buyColor: TextureManager.parseColorRGB(buyColor),
      sellColor: TextureManager.parseColorRGB(sellColor),
      opacity,
      maxSize,
      count,
    });
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    if (this.drawCommand) {
      const cmd = this.drawCommand as any;
      cmd._positionBuf?.destroy();
      cmd._sizeBuf?.destroy();
      cmd._buyRatioBuf?.destroy();
      cmd._ageBuf?.destroy();
    }
    this.drawCommand = null;
  }
}
