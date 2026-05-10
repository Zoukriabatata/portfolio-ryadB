import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { TradesBuffer } from "./TradesBuffer";

const MAX_BUBBLES = 50_000;
const FLOATS_PER_INSTANCE = 6; // centerX, centerY, radius_px, r, g, b
const STRIDE_BYTES = FLOATS_PER_INSTANCE * Float32Array.BYTES_PER_ELEMENT;
const VISIBLE_FLOATS_PER_TRADE = 4; // tDelta, price, size, side01
const MEDIAN_WINDOW = 50;

const BASE_RADIUS_PX = 4;
const MIN_RADIUS_PX = 2;
const MAX_RADIUS_PX = 30;

// Pure helper, exporté pour test unitaire. Mapping volume → radius en sqrt
// avec normalisation par la médiane glissante. Fallback explicite si median
// absent / nul (early stream) → baseRadiusPx.
export function volumeToRadiusPx(
  size: number,
  median: number,
  baseRadiusPx: number = BASE_RADIUS_PX,
  minPx: number = MIN_RADIUS_PX,
  maxPx: number = MAX_RADIUS_PX,
): number {
  if (!Number.isFinite(median) || median <= 0) {
    return Math.max(minPx, Math.min(maxPx, baseRadiusPx));
  }
  if (!Number.isFinite(size) || size <= 0) return minPx;
  const r = baseRadiusPx * Math.sqrt(size / median);
  return Math.max(minPx, Math.min(maxPx, r));
}

const VERT_SRC = `
precision mediump float;
attribute vec2 aQuad;
attribute vec2 aCenter;
attribute float aRadius;
attribute vec3 aColor;
uniform vec2 uResolution;
varying vec2 vUV;
varying vec3 vColor;
void main() {
  vec2 centerClip = aCenter * 2.0 - 1.0;
  vec2 offsetClip = (aQuad * aRadius) / uResolution * 2.0;
  gl_Position = vec4(centerClip + offsetClip, 0.0, 1.0);
  vUV = aQuad;
  vColor = aColor;
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec2 vUV;
varying vec3 vColor;
void main() {
  float d = length(vUV);
  float alpha = 1.0 - smoothstep(0.85, 1.0, d);
  if (alpha <= 0.0) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 6) {
    throw new Error(`TradeBubblesLayer: invalid CSS color "${hex}"`);
  }
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function readBidAskColors(): {
  bid: [number, number, number];
  ask: [number, number, number];
} {
  const style = getComputedStyle(document.documentElement);
  const bidRaw = style.getPropertyValue("--bid");
  const askRaw = style.getPropertyValue("--ask");
  if (!bidRaw || !askRaw) {
    throw new Error(
      "TradeBubblesLayer: --bid/--ask CSS variables undefined. tokens.css importé ?",
    );
  }
  return { bid: parseHexColor(bidRaw), ask: parseHexColor(askRaw) };
}

export class TradeBubblesLayer implements Layer<TradesBuffer> {
  public dirty = false;
  private quadBuf: Regl.Buffer | null = null;
  private instanceBuf: Regl.Buffer | null = null;
  private drawCmd: Regl.DrawCommand | null = null;
  private readonly visibleScratch: Float32Array;
  private readonly instanceData: Float32Array;
  private instanceCount = 0;
  private bidColor: [number, number, number] = [0, 1, 0];
  private askColor: [number, number, number] = [1, 0, 0];
  private canvasWidth = 1;
  private canvasHeight = 1;

  constructor() {
    this.visibleScratch = new Float32Array(
      MAX_BUBBLES * VISIBLE_FLOATS_PER_TRADE,
    );
    this.instanceData = new Float32Array(MAX_BUBBLES * FLOATS_PER_INSTANCE);
  }

  init(regl: Regl.Regl, _grid: GridSystem): void {
    if (!regl.hasExtension("ANGLE_instanced_arrays")) {
      throw new Error(
        "TradeBubblesLayer: ANGLE_instanced_arrays non supporté par WebGL runtime",
      );
    }
    const colors = readBidAskColors();
    this.bidColor = colors.bid;
    this.askColor = colors.ask;

    this.quadBuf = regl.buffer({ data: QUAD, usage: "static" });
    // usage: 'dynamic' documenté car subdata appelé à chaque update (cf.
    // CLAUDE.md anti-pattern : pas de réutilisation buffer GPU sans usage doc).
    this.instanceBuf = regl.buffer({
      data: this.instanceData,
      usage: "dynamic",
    });

    this.drawCmd = regl({
      vert: VERT_SRC,
      frag: FRAG_SRC,
      attributes: {
        aQuad: { buffer: this.quadBuf, divisor: 0 },
        aCenter: {
          buffer: this.instanceBuf,
          offset: 0,
          stride: STRIDE_BYTES,
          divisor: 1,
        },
        aRadius: {
          buffer: this.instanceBuf,
          offset: 8,
          stride: STRIDE_BYTES,
          divisor: 1,
        },
        aColor: {
          buffer: this.instanceBuf,
          offset: 12,
          stride: STRIDE_BYTES,
          divisor: 1,
        },
      },
      uniforms: {
        // Closure directe (pas regl.prop pour vec2 — leçon §5.B).
        uResolution: () => [this.canvasWidth, this.canvasHeight],
      },
      primitive: "triangle strip",
      count: 4,
      // Scalar prop OK (pas vec).
      instances: regl.prop<{ instances: number }, "instances">("instances"),
      depth: { enable: false },
      blend: {
        enable: true,
        func: { src: "src alpha", dst: "one minus src alpha" },
      },
    });
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = Math.max(1, width);
    this.canvasHeight = Math.max(1, height);
  }

  update(grid: GridSystem, buffer: TradesBuffer): void {
    if (!this.instanceBuf) return;
    const visible = buffer.visibleTrades(grid, this.visibleScratch);
    if (visible > MAX_BUBBLES) {
      throw new Error(
        `TradeBubblesLayer: ${visible} bubbles dépasse MAX_BUBBLES=${MAX_BUBBLES}`,
      );
    }
    const median = buffer.medianRecentVolume(MEDIAN_WINDOW);
    const range = grid.priceMax - grid.priceMin;
    const historyDur = grid.historyDurationMs;

    let outIdx = 0;
    for (let i = 0; i < visible; i++) {
      const base = i * VISIBLE_FLOATS_PER_TRADE;
      const tDelta = this.visibleScratch[base + 0];
      const price = this.visibleScratch[base + 1];
      const size = this.visibleScratch[base + 2];
      const side01 = this.visibleScratch[base + 3];

      const cx = tDelta / historyDur;
      const cy = (price - grid.priceMin) / range;
      if (cx < 0 || cx > 1 || cy < 0 || cy > 1) continue;

      const radius = volumeToRadiusPx(size, median);
      const color = side01 < 0.5 ? this.bidColor : this.askColor;

      this.instanceData[outIdx + 0] = cx;
      this.instanceData[outIdx + 1] = cy;
      this.instanceData[outIdx + 2] = radius;
      this.instanceData[outIdx + 3] = color[0];
      this.instanceData[outIdx + 4] = color[1];
      this.instanceData[outIdx + 5] = color[2];
      outIdx += FLOATS_PER_INSTANCE;
    }
    this.instanceCount = outIdx / FLOATS_PER_INSTANCE;
    if (this.instanceCount > 0) {
      this.instanceBuf.subdata(this.instanceData.subarray(0, outIdx), 0);
    }
  }

  draw(): void {
    if (!this.drawCmd || this.instanceCount === 0) return;
    this.drawCmd({ instances: this.instanceCount });
  }

  // No-op : la couche recompute les coords UV à l'update à partir du grid courant.
  // Buffers fixes basés sur MAX_BUBBLES, pas de realloc.
  onViewportChange(_grid: GridSystem): void {
    // intentionnellement vide
  }

  destroy(): void {
    this.quadBuf?.destroy();
    this.instanceBuf?.destroy();
    this.quadBuf = null;
    this.instanceBuf = null;
    this.drawCmd = null;
    this.instanceCount = 0;
  }
}
