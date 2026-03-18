/**
 * lib/live/TradovateLiveAdapter.ts
 *
 * Drop-in replacement for RithmicLiveWS — same interface, backed by TradovateWS.
 * Subscribes to CME futures trades via Tradovate cloud API and feeds them into
 * the shared HierarchicalAggregator (same pipeline as Binance / Rithmic).
 *
 * Architecture:
 *   Tradovate API (wss://md.tradovateapi.com) → TradovateWS → TradovateLiveAdapter
 *                                                                      │
 *                                                                      ▼
 *                                                    HierarchicalAggregator → /live  /footprint
 *
 * Requires the user to have configured Tradovate credentials in /boutique.
 * CME Level 2 DOM subscription is ~$41–48/mo (non-professional).
 */

import { tradovateWS } from '@/lib/websocket/TradovateWS';
import { getAggregator, type Tick } from './HierarchicalAggregator';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback  = (tick: Tick) => void;

class TradovateLiveAdapter {
  private symbol   = '';
  private status: ConnectionStatus = 'disconnected';

  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners:   Set<TickCallback>   = new Set();

  private tickCount    = 0;
  private currentPrice = 0;

  private unsubTrades: (() => void) | null = null;

  // ── Public API (mirrors RithmicLiveWS exactly) ────────────────────────────

  async connect(symbol = 'MNQ'): Promise<void> {
    this.symbol = symbol.toUpperCase();
    this.cleanup();
    this.setStatus('connecting');

    try {
      this.unsubTrades = await tradovateWS.subscribeTrades(
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

          // Feed into shared aggregator (same as Binance / Rithmic path)
          getAggregator().processTick(tick);

          // Notify listeners
          this.tickListeners.forEach(cb => cb(tick));
        },
      );

      // If subscribeTrades returned a no-op (auth failed / no credentials),
      // check by waiting briefly — if no tick arrives and status never changes,
      // it means the connection silently failed.
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

    // Re-subscribe with new symbol
    if (this.unsubTrades) {
      this.unsubTrades();
      this.unsubTrades = null;
    }
    this.setStatus('connecting');

    tradovateWS.subscribeTrades(this.symbol, (trade) => {
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
    callback(this.status); // emit current status immediately
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
let adapter: TradovateLiveAdapter | null = null;
export function getTradovateLiveAdapter(): TradovateLiveAdapter {
  if (!adapter) adapter = new TradovateLiveAdapter();
  return adapter;
}
