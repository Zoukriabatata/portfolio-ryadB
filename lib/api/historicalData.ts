/**
 * HISTORICAL DATA SERVICE
 *
 * Handles fetching, caching, and managing historical candle data
 * Supports incremental loading (pan left to load more)
 */

import type { Candle } from '@/types/market';
import { throttledFetch } from '@/lib/api/throttledFetch';

export interface HistoricalDataOptions {
  symbol: string;
  interval: string;
  limit?: number;
  endTime?: number;
  startTime?: number;
  exchange?: 'binance' | 'bybit';
}

export interface HistoricalDataResponse {
  success: boolean;
  symbol: string;
  interval: string;
  count: number;
  candles: Candle[];
  error?: string;
}

// Cache for historical data to avoid redundant fetches
// LRU: max 10 entries, oldest-accessed evicted when full
const MAX_CACHE_ENTRIES = 10;
const MAX_CANDLES_PER_ENTRY = 3000;

const dataCache = new Map<string, {
  candles: Candle[];
  oldestTime: number;
  newestTime: number;
  lastFetch: number;
}>();

/** Move key to end of Map (most recently used) and evict oldest if over limit */
function cacheTouchAndEvict(key: string): void {
  const entry = dataCache.get(key);
  if (entry) {
    dataCache.delete(key);
    dataCache.set(key, entry);
  }
  // Evict oldest entries (first in Map) if over limit
  while (dataCache.size > MAX_CACHE_ENTRIES) {
    const oldest = dataCache.keys().next().value;
    if (oldest) dataCache.delete(oldest);
  }
}

// Minimum time between fetches for the same key (ms)
const FETCH_DEBOUNCE = 1000;

/**
 * Generate cache key
 */
function getCacheKey(symbol: string, interval: string): string {
  return `${symbol}_${interval}`;
}

/**
 * Fetch historical candles from API
 */
export async function fetchHistoricalCandles(
  options: HistoricalDataOptions
): Promise<HistoricalDataResponse> {
  const {
    symbol,
    interval,
    limit = 500,
    endTime,
    startTime,
    exchange = 'binance',
  } = options;

  const params = new URLSearchParams({
    symbol,
    interval,
    limit: limit.toString(),
    exchange,
  });

  if (endTime) params.append('endTime', endTime.toString());
  if (startTime) params.append('startTime', startTime.toString());

  try {
    const response = await throttledFetch(`/api/history/klines?${params}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch historical data');
    }

    return data as HistoricalDataResponse;
  } catch (error) {
    console.error('Error fetching historical candles:', error);
    return {
      success: false,
      symbol,
      interval,
      count: 0,
      candles: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch initial historical data for a symbol/interval
 */
export async function fetchInitialHistory(
  symbol: string,
  interval: string,
  limit: number = 500,
  exchange: 'binance' | 'bybit' = 'binance'
): Promise<Candle[]> {
  const cacheKey = getCacheKey(symbol, interval);
  const cached = dataCache.get(cacheKey);

  // Return cached data if recent enough
  if (cached && Date.now() - cached.lastFetch < FETCH_DEBOUNCE) {
    return cached.candles;
  }

  const result = await fetchHistoricalCandles({
    symbol,
    interval,
    limit,
    exchange,
  });

  if (result.success && result.candles.length > 0) {
    const capped = result.candles.slice(-MAX_CANDLES_PER_ENTRY);
    dataCache.set(cacheKey, {
      candles: capped,
      oldestTime: capped[0].time,
      newestTime: capped[capped.length - 1].time,
      lastFetch: Date.now(),
    });
    cacheTouchAndEvict(cacheKey);

    return result.candles;
  }

  return [];
}

/**
 * Load more history (older candles) - for pan left
 */
export async function loadMoreHistory(
  symbol: string,
  interval: string,
  currentOldestTime: number,
  limit: number = 500,
  exchange: 'binance' | 'bybit' = 'binance'
): Promise<Candle[]> {
  const cacheKey = getCacheKey(symbol, interval);
  const cached = dataCache.get(cacheKey);

  // Debounce rapid requests
  if (cached && Date.now() - cached.lastFetch < FETCH_DEBOUNCE) {
    return [];
  }

  // Fetch older candles (endTime = current oldest - 1)
  const result = await fetchHistoricalCandles({
    symbol,
    interval,
    limit,
    endTime: (currentOldestTime - 1) * 1000, // Convert to ms for API
    exchange,
  });

  if (result.success && result.candles.length > 0) {
    // Update cache with merged data
    if (cached) {
      // Deduplicate using Map (O(n) instead of O(n²))
      const timeMap = new Map<number, Candle>();
      for (const c of result.candles) timeMap.set(c.time, c);
      for (const c of cached.candles) timeMap.set(c.time, c);

      const uniqueCandles = Array.from(timeMap.values())
        .sort((a, b) => a.time - b.time)
        .slice(-MAX_CANDLES_PER_ENTRY);

      dataCache.set(cacheKey, {
        candles: uniqueCandles,
        oldestTime: uniqueCandles[0].time,
        newestTime: uniqueCandles[uniqueCandles.length - 1].time,
        lastFetch: Date.now(),
      });
      cacheTouchAndEvict(cacheKey);
    }

    return result.candles;
  }

  return [];
}

/**
 * Get cached data for a symbol/interval
 */
export function getCachedHistory(symbol: string, interval: string): Candle[] | null {
  const cacheKey = getCacheKey(symbol, interval);
  const cached = dataCache.get(cacheKey);
  return cached?.candles || null;
}

/**
 * Clear cache for a specific symbol/interval
 */
export function clearHistoryCache(symbol?: string, interval?: string): void {
  if (symbol && interval) {
    dataCache.delete(getCacheKey(symbol, interval));
  } else {
    dataCache.clear();
  }
}

/**
 * Get interval in milliseconds
 */
export function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };
  return map[interval] || 60 * 1000;
}

/**
 * Calculate how many candles to fetch based on visible range
 */
export function calculateFetchLimit(
  visibleStartTime: number,
  visibleEndTime: number,
  interval: string,
  buffer: number = 2
): number {
  const intervalMs = getIntervalMs(interval);
  const visibleMs = (visibleEndTime - visibleStartTime) * 1000;
  const visibleCandles = Math.ceil(visibleMs / intervalMs);
  return Math.min(Math.max(visibleCandles * buffer, 200), 1500);
}
