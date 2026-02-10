/**
 * BINANCE LIVE WEBSOCKET
 *
 * Connexion WebSocket à Binance pour recevoir les trades en temps réel.
 *
 * STREAMS UTILISÉS :
 * ==================
 *
 * 1. aggTrade : Trades agrégés (meilleur compromis débit/latence)
 *    - ws://stream.binance.com:9443/ws/btcusdt@aggTrade
 *    - Données : { p: price, q: quantity, T: timestamp, m: isBuyerMaker }
 *
 * 2. kline_1m : Bougies M1 (pour historique initial)
 *    - ws://stream.binance.com:9443/ws/btcusdt@kline_1m
 *
 * ARCHITECTURE :
 * ==============
 *
 * BinanceLiveWS ──► TickAggregator ──► LiveChart
 *     │                   │
 *     │ trades            │ candles 15s/30s/1m
 *     ▼                   ▼
 *   WebSocket          Events
 */

import { getAggregator, type Tick, type LiveCandle, type TimeframeSeconds } from './HierarchicalAggregator';
import type { MarkPriceUpdate, LiquidationEvent } from '@/types/futures';

type MarkPriceCallback = (update: MarkPriceUpdate) => void;
type LiquidationCallback = (event: LiquidationEvent) => void;

// Types pour les messages Binance
interface BinanceAggTrade {
  e: 'aggTrade';
  E: number;  // Event time
  s: string;  // Symbol
  a: number;  // Aggregate trade ID
  p: string;  // Price
  q: string;  // Quantity
  f: number;  // First trade ID
  l: number;  // Last trade ID
  T: number;  // Trade time
  m: boolean; // Is buyer maker
}

interface BinanceKline {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;  // Kline start time
    T: number;  // Kline close time
    s: string;  // Symbol
    i: string;  // Interval
    o: string;  // Open
    c: string;  // Close
    h: string;  // High
    l: string;  // Low
    v: string;  // Volume
    n: number;  // Number of trades
    x: boolean; // Is closed
  };
}

interface BinanceDepth {
  e: 'depthUpdate';
  E: number;  // Event time
  s: string;  // Symbol
  U: number;  // First update ID
  u: number;  // Final update ID
  b: [string, string][]; // Bids [price, qty]
  a: [string, string][]; // Asks [price, qty]
}

interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback = (tick: Tick) => void;
type DepthCallback = (depth: DepthSnapshot) => void;

/**
 * Gestionnaire WebSocket Binance Live
 */
class BinanceLiveWS {
  private ws: WebSocket | null = null;
  private symbol: string = 'btcusdt';
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // Increased from 5 to 10 for better resilience
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Reconnection tracking for auxiliary streams
  private depthReconnectAttempts = 0;
  private markPriceReconnectAttempts = 0;
  private liquidationReconnectAttempts = 0;
  private maxAuxReconnectAttempts = 8;

  // Callbacks
  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners: Set<TickCallback> = new Set();
  private depthListeners: Set<DepthCallback> = new Set();

  // Stats
  private tickCount = 0;
  private lastTickTime = 0;
  private currentPrice = 0;

  // Depth WebSocket
  private depthWs: WebSocket | null = null;
  private depthSnapshot: DepthSnapshot | null = null;

  // Mark Price WebSocket (futures stream)
  private markPriceWs: WebSocket | null = null;
  private markPriceListeners: Set<MarkPriceCallback> = new Set();

  // Liquidation WebSocket (futures stream)
  private liquidationWs: WebSocket | null = null;
  private liquidationListeners: Set<LiquidationCallback> = new Set();

  /**
   * Connecte au stream Binance
   */
  connect(symbol: string = 'btcusdt'): void {
    this.symbol = symbol.toLowerCase();
    this.intentionalDisconnect = false;
    this.depthSnapshot = null;
    this.doConnect();
    this.connectDepth();
    this.connectMarkPrice();
    this.connectLiquidation();
  }

  /**
   * Effectue la connexion WebSocket
   */
  private intentionalDisconnect = false;

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setStatus('connecting');

    // URL du stream aggTrade
    const wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@aggTrade`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.debug(`[Binance WS] Connected to ${this.symbol}`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.tickCount = 0;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        // WebSocket errors don't contain useful info in browsers
        // The actual error details come in the onclose event
        console.warn('[Binance WS] Connection error occurred - waiting for close event');
      };

      this.ws.onclose = (event) => {
        // Common close codes:
        // 1000 - Normal closure
        // 1001 - Going away (page unload)
        // 1006 - Abnormal closure (no close frame received) - usually network issue
        // 1015 - TLS handshake failure
        const reason = event.reason || this.getCloseReason(event.code);
        console.debug(`[Binance WS] Closed: ${event.code} - ${reason}`);

        if (event.code === 1006) {
          console.warn('[Binance WS] Network issue detected - check your internet connection');
        }

        this.setStatus('disconnected');
        if (!this.intentionalDisconnect) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      console.error('[Binance WS] Connection error:', error);
      this.setStatus('error');
      this.attemptReconnect();
    }
  }

  /**
   * Traite un message reçu
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as BinanceAggTrade;

      if (message.e === 'aggTrade') {
        const tick: Tick = {
          price: parseFloat(message.p),
          quantity: parseFloat(message.q),
          timestamp: message.T,
          isBuyerMaker: message.m,
        };

        this.tickCount++;
        this.lastTickTime = Date.now();

        // Envoie au agrégateur
        const aggregator = getAggregator();
        aggregator.processTick(tick);

        // Store current price
        this.currentPrice = tick.price;

        // Notifie les listeners
        this.tickListeners.forEach(cb => cb(tick));
      }
    } catch (error) {
      console.error('[Binance WS] Parse error:', error);
    }
  }

  /**
   * Connect to depth stream (order book)
   */
  private connectDepth(): void {
    if (this.depthWs?.readyState === WebSocket.OPEN || this.depthWs?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Depth stream URL (20 levels, 100ms updates)
    const depthUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@depth20@100ms`;

    try {
      this.depthWs = new WebSocket(depthUrl);

      this.depthWs.onopen = () => {
        console.debug(`[Binance Depth] Connected to ${this.symbol}`);
        this.depthReconnectAttempts = 0; // Reset on successful connection
      };

      this.depthWs.onmessage = (event) => {
        this.handleDepthMessage(event.data);
      };

      this.depthWs.onerror = () => {
        console.warn('[Binance Depth] Connection error');
      };

      this.depthWs.onclose = (event) => {
        console.debug(`[Binance Depth] Closed: ${this.getCloseReason(event.code)}`);
        if (!this.intentionalDisconnect) {
          this.attemptDepthReconnect();
        }
      };
    } catch (error) {
      console.error('[Binance Depth] Connection error:', error);
    }
  }

  /**
   * Handle depth message
   */
  private handleDepthMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Depth snapshot
      if (message.lastUpdateId) {
        this.depthSnapshot = {
          bids: message.bids || [],
          asks: message.asks || [],
          lastUpdateId: message.lastUpdateId,
        };

        // Notify listeners
        if (this.depthSnapshot) {
          this.depthListeners.forEach(cb => cb(this.depthSnapshot!));
        }
      }
    } catch (error) {
      console.error('[Binance Depth] Parse error:', error);
    }
  }

  /**
   * Connect to mark price stream (futures)
   */
  private connectMarkPrice(): void {
    if (this.markPriceWs?.readyState === WebSocket.OPEN || this.markPriceWs?.readyState === WebSocket.CONNECTING) return;

    const url = `wss://fstream.binance.com/ws/${this.symbol}@markPrice@1s`;

    try {
      this.markPriceWs = new WebSocket(url);

      this.markPriceWs.onopen = () => {
        console.debug(`[Binance MarkPrice] Connected to ${this.symbol}`);
        this.markPriceReconnectAttempts = 0; // Reset on successful connection
      };

      this.markPriceWs.onmessage = (event) => {
        this.handleMarkPriceMessage(event.data);
      };

      this.markPriceWs.onerror = () => {
        console.warn('[Binance MarkPrice] Connection error');
      };

      this.markPriceWs.onclose = (event) => {
        console.debug(`[Binance MarkPrice] Closed: ${this.getCloseReason(event.code)}`);
        if (!this.intentionalDisconnect) {
          this.attemptMarkPriceReconnect();
        }
      };
    } catch (error) {
      console.error('[Binance MarkPrice] Connection error:', error);
    }
  }

  /**
   * Handle mark price message
   */
  private handleMarkPriceMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.e === 'markPriceUpdate') {
        const update: MarkPriceUpdate = {
          symbol: msg.s,
          markPrice: parseFloat(msg.p),
          indexPrice: parseFloat(msg.i),
          fundingRate: parseFloat(msg.r),
          nextFundingTime: msg.T,
          estimatedSettlePrice: parseFloat(msg.P || '0'),
        };
        this.markPriceListeners.forEach(cb => cb(update));
      }
    } catch (error) {
      console.error('[Binance MarkPrice] Parse error:', error);
    }
  }

  /**
   * Connect to liquidation stream (futures)
   */
  private connectLiquidation(): void {
    if (this.liquidationWs?.readyState === WebSocket.OPEN || this.liquidationWs?.readyState === WebSocket.CONNECTING) return;

    const url = `wss://fstream.binance.com/ws/${this.symbol}@forceOrder`;

    try {
      this.liquidationWs = new WebSocket(url);

      this.liquidationWs.onopen = () => {
        console.debug(`[Binance Liquidation] Connected to ${this.symbol}`);
        this.liquidationReconnectAttempts = 0; // Reset on successful connection
      };

      this.liquidationWs.onmessage = (event) => {
        this.handleLiquidationMessage(event.data);
      };

      this.liquidationWs.onerror = () => {
        console.warn('[Binance Liquidation] Connection error');
      };

      this.liquidationWs.onclose = (event) => {
        console.debug(`[Binance Liquidation] Closed: ${this.getCloseReason(event.code)}`);
        if (!this.intentionalDisconnect) {
          this.attemptLiquidationReconnect();
        }
      };
    } catch (error) {
      console.error('[Binance Liquidation] Connection error:', error);
    }
  }

  /**
   * Handle liquidation message
   */
  private handleLiquidationMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.e === 'forceOrder') {
        const o = msg.o;
        const event: LiquidationEvent = {
          symbol: o.s,
          side: o.S,
          quantity: parseFloat(o.q),
          price: parseFloat(o.p),
          averagePrice: parseFloat(o.ap),
          status: o.X,
          lastFilledQty: parseFloat(o.l),
          cumulativeFilledQty: parseFloat(o.z),
          time: o.T,
        };
        this.liquidationListeners.forEach(cb => cb(event));
      }
    } catch (error) {
      console.error('[Binance Liquidation] Parse error:', error);
    }
  }

  /**
   * Tente une reconnexion
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Binance WS] Max reconnect attempts reached');
      this.setStatus('error');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    console.debug(`[Binance WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  /**
   * Attempt to reconnect depth stream with exponential backoff
   */
  private attemptDepthReconnect(): void {
    if (this.depthReconnectAttempts >= this.maxAuxReconnectAttempts) {
      console.error('[Binance Depth] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.depthReconnectAttempts);
    console.debug(`[Binance Depth] Reconnecting in ${delay}ms (attempt ${this.depthReconnectAttempts + 1})`);

    setTimeout(() => {
      this.depthReconnectAttempts++;
      this.connectDepth();
    }, delay);
  }

  /**
   * Attempt to reconnect mark price stream with exponential backoff
   */
  private attemptMarkPriceReconnect(): void {
    if (this.markPriceReconnectAttempts >= this.maxAuxReconnectAttempts) {
      console.error('[Binance MarkPrice] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.markPriceReconnectAttempts);
    console.debug(`[Binance MarkPrice] Reconnecting in ${delay}ms (attempt ${this.markPriceReconnectAttempts + 1})`);

    setTimeout(() => {
      this.markPriceReconnectAttempts++;
      this.connectMarkPrice();
    }, delay);
  }

  /**
   * Attempt to reconnect liquidation stream with exponential backoff
   */
  private attemptLiquidationReconnect(): void {
    if (this.liquidationReconnectAttempts >= this.maxAuxReconnectAttempts) {
      console.error('[Binance Liquidation] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.liquidationReconnectAttempts);
    console.debug(`[Binance Liquidation] Reconnecting in ${delay}ms (attempt ${this.liquidationReconnectAttempts + 1})`);

    setTimeout(() => {
      this.liquidationReconnectAttempts++;
      this.connectLiquidation();
    }, delay);
  }

  /**
   * Get human-readable close reason from code
   */
  private getCloseReason(code: number): string {
    const reasons: Record<number, string> = {
      1000: 'Normal closure',
      1001: 'Going away (page unload)',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1005: 'No status received',
      1006: 'Abnormal closure (network issue)',
      1007: 'Invalid data',
      1008: 'Policy violation',
      1009: 'Message too big',
      1010: 'Missing extension',
      1011: 'Internal error',
      1012: 'Service restart',
      1013: 'Try again later',
      1014: 'Bad gateway',
      1015: 'TLS handshake failure',
    };
    return reasons[code] || `Unknown (${code})`;
  }

  /**
   * Déconnecte du stream
   */
  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.depthWs) {
      this.depthWs.close();
      this.depthWs = null;
    }

    if (this.markPriceWs) {
      this.markPriceWs.close();
      this.markPriceWs = null;
    }

    if (this.liquidationWs) {
      this.liquidationWs.close();
      this.liquidationWs = null;
    }

    this.setStatus('disconnected');
  }

  /**
   * Change de symbole
   */
  changeSymbol(symbol: string): void {
    const newSymbol = symbol.toLowerCase();
    if (newSymbol === this.symbol) return;

    // Reset l'agrégateur
    getAggregator().reset();

    // Reconnecte avec le nouveau symbole
    this.disconnect();
    this.connect(newSymbol);
  }

  /**
   * Met à jour le status et notifie
   */
  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  /**
   * S'abonne aux changements de status
   */
  onStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    // Envoie le status actuel immédiatement
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  /**
   * S'abonne aux ticks
   */
  onTick(callback: TickCallback): () => void {
    this.tickListeners.add(callback);
    return () => this.tickListeners.delete(callback);
  }

  /**
   * S'abonne aux mises à jour du carnet d'ordres
   */
  onDepthUpdate(callback: DepthCallback): () => void {
    this.depthListeners.add(callback);
    // Send current snapshot if available
    if (this.depthSnapshot) {
      callback(this.depthSnapshot);
    }
    return () => this.depthListeners.delete(callback);
  }

  /**
   * S'abonne aux mises à jour du mark price
   */
  onMarkPrice(callback: MarkPriceCallback): () => void {
    this.markPriceListeners.add(callback);
    return () => this.markPriceListeners.delete(callback);
  }

  /**
   * S'abonne aux liquidations
   */
  onLiquidation(callback: LiquidationCallback): () => void {
    this.liquidationListeners.add(callback);
    return () => this.liquidationListeners.delete(callback);
  }

  /**
   * Getters
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSymbol(): string {
    return this.symbol.toUpperCase();
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
}

/**
 * Instance singleton
 */
let wsInstance: BinanceLiveWS | null = null;

export function getBinanceLiveWS(): BinanceLiveWS {
  if (!wsInstance) {
    wsInstance = new BinanceLiveWS();
  }
  return wsInstance;
}

export type { ConnectionStatus, Tick, DepthSnapshot, MarkPriceCallback, LiquidationCallback };
