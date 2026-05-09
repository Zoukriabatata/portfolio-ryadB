// Phase B / M6a-1 — slim WebGL heatmap renderer.
//
// Single-class implementation, ~280 LOC instead of the web's
// HybridRenderer + CameraController + commands totalling 4 K LOC.
// Trade-offs accepted for M6a-1 to stay deliverable in one
// session:
//   • viewport is fixed (no pan/zoom — M6a-2)
//   • only the passive-orders background is drawn (no trade
//     bubbles, no key levels, no profile column — M6b/M6c)
//   • Canvas2D overlay limited to axes; crosshair lands in M6a-2
//
// Pipeline: each frame we rebuild a (TIME × PRICE) intensity
// texture from the adapter's snapshot ring buffer, upload it to
// the GPU, and draw a full-screen quad whose fragment shader
// samples the intensity + a 256-px gradient lookup.

import createREGL, { type Regl, type Texture2D, type DrawCommand } from "regl";

import {
  ATAS_HEATMAP_THEME,
  generateGradientTexture,
  type HeatmapTheme,
} from "./theme";
import type {
  HeatmapMarketState,
  OrderbookSnapshot,
} from "./types";

const TIME_BUCKETS = 300; // 5 min @ 1 Hz
const PRICE_BUCKETS = 200;
const MIN_INTENSITY = 0.02; // floor below which a cell paints as "empty" so dust doesn't speckle the bg

export interface RendererStats {
  fps: number;
  historyLength: number;
  midPrice: number;
  priceRange: [number, number];
}

export class HeatmapRenderer {
  private regl: Regl;
  private canvas: HTMLCanvasElement;
  private theme: HeatmapTheme;

  private intensityTex: Texture2D;
  private intensityBuf: Uint8Array;
  private gradientTex: Texture2D;
  private drawHeatmap: DrawCommand;

  private dpr = 1;
  private rafId: number | null = null;

  // Per-frame computed range cached for the overlay axes.
  private lastRange: [number, number] = [0, 0];
  private lastMid = 0;
  private lastFps = 0;
  private frameTimes: number[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    theme: HeatmapTheme = ATAS_HEATMAP_THEME,
  ) {
    this.canvas = canvas;
    this.theme = theme;

    this.regl = createREGL({
      canvas,
      attributes: {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: false,
      },
    });

    // Intensity texture: (TIME × PRICE) with the bucket value in the
    // red channel. We allocate the backing Uint8Array once and
    // re-use it on every frame to avoid GC churn.
    this.intensityBuf = new Uint8Array(TIME_BUCKETS * PRICE_BUCKETS * 4);
    this.intensityTex = this.regl.texture({
      width: TIME_BUCKETS,
      height: PRICE_BUCKETS,
      format: "rgba",
      type: "uint8",
      mag: "linear",
      min: "linear",
      data: this.intensityBuf,
    });

    // 256-pixel 1D-style gradient lookup. The fragment shader
    // samples it with vec2(intensity, 0.5).
    this.gradientTex = this.regl.texture({
      width: 256,
      height: 1,
      format: "rgba",
      type: "uint8",
      mag: "linear",
      min: "linear",
      data: generateGradientTexture(theme),
    });

    this.drawHeatmap = this.regl({
      vert: `
        precision highp float;
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `,
      frag: `
        precision highp float;
        uniform sampler2D u_intensity;
        uniform sampler2D u_gradient;
        uniform vec4 u_bg;
        varying vec2 v_uv;
        void main() {
          float i = texture2D(u_intensity, v_uv).r;
          if (i <= 0.0) {
            gl_FragColor = u_bg;
          } else {
            vec3 c = texture2D(u_gradient, vec2(i, 0.5)).rgb;
            gl_FragColor = vec4(c, 1.0);
          }
        }
      `,
      attributes: {
        a_position: this.regl.buffer([
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]),
      },
      uniforms: {
        u_intensity: this.intensityTex,
        u_gradient: this.gradientTex,
        u_bg: theme.background,
      },
      count: 4,
      primitive: "triangle strip",
      depth: { enable: false },
      blend: { enable: false },
    });

    const rect = canvas.getBoundingClientRect();
    this.applySize(rect.width || 800, rect.height || 480);
  }

  /** Mount the RAF loop. `getState` is called every frame so the
   *  renderer pulls the latest market state without holding a
   *  long-lived reference / subscription. */
  start(getState: () => HeatmapMarketState) {
    if (this.rafId !== null) return;
    const tick = () => {
      const t0 = performance.now();
      this.renderFrame(getState());
      const dt = performance.now() - t0;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy() {
    this.stop();
    try {
      this.regl.destroy();
    } catch {
      /* GL context already gone — ignore */
    }
  }

  resize(width: number, height: number) {
    this.applySize(width, height);
  }

  setTheme(theme: HeatmapTheme) {
    this.theme = theme;
    this.gradientTex.subimage({
      width: 256,
      height: 1,
      data: generateGradientTexture(theme),
    });
  }

  /** Last frame's price range and mid — used by the React overlay
   *  to paint axis labels in CSS coordinates without recomputing
   *  the same data. */
  getStats(): RendererStats {
    return {
      fps: this.lastFps,
      historyLength: 0, // populated below
      midPrice: this.lastMid,
      priceRange: this.lastRange,
    };
  }

  private applySize(width: number, height: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private renderFrame(state: HeatmapMarketState) {
    // FPS over the last 60 frames.
    if (this.frameTimes.length > 0) {
      const avg = this.frameTimes.reduce((s, x) => s + x, 0) / this.frameTimes.length;
      this.lastFps = avg > 0 ? Math.min(60, 1000 / avg) : 0;
    }

    if (state.history.length === 0) {
      this.regl.clear({
        color: this.theme.background,
        depth: 1,
      });
      return;
    }

    // Compute the price range across the full history so the Y
    // axis stays stable when the latest snapshot's spread shifts.
    const { minPrice, maxPrice } = scanRange(state.history);
    if (maxPrice <= minPrice) {
      this.regl.clear({ color: this.theme.background, depth: 1 });
      return;
    }
    const priceStep = (maxPrice - minPrice) / PRICE_BUCKETS;
    this.lastRange = [minPrice, maxPrice];
    this.lastMid = state.latest?.midPrice ?? 0;

    // Reset the intensity buffer to zero (alpha channel stays at
    // 0xFF — fragment shader gates on the red channel anyway).
    this.intensityBuf.fill(0);

    // Find the global max intensity across the window so we can
    // normalize. Log-scaled because BTCUSDT books have a few huge
    // levels and many tiny — linear normalization would wash out
    // the small-but-present liquidity that a heatmap is meant to
    // surface.
    let maxLog = 0;
    for (const snap of state.history) {
      for (const q of snap.bids.values()) {
        const v = Math.log1p(q);
        if (v > maxLog) maxLog = v;
      }
      for (const q of snap.asks.values()) {
        const v = Math.log1p(q);
        if (v > maxLog) maxLog = v;
      }
    }
    if (maxLog === 0) {
      this.regl.clear({ color: this.theme.background, depth: 1 });
      return;
    }

    // Fill the buffer. timeBucket is the index in the visible
    // window: oldest = 0, newest = TIME_BUCKETS - 1. For a partial
    // window (history.length < TIME_BUCKETS) we right-anchor the
    // data so the latest snapshot stays at the right edge.
    const startIdx = Math.max(0, TIME_BUCKETS - state.history.length);
    for (let i = 0; i < state.history.length; i++) {
      const snap = state.history[i];
      const tBucket = startIdx + i;
      if (tBucket < 0 || tBucket >= TIME_BUCKETS) continue;
      writeSide(snap.bids, this.intensityBuf, tBucket, minPrice, priceStep, maxLog);
      writeSide(snap.asks, this.intensityBuf, tBucket, minPrice, priceStep, maxLog);
    }

    // Push the buffer to the GPU + draw.
    this.intensityTex.subimage({
      width: TIME_BUCKETS,
      height: PRICE_BUCKETS,
      data: this.intensityBuf,
    });

    this.regl.poll(); // sync viewport with canvas size in case of resize
    this.regl.clear({ color: this.theme.background, depth: 1 });
    this.drawHeatmap();
  }
}

function scanRange(history: OrderbookSnapshot[]): {
  minPrice: number;
  maxPrice: number;
} {
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const snap of history) {
    for (const p of snap.bids.keys()) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
    for (const p of snap.asks.keys()) {
      if (p < minPrice) minPrice = p;
      if (p > maxPrice) maxPrice = p;
    }
  }
  return { minPrice, maxPrice };
}

function writeSide(
  side: Map<number, number>,
  buf: Uint8Array,
  tBucket: number,
  minPrice: number,
  priceStep: number,
  maxLog: number,
) {
  for (const [price, qty] of side) {
    const pBucket = Math.floor((price - minPrice) / priceStep);
    if (pBucket < 0 || pBucket >= PRICE_BUCKETS) continue;
    const intensity = Math.log1p(qty) / maxLog;
    if (intensity < MIN_INTENSITY) continue;
    const off = (pBucket * TIME_BUCKETS + tBucket) * 4;
    const v = Math.max(0, Math.min(255, Math.round(intensity * 255)));
    if (v > buf[off]) buf[off] = v; // keep the brightest sample at this cell
  }
}
