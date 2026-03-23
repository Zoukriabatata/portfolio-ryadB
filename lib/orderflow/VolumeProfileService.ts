/**
 * VolumeProfileService — Singleton per symbol
 *
 * Provides a SINGLE correct Volume Profile per symbol, shared across all timeframes.
 * Loads real aggTrades from Binance Futures, caches in IndexedDB, updates via WebSocket.
 *
 * The VP is INDEPENDENT of timeframe — M1, M5, M15 all show the same VP.
 * This matches professional tools like ATAS.
 */

import { VolumeProfileEngine, type ProfileConfig } from './VolumeProfileEngine';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';

// ─── Tick sizes ────────────────────────────────────────────────────────────────
function getTickSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return 10;
  if (s.includes('ETH')) return 1;
  if (s.includes('SOL')) return 0.1;
  if (s.includes('BNB')) return 1;
  if (s.includes('XRP') || s.includes('ADA') || s.includes('ARB')) return 0.001;
  if (s.includes('DOGE')) return 0.0001;
  if (s.includes('PEPE')) return 0.0000001;
  if (s.includes('AVAX')) return 0.1;
  if (s.includes('LINK') || s.includes('OP')) return 0.01;
  return 0.01;
}

// ─── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB_NAME = 'senzoukria-vp';
const DB_VERSION = 1;
const STORE_NAME = 'vp-trades';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface CachedVP {
  symbol: string;
  date: string; // UTC date string YYYY-MM-DD
  lastTradeTime: number; // ms
  bins: Map<number, { total: number; buy: number; sell: number }>;
}

async function loadCache(symbol: string, date: string): Promise<CachedVP | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`${symbol}_${date}`);
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.bins) {
          // Restore Map from plain object
          data.bins = new Map(Object.entries(data.bins).map(([k, v]) => [parseFloat(k), v as { total: number; buy: number; sell: number }]));
          resolve(data as CachedVP);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveCache(cache: CachedVP): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Convert Map to plain object for storage
    const serializable = {
      ...cache,
      bins: Object.fromEntries(cache.bins),
    };
    store.put(serializable, `${cache.symbol}_${cache.date}`);
  } catch {
    // Silent fail
  }
}

// ─── Service instance per symbol ───────────────────────────────────────────────
interface VPServiceInstance {
  engine: VolumeProfileEngine;
  symbol: string;
  loading: boolean;
  loadedTradeCount: number;
  oldestTradeTime: number;
  newestTradeTime: number;
  cancelLoad: (() => void) | null;
  unsubLive: (() => void) | null;
  listeners: Set<() => void>;
}

const instances = new Map<string, VPServiceInstance>();

function getUTCDate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function getDayStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Get or create a VP service instance for a symbol.
 * All timeframes share the same instance.
 */
export function getVPService(symbol: string): VPServiceInstance {
  const key = symbol.toUpperCase();
  let inst = instances.get(key);
  if (inst) return inst;

  const tickSize = getTickSize(symbol);
  const config: ProfileConfig = {
    tickSize,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 50000,
  };

  inst = {
    engine: new VolumeProfileEngine(config),
    symbol: key,
    loading: false,
    loadedTradeCount: 0,
    oldestTradeTime: Infinity,
    newestTradeTime: 0,
    cancelLoad: null,
    unsubLive: null,
    listeners: new Set(),
  };

  instances.set(key, inst);
  return inst;
}

/**
 * Subscribe to VP updates. Returns unsubscribe function.
 */
export function subscribeVP(symbol: string, callback: () => void): () => void {
  const inst = getVPService(symbol);
  inst.listeners.add(callback);
  return () => inst.listeners.delete(callback);
}

function notifyListeners(inst: VPServiceInstance): void {
  inst.listeners.forEach(cb => cb());
}

/**
 * Start loading VP data for a symbol.
 * - Checks IndexedDB cache first
 * - Loads missing trades from Binance aggTrades
 * - Subscribes to live trades via WebSocket
 */
export async function startVPLoad(symbol: string): Promise<void> {
  const inst = getVPService(symbol);
  if (inst.loading) return; // Already loading
  inst.loading = true;

  let cancelled = false;
  inst.cancelLoad = () => { cancelled = true; };

  const date = getUTCDate();
  const dayStart = getDayStartMs();
  const now = Date.now();

  // 1. Try IndexedDB cache
  const cached = await loadCache(inst.symbol, date);
  if (cached && !cancelled) {
    // Restore bins into engine
    for (const [price, vol] of cached.bins) {
      inst.engine.addBulkVolume(price, vol.buy, vol.sell, cached.lastTradeTime);
    }
    inst.oldestTradeTime = dayStart;
    inst.newestTradeTime = cached.lastTradeTime;
    inst.loadedTradeCount = cached.bins.size * 10; // Approximate
    notifyListeners(inst);
  }

  // 2. Load aggTrades from newestTradeTime → now (fill gap since cache)
  const startFrom = inst.newestTradeTime > dayStart ? inst.newestTradeTime + 1 : dayStart;
  let cursor = now;
  let reqCount = 0;
  const maxReqs = 500; // ~500K trades max

  // Load backward from now to startFrom
  while (cursor > startFrom && !cancelled && reqCount < maxReqs) {
    try {
      const params = new URLSearchParams({
        symbol: inst.symbol,
        endTime: cursor.toString(),
        limit: '1000',
      });
      const res = await fetch(`/api/binance/fapi/v1/aggTrades?${params}`);
      reqCount++;
      if (!res.ok || cancelled) break;
      const trades = await res.json();
      if (!Array.isArray(trades) || trades.length === 0) break;

      for (const t of trades) {
        const ts = t.T as number;
        if (ts < dayStart) continue; // Skip pre-day trades
        inst.engine.processTrade({
          timestamp: ts,
          price: parseFloat(t.p),
          size: parseFloat(t.q),
          side: t.m ? 'sell' : 'buy',
        });
        inst.loadedTradeCount++;
        if (ts < inst.oldestTradeTime) inst.oldestTradeTime = ts;
        if (ts > inst.newestTradeTime) inst.newestTradeTime = ts;
      }

      cursor = (trades[0].T as number) - 1;
      if (cursor < dayStart) break;

      // Update UI every 10 batches
      if (reqCount % 10 === 0 && !cancelled) {
        notifyListeners(inst);
      }

      // Rate limit: ~3 req/sec (safe for weight budget)
      if (reqCount % 5 === 0) {
        await new Promise(r => setTimeout(r, 300));
      }

      if (trades.length < 1000) break;
    } catch {
      break;
    }
  }

  if (!cancelled) {
    notifyListeners(inst);

    // 3. Save to IndexedDB cache
    const bins = new Map<number, { total: number; buy: number; sell: number }>();
    for (const bin of inst.engine.getBins()) {
      bins.set(bin.price, { total: bin.totalVolume, buy: bin.askVolume, sell: bin.bidVolume });
    }
    await saveCache({
      symbol: inst.symbol,
      date,
      lastTradeTime: inst.newestTradeTime,
      bins,
    });
  }

  // 4. Subscribe to live trades
  if (!cancelled && !inst.unsubLive) {
    const ws = getBinanceLiveWS();
    inst.unsubLive = ws.onTick((tick) => {
      inst.engine.processTrade({
        timestamp: tick.timestamp,
        price: tick.price,
        size: tick.quantity,
        side: tick.isBuyerMaker ? 'sell' : 'buy',
      });
      inst.loadedTradeCount++;
      if (tick.timestamp > inst.newestTradeTime) inst.newestTradeTime = tick.timestamp;
    });
  }

  // Periodic UI update for live trades (4fps)
  if (!cancelled) {
    const interval = setInterval(() => {
      if (!instances.has(inst.symbol)) {
        clearInterval(interval);
        return;
      }
      notifyListeners(inst);
    }, 250);

    // Store interval for cleanup
    const oldCancel = inst.cancelLoad;
    inst.cancelLoad = () => {
      cancelled = true;
      clearInterval(interval);
      oldCancel?.();
    };
  }

  inst.loading = false;
}

/**
 * Stop VP for a symbol — cleanup WebSocket, cancel loading
 */
export function stopVPLoad(symbol: string): void {
  const key = symbol.toUpperCase();
  const inst = instances.get(key);
  if (!inst) return;

  inst.cancelLoad?.();
  inst.unsubLive?.();
  inst.unsubLive = null;
  inst.listeners.clear();
  instances.delete(key);
}

/**
 * Get current VP data (bins, POC, VAH, VAL)
 */
export function getVPData(symbol: string) {
  const inst = getVPService(symbol);
  const state = inst.engine.getState();
  if (state.tradeCount === 0) return null;

  return {
    bins: inst.engine.getBins(),
    valueArea: inst.engine.calculateValueArea(),
    totalVolume: state.totalVolume,
    loadedTradeCount: inst.loadedTradeCount,
    loading: inst.loading,
  };
}
