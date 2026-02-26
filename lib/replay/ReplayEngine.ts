/**
 * REPLAY ENGINE
 *
 * Replays recorded IB data (trades + depth) through the same adapters
 * used for live data, allowing users to review their trading sessions.
 *
 * Features:
 * - Play / Pause / Stop / Seek
 * - Adjustable speed (0.25x to 10x)
 * - Feeds data to IBHeatmapAdapter and IBFootprintAdapter
 * - Emits events for UI updates
 */

import { IBHeatmapAdapter } from '@/lib/ib/IBHeatmapAdapter';
import { IBFootprintAdapter } from '@/lib/ib/IBFootprintAdapter';
import { CME_CONTRACTS, type CMEContractSpec } from '@/types/ib-protocol';
import type { RenderData } from '@/lib/heatmap-webgl/HybridRenderer';
import {
  getReplayRecorder,
  type RecordedTrade,
  type RecordedDepthSnapshot,
  type RecordingSession,
} from './ReplayRecorder';

// Generic contract specs for crypto symbols (cast as CMEContractSpec for adapter compatibility)
const CRYPTO_CONTRACTS: Record<string, CMEContractSpec> = {
  BTCUSDT:  { symbol: 'BTCUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'Bitcoin USDT Perpetual', tickSize: 0.10,  tickValue: 0.10,  pointValue: 1, tradingHours: '24/7' },
  ETHUSDT:  { symbol: 'ETHUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'Ethereum USDT Perpetual', tickSize: 0.01,  tickValue: 0.01,  pointValue: 1, tradingHours: '24/7' },
  SOLUSDT:  { symbol: 'SOLUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'Solana USDT Perpetual', tickSize: 0.001, tickValue: 0.001, pointValue: 1, tradingHours: '24/7' },
  BNBUSDT:  { symbol: 'BNBUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'BNB USDT Perpetual', tickSize: 0.01,  tickValue: 0.01,  pointValue: 1, tradingHours: '24/7' },
  XRPUSDT:  { symbol: 'XRPUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'XRP USDT Perpetual', tickSize: 0.0001, tickValue: 0.0001, pointValue: 1, tradingHours: '24/7' },
  DOGEUSDT: { symbol: 'DOGEUSDT', exchange: 'BINANCE', secType: 'FUT', description: 'Doge USDT Perpetual', tickSize: 0.00001, tickValue: 0.00001, pointValue: 1, tradingHours: '24/7' },
  ARBUSDT:  { symbol: 'ARBUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'Arbitrum USDT Perpetual', tickSize: 0.0001, tickValue: 0.0001, pointValue: 1, tradingHours: '24/7' },
  SUIUSDT:  { symbol: 'SUIUSDT',  exchange: 'BINANCE', secType: 'FUT', description: 'SUI USDT Perpetual', tickSize: 0.0001, tickValue: 0.0001, pointValue: 1, tradingHours: '24/7' },
  AVAXUSDT: { symbol: 'AVAXUSDT', exchange: 'BINANCE', secType: 'FUT', description: 'Avalanche USDT Perpetual', tickSize: 0.01, tickValue: 0.01, pointValue: 1, tradingHours: '24/7' },
  LINKUSDT: { symbol: 'LINKUSDT', exchange: 'BINANCE', secType: 'FUT', description: 'Chainlink USDT Perpetual', tickSize: 0.001, tickValue: 0.001, pointValue: 1, tradingHours: '24/7' },
  'BTC-PERPETUAL': { symbol: 'BTC-PERPETUAL', exchange: 'DERIBIT', secType: 'FUT', description: 'BTC Perpetual', tickSize: 0.50, tickValue: 0.50, pointValue: 1, tradingHours: '24/7' },
  'ETH-PERPETUAL': { symbol: 'ETH-PERPETUAL', exchange: 'DERIBIT', secType: 'FUT', description: 'ETH Perpetual', tickSize: 0.05, tickValue: 0.05, pointValue: 1, tradingHours: '24/7' },
};

function getContractForSymbol(symbol: string): CMEContractSpec {
  return CME_CONTRACTS[symbol] || CRYPTO_CONTRACTS[symbol] || CRYPTO_CONTRACTS[symbol.toUpperCase()] || {
    symbol, exchange: 'CRYPTO', secType: 'FUT' as const, description: symbol, tickSize: 0.01, tickValue: 0.01, pointValue: 1, tradingHours: '24/7',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ReplayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'finished';

export interface ReplayState {
  status: ReplayStatus;
  sessionId: string | null;
  symbol: string;
  currentTime: number;     // Current replay timestamp
  startTime: number;       // Session start timestamp
  endTime: number;         // Session end timestamp
  progress: number;        // 0-1
  speed: number;           // Playback speed multiplier
  tradeIndex: number;      // Current position in trade array
  depthIndex: number;      // Current position in depth array
  totalTrades: number;
  totalDepthSnapshots: number;
  tradeFedCount: number;   // Trades fed to adapters so far
}

type StatusCallback = (state: ReplayState) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class ReplayEngine {
  private static instance: ReplayEngine;

  // Adapters (same ones used for live IB data)
  private heatmapAdapter: IBHeatmapAdapter;
  private footprintAdapter: IBFootprintAdapter;

  // Recorded data
  private trades: RecordedTrade[] = [];
  private depthSnapshots: RecordedDepthSnapshot[] = [];

  // Playback state
  private state: ReplayState = {
    status: 'idle',
    sessionId: null,
    symbol: '',
    currentTime: 0,
    startTime: 0,
    endTime: 0,
    progress: 0,
    speed: 1,
    tradeIndex: 0,
    depthIndex: 0,
    totalTrades: 0,
    totalDepthSnapshots: 0,
    tradeFedCount: 0,
  };

  // Animation
  private rafId: number = 0;
  private lastFrameTime: number = 0;

  // Callbacks
  private statusCallbacks: Set<StatusCallback> = new Set();

  private constructor() {
    this.heatmapAdapter = new IBHeatmapAdapter({ maxSnapshots: 500 });
    this.footprintAdapter = new IBFootprintAdapter();
  }

  static getInstance(): ReplayEngine {
    if (!ReplayEngine.instance) {
      ReplayEngine.instance = new ReplayEngine();
    }
    return ReplayEngine.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load a recorded session for replay.
   */
  async loadSession(sessionId: string): Promise<void> {
    this.stop();
    this.updateState({ status: 'loading', sessionId });

    const recorder = getReplayRecorder();
    await recorder.init();

    // Load session metadata
    const sessions = await recorder.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Load all data
    const [trades, depth] = await Promise.all([
      recorder.getSessionTrades(sessionId),
      recorder.getSessionDepth(sessionId),
    ]);

    // Sort by timestamp
    trades.sort((a, b) => a.timestamp - b.timestamp);
    depth.sort((a, b) => a.timestamp - b.timestamp);

    this.trades = trades;
    this.depthSnapshots = depth;

    // Configure adapters for the symbol (supports CME + crypto)
    const contract = getContractForSymbol(session.symbol);
    this.heatmapAdapter.setContract(contract);
    this.footprintAdapter.setContract(contract);

    const startTime = Math.min(
      trades[0]?.timestamp || Infinity,
      depth[0]?.timestamp || Infinity,
    );
    const endTime = Math.max(
      trades[trades.length - 1]?.timestamp || 0,
      depth[depth.length - 1]?.timestamp || 0,
    );

    this.updateState({
      status: 'paused',
      symbol: session.symbol,
      currentTime: startTime,
      startTime,
      endTime,
      progress: 0,
      tradeIndex: 0,
      depthIndex: 0,
      totalTrades: trades.length,
      totalDepthSnapshots: depth.length,
      tradeFedCount: 0,
    });

    console.log(`[ReplayEngine] Loaded session: ${trades.length} trades, ${depth.length} depth snapshots, ${Math.round((endTime - startTime) / 1000)}s duration`);
  }

  /**
   * Start or resume playback.
   */
  play(): void {
    if (this.state.status === 'loading' || this.state.status === 'idle') return;
    if (this.state.status === 'finished') {
      // Restart from beginning
      this.seek(0);
    }

    this.updateState({ status: 'playing' });
    this.lastFrameTime = performance.now();
    this.tick();
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (this.state.status !== 'playing') return;
    cancelAnimationFrame(this.rafId);
    this.updateState({ status: 'paused' });
  }

  /**
   * Stop and reset.
   */
  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.trades = [];
    this.depthSnapshots = [];
    this.heatmapAdapter.reset();
    this.footprintAdapter.reset();
    this.updateState({
      status: 'idle',
      sessionId: null,
      symbol: '',
      currentTime: 0,
      startTime: 0,
      endTime: 0,
      progress: 0,
      tradeIndex: 0,
      depthIndex: 0,
      totalTrades: 0,
      totalDepthSnapshots: 0,
      tradeFedCount: 0,
    });
  }

  /**
   * Seek to a position (0-1 progress).
   */
  seek(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const targetTime = this.state.startTime + p * (this.state.endTime - this.state.startTime);

    // Reset adapters
    this.heatmapAdapter.reset();
    this.footprintAdapter.reset();

    // Find new indices
    let tradeIdx = 0;
    let depthIdx = 0;

    // Fast-forward: feed all data up to targetTime
    // For trades, feed them all to build the footprint state
    while (tradeIdx < this.trades.length && this.trades[tradeIdx].timestamp <= targetTime) {
      const t = this.trades[tradeIdx];
      this.heatmapAdapter.feedTrade({
        price: t.price,
        size: t.size,
        side: t.side,
        timestamp: t.timestamp,
        symbol: this.state.symbol,
        exchange: 'REPLAY',
      });
      this.footprintAdapter.processTrade({
        price: t.price,
        size: t.size,
        side: t.side,
        timestamp: t.timestamp,
        symbol: this.state.symbol,
        exchange: 'REPLAY',
      });
      tradeIdx++;
    }

    // For depth, only feed the last ~50 to build the heatmap view
    while (depthIdx < this.depthSnapshots.length && this.depthSnapshots[depthIdx].timestamp <= targetTime) {
      depthIdx++;
    }
    const depthStart = Math.max(0, depthIdx - 50);
    for (let i = depthStart; i < depthIdx; i++) {
      const d = this.depthSnapshots[i];
      this.heatmapAdapter.feedDepth({
        symbol: this.state.symbol,
        timestamp: d.timestamp,
        bids: d.bids.map((b, idx) => ({ position: idx, price: b.price, size: b.size, numOrders: 1 })),
        asks: d.asks.map((a, idx) => ({ position: idx, price: a.price, size: a.size, numOrders: 1 })),
      });
    }

    this.updateState({
      currentTime: targetTime,
      progress: p,
      tradeIndex: tradeIdx,
      depthIndex: depthIdx,
      tradeFedCount: tradeIdx,
    });
  }

  /**
   * Set playback speed (0.25x to 10x).
   */
  setSpeed(speed: number): void {
    this.updateState({ speed: Math.max(0.25, Math.min(14400, speed)) });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER DATA ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  getHeatmapRenderData(width: number, height: number): RenderData {
    return this.heatmapAdapter.toRenderData(width, height);
  }

  getFootprintCandles() {
    return this.footprintAdapter.getCandles();
  }

  getCurrentPrice(): number {
    return this.heatmapAdapter.getCurrentPrice();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  getState(): ReplayState {
    return { ...this.state };
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.state);
    return () => this.statusCallbacks.delete(callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL TICK LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  private tick = (): void => {
    if (this.state.status !== 'playing') return;

    const now = performance.now();
    const realDeltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Scale delta by playback speed
    const replayDeltaMs = realDeltaMs * this.state.speed;
    const newTime = this.state.currentTime + replayDeltaMs;

    // Feed trades up to newTime
    let tradeIdx = this.state.tradeIndex;
    let tradeFed = this.state.tradeFedCount;
    while (tradeIdx < this.trades.length && this.trades[tradeIdx].timestamp <= newTime) {
      const t = this.trades[tradeIdx];
      this.heatmapAdapter.feedTrade({
        price: t.price,
        size: t.size,
        side: t.side,
        timestamp: t.timestamp,
        symbol: this.state.symbol,
        exchange: 'REPLAY',
      });
      this.footprintAdapter.processTrade({
        price: t.price,
        size: t.size,
        side: t.side,
        timestamp: t.timestamp,
        symbol: this.state.symbol,
        exchange: 'REPLAY',
      });
      tradeIdx++;
      tradeFed++;
    }

    // Feed depth snapshots up to newTime
    let depthIdx = this.state.depthIndex;
    while (depthIdx < this.depthSnapshots.length && this.depthSnapshots[depthIdx].timestamp <= newTime) {
      const d = this.depthSnapshots[depthIdx];
      this.heatmapAdapter.feedDepth({
        symbol: this.state.symbol,
        timestamp: d.timestamp,
        bids: d.bids.map((b, i) => ({ position: i, price: b.price, size: b.size, numOrders: 1 })),
        asks: d.asks.map((a, i) => ({ position: i, price: a.price, size: a.size, numOrders: 1 })),
      });
      depthIdx++;
    }

    // Calculate progress
    const duration = this.state.endTime - this.state.startTime;
    const progress = duration > 0 ? (newTime - this.state.startTime) / duration : 1;

    // Check if finished
    if (tradeIdx >= this.trades.length && depthIdx >= this.depthSnapshots.length) {
      this.updateState({
        status: 'finished',
        currentTime: this.state.endTime,
        progress: 1,
        tradeIndex: tradeIdx,
        depthIndex: depthIdx,
        tradeFedCount: tradeFed,
      });
      return;
    }

    this.updateState({
      currentTime: newTime,
      progress: Math.min(1, progress),
      tradeIndex: tradeIdx,
      depthIndex: depthIdx,
      tradeFedCount: tradeFed,
    });

    this.rafId = requestAnimationFrame(this.tick);
  };

  private updateState(partial: Partial<ReplayState>): void {
    this.state = { ...this.state, ...partial };
    this.statusCallbacks.forEach(cb => cb(this.state));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

export function getReplayEngine(): ReplayEngine {
  return ReplayEngine.getInstance();
}
