/**
 * RITHMIC LIVE WS ADAPTER
 *
 * Drop-in replacement for IBLiveWS — same interface, backed by RithmicClient.
 * Connects to the local Python bridge at ws://localhost:8765 and feeds
 * classified CME trades into HierarchicalAggregator (same pipeline as Binance).
 *
 * Architecture:
 *   Python Bridge (ws://8765) → RithmicClient → RithmicLiveWS → HierarchicalAggregator
 *                                                                        │
 *                                                                        ▼
 *                                                               /live  /footprint
 */

import { getRithmicClient, type ClassifiedTrade } from '@/lib/rithmic/RithmicClient';
import { getAggregator, type Tick } from './HierarchicalAggregator';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback = (tick: Tick) => void;

class RithmicLiveWS {
  private symbol: string = '';
  private status: ConnectionStatus = 'disconnected';

  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners: Set<TickCallback> = new Set();

  private tickCount = 0;
  private lastTickTime = 0;
  private currentPrice = 0;

  private cleanupFns: (() => void)[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API  (mirrors IBLiveWS exactly)
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(symbol: string = 'MNQ'): Promise<void> {
    this.symbol = symbol.toUpperCase();
    this.setStatus('connecting');

    const client = getRithmicClient();

    // Clean up any previous subscriptions
    this.cleanup();

    // Map Rithmic status → our ConnectionStatus
    const unsubStatus = client.onStatus((rStatus) => {
      const mapped: ConnectionStatus =
        rStatus === 'connected'    ? 'connected'    :
        rStatus === 'connecting'   ? 'connecting'   :
        rStatus === 'error'        ? 'error'        :
        'disconnected';
      this.setStatus(mapped);
    });
    this.cleanupFns.push(unsubStatus);

    // Subscribe to trades for this symbol
    const unsubTrades = client.subscribeTrades(this.symbol, (trade: ClassifiedTrade) => {
      const tick: Tick = {
        price: trade.price,
        quantity: trade.size,
        timestamp: trade.timestamp,
        // isBuyerMaker = true means buyer was passive = sell aggressor hit bid
        isBuyerMaker: trade.side === 'BID',
      };

      this.tickCount++;
      this.lastTickTime = Date.now();
      this.currentPrice = tick.price;

      // Feed into shared aggregator (same as Binance / IB path)
      getAggregator().processTick(tick);

      // Notify listeners
      this.tickListeners.forEach(cb => cb(tick));
    });
    this.cleanupFns.push(unsubTrades);

    // Connect the underlying WebSocket (idempotent — safe to call multiple times)
    client.connect();
  }

  disconnect(): void {
    this.cleanup();
    this.setStatus('disconnected');
    // Do not call client.disconnect() — singleton is shared across pages
  }

  changeSymbol(symbol: string): void {
    const newSymbol = symbol.toUpperCase();
    if (newSymbol === this.symbol) return;

    // Reset aggregator for clean slate
    getAggregator().reset();

    this.symbol = newSymbol;
    this.tickCount = 0;

    // Re-subscribe to new symbol
    const client = getRithmicClient();
    const unsubTrades = client.subscribeTrades(this.symbol, (trade: ClassifiedTrade) => {
      const tick: Tick = {
        price: trade.price,
        quantity: trade.size,
        timestamp: trade.timestamp,
        isBuyerMaker: trade.side === 'BID',
      };

      this.tickCount++;
      this.lastTickTime = Date.now();
      this.currentPrice = tick.price;

      getAggregator().processTick(tick);
      this.tickListeners.forEach(cb => cb(tick));
    });

    // Replace previous trade subscription
    this.cleanupFns = this.cleanupFns.filter(fn => fn !== unsubTrades);
    this.cleanupFns.push(unsubTrades);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    // Emit current status immediately (mirrors IBLiveWS behaviour)
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  onTick(callback: TickCallback): () => void {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  getStatus(): ConnectionStatus { return this.status; }
  getSymbol(): string { return this.symbol; }
  getTickCount(): number { return this.tickCount; }
  getLastTickTime(): number { return this.lastTickTime; }
  getCurrentPrice(): number { return this.currentPrice; }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNALS
  // ═══════════════════════════════════════════════════════════════════════════

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  private cleanup(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let wsInstance: RithmicLiveWS | null = null;

export function getRithmicLiveWS(): RithmicLiveWS {
  if (!wsInstance) {
    wsInstance = new RithmicLiveWS();
  }
  return wsInstance;
}

export type { ConnectionStatus, Tick };
