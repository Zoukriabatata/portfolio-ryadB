/**
 * Trade Bubbles Rendering Command - Enhanced
 *
 * Features:
 * - Pie chart visualization with gradient
 * - Border/outline
 * - Glow effect for large trades
 * - Pop-in animation for new trades
 * - Ripple effect
 * - Glass-like inner highlight
 * - Configurable size scaling
 */

import type { RenderContext } from '../core/RenderContext';
import type { TradeData } from '../types';
import { TextureManager } from '../core/TextureManager';

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED TRADE BUBBLE SHADERS
// ═══════════════════════════════════════════════════════════════════════════

const tradeBubbleVert = `
precision highp float;

attribute vec2 position;
attribute float size;
attribute float buyRatio;
attribute float age;
attribute float isLarge;      // 1.0 if large trade
attribute float spawnTime;    // For pop-in animation

uniform mat4 projection;
uniform float maxSize;
uniform float minSize;
uniform float time;

varying float vBuyRatio;
varying float vAge;
varying float vIsLarge;
varying float vNormalizedSize;

void main() {
  gl_Position = projection * vec4(position, 0.0, 1.0);

  // Pop-in animation (0-1 over 0.3 seconds)
  float popProgress = clamp((time - spawnTime) / 0.3, 0.0, 1.0);
  // Elastic ease-out
  float popScale = popProgress < 1.0
    ? 1.0 - pow(2.0, -10.0 * popProgress) * cos(popProgress * 6.28318 * 1.5)
    : 1.0;

  // Age fadeout
  float fadeScale = 1.0 - age * 0.3;

  // Calculate point size
  float baseSize = clamp(size, minSize, maxSize);
  gl_PointSize = baseSize * fadeScale * popScale;

  // Normalized size for glow intensity
  vNormalizedSize = (baseSize - minSize) / (maxSize - minSize);

  vBuyRatio = buyRatio;
  vAge = age;
  vIsLarge = isLarge;
}
`;

const tradeBubbleFrag = `
precision highp float;

varying float vBuyRatio;
varying float vAge;
varying float vIsLarge;
varying float vNormalizedSize;

uniform vec3 buyColor;
uniform vec3 sellColor;
uniform float opacity;
uniform float time;
uniform float showBorder;
uniform float borderWidth;
uniform vec3 borderColor;
uniform float glowEnabled;
uniform float glowIntensity;
uniform float showGradient;
uniform float rippleEnabled;

const float PI = 3.14159265359;

void main() {
  // Distance from center (0-1)
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord) * 2.0;

  // Discard outside circle
  if (dist > 1.0) discard;

  // ═══════════════════════════════════════════════════════════════
  // PIE CHART CALCULATION
  // ═══════════════════════════════════════════════════════════════

  // Angle from top (12 o'clock position)
  float angle = atan(coord.x, -coord.y) / PI * 0.5 + 0.5; // 0-1 from top clockwise

  // Determine color based on buy/sell ratio
  vec3 baseColor;
  float isBuySide = step(angle, vBuyRatio);
  baseColor = mix(sellColor, buyColor, isBuySide);

  // ═══════════════════════════════════════════════════════════════
  // GRADIENT EFFECT (radial darker at edges)
  // ═══════════════════════════════════════════════════════════════

  if (showGradient > 0.5) {
    float gradientFactor = 1.0 - dist * 0.3;
    baseColor *= gradientFactor;
  }

  // ═══════════════════════════════════════════════════════════════
  // GLASS HIGHLIGHT (inner reflection)
  // ═══════════════════════════════════════════════════════════════

  vec2 highlightCenter = vec2(-0.15, -0.2);
  float highlightDist = length(coord - highlightCenter);
  float highlight = smoothstep(0.3, 0.0, highlightDist) * 0.3;
  baseColor = mix(baseColor, vec3(1.0), highlight);

  // ═══════════════════════════════════════════════════════════════
  // BORDER
  // ═══════════════════════════════════════════════════════════════

  float alpha = 1.0;

  if (showBorder > 0.5) {
    float borderStart = 1.0 - borderWidth * 2.0;
    float borderAlpha = smoothstep(borderStart, borderStart + 0.05, dist);

    if (dist > borderStart) {
      baseColor = mix(baseColor, borderColor, borderAlpha * 0.8);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANTI-ALIASED EDGE
  // ═══════════════════════════════════════════════════════════════

  alpha *= 1.0 - smoothstep(0.9, 1.0, dist);

  // ═══════════════════════════════════════════════════════════════
  // GLOW EFFECT (for large trades)
  // ═══════════════════════════════════════════════════════════════

  if (glowEnabled > 0.5 && vIsLarge > 0.5) {
    // Outer glow
    float glowFactor = (1.0 - dist) * glowIntensity * vNormalizedSize;
    baseColor += baseColor * glowFactor * 0.5;
    alpha = min(1.0, alpha + glowFactor * 0.2);
  }

  // ═══════════════════════════════════════════════════════════════
  // RIPPLE EFFECT (animated rings)
  // ═══════════════════════════════════════════════════════════════

  if (rippleEnabled > 0.5 && vIsLarge > 0.5) {
    float rippleTime = fract(time * 0.5);
    float rippleRadius = rippleTime;
    float rippleWidth = 0.1;

    float ripple = smoothstep(rippleRadius - rippleWidth, rippleRadius, dist)
                 * smoothstep(rippleRadius + rippleWidth, rippleRadius, dist);
    ripple *= (1.0 - rippleTime); // Fade out as it expands

    baseColor += vec3(1.0) * ripple * 0.3;
  }

  // ═══════════════════════════════════════════════════════════════
  // DIVIDER LINE (between buy and sell)
  // ═══════════════════════════════════════════════════════════════

  // Draw thin line at the boundary
  float angleDiff = abs(angle - vBuyRatio);
  if (angleDiff < 0.02 && dist < 0.9 && dist > 0.1) {
    baseColor = mix(baseColor, vec3(0.0), 0.3);
  }

  // ═══════════════════════════════════════════════════════════════
  // AGE FADE
  // ═══════════════════════════════════════════════════════════════

  float ageFade = 1.0 - vAge * 0.5;
  alpha *= ageFade;

  // Final color
  gl_FragColor = vec4(baseColor, alpha * opacity);
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
  // Enhanced options
  minSize?: number;
  showBorder?: boolean;
  borderWidth?: number;
  borderColor?: string;
  glowEnabled?: boolean;
  glowIntensity?: number;
  showGradient?: boolean;
  rippleEnabled?: boolean;
  largeTradeThreshold?: number;  // Size threshold for "large trade" effects
  sizeScaling?: 'sqrt' | 'linear' | 'log';
  animationTime?: number;
}

export class TradeBubblesCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  // Reusable buffers
  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private buyRatioBuffer: Float32Array;
  private ageBuffer: Float32Array;
  private isLargeBuffer: Float32Array;
  private spawnTimeBuffer: Float32Array;
  private maxTrades: number;

  // Spawn time tracking
  private tradeSpawnTimes: Map<string, number> = new Map();
  private animationStartTime: number = performance.now();

  constructor(ctx: RenderContext, maxTrades: number = 2000) {
    this.ctx = ctx;
    this.maxTrades = maxTrades;

    // Pre-allocate buffers
    this.positionBuffer = new Float32Array(maxTrades * 2);
    this.sizeBuffer = new Float32Array(maxTrades);
    this.buyRatioBuffer = new Float32Array(maxTrades);
    this.ageBuffer = new Float32Array(maxTrades);
    this.isLargeBuffer = new Float32Array(maxTrades);
    this.spawnTimeBuffer = new Float32Array(maxTrades);

    this.createCommand();
  }

  private createCommand(): void {
    const { regl } = this.ctx;

    const positionBuf = regl.buffer({ data: this.positionBuffer, usage: 'dynamic' });
    const sizeBuf = regl.buffer({ data: this.sizeBuffer, usage: 'dynamic' });
    const buyRatioBuf = regl.buffer({ data: this.buyRatioBuffer, usage: 'dynamic' });
    const ageBuf = regl.buffer({ data: this.ageBuffer, usage: 'dynamic' });
    const isLargeBuf = regl.buffer({ data: this.isLargeBuffer, usage: 'dynamic' });
    const spawnTimeBuf = regl.buffer({ data: this.spawnTimeBuffer, usage: 'dynamic' });

    this.drawCommand = regl({
      vert: tradeBubbleVert,
      frag: tradeBubbleFrag,

      attributes: {
        position: { buffer: positionBuf, size: 2 },
        size: { buffer: sizeBuf, size: 1 },
        buyRatio: { buffer: buyRatioBuf, size: 1 },
        age: { buffer: ageBuf, size: 1 },
        isLarge: { buffer: isLargeBuf, size: 1 },
        spawnTime: { buffer: spawnTimeBuf, size: 1 },
      },

      uniforms: {
        projection: regl.prop<{ projection: number[] }, 'projection'>('projection'),
        buyColor: regl.prop<{ buyColor: [number, number, number] }, 'buyColor'>('buyColor'),
        sellColor: regl.prop<{ sellColor: [number, number, number] }, 'sellColor'>('sellColor'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
        maxSize: regl.prop<{ maxSize: number }, 'maxSize'>('maxSize'),
        minSize: regl.prop<{ minSize: number }, 'minSize'>('minSize'),
        time: regl.prop<{ time: number }, 'time'>('time'),
        showBorder: regl.prop<{ showBorder: number }, 'showBorder'>('showBorder'),
        borderWidth: regl.prop<{ borderWidth: number }, 'borderWidth'>('borderWidth'),
        borderColor: regl.prop<{ borderColor: [number, number, number] }, 'borderColor'>('borderColor'),
        glowEnabled: regl.prop<{ glowEnabled: number }, 'glowEnabled'>('glowEnabled'),
        glowIntensity: regl.prop<{ glowIntensity: number }, 'glowIntensity'>('glowIntensity'),
        showGradient: regl.prop<{ showGradient: number }, 'showGradient'>('showGradient'),
        rippleEnabled: regl.prop<{ rippleEnabled: number }, 'rippleEnabled'>('rippleEnabled'),
      },

      primitive: 'points',
      count: regl.prop<{ count: number }, 'count'>('count'),

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
    (this.drawCommand as any)._sizeBuf = sizeBuf;
    (this.drawCommand as any)._buyRatioBuf = buyRatioBuf;
    (this.drawCommand as any)._ageBuf = ageBuf;
    (this.drawCommand as any)._isLargeBuf = isLargeBuf;
    (this.drawCommand as any)._spawnTimeBuf = spawnTimeBuf;
  }

  /**
   * Calculate display size based on scaling mode
   */
  private calculateSize(rawSize: number, scaling: 'sqrt' | 'linear' | 'log'): number {
    switch (scaling) {
      case 'sqrt':
        return Math.sqrt(rawSize) * 4;
      case 'linear':
        return rawSize * 0.5;
      case 'log':
        return Math.log(rawSize + 1) * 8;
      default:
        return Math.sqrt(rawSize) * 4;
    }
  }

  /**
   * Generate a unique key for a trade (for spawn time tracking)
   */
  private getTradeKey(trade: TradeData): string {
    return `${trade.x.toFixed(0)}_${trade.price.toFixed(2)}`;
  }

  /**
   * Render trade bubbles
   */
  render(props: TradeBubbleRenderProps, projection: number[], viewportHeight: number): void {
    if (!this.drawCommand) return;

    const {
      trades,
      priceMin,
      priceMax,
      buyColor,
      sellColor,
      opacity,
      maxSize,
      minSize = 8,
      showBorder = true,
      borderWidth = 0.08,
      borderColor = 'rgba(255, 255, 255, 0.5)',
      glowEnabled = true,
      glowIntensity = 0.6,
      showGradient = true,
      rippleEnabled = true,
      largeTradeThreshold = 50,
      sizeScaling = 'sqrt',
      animationTime,
    } = props;

    const priceRange = priceMax - priceMin;
    if (trades.length === 0 || priceRange === 0) return;

    const count = Math.min(trades.length, this.maxTrades);
    const currentTime = animationTime ?? ((performance.now() - this.animationStartTime) / 1000);

    // Update buffers
    for (let i = 0; i < count; i++) {
      const trade = trades[i];
      const y = viewportHeight - ((trade.price - priceMin) / priceRange) * viewportHeight;

      // Track spawn time for pop-in animation
      const tradeKey = this.getTradeKey(trade);
      if (!this.tradeSpawnTimes.has(tradeKey)) {
        this.tradeSpawnTimes.set(tradeKey, currentTime);
      }
      const spawnTime = this.tradeSpawnTimes.get(tradeKey)!;

      // Calculate size based on scaling mode
      const displaySize = this.calculateSize(trade.size, sizeScaling);
      const isLarge = trade.size > largeTradeThreshold ? 1 : 0;

      this.positionBuffer[i * 2] = trade.x;
      this.positionBuffer[i * 2 + 1] = y;
      this.sizeBuffer[i] = displaySize;
      this.buyRatioBuffer[i] = trade.buyRatio;
      this.ageBuffer[i] = trade.age;
      this.isLargeBuffer[i] = isLarge;
      this.spawnTimeBuffer[i] = spawnTime;
    }

    // Clean up old spawn times - bounded to prevent memory leak
    // Runs every frame but only cleans when needed
    const maxSpawnEntries = this.maxTrades * 2;
    if (this.tradeSpawnTimes.size > maxSpawnEntries) {
      // Remove oldest entries first (Map preserves insertion order)
      const entriesToRemove = this.tradeSpawnTimes.size - this.maxTrades;
      let removed = 0;
      for (const key of this.tradeSpawnTimes.keys()) {
        if (removed >= entriesToRemove) break;
        this.tradeSpawnTimes.delete(key);
        removed++;
      }
    }

    // Upload buffers
    const cmd = this.drawCommand as any;
    cmd._positionBuf.subdata(this.positionBuffer.subarray(0, count * 2));
    cmd._sizeBuf.subdata(this.sizeBuffer.subarray(0, count));
    cmd._buyRatioBuf.subdata(this.buyRatioBuffer.subarray(0, count));
    cmd._ageBuf.subdata(this.ageBuffer.subarray(0, count));
    cmd._isLargeBuf.subdata(this.isLargeBuffer.subarray(0, count));
    cmd._spawnTimeBuf.subdata(this.spawnTimeBuffer.subarray(0, count));

    // Parse colors
    const buyColorRGB = TextureManager.parseColorRGB(buyColor);
    const sellColorRGB = TextureManager.parseColorRGB(sellColor);
    const borderColorRGB = TextureManager.parseColorRGB(borderColor);

    // Draw
    this.drawCommand({
      projection,
      buyColor: buyColorRGB,
      sellColor: sellColorRGB,
      opacity,
      maxSize,
      minSize,
      time: currentTime,
      showBorder: showBorder ? 1 : 0,
      borderWidth,
      borderColor: borderColorRGB,
      glowEnabled: glowEnabled ? 1 : 0,
      glowIntensity,
      showGradient: showGradient ? 1 : 0,
      rippleEnabled: rippleEnabled ? 1 : 0,
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
      cmd._isLargeBuf?.destroy();
      cmd._spawnTimeBuf?.destroy();
    }
    this.drawCommand = null;
    this.tradeSpawnTimes.clear();
  }
}
