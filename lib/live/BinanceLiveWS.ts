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

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback = (tick: Tick) => void;

/**
 * Gestionnaire WebSocket Binance Live
 */
class BinanceLiveWS {
  private ws: WebSocket | null = null;
  private symbol: string = 'btcusdt';
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Callbacks
  private statusListeners: Set<StatusCallback> = new Set();
  private tickListeners: Set<TickCallback> = new Set();

  // Stats
  private tickCount = 0;
  private lastTickTime = 0;

  /**
   * Connecte au stream Binance
   */
  connect(symbol: string = 'btcusdt'): void {
    this.symbol = symbol.toLowerCase();
    this.doConnect();
  }

  /**
   * Effectue la connexion WebSocket
   */
  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus('connecting');

    // URL du stream aggTrade
    const wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}@aggTrade`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[Binance WS] Connected to ${this.symbol}`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.tickCount = 0;
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Binance WS] Error:', error);
        this.setStatus('error');
      };

      this.ws.onclose = (event) => {
        console.log(`[Binance WS] Closed: ${event.code} ${event.reason}`);
        this.setStatus('disconnected');
        this.attemptReconnect();
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

        // Notifie les listeners
        this.tickListeners.forEach(cb => cb(tick));
      }
    } catch (error) {
      console.error('[Binance WS] Parse error:', error);
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
    console.log(`[Binance WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  /**
   * Déconnecte du stream
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
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

export type { ConnectionStatus, Tick };
