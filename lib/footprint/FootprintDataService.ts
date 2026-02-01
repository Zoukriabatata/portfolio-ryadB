/**
 * FOOTPRINT DATA SERVICE
 *
 * Professional footprint data management for trading platforms
 * Handles:
 * - Historical trade fetching
 * - Trade-to-footprint aggregation
 * - Session data caching
 * - Incremental loading
 *
 * Architecture based on ATAS / NinjaTrader
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ============ TYPES ============

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  time: number;       // Unix ms
  isBuyerMaker: boolean; // true = sell aggressor, false = buy aggressor
}

export interface FootprintSession {
  symbol: string;
  timeframe: number;  // Seconds per candle
  tickSize: number;
  startTime: number;  // Session start (Unix seconds)
  endTime: number;    // Session end (Unix seconds)
  candles: FootprintCandle[];
  lastTradeTime: number;
  isLive: boolean;
}

export interface LoadHistoryOptions {
  symbol: string;
  timeframe: number;
  tickSize: number;
  hoursBack?: number;
  startTime?: number;
  endTime?: number;
  imbalanceRatio?: number;
}

// ============ CACHE ============

const sessionCache = new Map<string, FootprintSession>();

function getCacheKey(symbol: string, timeframe: number): string {
  return `${symbol}_${timeframe}`;
}

// ============ FOOTPRINT DATA SERVICE ============

export class FootprintDataService {
  private imbalanceRatio: number = 3.0;

  setImbalanceRatio(ratio: number): void {
    this.imbalanceRatio = ratio;
  }

  /**
   * Load historical footprint data
   */
  async loadHistory(options: LoadHistoryOptions): Promise<FootprintCandle[]> {
    const {
      symbol,
      timeframe,
      tickSize,
      hoursBack = 24,
      startTime,
      endTime,
      imbalanceRatio = this.imbalanceRatio,
    } = options;

    const cacheKey = getCacheKey(symbol, timeframe);

    // Check cache
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.tickSize === tickSize) {
      // If we have cached data and it's recent, use it
      const cacheAge = Date.now() / 1000 - cached.lastTradeTime;
      if (cacheAge < 60) { // Cache valid for 60 seconds
        return cached.candles;
      }
    }

    // Calculate time range
    const now = Date.now();
    const fetchEndTime = endTime ? endTime * 1000 : now;
    const fetchStartTime = startTime ? startTime * 1000 : now - hoursBack * 60 * 60 * 1000;

    console.log(`[FootprintDataService] Loading ${hoursBack}h of trades for ${symbol}...`);

    try {
      // Fetch trades
      const trades = await this.fetchHistoricalTrades(symbol, fetchStartTime, fetchEndTime);

      if (trades.length === 0) {
        console.log('[FootprintDataService] No trades fetched');
        return [];
      }

      console.log(`[FootprintDataService] Processing ${trades.length} trades...`);

      // Aggregate into footprint candles
      const candles = this.aggregateTradesIntoCandles(
        trades,
        timeframe,
        tickSize,
        imbalanceRatio
      );

      // Update cache
      sessionCache.set(cacheKey, {
        symbol,
        timeframe,
        tickSize,
        startTime: candles.length > 0 ? candles[0].time : fetchStartTime / 1000,
        endTime: candles.length > 0 ? candles[candles.length - 1].time : fetchEndTime / 1000,
        candles,
        lastTradeTime: Date.now() / 1000,
        isLive: true,
      });

      console.log(`[FootprintDataService] Created ${candles.length} footprint candles`);

      return candles;
    } catch (error) {
      console.error('[FootprintDataService] Error loading history:', error);
      return cached?.candles || [];
    }
  }

  /**
   * Fetch historical trades from Bybit API
   */
  private async fetchHistoricalTrades(
    symbol: string,
    startTime: number,
    endTime: number
  ): Promise<Trade[]> {
    const allTrades: Trade[] = [];
    let cursor: string | undefined;
    let iterations = 0;
    const maxIterations = 50; // Safety limit
    let oldestTime = endTime;

    while (oldestTime > startTime && iterations < maxIterations) {
      iterations++;

      try {
        const params = new URLSearchParams({
          category: 'linear',
          symbol: symbol.toUpperCase(),
          limit: '1000',
        });

        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(`/api/bybit/v5/market/recent-trade?${params}`);
        const data = await response.json();

        if (data.retCode !== 0 || !data.result?.list?.length) {
          break;
        }

        const trades: Trade[] = data.result.list.map((t: {
          execId: string;
          price: string;
          size: string;
          side: 'Buy' | 'Sell';
          time: string;
        }) => ({
          id: t.execId,
          price: parseFloat(t.price),
          quantity: parseFloat(t.size),
          time: parseInt(t.time),
          isBuyerMaker: t.side === 'Sell', // Sell = taker sold = buyer was maker
        }));

        allTrades.push(...trades);

        // Update oldest time
        const batchOldest = Math.min(...trades.map(t => t.time));
        oldestTime = batchOldest;

        // Get cursor for next batch
        cursor = data.result.nextPageCursor;

        if (!cursor) break;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        console.error('[FootprintDataService] Trade fetch error:', error);
        break;
      }
    }

    // Sort by time ascending
    allTrades.sort((a, b) => a.time - b.time);

    return allTrades;
  }

  /**
   * Aggregate trades into footprint candles
   */
  private aggregateTradesIntoCandles(
    trades: Trade[],
    timeframe: number,
    tickSize: number,
    imbalanceRatio: number
  ): FootprintCandle[] {
    if (trades.length === 0) return [];

    const candleMap = new Map<number, FootprintCandle>();

    // Process each trade
    for (const trade of trades) {
      const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
      const priceLevel = Math.round(trade.price / tickSize) * tickSize;

      let candle = candleMap.get(candleTime);

      if (!candle) {
        // Create new candle
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
        candleMap.set(candleTime, candle);
      }

      // Update OHLC
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;

      // Update level
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

      // Add volume based on aggressor side
      // isBuyerMaker = true means seller was aggressor (hitting bid)
      // isBuyerMaker = false means buyer was aggressor (hitting ask)
      if (trade.isBuyerMaker) {
        // Sell aggressor = bid volume
        level.bidVolume += trade.quantity;
        level.bidTrades += 1;
        candle.totalSellVolume += trade.quantity;
      } else {
        // Buy aggressor = ask volume
        level.askVolume += trade.quantity;
        level.askTrades += 1;
        candle.totalBuyVolume += trade.quantity;
      }

      level.totalVolume = level.bidVolume + level.askVolume;
      level.delta = level.askVolume - level.bidVolume;

      // Update candle totals
      candle.totalVolume += trade.quantity;
      candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
      candle.totalTrades += 1;
    }

    // Post-process candles
    const candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

    for (const candle of candles) {
      // Calculate POC
      let maxVol = 0;
      candle.levels.forEach((level, price) => {
        if (level.totalVolume > maxVol) {
          maxVol = level.totalVolume;
          candle.poc = price;
        }
      });

      // Calculate imbalances (diagonal comparison)
      candle.levels.forEach((level, price) => {
        const levelBelow = candle.levels.get(price - tickSize);
        const levelAbove = candle.levels.get(price + tickSize);

        // Buy imbalance: ask at this price vs bid below
        if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
          level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
        }

        // Sell imbalance: bid at this price vs ask above
        if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
          level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
        }
      });

      // Calculate VAH/VAL (70% value area)
      const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
      const totalVol = candle.totalVolume;
      let cumVol = 0;
      let vahFound = false;
      let valFound = false;

      for (const price of sortedPrices) {
        const level = candle.levels.get(price)!;
        cumVol += level.totalVolume;

        if (!valFound && cumVol >= totalVol * 0.15) {
          candle.val = price;
          valFound = true;
        }

        if (!vahFound && cumVol >= totalVol * 0.85) {
          candle.vah = price;
          vahFound = true;
        }
      }

      // Mark as closed (historical data is always closed)
      candle.isClosed = true;
    }

    return candles;
  }

  /**
   * Process a single trade into existing candles (for live updates)
   */
  processLiveTrade(
    trade: Trade,
    timeframe: number,
    tickSize: number,
    existingCandles: FootprintCandle[]
  ): FootprintCandle[] {
    const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
    const priceLevel = Math.round(trade.price / tickSize) * tickSize;

    // Find or create candle
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

    // Update OHLC
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    // Update level
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

    // Recalculate imbalances
    candle.levels.forEach((lvl, price) => {
      const levelBelow = candle!.levels.get(price - tickSize);
      const levelAbove = candle!.levels.get(price + tickSize);

      if (levelBelow && lvl.askVolume > 0 && levelBelow.bidVolume > 0) {
        lvl.imbalanceBuy = (lvl.askVolume / levelBelow.bidVolume) >= this.imbalanceRatio;
      }
      if (levelAbove && lvl.bidVolume > 0 && levelAbove.askVolume > 0) {
        lvl.imbalanceSell = (lvl.bidVolume / levelAbove.askVolume) >= this.imbalanceRatio;
      }
    });

    if (isNewCandle) {
      return [...existingCandles, candle].sort((a, b) => a.time - b.time);
    }

    return existingCandles;
  }

  /**
   * Load more history (older candles)
   */
  async loadMoreHistory(
    symbol: string,
    timeframe: number,
    tickSize: number,
    currentOldestTime: number,
    hoursBack: number = 4
  ): Promise<FootprintCandle[]> {
    const endTime = (currentOldestTime - 1) * 1000; // Before current oldest
    const startTime = endTime - hoursBack * 60 * 60 * 1000;

    const trades = await this.fetchHistoricalTrades(symbol, startTime, endTime);

    if (trades.length === 0) return [];

    return this.aggregateTradesIntoCandles(
      trades,
      timeframe,
      tickSize,
      this.imbalanceRatio
    );
  }

  /**
   * Get cached session
   */
  getCachedSession(symbol: string, timeframe: number): FootprintSession | null {
    return sessionCache.get(getCacheKey(symbol, timeframe)) || null;
  }

  /**
   * Clear cache
   */
  clearCache(symbol?: string, timeframe?: number): void {
    if (symbol && timeframe) {
      sessionCache.delete(getCacheKey(symbol, timeframe));
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
