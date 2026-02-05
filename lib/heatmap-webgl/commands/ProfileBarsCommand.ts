/**
 * Profile Bars Rendering Command
 * Renders delta profile and volume profile bars using instanced rendering
 */

import type { RenderContext } from '../core/RenderContext';
import { TextureManager } from '../core/TextureManager';

// Profile bar shaders
const profileBarVert = `
precision highp float;

attribute vec2 position;

uniform mat4 projection;
uniform vec2 offset;
uniform float barWidth;
uniform float barHeight;
uniform float side;  // 0 = bid/buy, 1 = ask/sell

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

const profileBarFrag = `
precision highp float;

varying float vSide;
varying vec2 vUV;

uniform vec3 bidColor;
uniform vec3 askColor;
uniform float opacity;

void main() {
  vec3 color = vSide < 0.5 ? bidColor : askColor;

  // Slight gradient for depth
  float gradient = 0.8 + 0.2 * (1.0 - vUV.x);
  color *= gradient;

  gl_FragColor = vec4(color, opacity);
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
  maxValue: number;
  baseX: number;        // Starting X position
  maxWidth: number;     // Maximum bar width
  bidColor: string;
  askColor: string;
  opacity: number;
  side: 'left' | 'right';  // Which side to render (left = delta, right = volume)
}

export class ProfileBarsCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  // Quad positions
  private positionBuffer: Float32Array;
  private maxBars: number;

  constructor(ctx: RenderContext, maxBars: number = 500) {
    this.ctx = ctx;
    this.maxBars = maxBars;

    // Quad positions (two triangles)
    this.positionBuffer = new Float32Array([
      0, 0, 1, 0, 1, 1, // First triangle
      0, 0, 1, 1, 0, 1, // Second triangle
    ]);

    this.createCommand();
  }

  private createCommand(): void {
    const { regl } = this.ctx;

    this.drawCommand = regl({
      vert: profileBarVert,
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
   * Render profile bars
   */
  render(props: ProfileBarsRenderProps, projection: number[], viewportHeight: number): void {
    if (!this.drawCommand) return;

    const {
      bars,
      priceMin,
      priceMax,
      maxValue,
      baseX,
      maxWidth,
      bidColor,
      askColor,
      opacity,
      side,
    } = props;

    if (bars.length === 0 || maxValue === 0) return;

    const priceRange = priceMax - priceMin;
    const barHeight = viewportHeight / bars.length;
    const bidColorRGB = TextureManager.parseColorRGB(bidColor);
    const askColorRGB = TextureManager.parseColorRGB(askColor);

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

    const count = Math.min(bars.length, this.maxBars);

    for (let i = 0; i < count; i++) {
      const bar = bars[i];
      const y = viewportHeight - ((bar.price - priceMin) / priceRange) * viewportHeight - barHeight;

      // Render bid bar
      if (bar.bidValue > 0) {
        const bidWidth = (bar.bidValue / maxValue) * maxWidth;
        const bidX = side === 'left' ? baseX + maxWidth - bidWidth : baseX;

        drawCalls.push({
          projection,
          offset: [bidX, y],
          barWidth: bidWidth,
          barHeight: barHeight * 0.9,
          side: 0,
          bidColor: bidColorRGB,
          askColor: askColorRGB,
          opacity,
        });
      }

      // Render ask bar
      if (bar.askValue > 0) {
        const askWidth = (bar.askValue / maxValue) * maxWidth;
        const askX = side === 'left' ? baseX + maxWidth : baseX + (bar.bidValue / maxValue) * maxWidth;

        drawCalls.push({
          projection,
          offset: [askX, y],
          barWidth: askWidth,
          barHeight: barHeight * 0.9,
          side: 1,
          bidColor: bidColorRGB,
          askColor: askColorRGB,
          opacity,
        });
      }
    }

    if (drawCalls.length > 0) {
      (this.drawCommand as (props: typeof drawCalls) => void)(drawCalls);
    }
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    this.drawCommand = null;
  }
}
