/**
 * REPLAY RECORDER
 *
 * Records IB Gateway trade and depth data to IndexedDB.
 * Each recording session stores trades and depth snapshots with timestamps,
 * allowing exact replay through the footprint/heatmap renderers.
 *
 * Legal: Only records the user's own personal CME data feed.
 * Data stays in the browser's IndexedDB - never uploaded to server.
 */

import type { IBTrade, IBDepthUpdate, IBQuote } from '@/types/ib-protocol';

// Generic trade/depth format for any exchange
export interface GenericTrade {
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  timestamp: number;
}

export interface GenericDepth {
  timestamp: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type RecordingExchange = 'ib' | 'binance' | 'bybit' | 'deribit';

export interface RecordingSession {
  id: string;
  symbol: string;
  exchange: RecordingExchange;
  startTime: number;
  endTime: number;
  tradeCount: number;
  depthSnapshotCount: number;
  status: 'recording' | 'completed' | 'error';
  fileSizeEstimate: number; // bytes
  metadata?: {
    description?: string;
    tags?: string[];
    initialBalance?: number;
    timeInvested?: number; // ms of active playback time
  };
}

export interface RecordedTrade {
  sessionId: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
}

export interface RecordedDepthSnapshot {
  sessionId: string;
  timestamp: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

export interface RecordedQuote {
  sessionId: string;
  timestamp: number;
  bid: number;
  ask: number;
  last: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDEXEDDB SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME = 'senzoukria_replay';
const DB_VERSION = 1;

const STORE_SESSIONS = 'sessions';
const STORE_TRADES = 'trades';
const STORE_DEPTH = 'depth';
const STORE_QUOTES = 'quotes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Sessions store
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }

      // Trades store with index on sessionId + timestamp
      if (!db.objectStoreNames.contains(STORE_TRADES)) {
        const tradeStore = db.createObjectStore(STORE_TRADES, { autoIncrement: true });
        tradeStore.createIndex('sessionId', 'sessionId', { unique: false });
        tradeStore.createIndex('session_time', ['sessionId', 'timestamp'], { unique: false });
      }

      // Depth snapshots store
      if (!db.objectStoreNames.contains(STORE_DEPTH)) {
        const depthStore = db.createObjectStore(STORE_DEPTH, { autoIncrement: true });
        depthStore.createIndex('sessionId', 'sessionId', { unique: false });
        depthStore.createIndex('session_time', ['sessionId', 'timestamp'], { unique: false });
      }

      // Quotes store
      if (!db.objectStoreNames.contains(STORE_QUOTES)) {
        const quoteStore = db.createObjectStore(STORE_QUOTES, { autoIncrement: true });
        quoteStore.createIndex('sessionId', 'sessionId', { unique: false });
        quoteStore.createIndex('session_time', ['sessionId', 'timestamp'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECORDER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ReplayRecorder {
  private db: IDBDatabase | null = null;
  private currentSession: RecordingSession | null = null;
  private writeBuffer: { store: string; data: unknown }[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private tradeCount = 0;
  private depthCount = 0;
  private sizeEstimate = 0;

  // Depth sampling: don't record every update, sample at interval
  private lastDepthTime = 0;
  private depthIntervalMs = 500; // Record depth every 500ms

  async init(): Promise<void> {
    this.db = await openDB();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORDING LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async startRecording(symbol: string, description?: string, exchange: RecordingExchange = 'ib'): Promise<string> {
    if (!this.db) await this.init();
    if (this.currentSession?.status === 'recording') {
      throw new Error('Already recording. Stop current session first.');
    }

    const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.currentSession = {
      id: sessionId,
      symbol: symbol.toUpperCase(),
      exchange,
      startTime: Date.now(),
      endTime: 0,
      tradeCount: 0,
      depthSnapshotCount: 0,
      status: 'recording',
      fileSizeEstimate: 0,
      metadata: {
        description: description || `${symbol} recording`,
        tags: [],
      },
    };

    this.tradeCount = 0;
    this.depthCount = 0;
    this.sizeEstimate = 0;
    this.writeBuffer = [];

    // Save session metadata
    await this.putSession(this.currentSession);

    // Start periodic flush (every 2 seconds)
    this.flushTimer = setInterval(() => this.flush(), 2000);

    console.log(`[ReplayRecorder] Started recording session ${sessionId} for ${symbol}`);
    return sessionId;
  }

  async stopRecording(): Promise<RecordingSession | null> {
    if (!this.currentSession || this.currentSession.status !== 'recording') {
      return null;
    }

    // Final flush
    await this.flush();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.currentSession.endTime = Date.now();
    this.currentSession.tradeCount = this.tradeCount;
    this.currentSession.depthSnapshotCount = this.depthCount;
    this.currentSession.fileSizeEstimate = this.sizeEstimate;
    this.currentSession.status = 'completed';

    await this.putSession(this.currentSession);

    const session = { ...this.currentSession };
    console.log(`[ReplayRecorder] Stopped recording: ${this.tradeCount} trades, ${this.depthCount} depth snapshots`);
    this.currentSession = null;

    return session;
  }

  isRecording(): boolean {
    return this.currentSession?.status === 'recording' || false;
  }

  getRecordingStats(): { tradeCount: number; depthCount: number; duration: number; sizeEstimate: number } {
    return {
      tradeCount: this.tradeCount,
      depthCount: this.depthCount,
      duration: this.currentSession ? Date.now() - this.currentSession.startTime : 0,
      sizeEstimate: this.sizeEstimate,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA INPUT (called from IBConnectionManager hooks)
  // ═══════════════════════════════════════════════════════════════════════════

  recordTrade(trade: IBTrade): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') return;

    const record: RecordedTrade = {
      sessionId: this.currentSession.id,
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: trade.side,
    };

    this.writeBuffer.push({ store: STORE_TRADES, data: record });
    this.tradeCount++;
    this.sizeEstimate += 60; // ~60 bytes per trade
  }

  recordDepth(depth: IBDepthUpdate): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') return;

    // Sample at interval to avoid overwhelming IndexedDB
    const now = Date.now();
    if (now - this.lastDepthTime < this.depthIntervalMs) return;
    this.lastDepthTime = now;

    const record: RecordedDepthSnapshot = {
      sessionId: this.currentSession.id,
      timestamp: now,
      bids: depth.bids.map(r => ({ price: r.price, size: r.size })),
      asks: depth.asks.map(r => ({ price: r.price, size: r.size })),
    };

    this.writeBuffer.push({ store: STORE_DEPTH, data: record });
    this.depthCount++;
    this.sizeEstimate += depth.bids.length * 16 + depth.asks.length * 16 + 40;
  }

  recordQuote(quote: IBQuote): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') return;

    const record: RecordedQuote = {
      sessionId: this.currentSession.id,
      timestamp: Date.now(),
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
    };

    this.writeBuffer.push({ store: STORE_QUOTES, data: record });
    this.sizeEstimate += 40;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC RECORDING (Crypto / any exchange)
  // ═══════════════════════════════════════════════════════════════════════════

  recordGenericTrade(trade: GenericTrade): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') return;

    const record: RecordedTrade = {
      sessionId: this.currentSession.id,
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: trade.side,
    };

    this.writeBuffer.push({ store: STORE_TRADES, data: record });
    this.tradeCount++;
    this.sizeEstimate += 60;
  }

  recordGenericDepth(depth: GenericDepth): void {
    if (!this.currentSession || this.currentSession.status !== 'recording') return;

    // Sample at interval
    const now = depth.timestamp || Date.now();
    if (now - this.lastDepthTime < this.depthIntervalMs) return;
    this.lastDepthTime = now;

    const record: RecordedDepthSnapshot = {
      sessionId: this.currentSession.id,
      timestamp: now,
      bids: depth.bids.slice(0, 20).map(r => ({ price: r.price, size: r.size })),
      asks: depth.asks.slice(0, 20).map(r => ({ price: r.price, size: r.size })),
    };

    this.writeBuffer.push({ store: STORE_DEPTH, data: record });
    this.depthCount++;
    this.sizeEstimate += depth.bids.length * 16 + depth.asks.length * 16 + 40;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async getSessions(): Promise<RecordingSession[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_SESSIONS, 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.getAll();
      request.onsuccess = () => {
        const sessions = request.result as RecordingSession[];
        // Sort by startTime descending (newest first)
        sessions.sort((a, b) => b.startTime - a.startTime);
        resolve(sessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateSession(sessionId: string, updates: { description?: string; tags?: string[] }): Promise<void> {
    if (!this.db) await this.init();
    const sessions = await this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.metadata = { ...session.metadata, ...updates };
    await this.putSession(session);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.db) await this.init();

    // Delete from all stores
    const stores = [STORE_SESSIONS, STORE_TRADES, STORE_DEPTH, STORE_QUOTES];

    for (const storeName of stores) {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        if (storeName === STORE_SESSIONS) {
          store.delete(sessionId);
        } else {
          const index = store.index('sessionId');
          const range = IDBKeyRange.only(sessionId);
          const cursorReq = index.openCursor(range);
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            }
          };
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    console.log(`[ReplayRecorder] Deleted session ${sessionId}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA RETRIEVAL (for ReplayEngine)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSessionTrades(sessionId: string): Promise<RecordedTrade[]> {
    if (!this.db) await this.init();
    return this.getAllBySession<RecordedTrade>(STORE_TRADES, sessionId);
  }

  async getSessionDepth(sessionId: string): Promise<RecordedDepthSnapshot[]> {
    if (!this.db) await this.init();
    return this.getAllBySession<RecordedDepthSnapshot>(STORE_DEPTH, sessionId);
  }

  async getSessionQuotes(sessionId: string): Promise<RecordedQuote[]> {
    if (!this.db) await this.init();
    return this.getAllBySession<RecordedQuote>(STORE_QUOTES, sessionId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ═══════════════════════════════════════════════════════════════════════════

  private async flush(): Promise<void> {
    if (!this.db || this.writeBuffer.length === 0) return;

    const buffer = [...this.writeBuffer];
    this.writeBuffer = [];

    // Group by store for efficient transactions
    const byStore = new Map<string, unknown[]>();
    for (const item of buffer) {
      if (!byStore.has(item.store)) byStore.set(item.store, []);
      byStore.get(item.store)!.push(item.data);
    }

    for (const [storeName, items] of byStore) {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const item of items) {
          store.add(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  private async putSession(session: RecordingSession): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      store.put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async getAllBySession<T>(storeName: string, sessionId: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index('sessionId');
      const request = index.getAll(IDBKeyRange.only(sessionId));
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton
let recorderInstance: ReplayRecorder | null = null;

export function getReplayRecorder(): ReplayRecorder {
  if (!recorderInstance) {
    recorderInstance = new ReplayRecorder();
  }
  return recorderInstance;
}
