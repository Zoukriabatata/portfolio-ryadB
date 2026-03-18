/**
 * lib/live/DxFeedLiveAdapter.ts
 *
 * Drop-in replacement for TradovateLiveAdapter — same interface, backed by dxFeedWS.
 * Subscribes to CME futures trades via the dxLink WebSocket protocol and feeds them
 * into the shared HierarchicalAggregator (same pipeline as Binance / Tradovate).
 *
 * Architecture:
 *   dxFeed cloud (wss://…/dxlink-ws) → DxFeedWS → DxFeedLiveAdapter
 *                                                         │
 *                                                         ▼
 *                                       HierarchicalAggregator → /live  /footprint
 *
 * Credentials are fetched automatically by DxFeedWS from /api/datafeed/credentials?provider=DXFEED.
 * dxFeed subscription: $29/mo for CME — no broker account required.
 */

import { dxFeedWS } from '@/lib/websocket/DxFeedWS';
import { getAggregator, type Tick } from './HierarchicalAggregator';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback   = (status: ConnectionStatus) => void;
type TickCallback     = (tick: Tick) => void;

class DxFeedLiveAdapter {
  private symbol   = '';
  private status: ConnectionStatus = 'disconnected';

  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners:   Set<TickCallback>   = new Set();

  private tickCount    = 0;
  private currentPrice = 0;

  private unsubTrades: (() => void) | null = null;

  // ── Public API (mirrors TradovateLiveAdapter exactly) ─────────────────────

  async connect(symbol = 'MNQ'): Promise<void> {
    this.symbol = symbol.toUpperCase();
    this.cleanup();
    this.setStatus('connecting');

    try {
      this.unsubTrades = await dxFeedWS.subscribeTrades(
        this.symbol,
        (trade) => {
          const tick: Tick = {
            price:        trade.price,
            quantity:     trade.quantity,
            timestamp:    trade.time,
            isBuyerMaker: trade.isBuyerMaker,
          };

          this.tickCount++;
          this.currentPrice = tick.price;

          getAggregator().processTick(tick);
          this.tickListeners.forEach(cb => cb(tick));
        },
      );

      this.setStatus('connected');
    } catch {
      this.setStatus('error');
    }
  }

  disconnect(): void {
    this.cleanup();
    this.setStatus('disconnected');
  }

  changeSymbol(symbol: string): void {
    const newSym = symbol.toUpperCase();
    if (newSym === this.symbol) return;
    this.symbol = newSym;
    this.tickCount = 0;
    getAggregator().reset();

    if (this.unsubTrades) {
      this.unsubTrades();
      this.unsubTrades = null;
    }
    this.setStatus('connecting');

    dxFeedWS.subscribeTrades(this.symbol, (trade) => {
      const tick: Tick = {
        price:        trade.price,
        quantity:     trade.quantity,
        timestamp:    trade.time,
        isBuyerMaker: trade.isBuyerMaker,
      };
      this.tickCount++;
      this.currentPrice = tick.price;
      getAggregator().processTick(tick);
      this.tickListeners.forEach(cb => cb(tick));
    }).then(unsub => {
      this.unsubTrades = unsub;
      this.setStatus('connected');
    }).catch(() => {
      this.setStatus('error');
    });
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  onTick(callback: TickCallback): () => void {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  getTickCount(): number { return this.tickCount; }
  getPrice():     number { return this.currentPrice; }

  // ── Internal ──────────────────────────────────────────────────────────────

  private cleanup(): void {
    if (this.unsubTrades) {
      this.unsubTrades();
      this.unsubTrades = null;
    }
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    this.statusListeners.forEach(cb => cb(s));
  }
}

// Singleton — shared across /footprint and /live
let adapter: DxFeedLiveAdapter | null = null;
export function getDxFeedLiveAdapter(): DxFeedLiveAdapter {
  if (!adapter) adapter = new DxFeedLiveAdapter();
  return adapter;
}
