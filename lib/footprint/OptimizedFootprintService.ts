/**
 * OPTIMIZED FOOTPRINT SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement wiring the new ATASFootprintEngine + ATASDataLoader into
 * the existing FootprintChartPro component interface.
 *
 * Key changes vs previous version:
 *   - Uses Math.floor price snapping (was Math.round — fixed all bid/ask errors)
 *   - No 10K trade hard cap — loader controls the limit
 *   - Full day mode for 1440 M1 candles
 *   - Strict tick timestamp sorting before processing (fixes OHLC accuracy)
 *   - Skeleton mode for BTC (instant OHLC + partial footprint)
 */

import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';
import {
  ATASFootprintEngine,
  type ATASEngineConfig,
  type RawTick,
} from './ATASFootprintEngine';
import {
  loadFootprintData,
  type LoadMode,
  type OHLCSkeleton,
} from './ATASDataLoader';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizedConfig {
  symbol: string;
  timeframe: number;          // Candle duration in SECONDS (e.g. 60 for 1m)
  tickSize: number;           // Price compression step (e.g. 10 for BTC)
  imbalanceRatio: number;     // Default 3.0
  totalHours: number;         // History window for window mode (default 4)

  /** Non-time aggregation (tick/volume bars) */
  aggregationMode: 'time' | 'tick' | 'volume';
  tickBarSize: number;
  volumeBarSize: number;

  /** Loading strategy */
  loadMode: LoadMode;

  /** Full day: UTC midnight ms. Defaults to today. */
  dayStartMs?: number;

  /** Max trades per time chunk (null = no cap). Recommended: null for ETH, 50000 for BTC */
  maxTradesPerChunk?: number | null;

  /** Enable per-tick debug logging */
  debug?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class OptimizedFootprintService {
  private config: OptimizedConfig;
  private engine: ATASFootprintEngine;
  private isLoading = false;
  private onProgress: ((progress: number, message: string) => void) | null = null;

  /** OHLC skeleton from klines (skeleton mode only) */
  private skeleton: OHLCSkeleton[] | undefined;

  // Non-time aggregation state
  private nonTimeIndex = 0;
  private currentNonTimeCandle: FootprintCandle | null = null;

  constructor(
    config: Partial<OptimizedConfig> & { symbol: string; timeframe: number; tickSize: number }
  ) {
    this.config = {
      imbalanceRatio: 3.0,
      totalHours: 4,
      aggregationMode: 'time',
      tickBarSize: 500,
      volumeBarSize: 100,
      loadMode: 'window',
      maxTradesPerChunk: null,
      debug: false,
      ...config,
    };

    this.engine = this.createEngine();
  }

  setProgressCallback(cb: (progress: number, message: string) => void): void {
    this.onProgress = cb;
  }

  // ─── LOAD ────────────────────────────────────────────────────────────────

  /**
   * Load footprint data using the configured mode.
   * Returns FootprintCandle[] ready for rendering.
   */
  async loadOptimized(): Promise<FootprintCandle[]> {
    if (this.isLoading) return this.getCandlesArray();

    this.isLoading = true;
    this.engine = this.createEngine();
    this.nonTimeIndex = 0;
    this.currentNonTimeCandle = null;

    try {
      this.report(0, 'Initializing...');

      const { ticks, skeleton } = await loadFootprintData(
        {
          symbol:            this.config.symbol,
          mode:              this.config.loadMode,
          hoursBack:         this.config.totalHours,
          dayStartMs:        this.config.dayStartMs,
          maxTradesPerChunk: this.config.maxTradesPerChunk,
          parallelChunks:    this.config.loadMode === 'fullday' ? 24 : 4,
        },
        (pct, msg) => this.report(pct * 0.85, msg)
      );

      this.skeleton = skeleton;

      if (ticks.length === 0) {
        this.report(100, 'No trades in window');
        return [];
      }

      this.report(86, `Processing ${ticks.length.toLocaleString()} ticks...`);

      // Process — engine handles time-based aggregation
      // For non-time modes, we route through the legacy processor
      if (this.config.aggregationMode === 'time') {
        this.engine.processBatch(ticks);
        this.engine.finalizeAll();
      } else {
        this.processNonTimeBatch(ticks);
      }

      const candles = this.getCandlesArray();

      this.report(100, `Ready: ${candles.length} candles from ${ticks.length.toLocaleString()} ticks`);
      return candles;

    } catch (err) {
      console.error('[OptimizedFootprint] Load error:', err);
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  // ─── LIVE TRADE ──────────────────────────────────────────────────────────

  /**
   * Process a single real-time trade from the WebSocket stream.
   * Returns the updated candle for immediate chart update.
   */
  processLiveTrade(trade: {
    price: number;
    quantity: number;
    time: number;       // milliseconds (Binance T field)
    isBuyerMaker: boolean;
  }): FootprintCandle | null {
    if (this.config.aggregationMode !== 'time') {
      return this.processLiveNonTime(trade);
    }

    const tick: RawTick = {
      price:        trade.price,
      quantity:     trade.quantity,
      timestampMs:  trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    };

    const { candle } = this.engine.processLiveTick(tick);

    // Convert to public FootprintCandle
    const bucketMs = Math.floor(trade.time / this.config.timeframe / 1000) * this.config.timeframe * 1000;
    return this.engine.getCandleAt(bucketMs);
  }

  // ─── OUTPUT ───────────────────────────────────────────────────────────────

  getCandlesArray(): FootprintCandle[] {
    if (this.config.aggregationMode !== 'time') {
      return this.getNonTimeCandlesArray();
    }
    return this.engine.getCandlesArray();
  }

  /** Return OHLC skeleton (skeleton mode only) */
  getSkeletonCandles(): OHLCSkeleton[] {
    return this.skeleton ?? [];
  }

  // ─── NON-TIME AGGREGATION ─────────────────────────────────────────────────
  // Tick bars and volume bars use index-based candles rather than time buckets.
  // These are processed outside ATASFootprintEngine which is time-based.

  private nonTimeCandles: Map<number, FootprintCandle> = new Map();

  private processNonTimeBatch(ticks: RawTick[]): void {
    for (const tick of ticks) {
      this.processNonTimeTick(tick);
    }
  }

  private processNonTimeTick(tick: RawTick): void {
    const { tickSize, aggregationMode, tickBarSize, volumeBarSize } = this.config;

    // Import snapToLevel for correct price level snapping
    const priceLevel = Math.floor(tick.price / tickSize) * tickSize;

    if (!this.currentNonTimeCandle) {
      this.currentNonTimeCandle = createEmptyCandle(this.nonTimeIndex, tick.price);
      this.nonTimeCandles.set(this.nonTimeIndex, this.currentNonTimeCandle);
    }

    const candle = this.currentNonTimeCandle;

    // Check close condition
    const shouldClose =
      (aggregationMode === 'tick'   && candle.totalTrades >= tickBarSize) ||
      (aggregationMode === 'volume' && candle.totalVolume >= volumeBarSize);

    if (shouldClose) {
      candle.isClosed = true;
      this.nonTimeIndex++;
      this.currentNonTimeCandle = createEmptyCandle(this.nonTimeIndex, tick.price);
      this.nonTimeCandles.set(this.nonTimeIndex, this.currentNonTimeCandle);
    }

    applyTickToCandle(this.currentNonTimeCandle!, tick, priceLevel);
  }

  private processLiveNonTime(trade: {
    price: number; quantity: number; time: number; isBuyerMaker: boolean;
  }): FootprintCandle | null {
    const tick: RawTick = {
      price: trade.price,
      quantity: trade.quantity,
      timestampMs: trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    };
    this.processNonTimeTick(tick);
    return this.currentNonTimeCandle;
  }

  private getNonTimeCandlesArray(): FootprintCandle[] {
    return Array.from(this.nonTimeCandles.values()).sort((a, b) => a.time - b.time);
  }

  // ─── DEBUG ────────────────────────────────────────────────────────────────

  /**
   * Print a full candle debug summary to the console.
   * Pass a candle timestamp in seconds to inspect that candle.
   *
   * Usage: service.debugCandle(1699880400)  // Unix timestamp in seconds
   */
  debugCandle(timestampSeconds: number): void {
    this.engine.debugCandle(timestampSeconds * 1000);
  }

  // ─── PRIVATE ──────────────────────────────────────────────────────────────

  private createEngine(): ATASFootprintEngine {
    const engineConfig: ATASEngineConfig = {
      priceStep:         this.config.tickSize,
      timeframeMs:       this.config.timeframe * 1000,  // seconds → ms
      valueAreaPercent:  0.70,
      imbalanceRatio:    this.config.imbalanceRatio,
      debug:             this.config.debug,
    };
    return new ATASFootprintEngine(engineConfig);
  }

  private report(progress: number, message: string): void {
    this.onProgress?.(Math.min(100, progress), message);
    console.log(`[OptimizedFootprint] ${Math.round(progress)}% – ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE HELPERS (non-time aggregation)
// ─────────────────────────────────────────────────────────────────────────────

function createEmptyCandle(index: number, price: number): FootprintCandle {
  return {
    time:             index,
    open:             price,
    high:             price,
    low:              price,
    close:            price,
    levels:           new Map(),
    totalVolume:      0,
    totalBuyVolume:   0,
    totalSellVolume:  0,
    totalDelta:       0,
    totalTrades:      0,
    poc:              price,
    vah:              price,
    val:              price,
    isClosed:         false,
  };
}

function applyTickToCandle(candle: FootprintCandle, tick: RawTick, priceLevel: number): void {
  if (candle.totalTrades === 0) candle.open = tick.price;
  candle.high  = Math.max(candle.high, tick.price);
  candle.low   = Math.min(candle.low,  tick.price);
  candle.close = tick.price;

  let level = candle.levels.get(priceLevel);
  if (!level) {
    level = {
      price:         priceLevel,
      bidVolume:     0,
      askVolume:     0,
      bidTrades:     0,
      askTrades:     0,
      delta:         0,
      totalVolume:   0,
      imbalanceBuy:  false,
      imbalanceSell: false,
    };
    candle.levels.set(priceLevel, level);
  }

  // isBuyerMaker=true → market sell → BID column
  if (tick.isBuyerMaker) {
    level.bidVolume     += tick.quantity;
    level.bidTrades     += 1;
    candle.totalSellVolume += tick.quantity;
  } else {
    level.askVolume     += tick.quantity;
    level.askTrades     += 1;
    candle.totalBuyVolume  += tick.quantity;
  }

  level.totalVolume = level.bidVolume + level.askVolume;
  level.delta       = level.askVolume - level.bidVolume;

  candle.totalVolume += tick.quantity;
  candle.totalDelta  = candle.totalBuyVolume - candle.totalSellVolume;
  candle.totalTrades += 1;

  // Live POC update
  let maxVol = 0;
  candle.levels.forEach((lv, price) => {
    if (lv.totalVolume > maxVol) {
      maxVol     = lv.totalVolume;
      candle.poc = price;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

let instance: OptimizedFootprintService | null = null;

export function getOptimizedFootprintService(
  config?: Partial<OptimizedConfig> & { symbol: string; timeframe: number; tickSize: number }
): OptimizedFootprintService {
  if (config) {
    instance = new OptimizedFootprintService(config);
  }
  if (!instance) {
    throw new Error('OptimizedFootprintService not initialized — pass config on first call');
  }
  return instance;
}

export function resetOptimizedFootprintService(): void {
  instance = null;
}

// Re-export types for callers
export type { AggTrade };
interface AggTrade {
  id: number;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}
