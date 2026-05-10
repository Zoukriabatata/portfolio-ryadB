import createREGL from "regl";
import type Regl from "regl";
import {
  ClockSource,
  createGridSystem,
  DEFAULT_VALUE_AREA_WIDTH,
  VolumeProfileBuilder,
  VwapBuilder,
  type BucketDurationMs,
  type GridSystem,
  type OrderbookSnapshot,
  type Trade,
  type Viewport,
} from "../core";
import { OrderbookHistory } from "./OrderbookHistory";
import { TradesBuffer } from "./TradesBuffer";
import type { LiquidityFrame } from "./LiquidityFrame";
import type { Layer } from "./Layer";

const KEY_LEVELS_SCRATCH_TRADES = 50_000;
const KEY_LEVELS_SCRATCH_FLOATS_PER_TRADE = 4;

export interface HeatmapEngineSpec {
  canvas: HTMLCanvasElement;
  // Canvas 2D overlay optionnel pour les couches non-regl (KeyLevels). Doit
  // avoir les mêmes dimensions que `canvas` côté caller.
  overlayCanvas?: HTMLCanvasElement;
  viewport: Viewport;
  bucketDurationMs?: BucketDurationMs;
  historyDurationMs?: number;
  tickSize?: number;
  // Largeur Value Area (default DEFAULT_VALUE_AREA_WIDTH = 0.70).
  valueAreaWidth?: number;
}

export interface KeyLevelsSnapshot {
  poc: number | null;
  vah: number | null;
  val: number | null;
  vwap: number | null;
}

// REFONTE-4c — snapshot pour la VolumeProfileLayer.
// volumes en zero-copy (DO NOT MUTATE). pocIdx/valIdx/vahIdx en priceIndex,
// -1 si indispo (pas de POC/VA encore calculé).
export interface VolumeProfileSnapshot {
  volumes: Readonly<Float32Array>;
  pocIdx: number;
  valIdx: number;
  vahIdx: number;
}

interface RegisteredLayer {
  layer: Layer<unknown>;
  zIndex: number;
  getData: () => unknown;
}

// Pure helper, exposé pour test unitaire (cf. contrat utilisateur :
// `engine.tick()` recompute toFrame UNIQUEMENT si bucket avancé).
export function shouldRecomputeFrame(
  pendingUpdate: boolean,
  currentBucket: number,
  lastBucketProcessed: number,
): boolean {
  return pendingUpdate && currentBucket > lastBucketProcessed;
}

// Pure helper : determine si un setViewport change les dimensions du buffer.
// Pan-only (priceMin/priceMax shift, range identique) → false, pas de realloc.
// Zoom (range change) → true, realloc nécessaire.
export function shouldReallocOnViewportChange(
  oldPriceLevels: number,
  newPriceLevels: number,
): boolean {
  return oldPriceLevels !== newPriceLevels;
}

// REFONTE-5 — Pure helper : convertit pixel canvas (drawing buffer) en
// coordonnées grid {price, timestampMs}. null si hors bornes ou canvas size 0.
// Mapping : x ∈ [0, canvasW) → time ∈ [oldestExchangeMs, nowExchangeMs)
//           y ∈ [0, canvasH) → price ∈ (priceMin, priceMax] (top=priceMax).
export function pixelsToGrid(
  x: number,
  y: number,
  canvasW: number,
  canvasH: number,
  grid: GridSystem,
): { price: number; timestampMs: number } | null {
  if (canvasW <= 0 || canvasH <= 0) return null;
  if (x < 0 || x >= canvasW || y < 0 || y >= canvasH) return null;
  return {
    timestampMs:
      grid.oldestExchangeMs + (x / canvasW) * grid.historyDurationMs,
    price: grid.priceMax - (y / canvasH) * (grid.priceMax - grid.priceMin),
  };
}

export interface CrosshairLookup {
  price: number;
  timestampMs: number;
  liquidityIntensity: number; // [0, 1] depuis cells normalisées
  volume: number; // raw size depuis VolumeProfileBuilder
}

export interface CrosshairData {
  // Coordonnées drawing buffer (canvas.width/height pixels), pas CSS px.
  // null = pas de crosshair (mouseleave).
  pos: { x: number; y: number } | null;
  lookup: CrosshairLookup | null;
}

const SANITY_VERT = `
precision mediump float;
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const SANITY_FRAG = `
precision mediump float;
void main() {
  gl_FragColor = vec4(1.0, 0.2, 0.2, 1.0);
}
`;

// Quad rouge ~5% écran en haut-gauche, clip space.
const SANITY_QUAD = new Float32Array([
  -0.98, 0.9,
   -0.88, 0.9,
   -0.98, 1.0,
   -0.88, 1.0,
]);

export class HeatmapEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly regl: Regl.Regl;
  private readonly clock = new ClockSource();
  private viewport: Viewport;
  private readonly bucketDurationMs: BucketDurationMs;
  private readonly historyDurationMs: number;
  private readonly tickSize: number;
  private readonly historyLength: number;
  private priceLevels: number;
  private readonly layers: RegisteredLayer[] = [];
  private orderbookHistory: OrderbookHistory | null = null;
  private lastOrderbookSnap: OrderbookSnapshot | null = null;
  private tradesBuffer: TradesBuffer | null = null;
  private volumeProfileBuilder: VolumeProfileBuilder | null = null;
  private vwapBuilder: VwapBuilder | null = null;
  private keyLevelsScratch: Float32Array | null = null;
  private liquidityFrameMutable: { grid: GridSystem; cells: Float32Array };
  private currentGrid: GridSystem;
  private lastBucketProcessed = -Infinity;
  private pendingOrderbookUpdate = false;
  private pendingTradesUpdate = false;
  private readonly overlayCtx: CanvasRenderingContext2D | null = null;
  private readonly valueAreaWidth: number;
  private rafId: number | null = null;
  private started = false;
  private destroyed = false;
  private sanityActive = false;
  private sanityDrawCmd: Regl.DrawCommand | null = null;
  private sanityBuf: Regl.Buffer | null = null;
  private fpsLast = 0;
  private readonly fpsSamples = new Uint16Array(60);
  private fpsIdx = 0;
  // REFONTE-5 — crosshair state. -1 = inactif (pas d'allocation per mousemove).
  private crosshairX = -1;
  private crosshairY = -1;

  constructor(spec: HeatmapEngineSpec) {
    this.viewport = spec.viewport;
    this.bucketDurationMs = spec.bucketDurationMs ?? 100;
    this.historyDurationMs = spec.historyDurationMs ?? 5 * 60_000;
    this.tickSize = spec.tickSize ?? 0.1;
    this.valueAreaWidth = spec.valueAreaWidth ?? DEFAULT_VALUE_AREA_WIDTH;
    this.overlayCtx = spec.overlayCanvas?.getContext("2d") ?? null;
    this.historyLength = Math.floor(
      this.historyDurationMs / this.bucketDurationMs,
    );
    this.priceLevels = Math.floor(
      (this.viewport.priceMax - this.viewport.priceMin) / this.tickSize,
    );

    this.canvas = spec.canvas;
    // ANGLE_instanced_arrays requise par TradeBubblesLayer (REFONTE-4a).
    // Si indispo (très improbable WebView2/Chromium), regl throw au create.
    this.regl = createREGL({
      canvas: spec.canvas,
      extensions: ["ANGLE_instanced_arrays"],
    });

    this.currentGrid = this.makeGrid();
    const cells = new Float32Array(this.historyLength * this.priceLevels);
    this.liquidityFrameMutable = { grid: this.currentGrid, cells };
  }

  private makeGrid(): GridSystem {
    return createGridSystem({
      bucketDurationMs: this.bucketDurationMs,
      historyDurationMs: this.historyDurationMs,
      nowExchangeMs: this.clock.now(),
      tickSize: this.tickSize,
      priceMin: this.viewport.priceMin,
      priceMax: this.viewport.priceMax,
    });
  }

  addLayer<T>(layer: Layer<T>, zIndex: number, getData: () => T): void {
    this.layers.push({
      layer: layer as Layer<unknown>,
      zIndex,
      getData: getData as () => unknown,
    });
    this.layers.sort((a, b) => a.zIndex - b.zIndex);
    if (this.started) {
      layer.init(this.regl, this.currentGrid, this.overlayCtx ?? undefined);
    }
  }

  setOrderbook(snap: OrderbookSnapshot): void {
    if (this.destroyed) return;
    // REFONTE-5 — ref directe pour DOM panel (read-only contract).
    this.lastOrderbookSnap = snap;
    this.clock.tick(snap.exchangeMs);
    if (!this.orderbookHistory) return; // pas encore start()
    this.currentGrid = this.makeGrid();
    this.orderbookHistory.ingest(snap, this.currentGrid);
    this.pendingOrderbookUpdate = true;
  }

  // REFONTE-5 — exposé pour DomPanel. Retourne la ref directe du dernier
  // snapshot reçu (pas de copie). DO NOT MUTATE côté consommateur.
  getLastOrderbookSnap(): OrderbookSnapshot | null {
    return this.lastOrderbookSnap;
  }

  setTrade(trade: Trade): void {
    if (this.destroyed || !this.tradesBuffer) return;
    this.clock.tick(trade.exchangeMs);
    this.tradesBuffer.ingest(trade);
    this.vwapBuilder?.ingest(trade.price, trade.size, trade.exchangeMs);
    this.pendingTradesUpdate = true;
  }

  getKeyLevelsSnapshot(): KeyLevelsSnapshot {
    const vp = this.volumeProfileBuilder;
    const va = vp ? vp.valueArea(this.valueAreaWidth, this.currentGrid) : null;
    return {
      poc: vp ? vp.poc(this.currentGrid) : null,
      vah: va ? va.vah : null,
      val: va ? va.val : null,
      vwap: this.vwapBuilder ? this.vwapBuilder.vwap() : null,
    };
  }

  // REFONTE-5 — crosshair API. setCrosshair/clearCrosshair appelés depuis
  // les mousemove/mouseleave listeners. lookupCell/getCrosshairData
  // consommés par la CrosshairLayer.
  setCrosshair(x: number, y: number): void {
    if (this.destroyed) return;
    this.crosshairX = x;
    this.crosshairY = y;
  }

  clearCrosshair(): void {
    this.crosshairX = -1;
    this.crosshairY = -1;
  }

  lookupCell(x: number, y: number): CrosshairLookup | null {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const px = pixelsToGrid(x, y, w, h, this.currentGrid);
    if (!px) return null;

    let liquidityIntensity = 0;
    const tIdx = this.currentGrid.bucketIndex(px.timestampMs);
    const pIdx = this.currentGrid.priceIndex(px.price);
    if (tIdx >= 0 && pIdx >= 0) {
      const cells = this.liquidityFrameMutable.cells;
      const offset = tIdx * this.currentGrid.priceLevels + pIdx;
      if (offset >= 0 && offset < cells.length) {
        liquidityIntensity = cells[offset];
      }
    }

    let volume = 0;
    if (this.volumeProfileBuilder && pIdx >= 0) {
      const view = this.volumeProfileBuilder.getVolumesView();
      if (pIdx < view.length) volume = view[pIdx];
    }

    return {
      price: px.price,
      timestampMs: px.timestampMs,
      liquidityIntensity,
      volume,
    };
  }

  getCrosshairData(): CrosshairData {
    if (this.crosshairX < 0 || this.crosshairY < 0) {
      return { pos: null, lookup: null };
    }
    const lookup = this.lookupCell(this.crosshairX, this.crosshairY);
    return {
      pos: { x: this.crosshairX, y: this.crosshairY },
      lookup,
    };
  }

  // REFONTE-4c — zero-copy snapshot pour la VolumeProfileLayer.
  // `volumes` est la ref interne du Builder (DO NOT MUTATE côté layer).
  getVolumeProfileSnapshot(): VolumeProfileSnapshot {
    const vp = this.volumeProfileBuilder;
    if (!vp) {
      return {
        volumes: new Float32Array(0),
        pocIdx: -1,
        valIdx: -1,
        vahIdx: -1,
      };
    }
    const va = vp.valueAreaIndices(this.valueAreaWidth);
    return {
      volumes: vp.getVolumesView(),
      pocIdx: vp.pocIndex(),
      valIdx: va ? va.val : -1,
      vahIdx: va ? va.vah : -1,
    };
  }

  // Compatibilité signature : itère et appelle setTrade pour chaque.
  setTrades(trades: ReadonlyArray<Trade>): void {
    for (let i = 0; i < trades.length; i++) {
      this.setTrade(trades[i]);
    }
  }

  getTradesBuffer(): TradesBuffer {
    if (!this.tradesBuffer) {
      throw new Error("HeatmapEngine: getTradesBuffer() avant start()");
    }
    return this.tradesBuffer;
  }

  setViewport(viewport: Viewport): void {
    if (this.destroyed) return;
    this.viewport = viewport;
    const newPriceLevels = Math.floor(
      (viewport.priceMax - viewport.priceMin) / this.tickSize,
    );
    const dimsChanged = shouldReallocOnViewportChange(
      this.priceLevels,
      newPriceLevels,
    );
    this.priceLevels = newPriceLevels;
    this.currentGrid = this.makeGrid();
    this.liquidityFrameMutable.grid = this.currentGrid;

    if (dimsChanged && this.started) {
      // Realloc cells + history + volumeProfileBuilder (perte des données
      // passées — refill au prochain ingest). VwapBuilder indépendant des
      // dims, pas touché.
      this.liquidityFrameMutable.cells = new Float32Array(
        this.historyLength * this.priceLevels,
      );
      this.orderbookHistory = new OrderbookHistory(
        this.historyLength,
        this.priceLevels,
      );
      this.volumeProfileBuilder = new VolumeProfileBuilder(this.priceLevels);
      this.lastBucketProcessed = -Infinity;
      this.pendingOrderbookUpdate = false;
    }

    if (this.started) {
      for (const reg of this.layers) {
        reg.layer.onViewportChange?.(this.currentGrid);
        reg.layer.dirty = true;
      }
    }
  }

  enableDevSanity(): void {
    if (this.sanityActive) return;
    this.sanityBuf = this.regl.buffer({ data: SANITY_QUAD, usage: "static" });
    this.sanityDrawCmd = this.regl({
      vert: SANITY_VERT,
      frag: SANITY_FRAG,
      attributes: { aPosition: this.sanityBuf },
      primitive: "triangle strip",
      count: 4,
      depth: { enable: false },
      blend: { enable: false },
    });
    this.sanityActive = true;
  }

  disableDevSanity(): void {
    if (!this.sanityActive) return;
    this.sanityBuf?.destroy();
    this.sanityBuf = null;
    this.sanityDrawCmd = null;
    this.sanityActive = false;
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.orderbookHistory = new OrderbookHistory(
      this.historyLength,
      this.priceLevels,
    );
    this.tradesBuffer = new TradesBuffer(50_000);
    this.volumeProfileBuilder = new VolumeProfileBuilder(this.priceLevels);
    this.vwapBuilder = new VwapBuilder();
    this.keyLevelsScratch = new Float32Array(
      KEY_LEVELS_SCRATCH_TRADES * KEY_LEVELS_SCRATCH_FLOATS_PER_TRADE,
    );
    for (const reg of this.layers) {
      reg.layer.init(this.regl, this.currentGrid, this.overlayCtx ?? undefined);
    }
    this.fpsLast = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    if (this.destroyed) return;

    // eslint-disable-next-line no-restricted-syntax -- FPS counter (UI animation), pas timestamp data : conforme à l'intent du contrat anti-pattern (Date.now/perf.now interdits pour data, autorisés pour metering UI).
    const now = performance.now();
    if (this.fpsLast > 0) {
      const dt = now - this.fpsLast;
      if (dt > 0) {
        const fps = 1000 / dt;
        this.fpsSamples[this.fpsIdx] = fps < 999 ? fps | 0 : 999;
        this.fpsIdx = (this.fpsIdx + 1) % this.fpsSamples.length;
      }
    }
    this.fpsLast = now;

    this.currentGrid = this.makeGrid();
    this.liquidityFrameMutable.grid = this.currentGrid;

    const currentBucket = Math.floor(
      this.currentGrid.nowExchangeMs / this.bucketDurationMs,
    );
    const shouldRecompute = shouldRecomputeFrame(
      this.pendingOrderbookUpdate,
      currentBucket,
      this.lastBucketProcessed,
    );
    const tradesPending =
      this.pendingTradesUpdate && currentBucket > this.lastBucketProcessed;

    if (shouldRecompute) {
      this.orderbookHistory!.toFrame(
        this.currentGrid,
        this.liquidityFrameMutable as LiquidityFrame,
      );
    }
    if (shouldRecompute || tradesPending) {
      // Rebuild VolumeProfileBuilder from-scratch depuis TradesBuffer visible.
      // Coût O(N_visible) ≤ 50k ops, négligeable à 10 Hz max.
      if (
        this.volumeProfileBuilder &&
        this.tradesBuffer &&
        this.keyLevelsScratch
      ) {
        this.volumeProfileBuilder.reset();
        const visible = this.tradesBuffer.visibleTrades(
          this.currentGrid,
          this.keyLevelsScratch,
        );
        for (let i = 0; i < visible; i++) {
          const base = i * KEY_LEVELS_SCRATCH_FLOATS_PER_TRADE;
          // scratch layout: [tDelta, price, size, side01]
          const price = this.keyLevelsScratch[base + 1];
          const size = this.keyLevelsScratch[base + 2];
          this.volumeProfileBuilder.addTrade(price, size, this.currentGrid);
        }
      }
      // VWAP eviction sur clock advance.
      this.vwapBuilder?.evict(this.clock.now());

      for (const reg of this.layers) {
        reg.layer.dirty = true;
      }
      this.lastBucketProcessed = currentBucket;
      this.pendingOrderbookUpdate = false;
      this.pendingTradesUpdate = false;
    }

    for (const reg of this.layers) {
      if (reg.layer.dirty) {
        reg.layer.update(this.currentGrid, reg.getData());
        reg.layer.dirty = false;
      }
    }

    this.regl.clear({ color: [0, 0, 0, 1] });

    // REFONTE-4c : clear l'overlay UNE FOIS par frame, AVANT les draws des
    // overlay layers. Les overlay layers (KeyLevels, VolumeProfile) ne
    // clear PAS leur zone individuellement — elles écrivent seulement.
    if (this.overlayCtx) {
      const oc = this.overlayCtx.canvas;
      this.overlayCtx.clearRect(0, 0, oc.width, oc.height);
    }

    for (const reg of this.layers) {
      reg.layer.draw();
    }

    if (this.sanityActive && this.sanityDrawCmd) {
      this.sanityDrawCmd();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  getLiquidityFrame(): LiquidityFrame {
    return this.liquidityFrameMutable as LiquidityFrame;
  }

  getFps(): number {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < this.fpsSamples.length; i++) {
      const v = this.fpsSamples[i];
      if (v > 0) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    for (const reg of this.layers) {
      reg.layer.destroy();
    }
    this.layers.length = 0;
    this.disableDevSanity();
    this.regl.destroy();
  }
}
