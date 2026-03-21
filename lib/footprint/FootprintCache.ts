/**
 * FOOTPRINT CACHE — IndexedDB-based cache for historical footprint candles
 *
 * Speeds up subsequent loads of the same symbol/timeframe by caching
 * computed candles and only fetching new trades since the last cache.
 */

import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';

const DB_NAME = 'footprint-cache';
const DB_VERSION = 2;
const STORE_NAME = 'candles';
const PROFILE_STORE_NAME = 'profiles';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  key: string; // symbol_timeframe
  candles: SerializedCandle[];
  lastCandleTime: number;
  cachedAt: number;
}

/** Cached computed profile for a candle (POC, VAH, VAL) */
export interface CachedProfile {
  poc: number;
  vah: number;
  val: number;
  timestamp: number;
}

interface ProfileCacheEntry {
  key: string; // symbol_timeframe
  profiles: CachedProfile[];
  cachedAt: number;
}

// FootprintCandle uses Map which can't be stored in IndexedDB directly
interface SerializedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Array<[number, SerializedLevel]>;
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

interface SerializedLevel {
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

function serializeCandle(candle: FootprintCandle): SerializedCandle {
  const levels: Array<[number, SerializedLevel]> = [];
  candle.levels.forEach((level, price) => {
    levels.push([price, {
      price: level.price,
      bidVolume: level.bidVolume,
      askVolume: level.askVolume,
      bidTrades: level.bidTrades,
      askTrades: level.askTrades,
      delta: level.delta,
      totalVolume: level.totalVolume,
      imbalanceBuy: level.imbalanceBuy,
      imbalanceSell: level.imbalanceSell,
    }]);
  });

  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    levels,
    totalVolume: candle.totalVolume,
    totalBuyVolume: candle.totalBuyVolume,
    totalSellVolume: candle.totalSellVolume,
    totalDelta: candle.totalDelta,
    totalTrades: candle.totalTrades,
    poc: candle.poc,
    vah: candle.vah,
    val: candle.val,
    isClosed: candle.isClosed,
  };
}

function deserializeCandle(s: SerializedCandle): FootprintCandle {
  const levels = new Map<number, any>();
  for (const [price, level] of s.levels) {
    levels.set(price, level);
  }
  return {
    time: s.time,
    open: s.open,
    high: s.high,
    low: s.low,
    close: s.close,
    levels,
    totalVolume: s.totalVolume,
    totalBuyVolume: s.totalBuyVolume,
    totalSellVolume: s.totalSellVolume,
    totalDelta: s.totalDelta,
    totalTrades: s.totalTrades,
    poc: s.poc,
    vah: s.vah,
    val: s.val,
    isClosed: s.isClosed,
  } as FootprintCandle;
}

class FootprintCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
          db.createObjectStore(PROFILE_STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Get cached candles for a symbol/timeframe
   * Returns null if no cache or cache is too old
   */
  async getCachedCandles(
    symbol: string,
    timeframe: number,
  ): Promise<{ candles: FootprintCandle[]; lastCandleTime: number } | null> {
    try {
      const db = await this.openDB();
      const key = `${symbol}_${timeframe}`;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;
          if (!entry) {
            resolve(null);
            return;
          }

          // Check if cache is too old
          if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
            resolve(null);
            return;
          }

          const candles = entry.candles.map(deserializeCandle);
          resolve({ candles, lastCandleTime: entry.lastCandleTime });
        };

        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Store candles in cache (only closed candles)
   */
  async storeCandles(
    symbol: string,
    timeframe: number,
    candles: FootprintCandle[],
  ): Promise<void> {
    try {
      const db = await this.openDB();
      const key = `${symbol}_${timeframe}`;

      // Only cache closed candles
      const closedCandles = candles.filter(c => c.isClosed);
      if (closedCandles.length === 0) return;

      const lastCandleTime = Math.max(...closedCandles.map(c => c.time));

      const entry: CacheEntry = {
        key,
        candles: closedCandles.map(serializeCandle),
        lastCandleTime,
        cachedAt: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Silently fail — cache is optional
    }
  }

  /**
   * Get cached computed profiles (POC, VAH, VAL) for a symbol/timeframe.
   * Returns null if no cache or cache is too old.
   */
  async getCachedProfiles(
    symbol: string,
    timeframe: number,
  ): Promise<CachedProfile[] | null> {
    try {
      const db = await this.openDB();
      const key = `${symbol}_${timeframe}`;

      return new Promise((resolve) => {
        const tx = db.transaction(PROFILE_STORE_NAME, 'readonly');
        const store = tx.objectStore(PROFILE_STORE_NAME);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as ProfileCacheEntry | undefined;
          if (!entry) { resolve(null); return; }
          if (Date.now() - entry.cachedAt > MAX_AGE_MS) { resolve(null); return; }
          resolve(entry.profiles);
        };

        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Store computed profiles (POC, VAH, VAL) alongside candles.
   * Avoids recalculation on subsequent loads.
   */
  async storeProfiles(
    symbol: string,
    timeframe: number,
    profiles: CachedProfile[],
  ): Promise<void> {
    try {
      const db = await this.openDB();
      const key = `${symbol}_${timeframe}`;

      const entry: ProfileCacheEntry = {
        key,
        profiles,
        cachedAt: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(PROFILE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PROFILE_STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Silently fail — cache is optional
    }
  }

  /**
   * Clear old cache entries
   */
  async clearOldEntries(): Promise<void> {
    try {
      const db = await this.openDB();
      const now = Date.now();

      const clearStore = (storeName: string): Promise<void> =>
        new Promise((resolve) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.openCursor();

          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) { resolve(); return; }
            const entry = cursor.value as { cachedAt: number };
            if (now - entry.cachedAt > MAX_AGE_MS) {
              cursor.delete();
            }
            cursor.continue();
          };

          request.onerror = () => resolve();
        });

      await clearStore(STORE_NAME);
      await clearStore(PROFILE_STORE_NAME);
    } catch {
      // Silently fail
    }
  }
}

// Singleton
let _cache: FootprintCache | null = null;

export function getFootprintCache(): FootprintCache {
  if (!_cache) {
    _cache = new FootprintCache();
  }
  return _cache;
}
