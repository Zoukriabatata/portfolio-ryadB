// Phase B / M6b-1 — instanced trade-bubble draw command.
//
// regl renders one quad per trade via instanced rendering: 4
// vertices defining a [-1, 1] template square, multiplied by per-
// instance (timeUv, priceUv, radiusPx, side) to position each
// bubble in NDC. Fragment shader uses gl_PointCoord-equivalent
// math on the quad to draw a soft circle (smoothstep edge,
// 85 % max alpha) tinted green for buy aggressors and red for
// sell aggressors.
//
// Viewport math mirrors the heatmap fragment shader's inverse:
//   heatmap:  sampleUV = vp.xy + (v_uv - 0.5) / vp.zw
//   bubbles:  v_uv     = (instanceUv - vp.xy) * vp.zw + 0.5
// so a trade at instanceUv = (1, 0.5) lands exactly where the
// heatmap renders the latest texel's mid-row. Tested by eyeballing
// a single bubble vs the right edge of the bg.

import type { Regl, Buffer, DrawCommand } from "regl";

import type { Trade } from "./TradeStateAdapter";

export const TRADE_BUBBLES_VERTEX = `
precision highp float;
attribute vec2 a_quadVertex;
attribute vec4 a_instance;
uniform vec4 u_viewport;
uniform vec2 u_resolution;
varying vec2 v_quadVertex;
varying float v_side;
void main() {
  vec2 vUv = (a_instance.xy - u_viewport.xy) * u_viewport.zw + 0.5;
  vec2 ndcCenter = vUv * 2.0 - 1.0;
  vec2 ndcOffset = a_quadVertex * a_instance.z * 2.0 / u_resolution;
  gl_Position = vec4(ndcCenter + ndcOffset, 0.0, 1.0);
  v_quadVertex = a_quadVertex;
  v_side = a_instance.w;
}
`;

export const TRADE_BUBBLES_FRAGMENT = `
precision highp float;
varying vec2 v_quadVertex;
varying float v_side;
void main() {
  float r = length(v_quadVertex);
  if (r > 1.0) discard;
  float alpha = smoothstep(1.0, 0.55, r) * 0.85;
  vec3 buyColor  = vec3(0.13, 0.77, 0.37);
  vec3 sellColor = vec3(0.94, 0.27, 0.27);
  vec3 color = mix(buyColor, sellColor, v_side);
  gl_FragColor = vec4(color, alpha);
}
`;

const QUAD = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  1, 1,
]);

const HISTORY_MS = 5 * 60 * 1000;

export class TradeBubblesCommand {
  private quadBuffer: Buffer;
  private instanceBuffer: Buffer;
  private drawCmd: DrawCommand;
  private instanceCount = 0;
  // Pre-allocated typed array reused across update() calls. Sized
  // generously — Bybit BTC pit hits ~50 trades/sec, 5min window
  // → ~15K trades upper bound. 30K headroom = 480 KB, negligible.
  private instanceBuf: Float32Array = new Float32Array(30_000 * 4);

  constructor(regl: Regl) {
    this.quadBuffer = regl.buffer(QUAD);
    this.instanceBuffer = regl.buffer({
      usage: "dynamic",
      length: this.instanceBuf.byteLength,
    });

    this.drawCmd = regl({
      vert: TRADE_BUBBLES_VERTEX,
      frag: TRADE_BUBBLES_FRAGMENT,
      attributes: {
        a_quadVertex: { buffer: this.quadBuffer, divisor: 0 },
        a_instance: { buffer: this.instanceBuffer, divisor: 1 },
      },
      uniforms: {
        u_viewport: regl.prop<{ viewport: number[] }, "viewport">("viewport"),
        u_resolution: regl.prop<
          { resolution: number[] },
          "resolution"
        >("resolution"),
      },
      blend: {
        enable: true,
        func: { src: "src alpha", dst: "one minus src alpha" },
      },
      depth: { enable: false },
      primitive: "triangle strip",
      count: 4,
      instances: regl.prop<{ instances: number }, "instances">("instances"),
    });
  }

  /** Recompute the instance buffer from the trade window. Trades
   *  outside the [now - 5min, now] horizon or outside the price
   *  band defined by `priceMin..priceMax` are dropped. */
  update(
    trades: Trade[],
    priceMin: number,
    priceMax: number,
    nowMs: number,
  ) {
    const priceSpan = priceMax - priceMin;
    if (priceSpan <= 0 || trades.length === 0) {
      this.instanceCount = 0;
      return;
    }

    let count = 0;
    const buf = this.instanceBuf;
    const cap = Math.min(trades.length, Math.floor(buf.length / 4));

    for (let i = 0; i < trades.length && count < cap; i++) {
      const t = trades[i];
      const dtMs = nowMs - t.timestampMs;
      if (dtMs < 0 || dtMs > HISTORY_MS) continue;
      const timeUv = 1 - dtMs / HISTORY_MS;
      const priceUv = (t.price - priceMin) / priceSpan;
      if (priceUv < 0 || priceUv > 1) continue;

      // Radius scales log-ishly: 1 BTC ≈ 4 px, 10 BTC ≈ 8 px,
      // 100 BTC ≈ 12 px. Floor at 2 so dust still draws as a
      // visible dot, ceiling at 12 so a 1000-BTC print doesn't
      // fill the screen.
      const radius = Math.max(
        2,
        Math.min(12, Math.log10(t.quantity + 1) * 4),
      );

      const off = count * 4;
      buf[off] = timeUv;
      buf[off + 1] = priceUv;
      buf[off + 2] = radius;
      buf[off + 3] = t.side === "sell" ? 1 : 0;
      count++;
    }

    if (count > 0) {
      // subdata accepts a Float32Array view; pass exactly the
      // populated slice so we don't upload stale instance data.
      this.instanceBuffer.subdata(buf.subarray(0, count * 4));
    }
    this.instanceCount = count;
  }

  draw(viewport: number[], resolution: number[]) {
    if (this.instanceCount === 0) return;
    this.drawCmd({
      viewport,
      resolution,
      instances: this.instanceCount,
    });
  }

  getInstanceCount(): number {
    return this.instanceCount;
  }

  destroy() {
    try {
      this.quadBuffer.destroy();
      this.instanceBuffer.destroy();
    } catch {
      /* GL context already torn down — ignore */
    }
  }
}
