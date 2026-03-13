/**
 * FOOTPRINT DATA SERVICE - REAL AGGTRADES
 *
 * Uses REAL Binance aggTrades for accurate bid/ask per price level.
 * Each trade has isBuyerMaker flag = exact bid/ask classification.
 *
 * Flow:
 * 1. Fetch aggTrades from Binance for the entire history window
 * 2. Group trades into candles by timeframe
 * 3. At each price level: accumulate real bid/ask from individual trades
 * 4. Calculate POC, imbalances, value area from real data
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ============ TYPES ============

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface FootprintSession {
  symbol: string;
  timeframe: number;
  tickSize: number;
  startTime: number;
  endTime: number;
  candles: FootprintCandle[];
  lastTradeTime: number;
  isLive: boolean;
}

export interface LoadHistoryOptions {
  symbol: string;
  timeframe: number;
  tickSize: number;
  hoursBack?: number;
  imbalanceRatio?: number;
}

// ============ CACHE ============

const sessionCache = new Map<string, FootprintSession>();

function getCacheKey(symbol: string, timeframe: number, tickSize: number): string {
  return `${symbol}_${timeframe}_${tickSize}`;
}

// ============ FOOTPRINT DATA SERVICE ============

export class FootprintDataService {
  private imbalanceRatio: number = 3.0;

  setImbalanceRatio(ratio: number): void {
    this.imbalanceRatio = ratio;
  }

  /**
   * Load historical footprint data using REAL aggTrades from Binance.
   * Every bid/ask per price level comes from actual executed trades.
   */
  async loadHistory(options: LoadHistoryOptions): Promise<FootprintCandle[]> {
    const {
      symbol,
      timeframe,
      tickSize,
      hoursBack = 4,
      imbalanceRatio = this.imbalanceRatio,
    } = options;

    const cacheKey = getCacheKey(symbol, timeframe, tickSize);

    // Check cache (valid for 30 seconds)
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.tickSize === tickSize) {
      const cacheAge = Date.now() / 1000 - cached.lastTradeTime;
      if (cacheAge < 30) {
        return cached.candles;
      }
    }

    console.log(`[FootprintDataService] Loading ${hoursBack}h of REAL aggTrades for ${symbol}...`);

    try {
      const now = Date.now();
      const startTime = now - hoursBack * 60 * 60 * 1000;

      // Fetch ALL real aggTrades for the entire period
      const trades = await this.fetchAllAggTrades(symbol, startTime, now);

      if (trades.length === 0) {
        console.log('[FootprintDataService] No trades fetched, falling back to cache');
        return cached?.candles || [];
      }

      console.log(`[FootprintDataService] Fetched ${trades.length} real trades`);

      // Build footprint candles from REAL trades
      const candles = this.buildFootprintFromTrades(trades, timeframe, tickSize, imbalanceRatio);

      // Update cache
      sessionCache.set(cacheKey, {
        symbol,
        timeframe,
        tickSize,
        startTime: candles.length > 0 ? candles[0].time : Date.now() / 1000,
        endTime: candles.length > 0 ? candles[candles.length - 1].time : Date.now() / 1000,
        candles,
        lastTradeTime: Date.now() / 1000,
        isLive: true,
      });

      console.log(`[FootprintDataService] Created ${candles.length} footprint candles from real trades`);

      return candles;
    } catch (error) {
      console.error('[FootprintDataService] Error loading history:', error);
      return cached?.candles || [];
    }
  }

  /**
   * Fetch ALL aggTrades for a time window using pagination.
   * Binance returns max 1000 trades per request, so we paginate by time.
   */
  private async fetchAllAggTrades(
    symbol: string,
    startTimeMs: number,
    endTimeMs: number
  ): Promise<Trade[]> {
    const allTrades: Trade[] = [];
    let currentStart = startTimeMs;
    let requestCount = 0;
    const MAX_REQUESTS = 10; // Hard cap — 10 requests × 1000 trades = 10 000 trades max

    while (currentStart < endTimeMs && requestCount < MAX_REQUESTS) {
      try {
        const params = new URLSearchParams({
          symbol: symbol.toUpperCase(),
          startTime: currentStart.toString(),
          endTime: endTimeMs.toString(),
          limit: '1000',
        });

        const response = await fetch(`/api/binance/fapi/v1/aggTrades?${params}`);
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) break;

        const trades: Trade[] = data.map((t: { a: number; p: string; q: string; T: number; m: boolean }) => ({
          id: t.a.toString(),
          price: parseFloat(t.p),
          quantity: parseFloat(t.q),
          time: t.T,
          isBuyerMaker: t.m,
        }));

        allTrades.push(...trades);
        requestCount++;

        // Move start to after last trade timestamp
        const lastTradeTime = trades[trades.length - 1].time;
        if (lastTradeTime <= currentStart) break; // No progress
        currentStart = lastTradeTime + 1;

        // If we got less than 1000, we've reached the end
        if (trades.length < 1000) break;

      } catch (error) {
        console.error(`[FootprintDataService] AggTrades fetch error (request ${requestCount}):`, error);
        break;
      }
    }

    console.log(`[FootprintDataService] Fetched ${allTrades.length} trades in ${requestCount} requests`);
    return allTrades;
  }

  /**
   * Build footprint candles from REAL individual trades.
   * Each trade has exact price and isBuyerMaker classification.
   */
  private buildFootprintFromTrades(
    trades: Trade[],
    timeframe: number,
    tickSize: number,
    imbalanceRatio: number
  ): FootprintCandle[] {
    const candleMap = new Map<number, FootprintCandle>();

    for (const trade of trades) {
      const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
      const priceLevel = Math.round(trade.price / tickSize) * tickSize;
      const normalizedPrice = Math.round(priceLevel * 1000000) / 1000000;

      let candle = candleMap.get(candleTime);

      if (!candle) {
        candle = {
          time: candleTime,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          levels: new Map(),
          totalVolume: 0,
          totalBuyVolume: 0,
          totalSellVolume: 0,
          totalDelta: 0,
          totalTrades: 0,
          poc: normalizedPrice,
          vah: trade.price,
          val: trade.price,
          isClosed: true,
        };
        candleMap.set(candleTime, candle);
      }

      // Update OHLC
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;

      // Get or create price level
      let level = candle.levels.get(normalizedPrice);
      if (!level) {
        level = {
          price: normalizedPrice,
          bidVolume: 0,
          askVolume: 0,
          bidTrades: 0,
          askTrades: 0,
          delta: 0,
          totalVolume: 0,
          imbalanceBuy: false,
          imbalanceSell: false,
        };
        candle.levels.set(normalizedPrice, level);
      }

      // REAL classification from Binance aggTrade
      // isBuyerMaker = true means the buyer was the maker (passive) → this is a SELL (hitting bid)
      // isBuyerMaker = false means the seller was the maker (passive) → this is a BUY (hitting ask)
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

    const candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

    // Mark last candle as not closed
    if (candles.length > 0) {
      candles[candles.length - 1].isClosed = false;
    }

    // Calculate POC, value area, and imbalances
    for (const candle of candles) {
      this.calculateMetrics(candle, tickSize, imbalanceRatio);
    }

    return candles;
  }

  /**
   * Calculate POC, VAH/VAL and imbalances
   */
  private calculateMetrics(
    candle: FootprintCandle,
    tickSize: number,
    imbalanceRatio: number
  ): void {
    // POC (Point of Control) = price with highest total volume
    let maxVol = 0;
    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVol) {
        maxVol = level.totalVolume;
        candle.poc = price;
      }
    });

    // Diagonal imbalances (professional style)
    candle.levels.forEach((level, price) => {
      const priceBelowKey = Math.round((price - tickSize) * 1000000) / 1000000;
      const priceAboveKey = Math.round((price + tickSize) * 1000000) / 1000000;

      const levelBelow = candle.levels.get(priceBelowKey);
      const levelAbove = candle.levels.get(priceAboveKey);

      if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
        level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
      }

      if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
        level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
      }
    });

    // Value Area (70% of volume)
    const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
    const totalVol = candle.totalVolume;
    let cumVol = 0;

    candle.val = candle.low;
    candle.vah = candle.high;

    for (const price of sortedPrices) {
      const level = candle.levels.get(price)!;
      cumVol += level.totalVolume;

      if (cumVol >= totalVol * 0.15 && candle.val === candle.low) {
        candle.val = price;
      }
      if (cumVol >= totalVol * 0.85) {
        candle.vah = price;
        break;
      }
    }
  }

  /**
   * Process live trade (REAL bid/ask classification)
   */
  processLiveTrade(
    trade: Trade,
    timeframe: number,
    tickSize: number,
    existingCandles: FootprintCandle[]
  ): FootprintCandle[] {
    const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
    const priceLevel = Math.round(trade.price / tickSize) * tickSize;

    let candle = existingCandles.find(c => c.time === candleTime);
    const isNewCandle = !candle;

    if (!candle) {
      candle = {
        time: candleTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        levels: new Map(),
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalDelta: 0,
        totalTrades: 0,
        poc: priceLevel,
        vah: trade.price,
        val: trade.price,
        isClosed: false,
      };
    }

    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    let level = candle.levels.get(priceLevel);
    if (!level) {
      level = {
        price: priceLevel,
        bidVolume: 0,
        askVolume: 0,
        bidTrades: 0,
        askTrades: 0,
        delta: 0,
        totalVolume: 0,
        imbalanceBuy: false,
        imbalanceSell: false,
      };
      candle.levels.set(priceLevel, level);
    }

    // REAL classification from live trade
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

    // Update POC
    let maxVol = 0;
    candle.levels.forEach((lvl, price) => {
      if (lvl.totalVolume > maxVol) {
        maxVol = lvl.totalVolume;
        candle!.poc = price;
      }
    });

    if (isNewCandle) {
      return [...existingCandles, candle].sort((a, b) => a.time - b.time);
    }

    return existingCandles;
  }

  getCachedSession(symbol: string, timeframe: number): FootprintSession | null {
    for (const [, session] of sessionCache.entries()) {
      if (session.symbol === symbol && session.timeframe === timeframe) {
        return session;
      }
    }
    return null;
  }

  clearCache(symbol?: string, timeframe?: number): void {
    if (symbol && timeframe) {
      for (const key of sessionCache.keys()) {
        if (key.startsWith(`${symbol}_${timeframe}_`)) {
          sessionCache.delete(key);
        }
      }
    } else {
      sessionCache.clear();
    }
  }
}

// ============ SINGLETON ============

let footprintDataService: FootprintDataService | null = null;

export function getFootprintDataService(): FootprintDataService {
  if (!footprintDataService) {
    footprintDataService = new FootprintDataService();
  }
  return footprintDataService;
}

export function resetFootprintDataService(): void {
  footprintDataService?.clearCache();
  footprintDataService = null;
}
