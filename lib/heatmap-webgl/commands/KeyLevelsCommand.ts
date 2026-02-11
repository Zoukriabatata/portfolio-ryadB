/**
 * Key Levels Rendering Command
 *
 * Renders important price levels:
 * - POC (Point of Control) - Highest volume price
 * - VAH/VAL (Value Area High/Low) - 70% volume range
 * - VWAP (Volume Weighted Average Price)
 * - Session High/Low
 * - Round Numbers
 */

import type { RenderContext } from '../core/RenderContext';
import { TextureManager } from '../core/TextureManager';

// ═══════════════════════════════════════════════════════════════════════════
// SHADERS
// ═══════════════════════════════════════════════════════════════════════════

const keyLevelVert = `
precision highp float;

attribute vec2 position;
attribute float levelType;   // 0=POC, 1=VAH, 2=VAL, 3=VWAP, 4=SessionHigh, 5=SessionLow, 6=RoundNumber, 7=VWAPBand1, 8=VWAPBand2

uniform mat4 projection;

varying float vLevelType;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);
  vLevelType = levelType;
}
`;

const keyLevelFrag = `
precision highp float;

varying float vLevelType;

uniform vec3 pocColor;
uniform vec3 vahColor;
uniform vec3 valColor;
uniform vec3 vwapColor;
uniform vec3 sessionHighColor;
uniform vec3 sessionLowColor;
uniform vec3 roundNumberColor;
uniform vec3 vwapBand1Color;
uniform vec3 vwapBand2Color;
uniform float opacity;
uniform float dashPhase;

void main() {
  vec3 color;
  float bandOpacity = 1.0;

  // Select color based on level type
  if (vLevelType < 0.5) {
    color = pocColor;           // POC
  } else if (vLevelType < 1.5) {
    color = vahColor;           // VAH
  } else if (vLevelType < 2.5) {
    color = valColor;           // VAL
  } else if (vLevelType < 3.5) {
    color = vwapColor;          // VWAP
  } else if (vLevelType < 4.5) {
    color = sessionHighColor;   // Session High
  } else if (vLevelType < 5.5) {
    color = sessionLowColor;    // Session Low
  } else if (vLevelType < 6.5) {
    color = roundNumberColor;   // Round Number
  } else if (vLevelType < 7.5) {
    color = vwapBand1Color;     // VWAP Band 1 SD
    bandOpacity = 0.6;
  } else {
    color = vwapBand2Color;     // VWAP Band 2 SD
    bandOpacity = 0.35;
  }

  // Dashed line effect for VWAP, bands, and other non-solid levels
  float dashPattern = mod(gl_FragCoord.x + dashPhase, 10.0);
  float dashAlpha = 1.0;
  if (vLevelType > 2.5 && vLevelType < 6.5) {
    dashAlpha = dashPattern < 6.0 ? 1.0 : 0.3;  // Standard dash
  } else if (vLevelType > 6.5) {
    dashAlpha = dashPattern < 4.0 ? 1.0 : 0.15;  // Tighter dash for bands
  }

  gl_FragColor = vec4(color, opacity * dashAlpha * bandOpacity);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type KeyLevelType = 'poc' | 'vah' | 'val' | 'vwap' | 'sessionHigh' | 'sessionLow' | 'roundNumber' | 'vwapBand1' | 'vwapBand2';

export interface KeyLevel {
  price: number;
  type: KeyLevelType;
  label?: string;
}

export interface KeyLevelsRenderProps {
  levels: KeyLevel[];
  priceMin: number;
  priceMax: number;
  viewportWidth: number;
  viewportHeight: number;
  leftMargin?: number;
  rightMargin?: number;
  lineWidth?: number;
  opacity?: number;
  // Colors
  pocColor?: string;
  vahColor?: string;
  valColor?: string;
  vwapColor?: string;
  sessionHighColor?: string;
  sessionLowColor?: string;
  roundNumberColor?: string;
  vwapBand1Color?: string;
  vwapBand2Color?: string;
  // Animation
  dashPhase?: number;
}

const LEVEL_TYPE_MAP: Record<KeyLevelType, number> = {
  poc: 0,
  vah: 1,
  val: 2,
  vwap: 3,
  sessionHigh: 4,
  sessionLow: 5,
  roundNumber: 6,
  vwapBand1: 7,
  vwapBand2: 8,
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND
// ═══════════════════════════════════════════════════════════════════════════

export class KeyLevelsCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  // Reusable buffers
  private positionBuffer: Float32Array;
  private levelTypeBuffer: Float32Array;
  private maxLevels: number;

  constructor(ctx: RenderContext, maxLevels: number = 50) {
    this.ctx = ctx;
    this.maxLevels = maxLevels;

    // Pre-allocate buffers (2 vertices per line * 2 components)
    this.positionBuffer = new Float32Array(maxLevels * 4);
    this.levelTypeBuffer = new Float32Array(maxLevels * 2);

    this.createCommand();
  }

  private createCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({ data: this.positionBuffer, usage: 'dynamic' });
    const levelTypeBuf = regl.buffer({ data: this.levelTypeBuffer, usage: 'dynamic' });

    this.drawCommand = regl({
      vert: keyLevelVert,
      frag: keyLevelFrag,

      attributes: {
        position: { buffer: positionBuf, size: 2 },
        levelType: { buffer: levelTypeBuf, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        pocColor: regl.prop<{ pocColor: [number, number, number] }, 'pocColor'>('pocColor'),
        vahColor: regl.prop<{ vahColor: [number, number, number] }, 'vahColor'>('vahColor'),
        valColor: regl.prop<{ valColor: [number, number, number] }, 'valColor'>('valColor'),
        vwapColor: regl.prop<{ vwapColor: [number, number, number] }, 'vwapColor'>('vwapColor'),
        sessionHighColor: regl.prop<{ sessionHighColor: [number, number, number] }, 'sessionHighColor'>('sessionHighColor'),
        sessionLowColor: regl.prop<{ sessionLowColor: [number, number, number] }, 'sessionLowColor'>('sessionLowColor'),
        roundNumberColor: regl.prop<{ roundNumberColor: [number, number, number] }, 'roundNumberColor'>('roundNumberColor'),
        vwapBand1Color: regl.prop<{ vwapBand1Color: [number, number, number] }, 'vwapBand1Color'>('vwapBand1Color'),
        vwapBand2Color: regl.prop<{ vwapBand2Color: [number, number, number] }, 'vwapBand2Color'>('vwapBand2Color'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        dashPhase: regl.prop<{ dashPhase: number }, 'dashPhase'>('dashPhase'),
      },

      primitive: 'lines',
      count: regl.prop<{ count: number }, 'count'>('count'),
      lineWidth: 1, // Will use geometry for thicker lines

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

    (this.drawCommand as any)._positionBuf = positionBuf;
    (this.drawCommand as any)._levelTypeBuf = levelTypeBuf;
  }

  /**
   * Render key levels
   */
  render(props: KeyLevelsRenderProps, projection: number[]): void {
    if (!this.drawCommand || props.levels.length === 0) return;

    const {
      levels,
      priceMin,
      priceMax,
      viewportWidth,
      viewportHeight,
      leftMargin = 0,
      rightMargin = 0,
      opacity = 0.8,
      pocColor = '#f59e0b',
      vahColor = '#8b5cf6',
      valColor = '#8b5cf6',
      vwapColor = '#06b6d4',
      sessionHighColor = '#22d3ee',
      sessionLowColor = '#fb7185',
      roundNumberColor = '#fbbf24',
      vwapBand1Color = '#06b6d4',
      vwapBand2Color = '#06b6d4',
      dashPhase = 0,
    } = props;

    const priceRange = priceMax - priceMin;
    if (priceRange === 0) return;

    const count = Math.min(levels.length, this.maxLevels);
    const x1 = leftMargin;
    const x2 = viewportWidth - rightMargin;

    // Fill buffers
    for (let i = 0; i < count; i++) {
      const level = levels[i];
      const y = viewportHeight - ((level.price - priceMin) / priceRange) * viewportHeight;

      // Line vertices
      this.positionBuffer[i * 4 + 0] = x1;
      this.positionBuffer[i * 4 + 1] = y;
      this.positionBuffer[i * 4 + 2] = x2;
      this.positionBuffer[i * 4 + 3] = y;

      // Level type for both vertices
      const levelTypeValue = LEVEL_TYPE_MAP[level.type];
      this.levelTypeBuffer[i * 2 + 0] = levelTypeValue;
      this.levelTypeBuffer[i * 2 + 1] = levelTypeValue;
    }

    // Upload buffers
    const cmd = this.drawCommand as any;
    cmd._positionBuf.subdata(this.positionBuffer.subarray(0, count * 4));
    cmd._levelTypeBuf.subdata(this.levelTypeBuffer.subarray(0, count * 2));

    // Draw
    this.drawCommand({
      projection,
      pocColor: TextureManager.parseColorRGB(pocColor),
      vahColor: TextureManager.parseColorRGB(vahColor),
      valColor: TextureManager.parseColorRGB(valColor),
      vwapColor: TextureManager.parseColorRGB(vwapColor),
      sessionHighColor: TextureManager.parseColorRGB(sessionHighColor),
      sessionLowColor: TextureManager.parseColorRGB(sessionLowColor),
      roundNumberColor: TextureManager.parseColorRGB(roundNumberColor),
      vwapBand1Color: TextureManager.parseColorRGB(vwapBand1Color),
      vwapBand2Color: TextureManager.parseColorRGB(vwapBand2Color),
      opacity,
      dashPhase,
      count: count * 2, // 2 vertices per line
    });
  }

  /**
   * Destroy command and release resources
   */
  destroy(): void {
    if (this.drawCommand) {
      const cmd = this.drawCommand as any;
      cmd._positionBuf?.destroy();
      cmd._levelTypeBuf?.destroy();
    }
    this.drawCommand = null;
  }
}
