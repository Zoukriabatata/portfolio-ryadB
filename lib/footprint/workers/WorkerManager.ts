/**
 * FOOTPRINT WORKER MANAGER
 *
 * Manages a Web Worker for heavy footprint computations.
 * Falls back to main-thread execution if the worker fails to load.
 *
 * Serializes FootprintCandle data (Map → array) for worker transfer.
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';
import type { StackedImbalance, NakedPOC, UnfinishedAuction } from '@/types/footprint';

// ============ SERIALIZATION ============

interface SerializedPriceLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  bidTrades: number;
  askTrades: number;
  delta: number;
  totalVolume: number;
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
}

interface SerializedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: [number, SerializedPriceLevel][];
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;
  poc: number;
  vah: number;
  val: number;
  isClosed: boolean;
}

function serializeCandles(candles: FootprintCandle[]): SerializedCandle[] {
  return candles.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    levels: Array.from(c.levels.entries()).map(([price, level]) => [
      price,
      {
        price: level.price,
        bidVolume: level.bidVolume,
        askVolume: level.askVolume,
        bidTrades: level.bidTrades,
        askTrades: level.askTrades,
        delta: level.delta,
        totalVolume: level.totalVolume,
        imbalanceBuy: level.imbalanceBuy,
        imbalanceSell: level.imbalanceSell,
      },
    ] as [number, SerializedPriceLevel]),
    totalVolume: c.totalVolume,
    totalBuyVolume: c.totalBuyVolume,
    totalSellVolume: c.totalSellVolume,
    totalDelta: c.totalDelta,
    totalTrades: c.totalTrades,
    poc: c.poc,
    vah: c.vah,
    val: c.val,
    isClosed: c.isClosed,
  }));
}

// ============ RESULT TYPES ============

export interface ProfileCachesResult {
  deltaByPrice: Map<number, number>;
  maxDelta: number;
  volumeByPrice: Map<number, { total: number; bid: number; ask: number }>;
  maxVolume: number;
  sessionStats: {
    pocPrice: number;
    pocVolume: number;
    vah: number;
    val: number;
    totalVolume: number;
    totalDelta: number;
    valueAreaPrices: Set<number>;
  };
}

export interface IndicatorsResult {
  stackedImbalances: StackedImbalance[];
  nakedPOCs: NakedPOC[];
  unfinishedAuctions: UnfinishedAuction[];
}

// ============ WORKER MANAGER ============

type PendingCallback = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

export class FootprintWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<number, PendingCallback>();
  private requestId = 0;
  private workerFailed = false;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(
        new URL('./footprint.worker.ts', import.meta.url),
      );
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, result } = e.data;
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.resolve(result);
        }
      };
      this.worker.onerror = (err) => {
        console.warn('[FootprintWorker] Worker error, falling back to main thread:', err.message);
        this.workerFailed = true;
        // Reject all pending requests
        this.pendingRequests.forEach(p => p.reject(new Error('Worker failed')));
        this.pendingRequests.clear();
      };
    } catch {
      console.warn('[FootprintWorker] Cannot create worker, using main thread fallback');
      this.workerFailed = true;
    }
  }

  private postRequest(msg: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker || this.workerFailed) {
        reject(new Error('Worker unavailable'));
        return;
      }
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  /**
   * Compute profile caches (delta/volume profiles, POC, VAH/VAL)
   */
  async computeProfiles(candles: FootprintCandle[]): Promise<ProfileCachesResult> {
    if (this.workerFailed) {
      return this.computeProfilesFallback(candles);
    }

    try {
      const serialized = serializeCandles(candles);
      const raw = await this.postRequest({ type: 'computeProfiles', candles: serialized }) as {
        deltaByPrice: [number, number][];
        maxDelta: number;
        volumeByPrice: [number, { total: number; bid: number; ask: number }][];
        maxVolume: number;
        sessionStats: {
          pocPrice: number;
          pocVolume: number;
          vah: number;
          val: number;
          totalVolume: number;
          totalDelta: number;
          valueAreaPrices: number[];
        };
      };

      // Deserialize Maps/Sets
      return {
        deltaByPrice: new Map(raw.deltaByPrice),
        maxDelta: raw.maxDelta,
        volumeByPrice: new Map(raw.volumeByPrice),
        maxVolume: raw.maxVolume,
        sessionStats: {
          ...raw.sessionStats,
          valueAreaPrices: new Set(raw.sessionStats.valueAreaPrices),
        },
      };
    } catch {
      return this.computeProfilesFallback(candles);
    }
  }

  /**
   * Compute all indicators (stacked imbalances, naked POCs, unfinished auctions)
   */
  async computeIndicators(
    candles: FootprintCandle[],
    tickSize: number,
    currentPrice: number,
    minConsecutive: number,
  ): Promise<IndicatorsResult> {
    if (this.workerFailed) {
      return this.computeIndicatorsFallback(candles, tickSize, currentPrice, minConsecutive);
    }

    try {
      const serialized = serializeCandles(candles);
      const raw = await this.postRequest({
        type: 'computeIndicators',
        candles: serialized,
        tickSize,
        currentPrice,
        minConsecutive,
      }) as IndicatorsResult;

      return raw;
    } catch {
      return this.computeIndicatorsFallback(candles, tickSize, currentPrice, minConsecutive);
    }
  }

  // ============ MAIN-THREAD FALLBACKS ============

  private computeProfilesFallback(candles: FootprintCandle[]): ProfileCachesResult {
    const deltaByPrice = new Map<number, number>();
    const volumeByPrice = new Map<number, { total: number; bid: number; ask: number }>();
    let maxDelta = 1;
    let maxVolume = 1;
    let pocPrice = 0;
    let pocVolume = 0;
    let totalVolume = 0;
    let totalDelta = 0;

    for (const candle of candles) {
      totalDelta += candle.totalDelta;
      candle.levels.forEach((level, price) => {
        const currentDelta = deltaByPrice.get(price) || 0;
        const newDelta = currentDelta + level.delta;
        deltaByPrice.set(price, newDelta);
        maxDelta = Math.max(maxDelta, Math.abs(newDelta));

        const currentVol = volumeByPrice.get(price) || { total: 0, bid: 0, ask: 0 };
        currentVol.total += level.totalVolume;
        currentVol.bid += level.bidVolume;
        currentVol.ask += level.askVolume;
        volumeByPrice.set(price, currentVol);
        if (currentVol.total > maxVolume) maxVolume = currentVol.total;
        if (currentVol.total > pocVolume) { pocVolume = currentVol.total; pocPrice = price; }
        totalVolume += level.totalVolume;
      });
    }

    const sortedPrices = Array.from(volumeByPrice.entries()).sort((a, b) => b[1].total - a[1].total);
    const targetVolume = totalVolume * 0.7;
    let accumulatedVolume = 0;
    const valueAreaPrices = new Set<number>();
    for (const [price, data] of sortedPrices) {
      valueAreaPrices.add(price);
      accumulatedVolume += data.total;
      if (accumulatedVolume >= targetVolume) break;
    }
    const vah = valueAreaPrices.size > 0 ? Math.max(...valueAreaPrices) : 0;
    const val = valueAreaPrices.size > 0 ? Math.min(...valueAreaPrices) : 0;

    return {
      deltaByPrice, maxDelta, volumeByPrice, maxVolume,
      sessionStats: { pocPrice, pocVolume, vah, val, totalVolume, totalDelta, valueAreaPrices },
    };
  }

  private computeIndicatorsFallback(
    candles: FootprintCandle[],
    tickSize: number,
    currentPrice: number,
    minConsecutive: number,
  ): IndicatorsResult {
    // Import logic inline (same as FootprintIndicators.ts)
    const stackedImbalances: StackedImbalance[] = [];
    const precisionDigits = Math.max(Math.round(-Math.log10(tickSize)) + 2, 2);
    const factor = Math.pow(10, precisionDigits);

    for (const candle of candles) {
      const sortedLevels = Array.from(candle.levels.entries()).sort((a, b) => a[0] - b[0]);
      if (sortedLevels.length < minConsecutive) continue;

      let currentDirection: 'bullish' | 'bearish' | null = null;
      let startPrice = 0, endPrice = 0, count = 0, lastPrice = -Infinity;

      for (const [price, level] of sortedLevels) {
        const isConsecutive = Math.abs(Math.round((price - lastPrice) * factor) / factor - tickSize) < tickSize * 0.1;
        const direction: 'bullish' | 'bearish' | null =
          level.imbalanceBuy ? 'bullish' : level.imbalanceSell ? 'bearish' : null;

        if (direction && direction === currentDirection && isConsecutive) {
          endPrice = price; count++;
        } else {
          if (currentDirection && count >= minConsecutive) {
            stackedImbalances.push({ startPrice, endPrice, direction: currentDirection, count, candleTime: candle.time });
          }
          if (direction) { currentDirection = direction; startPrice = price; endPrice = price; count = 1; }
          else { currentDirection = null; count = 0; }
        }
        lastPrice = price;
      }
      if (currentDirection && count >= minConsecutive) {
        stackedImbalances.push({ startPrice, endPrice, direction: currentDirection, count, candleTime: candle.time });
      }
    }

    // Naked POCs
    const nakedPOCs: NakedPOC[] = [];
    for (let i = 0; i < candles.length - 1; i++) {
      const candle = candles[i];
      if (!candle.poc) continue;
      let tested = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= candle.poc && candles[j].high >= candle.poc) { tested = true; break; }
      }
      if (!tested) {
        const pocLevel = candle.levels.get(candle.poc);
        nakedPOCs.push({ price: candle.poc, candleTime: candle.time, volume: pocLevel?.totalVolume || 0, tested: false });
      }
    }

    // Unfinished Auctions
    const unfinishedAuctions: UnfinishedAuction[] = [];
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const highLevel = candle.levels.get(candle.high);
      if (highLevel && highLevel.askVolume === 0 && highLevel.bidVolume > 0) {
        let tested = false;
        for (let j = i + 1; j < candles.length; j++) { if (candles[j].high > candle.high) { tested = true; break; } }
        unfinishedAuctions.push({ price: candle.high, side: 'high', candleTime: candle.time, volume: highLevel.bidVolume, tested });
      }
      const lowLevel = candle.levels.get(candle.low);
      if (lowLevel && lowLevel.bidVolume === 0 && lowLevel.askVolume > 0) {
        let tested = false;
        for (let j = i + 1; j < candles.length; j++) { if (candles[j].low < candle.low) { tested = true; break; } }
        unfinishedAuctions.push({ price: candle.low, side: 'low', candleTime: candle.time, volume: lowLevel.askVolume, tested });
      }
    }

    return { stackedImbalances, nakedPOCs, unfinishedAuctions };
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingRequests.clear();
  }
}

// ============ SINGLETON ============

let instance: FootprintWorkerManager | null = null;

export function getFootprintWorkerManager(): FootprintWorkerManager {
  if (!instance) {
    instance = new FootprintWorkerManager();
  }
  return instance;
}

export function resetFootprintWorkerManager(): void {
  instance?.terminate();
  instance = null;
}
