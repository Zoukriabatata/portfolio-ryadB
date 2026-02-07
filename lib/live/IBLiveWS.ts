/**
 * IB LIVE WEBSOCKET ADAPTER
 *
 * Same interface as BinanceLiveWS but connects to IB Gateway
 * for CME futures real-time data.
 *
 * Architecture:
 *   IBLiveWS ──► IBConnectorClient ──► Gateway ──► IB TWS ──► CME
 *       │
 *       ▼
 *   HierarchicalAggregator (same as Binance flow)
 *
 * Usage:
 *   const ws = getIBLiveWS();
 *   ws.connect('NQ');
 *   ws.onTick(tick => { ... });
 *   ws.onStatus(status => { ... });
 */

import { IBConnectorClient, getIBConnector } from '@/lib/ib/IBConnectorClient';
import { getAggregator, type Tick } from './HierarchicalAggregator';
import type { GatewayConnectionStatus } from '@/types/ib-protocol';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback = (tick: Tick) => void;

const GATEWAY_URL = process.env.NEXT_PUBLIC_IB_GATEWAY_URL || 'ws://localhost:4000';

class IBLiveWS {
  private connector: IBConnectorClient;
  private symbol: string = '';
  private status: ConnectionStatus = 'disconnected';

  // Callbacks
  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners: Set<TickCallback> = new Set();

  // Stats
  private tickCount = 0;
  private lastTickTime = 0;
  private currentPrice = 0;

  // Cleanup
  private cleanupFns: (() => void)[] = [];
  private tokenFetched = false;
  private jwtToken: string = '';

  constructor() {
    this.connector = getIBConnector();
  }

  /**
   * Fetch JWT token from /api/ib/token
   */
  private async fetchToken(): Promise<string | null> {
    try {
      const res = await fetch('/api/ib/token');
      if (!res.ok) {
        // If not authenticated, use a fallback dev token
        console.warn('[IBLiveWS] Not authenticated, using dev mode');
        return 'dev-token';
      }
      const data = await res.json();
      return data.token || null;
    } catch {
      console.warn('[IBLiveWS] Failed to fetch token, using dev mode');
      return 'dev-token';
    }
  }

  /**
   * Connect to IB Gateway for a CME symbol
   */
  async connect(symbol: string = 'NQ'): Promise<void> {
    this.symbol = symbol.toUpperCase();
    this.setStatus('connecting');

    // Fetch JWT if not already done
    if (!this.tokenFetched) {
      const token = await this.fetchToken();
      if (!token) {
        this.setStatus('error');
        return;
      }
      this.jwtToken = token;
      this.tokenFetched = true;
    }

    // Wire up IB connector callbacks
    this.cleanup();

    // Trade callback → convert to Tick format for aggregator
    const unsubTrade = this.connector.onTrade((trade) => {
      const tick: Tick = {
        price: trade.price,
        quantity: trade.size,
        timestamp: trade.timestamp,
        isBuyerMaker: trade.side === 'BID',
      };

      this.tickCount++;
      this.lastTickTime = Date.now();
      this.currentPrice = tick.price;

      // Feed to aggregator
      const aggregator = getAggregator();
      aggregator.processTick(tick);

      // Notify listeners
      this.tickListeners.forEach(cb => cb(tick));
    });
    this.cleanupFns.push(unsubTrade);

    // Quote callback → update current price
    const unsubQuote = this.connector.onQuote((quote) => {
      if (quote.last) {
        this.currentPrice = quote.last;
      }
    });
    this.cleanupFns.push(unsubQuote);

    // Status callback → map IB statuses to simple statuses
    const unsubStatus = this.connector.onStatus((ibStatus) => {
      const mapped = this.mapStatus(ibStatus);
      this.setStatus(mapped);
    });
    this.cleanupFns.push(unsubStatus);

    // Connect and subscribe
    this.connector.connect(GATEWAY_URL, this.jwtToken);
    this.connector.subscribe('trades', this.symbol);
    this.connector.subscribe('quotes', this.symbol);
  }

  /**
   * Disconnect from IB Gateway
   */
  disconnect(): void {
    this.cleanup();
    // Don't disconnect the connector itself since it's a singleton
    // and might be used by other components (heatmap, footprint)
    this.connector.unsubscribe('trades', this.symbol);
    this.connector.unsubscribe('quotes', this.symbol);
    this.setStatus('disconnected');
  }

  /**
   * Change symbol
   */
  changeSymbol(symbol: string): void {
    const newSymbol = symbol.toUpperCase();
    if (newSymbol === this.symbol) return;

    // Reset aggregator
    getAggregator().reset();

    // Unsubscribe old
    this.connector.unsubscribe('trades', this.symbol);
    this.connector.unsubscribe('quotes', this.symbol);

    // Subscribe new
    this.symbol = newSymbol;
    this.connector.subscribe('trades', this.symbol);
    this.connector.subscribe('quotes', this.symbol);
    this.connector.changeSymbol(this.symbol);

    this.tickCount = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
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

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSymbol(): string {
    return this.symbol;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  getLastTickTime(): number {
    return this.lastTickTime;
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNALS
  // ═══════════════════════════════════════════════════════════════════════════

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  private mapStatus(ibStatus: GatewayConnectionStatus): ConnectionStatus {
    switch (ibStatus) {
      case 'connected': return 'connected';
      case 'connecting_ib':
      case 'authenticating': return 'connecting';
      case 'disconnected': return 'disconnected';
      case 'error': return 'error';
      default: return 'disconnected';
    }
  }

  private cleanup(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let wsInstance: IBLiveWS | null = null;

export function getIBLiveWS(): IBLiveWS {
  if (!wsInstance) {
    wsInstance = new IBLiveWS();
  }
  return wsInstance;
}

export type { ConnectionStatus, Tick };
