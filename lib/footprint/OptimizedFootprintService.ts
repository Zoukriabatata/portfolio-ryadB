/**
 * OPTIMIZED FOOTPRINT SERVICE
 *
 * Uses REAL Binance aggTrades for the ENTIRE history window.
 * Every bid/ask per price level comes from actual executed trades
 * with isBuyerMaker flag = exact bid/ask classification.
 *
 * No simulated distribution — 100% real data.
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ============ TYPES ============

export interface OptimizedConfig {
  symbol: string;
  timeframe: number;
  tickSize: number;
  imbalanceRatio: number;
  totalHours: number;       // Total hours of real aggTrades (default: 6)
  // Non-time aggregation modes
  aggregationMode: 'time' | 'tick' | 'volume';
  tickBarSize: number;      // Trades per candle (tick mode)
  volumeBarSize: number;    // Volume per candle (volume mode)
}

export { type AggTrade };

interface AggTrade {
  id: number;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

// ============ SERVICE ============

export class OptimizedFootprintService {
  private config: OptimizedConfig;
  private candles: Map<number, FootprintCandle> = new Map();
  private lastTradeId: number = 0;
  private isLoading: boolean = false;
  private onProgress: ((progress: number, message: string) => void) | null = null;
  // Non-time aggregation state
  private nonTimeIndex: number = 0;
  private currentNonTimeCandle: FootprintCandle | null = null;

  constructor(config: Partial<OptimizedConfig> & { symbol: string; timeframe: number; tickSize: number }) {
    this.config = {
      symbol: config.symbol,
      timeframe: config.timeframe,
      tickSize: config.tickSize,
      imbalanceRatio: config.imbalanceRatio ?? 3.0,
      totalHours: config.totalHours ?? 6,
      aggregationMode: config.aggregationMode ?? 'time',
      tickBarSize: config.tickBarSize ?? 500,
      volumeBarSize: config.volumeBarSize ?? 100,
    };
  }

  setProgressCallback(cb: (progress: number, message: string) => void): void {
    this.onProgress = cb;
  }

  /**
   * Load footprint data using REAL aggTrades for the entire history
   */
  async loadOptimized(): Promise<FootprintCandle[]> {
    if (this.isLoading) return this.getCandlesArray();

    this.isLoading = true;
    this.candles.clear();

    const now = Date.now();
    const { totalHours } = this.config;

    try {
      // ═══════════════════════════════════════════════════════════════
      // SINGLE PHASE: Load ALL real aggTrades for the entire window
      // ═══════════════════════════════════════════════════════════════
      this.report(5, 'Loading real trades...');

      const tradesStart = now - totalHours * 60 * 60 * 1000;
      await this.loadTradesRange(tradesStart, now);

      // ═══════════════════════════════════════════════════════════════
      // Calculate metrics (POC, imbalances)
      // ═══════════════════════════════════════════════════════════════
      this.report(90, 'Calculating footprint metrics...');

      this.candles.forEach(candle => this.calculateMetrics(candle));

      // Mark last candle as not closed
      const result = this.getCandlesArray();
      if (result.length > 0) {
        result[result.length - 1].isClosed = false;
      }

      this.report(100, `Ready: ${result.length} candles (100% real data)`);

      return result;

    } catch (error) {
      console.error('[OptimizedFootprint] Error:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load real aggTrades in parallel chunks for speed
   */
  private async loadTradesRange(startTime: number, endTime: number): Promise<void> {
    const totalDuration = endTime - startTime;
    const PARALLEL_CHUNKS = 6; // 6 parallel workers
    const chunkDuration = Math.ceil(totalDuration / PARALLEL_CHUNKS);

    // Build chunk ranges
    const chunks: { start: number; end: number }[] = [];
    for (let i = 0; i < PARALLEL_CHUNKS; i++) {
      const chunkStart = startTime + i * chunkDuration;
      const chunkEnd = Math.min(chunkStart + chunkDuration, endTime);
      if (chunkStart < endTime) {
        chunks.push({ start: chunkStart, end: chunkEnd });
      }
    }

    this.report(5, `Loading trades (${chunks.length} parallel streams)...`);

    // Fetch all chunks in parallel, each chunk paginates sequentially
    const chunkResults = await Promise.all(
      chunks.map((chunk, idx) => this.loadChunk(chunk.start, chunk.end, idx, chunks.length))
    );

    // Process trades in chronological order (chunks are already time-ordered)
    let totalTrades = 0;
    for (const trades of chunkResults) {
      for (const t of trades) {
        this.processTrade(t);
        this.lastTradeId = Math.max(this.lastTradeId, t.id);
      }
      totalTrades += trades.length;
    }

    console.log(`[OptimizedFootprint] Fetched ${totalTrades} real trades in ${chunks.length} parallel chunks`);
  }

  /**
   * Load a single time chunk with sequential pagination
   */
  private async loadChunk(startTime: number, endTime: number, chunkIdx: number, totalChunks: number): Promise<AggTrade[]> {
    const { symbol } = this.config;
    const trades: AggTrade[] = [];
    let currentStart = startTime;
    let batchCount = 0;
    const maxBatches = 200;

    while (currentStart < endTime && batchCount < maxBatches) {
      batchCount++;

      const params = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        startTime: currentStart.toString(),
        endTime: endTime.toString(),
        limit: '1000',
      });

      const response = await fetch(`/api/binance/fapi/v1/aggTrades?${params}`);
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) break;

      for (const t of data) {
        trades.push({
          id: t.a,
          price: parseFloat(t.p),
          quantity: parseFloat(t.q),
          time: t.T,
          isBuyerMaker: t.m,
        });
      }

      const lastTradeTime = data[data.length - 1].T;
      if (lastTradeTime <= currentStart) break;
      currentStart = lastTradeTime + 1;

      // Report progress for this chunk
      const chunkProgress = (currentStart - startTime) / (endTime - startTime);
      const overallProgress = 5 + ((chunkIdx + chunkProgress) / totalChunks) * 80;
      this.report(Math.min(85, overallProgress), `Loaded ${trades.length.toLocaleString()} trades (stream ${chunkIdx + 1}/${totalChunks})`);

      if (data.length < 1000) break;
    }

    return trades;
  }

  /**
   * Process a single trade into the correct candle and price level
   */
  private processTrade(trade: AggTrade): void {
    const { timeframe, tickSize, aggregationMode } = this.config;
    const priceLevel = Math.round(trade.price / tickSize) * tickSize;

    let candle: FootprintCandle;

    if (aggregationMode === 'tick' || aggregationMode === 'volume') {
      // Non-time aggregation: use index-based candle keys
      if (!this.currentNonTimeCandle) {
        this.currentNonTimeCandle = this.createCandle(this.nonTimeIndex, trade.price);
        this.candles.set(this.nonTimeIndex, this.currentNonTimeCandle);
      }

      candle = this.currentNonTimeCandle;

      // Check if candle is complete
      const shouldClose =
        (aggregationMode === 'tick' && candle.totalTrades >= this.config.tickBarSize) ||
        (aggregationMode === 'volume' && candle.totalVolume >= this.config.volumeBarSize);

      if (shouldClose) {
        this.nonTimeIndex++;
        this.currentNonTimeCandle = this.createCandle(this.nonTimeIndex, trade.price);
        this.candles.set(this.nonTimeIndex, this.currentNonTimeCandle);
        candle = this.currentNonTimeCandle;
      }
    } else {
      // Time-based aggregation (default)
      const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
      let existing = this.candles.get(candleTime);
      if (!existing) {
        existing = this.createCandle(candleTime, trade.price);
        this.candles.set(candleTime, existing);
      }
      candle = existing;
    }

    // Update OHLC
    if (candle.totalTrades === 0) candle.open = trade.price;
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    // Get or create level
    let level = candle.levels.get(priceLevel);
    if (!level) {
      level = this.createLevel(priceLevel);
      candle.levels.set(priceLevel, level);
    }

    // REAL bid/ask classification from isBuyerMaker
    // isBuyerMaker = true → buyer was maker (passive) → SELL (hitting bid)
    // isBuyerMaker = false → seller was maker (passive) → BUY (hitting ask)
    if (trade.isBuyerMaker) {
      level.bidVolume += trade.quantity;
      level.bidTrades += 1;
      candle.totalSellVolume += trade.quantity;
    } else {
      level.askVolume += trade.quantity;
      level.askTrades += 1;
      candle.totalBuyVolume += trade.quantity;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    candle.totalVolume += trade.quantity;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades += 1;
  }

  /**
   * Calculate POC, diagonal imbalances (ATAS style)
   */
  private calculateMetrics(candle: FootprintCandle): void {
    const { tickSize, imbalanceRatio } = this.config;

    // POC
    let maxVol = 0;
    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVol) {
        maxVol = level.totalVolume;
        candle.poc = price;
      }
    });

    // Diagonal imbalances
    candle.levels.forEach((level, price) => {
      const below = candle.levels.get(Math.round((price - tickSize) * 1e6) / 1e6);
      const above = candle.levels.get(Math.round((price + tickSize) * 1e6) / 1e6);

      if (below && level.askVolume > 0 && below.bidVolume > 0) {
        level.imbalanceBuy = level.askVolume / below.bidVolume >= imbalanceRatio;
      }
      if (above && level.bidVolume > 0 && above.askVolume > 0) {
        level.imbalanceSell = level.bidVolume / above.askVolume >= imbalanceRatio;
      }
    });
  }

  /**
   * Process a live trade (real-time)
   */
  processLiveTrade(trade: { price: number; quantity: number; time: number; isBuyerMaker: boolean }): FootprintCandle | null {
    const aggTrade: AggTrade = {
      id: Date.now(),
      price: trade.price,
      quantity: trade.quantity,
      time: trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    };

    this.processTrade(aggTrade);

    const candleTime = Math.floor(trade.time / 1000 / this.config.timeframe) * this.config.timeframe;
    const candle = this.candles.get(candleTime);

    if (candle) {
      this.calculateMetrics(candle);
    }

    return candle || null;
  }

  getCandlesArray(): FootprintCandle[] {
    return Array.from(this.candles.values()).sort((a, b) => a.time - b.time);
  }

  // ============ HELPERS ============

  private createCandle(time: number, price: number): FootprintCandle {
    return {
      time,
      open: price,
      high: price,
      low: price,
      close: price,
      levels: new Map(),
      totalVolume: 0,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      totalDelta: 0,
      totalTrades: 0,
      poc: price,
      vah: price,
      val: price,
      isClosed: true,
    };
  }

  private createLevel(price: number): PriceLevel {
    return {
      price,
      bidVolume: 0,
      askVolume: 0,
      bidTrades: 0,
      askTrades: 0,
      delta: 0,
      totalVolume: 0,
      imbalanceBuy: false,
      imbalanceSell: false,
    };
  }

  private report(progress: number, message: string): void {
    this.onProgress?.(progress, message);
    console.log(`[OptimizedFootprint] ${progress.toFixed(0)}% - ${message}`);
  }
}

// ============ SINGLETON ============

let instance: OptimizedFootprintService | null = null;

export function getOptimizedFootprintService(config?: Partial<OptimizedConfig> & { symbol: string; timeframe: number; tickSize: number }): OptimizedFootprintService {
  if (config) {
    instance = new OptimizedFootprintService(config);
  }
  if (!instance) {
    throw new Error('OptimizedFootprintService not initialized');
  }
  return instance;
}

export function resetOptimizedFootprintService(): void {
  instance = null;
}
