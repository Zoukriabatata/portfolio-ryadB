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
import { TradeBubblesCommand } from "./TradeBubblesCommand";
import type { Trade } from "./TradeStateAdapter";
import type {
  HeatmapMarketState,
  OrderbookSnapshot,
} from "./types";

export type HeatmapRendererSettings = {
  showTradeBubbles: boolean;
};

const DEFAULT_RENDERER_SETTINGS: HeatmapRendererSettings = {
  showTradeBubbles: true,
};

const TIME_BUCKETS = 300; // 5 min @ 1 Hz
const PRICE_BUCKETS = 200;
const MIN_INTENSITY = 0.02; // floor below which a cell paints as "empty" so dust doesn't speckle the bg

export interface RendererStats {
  fps: number;
  historyLength: number;
  midPrice: number;
  priceRange: [number, number];
}

/** Viewport in texture-uv space, applied by the fragment shader.
 *  M6a-2 — `x` is the centre of the visible window in [0, 1]
 *  texture-X (0=oldest, 1=newest). `xZoom` is the zoom factor;
 *  larger = more zoomed in = narrower window. Same shape on Y.
 *  Default: x = 1 - 0.5/xZoom (right-anchored), y = 0.5 (centred). */
export type HeatmapViewport = {
  x: number;
  y: number;
  xZoom: number;
  yZoom: number;
};

export const DEFAULT_VIEWPORT: HeatmapViewport = {
  x: 0.5,
  y: 0.5,
  xZoom: 1,
  yZoom: 1,
};

/** Reverse-mapping payload returned by `getCellAt(x, y)` — exposed
 *  so the React overlay can render the price tag, time tag, and
 *  the cell tooltip (bid/ask quantities at the snap target). */
export type HeatmapCellInfo = {
  /** Index in the adapter's history array. */
  snapshotIdx: number;
  /** Snapped price (rounded to the nearest priceBucket centre). */
  price: number;
  /** Quantity at this price level on the bid side, or null when
   *  the level isn't present in the snapshot. */
  bidQty: number | null;
  /** Same for the ask side. */
  askQty: number | null;
  timestampMs: number;
};

export class HeatmapRenderer {
  private regl: Regl;
  private canvas: HTMLCanvasElement;
  private theme: HeatmapTheme;

  private intensityTex: Texture2D;
  private intensityBuf: Uint8Array;
  private gradientTex: Texture2D;
  private drawHeatmap: DrawCommand;
  private bubbles: TradeBubblesCommand;
  private settings: HeatmapRendererSettings = { ...DEFAULT_RENDERER_SETTINGS };

  private dpr = 1;
  private rafId: number | null = null;
  private viewport: HeatmapViewport = { ...DEFAULT_VIEWPORT };

  // Per-frame computed range cached for the overlay axes + the
  // reverse mapping in getCellAt.
  private lastRange: [number, number] = [0, 0];
  private lastMid = 0;
  private lastFps = 0;
  private frameTimes: number[] = [];
  private lastState: HeatmapMarketState | null = null;
  private lastTimeStartIdx = 0; // history idx that maps to time bucket 0

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
      // ANGLE_instanced_arrays is required by TradeBubblesCommand
      // (M6b-1) — without it, the `divisor: 1` attribute throws
      // at draw-call build time. WebGL2 has the equivalent
      // primitive built in, but regl's WebGL1 default still wants
      // the extension declared explicitly.
      extensions: ["ANGLE_instanced_arrays"],
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
      // M6a-2 viewport: u_viewport = (xCenter, yCenter, xZoom, yZoom).
      // sample uv = viewport.xy + (frag uv - 0.5) / viewport.zw.
      // Out-of-range samples paint the background instead of
      // wrapping (no GL_REPEAT semantics — explicit branch).
      frag: `
        precision highp float;
        uniform sampler2D u_intensity;
        uniform sampler2D u_gradient;
        uniform vec4 u_bg;
        uniform vec4 u_viewport;
        varying vec2 v_uv;
        void main() {
          vec2 sampleUV = u_viewport.xy + (v_uv - 0.5) / u_viewport.zw;
          if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
              sampleUV.y < 0.0 || sampleUV.y > 1.0) {
            gl_FragColor = u_bg;
            return;
          }
          float i = texture2D(u_intensity, sampleUV).r;
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
        u_viewport: () => [
          this.viewport.x,
          this.viewport.y,
          this.viewport.xZoom,
          this.viewport.yZoom,
        ],
      },
      count: 4,
      primitive: "triangle strip",
      depth: { enable: false },
      blend: { enable: false },
    });

    this.bubbles = new TradeBubblesCommand(this.regl);

    const rect = canvas.getBoundingClientRect();
    this.applySize(rect.width || 800, rect.height || 480);
  }

  /** M6b-1 — push the latest 5-min trade buffer for bubble
   *  rendering. Caller is the React layer; the command rebuilds
   *  the instance buffer from the supplied trades + the price
   *  range cached on the last frame. */
  setTrades(trades: Trade[]) {
    if (this.lastRange[1] <= this.lastRange[0]) {
      // Range hasn't been computed yet — defer until at least one
      // heatmap frame ran.
      return;
    }
    this.bubbles.update(
      trades,
      this.lastRange[0],
      this.lastRange[1],
      Date.now(),
    );
  }

  setRendererSettings(s: HeatmapRendererSettings) {
    this.settings = s;
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

  /** Push a new viewport. The next frame's draw call will sample
   *  the texture through the updated transform. */
  setViewport(v: HeatmapViewport) {
    this.viewport = v;
  }

  getViewport(): HeatmapViewport {
    return this.viewport;
  }

  /** Reverse-map a CSS-pixel cursor coordinate (origin top-left of
   *  the canvas) to a snapshot + price + bid/ask qty. Returns null
   *  when the pointer is outside the rendered chart area or no
   *  frame has run yet. */
  getCellAt(canvasX: number, canvasY: number): HeatmapCellInfo | null {
    const state = this.lastState;
    if (!state || state.history.length === 0) return null;
    const w = parseFloat(this.canvas.style.width || "0");
    const h = parseFloat(this.canvas.style.height || "0");
    if (w <= 0 || h <= 0) return null;
    if (canvasX < 0 || canvasX > w || canvasY < 0 || canvasY > h) return null;

    // CSS px → fragment UV. Fragment UV has Y up (origin bottom-
    // left) so we flip Y.
    const fragU = canvasX / w;
    const fragV = 1 - canvasY / h;

    // Apply viewport transform to land in texture UV space.
    const sampleU = this.viewport.x + (fragU - 0.5) / this.viewport.xZoom;
    const sampleV = this.viewport.y + (fragV - 0.5) / this.viewport.yZoom;
    if (sampleU < 0 || sampleU > 1 || sampleV < 0 || sampleV > 1) return null;

    const tBucket = Math.min(
      TIME_BUCKETS - 1,
      Math.max(0, Math.floor(sampleU * TIME_BUCKETS)),
    );
    const pBucket = Math.min(
      PRICE_BUCKETS - 1,
      Math.max(0, Math.floor(sampleV * PRICE_BUCKETS)),
    );

    // tBucket → snapshotIdx via the right-anchoring offset cached
    // by renderFrame. Snapshots earlier than the visible window
    // (left of the right-anchored start) yield no cell.
    const snapshotIdx = tBucket - this.lastTimeStartIdx;
    if (snapshotIdx < 0 || snapshotIdx >= state.history.length) return null;

    const [minPrice, maxPrice] = this.lastRange;
    if (maxPrice <= minPrice) return null;
    const priceStep = (maxPrice - minPrice) / PRICE_BUCKETS;
    const price = minPrice + (pBucket + 0.5) * priceStep;

    const snap = state.history[snapshotIdx];
    // Snap to the closest exchange tick price present in the
    // snapshot's bid/ask Maps. We can't trust the bucket midpoint
    // because the exchange ticks at a finer granularity than our
    // 200-bucket Y grid.
    const closestPrice = closestKey(snap.bids, snap.asks, price);
    const bidQty = closestPrice !== null ? snap.bids.get(closestPrice) ?? null : null;
    const askQty = closestPrice !== null ? snap.asks.get(closestPrice) ?? null : null;

    return {
      snapshotIdx,
      price: closestPrice ?? price,
      bidQty,
      askQty,
      timestampMs: snap.timestampMs,
    };
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
    // M6b-1 diagnostic — remove once bubble sizing is verified.
    // eslint-disable-next-line no-console
    console.log("[HEATMAP DEBUG applySize]", {
      cssW: width,
      cssH: height,
      physW: this.canvas.width,
      physH: this.canvas.height,
      dpr: this.dpr,
    });
  }

  private renderFrame(state: HeatmapMarketState) {
    // FPS over the last 60 frames.
    if (this.frameTimes.length > 0) {
      const avg = this.frameTimes.reduce((s, x) => s + x, 0) / this.frameTimes.length;
      this.lastFps = avg > 0 ? Math.min(60, 1000 / avg) : 0;
    }

    this.lastState = state;
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
    this.lastTimeStartIdx = startIdx;
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

    // M6b-1 — alpha-blend trade bubbles on top of the heatmap bg.
    // Resolution is in CSS pixels so bubble radii (also CSS px)
    // stay visually constant across DPR.
    if (this.settings.showTradeBubbles) {
      const cssWidth = parseFloat(this.canvas.style.width || "0") || 1;
      const cssHeight = parseFloat(this.canvas.style.height || "0") || 1;
      const viewport = [
        this.viewport.x,
        this.viewport.y,
        this.viewport.xZoom,
        this.viewport.yZoom,
      ];
      const resolution = [cssWidth, cssHeight];
      // M6b-1 diagnostic — remove once bubble sizing is verified.
      if ((this as unknown as { __dbgFrames?: number }).__dbgFrames === undefined) {
        (this as unknown as { __dbgFrames: number }).__dbgFrames = 0;
      }
      const dbg = this as unknown as { __dbgFrames: number };
      if (dbg.__dbgFrames < 5 || dbg.__dbgFrames % 60 === 0) {
        // eslint-disable-next-line no-console
        console.log("[BUBBLES DEBUG]", {
          viewport,
          resolution,
          instanceCount: this.bubbles.getInstanceCount(),
          canvasWidth: this.canvas.width,
          canvasHeight: this.canvas.height,
          styleWidth: this.canvas.style.width,
          styleHeight: this.canvas.style.height,
        });
      }
      dbg.__dbgFrames += 1;
      this.bubbles.draw(viewport, resolution);
    }
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

/** Find the price key (across both bid and ask Maps) whose value
 *  is closest to `target`. Used by getCellAt to snap to an actual
 *  exchange tick rather than the bucket midpoint. */
function closestKey(
  bids: Map<number, number>,
  asks: Map<number, number>,
  target: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const k of bids.keys()) {
    const d = Math.abs(k - target);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  for (const k of asks.keys()) {
    const d = Math.abs(k - target);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
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
