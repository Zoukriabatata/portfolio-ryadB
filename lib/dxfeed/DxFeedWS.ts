/**
 * DXFEED WEBSOCKET CLIENT
 *
 * FREE real-time data for CME futures with 15-minute delay
 * Professional-grade data quality
 *
 * Symbols (dxFeed format):
 * - /NQ  → E-mini Nasdaq 100
 * - /ES  → E-mini S&P 500
 * - /YM  → E-mini Dow
 * - /RTY → E-mini Russell 2000
 * - /GC  → Gold
 * - /CL  → Crude Oil
 *
 * Note: 15-minute delayed data - perfect for analysis/learning
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DxFeedQuote {
  symbol: string;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  time: number;
}

export interface DxFeedTrade {
  symbol: string;
  price: number;
  size: number;
  time: number;
  exchangeCode: string;
  aggressorSide: 'BUY' | 'SELL' | 'UNDEFINED';
}

export interface DxFeedCandle {
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type TradeCallback = (trade: DxFeedTrade) => void;
type QuoteCallback = (quote: DxFeedQuote) => void;
type CandleCallback = (candle: DxFeedCandle) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

// Map our generic symbols to dxFeed symbols
export const CME_TO_DXFEED: Record<string, string> = {
  // Index Futures (continuous front month)
  'NQ': '/NQ',
  'MNQ': '/MNQ',
  'ES': '/ES',
  'MES': '/MES',
  'YM': '/YM',
  'MYM': '/MYM',
  'RTY': '/RTY',
  'M2K': '/M2K',
  // Metals
  'GC': '/GC',
  'MGC': '/MGC',
  'SI': '/SI',
  // Energy
  'CL': '/CL',
  'MCL': '/MCL',
  'NG': '/NG',
};

// Tick sizes for CME futures
export const CME_TICK_SIZES: Record<string, number> = {
  'NQ': 0.25,
  'MNQ': 0.25,
  'ES': 0.25,
  'MES': 0.25,
  'YM': 1,
  'MYM': 1,
  'RTY': 0.1,
  'M2K': 0.1,
  'GC': 0.1,
  'MGC': 0.1,
  'SI': 0.005,
  'CL': 0.01,
  'MCL': 0.01,
  'NG': 0.001,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DXFEED WEBSOCKET CLIENT (via demo.dxfeed.com)
// ═══════════════════════════════════════════════════════════════════════════════

class DxFeedWebSocket {
  private static instance: DxFeedWebSocket;
  private ws: WebSocket | null = null;
  private connected = false;
  private tradeCallbacks: Map<string, Set<TradeCallback>> = new Map();
  private quoteCallbacks: Map<string, Set<QuoteCallback>> = new Map();
  private candleCallbacks: Map<string, Set<CandleCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private lastTrades: Map<string, DxFeedTrade> = new Map();
  private lastQuotes: Map<string, DxFeedQuote> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private authToken: string | null = null;

  private constructor() {}

  static getInstance(): DxFeedWebSocket {
    if (!DxFeedWebSocket.instance) {
      DxFeedWebSocket.instance = new DxFeedWebSocket();
    }
    return DxFeedWebSocket.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    this.emitStatus('connecting', 'Connecting to dxFeed...');
    console.log('[dxFeed WS] Connecting...');

    try {
      // dxFeed demo WebSocket endpoint (15-min delayed data)
      // Using the public demo feed
      this.ws = new WebSocket('wss://demo.dxfeed.com/webservice/cometd');

      return new Promise((resolve) => {
        if (!this.ws) {
          resolve(false);
          return;
        }

        this.ws.onopen = () => {
          console.log('[dxFeed WS] WebSocket opened, performing handshake...');
          this.performHandshake();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data, resolve);
        };

        this.ws.onerror = (error) => {
          console.error('[dxFeed WS] Error:', error);
          this.emitStatus('error', 'WebSocket error');
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log('[dxFeed WS] Disconnected');
          this.connected = false;
          this.stopHeartbeat();
          this.emitStatus('disconnected');
          this.scheduleReconnect();
        };

        // Timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            console.log('[dxFeed WS] Connection timeout');
            resolve(false);
          }
        }, 10000);
      });
    } catch (error) {
      console.error('[dxFeed WS] Connection failed:', error);
      this.emitStatus('error', 'Connection failed');
      this.scheduleReconnect();
      return false;
    }
  }

  private performHandshake(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // CometD handshake message
    const handshake = [{
      channel: '/meta/handshake',
      version: '1.0',
      supportedConnectionTypes: ['websocket'],
      advice: { timeout: 60000, interval: 0 },
    }];

    this.ws.send(JSON.stringify(handshake));
    console.log('[dxFeed WS] Handshake sent');
  }

  private handleMessage(data: string, connectResolve?: (value: boolean) => void): void {
    try {
      const messages = JSON.parse(data);

      for (const msg of messages) {
        // Handle handshake response
        if (msg.channel === '/meta/handshake') {
          if (msg.successful) {
            console.log('[dxFeed WS] Handshake successful');
            this.authToken = msg.clientId;
            this.sendConnect();
          } else {
            console.error('[dxFeed WS] Handshake failed:', msg);
            this.emitStatus('error', 'Handshake failed');
            connectResolve?.(false);
          }
        }
        // Handle connect response
        else if (msg.channel === '/meta/connect') {
          if (msg.successful) {
            if (!this.connected) {
              console.log('[dxFeed WS] Connected');
              this.connected = true;
              this.reconnectAttempts = 0;
              this.emitStatus('connected', 'Connected to dxFeed (15min delayed)');
              this.startHeartbeat();
              this.resubscribeAll();
              connectResolve?.(true);
            }
            // Send next connect (long polling)
            this.sendConnect();
          }
        }
        // Handle subscription response
        else if (msg.channel === '/meta/subscribe') {
          if (msg.successful) {
            console.log('[dxFeed WS] Subscribed to:', msg.subscription);
          } else {
            console.error('[dxFeed WS] Subscription failed:', msg);
          }
        }
        // Handle data messages
        else if (msg.channel?.startsWith('/service/')) {
          this.processDataMessage(msg);
        }
      }
    } catch (error) {
      console.error('[dxFeed WS] Failed to parse message:', error);
    }
  }

  private sendConnect(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) return;

    const connect = [{
      channel: '/meta/connect',
      clientId: this.authToken,
      connectionType: 'websocket',
    }];

    this.ws.send(JSON.stringify(connect));
  }

  private processDataMessage(msg: { channel: string; data?: Record<string, unknown> }): void {
    if (!msg.data) return;

    const data = msg.data as Record<string, unknown>;

    // Trade data
    if (msg.channel === '/service/timeSeriesData' || msg.channel === '/service/data') {
      if (data.eventType === 'Trade' || data.Trade) {
        const tradeData = (data.Trade || data) as Record<string, unknown>;
        const trade: DxFeedTrade = {
          symbol: String(tradeData.eventSymbol || data.eventSymbol || ''),
          price: Number(tradeData.price || 0),
          size: Number(tradeData.size || 0),
          time: Number(tradeData.time || Date.now()),
          exchangeCode: String(tradeData.exchangeCode || ''),
          aggressorSide: this.parseAggressorSide(tradeData.aggressorSide),
        };

        if (trade.symbol && trade.price > 0) {
          this.lastTrades.set(trade.symbol, trade);
          this.emitTrade(trade);
        }
      }

      // Quote data
      if (data.eventType === 'Quote' || data.Quote) {
        const quoteData = (data.Quote || data) as Record<string, unknown>;
        const quote: DxFeedQuote = {
          symbol: String(quoteData.eventSymbol || data.eventSymbol || ''),
          bidPrice: Number(quoteData.bidPrice || 0),
          askPrice: Number(quoteData.askPrice || 0),
          bidSize: Number(quoteData.bidSize || 0),
          askSize: Number(quoteData.askSize || 0),
          time: Number(quoteData.time || Date.now()),
        };

        if (quote.symbol && quote.bidPrice > 0) {
          this.lastQuotes.set(quote.symbol, quote);
          this.emitQuote(quote);
        }
      }

      // Candle data
      if (data.eventType === 'Candle' || data.Candle) {
        const candleData = (data.Candle || data) as Record<string, unknown>;
        const candle: DxFeedCandle = {
          symbol: String(candleData.eventSymbol || data.eventSymbol || ''),
          time: Number(candleData.time || Date.now()),
          open: Number(candleData.open || 0),
          high: Number(candleData.high || 0),
          low: Number(candleData.low || 0),
          close: Number(candleData.close || 0),
          volume: Number(candleData.volume || 0),
        };

        if (candle.symbol && candle.close > 0) {
          this.emitCandle(candle);
        }
      }
    }
  }

  private parseAggressorSide(side: unknown): 'BUY' | 'SELL' | 'UNDEFINED' {
    if (side === 'BUY' || side === 1) return 'BUY';
    if (side === 'SELL' || side === 2) return 'SELL';
    return 'UNDEFINED';
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendConnect();
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[dxFeed WS] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[dxFeed WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.authToken = null;
    this.tradeCallbacks.clear();
    this.quoteCallbacks.clear();
    this.emitStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  subscribeTrades(symbol: string, callback: TradeCallback): () => void {
    const dxSymbol = CME_TO_DXFEED[symbol] || symbol;

    if (!this.tradeCallbacks.has(symbol)) {
      this.tradeCallbacks.set(symbol, new Set());
    }
    this.tradeCallbacks.get(symbol)!.add(callback);

    if (this.connected) {
      this.sendSubscription('Trade', dxSymbol);
    }

    return () => {
      this.tradeCallbacks.get(symbol)?.delete(callback);
      if (this.tradeCallbacks.get(symbol)?.size === 0) {
        this.tradeCallbacks.delete(symbol);
        this.sendUnsubscription('Trade', dxSymbol);
      }
    };
  }

  subscribeQuotes(symbol: string, callback: QuoteCallback): () => void {
    const dxSymbol = CME_TO_DXFEED[symbol] || symbol;

    if (!this.quoteCallbacks.has(symbol)) {
      this.quoteCallbacks.set(symbol, new Set());
    }
    this.quoteCallbacks.get(symbol)!.add(callback);

    if (this.connected) {
      this.sendSubscription('Quote', dxSymbol);
    }

    return () => {
      this.quoteCallbacks.get(symbol)?.delete(callback);
      if (this.quoteCallbacks.get(symbol)?.size === 0) {
        this.quoteCallbacks.delete(symbol);
        this.sendUnsubscription('Quote', dxSymbol);
      }
    };
  }

  subscribeCandles(symbol: string, callback: CandleCallback): () => void {
    const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
    // Candle subscription format: /NQ{=1m} for 1-minute candles
    const candleSymbol = `${dxSymbol}{=1m}`;

    if (!this.candleCallbacks.has(symbol)) {
      this.candleCallbacks.set(symbol, new Set());
    }
    this.candleCallbacks.get(symbol)!.add(callback);

    if (this.connected) {
      this.sendSubscription('Candle', candleSymbol);
    }

    return () => {
      this.candleCallbacks.get(symbol)?.delete(callback);
      if (this.candleCallbacks.get(symbol)?.size === 0) {
        this.candleCallbacks.delete(symbol);
        this.sendUnsubscription('Candle', candleSymbol);
      }
    };
  }

  private sendSubscription(eventType: string, symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) return;

    const subscribe = [{
      channel: '/meta/subscribe',
      clientId: this.authToken,
      subscription: '/service/data',
      ext: {
        'com.devexperts.qd.dataextractor': {
          eventTypes: [eventType],
          symbols: [symbol],
        },
      },
    }];

    this.ws.send(JSON.stringify(subscribe));
    console.log(`[dxFeed WS] Subscribing to ${eventType} for ${symbol}`);
  }

  private sendUnsubscription(eventType: string, symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authToken) return;

    const unsubscribe = [{
      channel: '/meta/unsubscribe',
      clientId: this.authToken,
      subscription: '/service/data',
      ext: {
        'com.devexperts.qd.dataextractor': {
          eventTypes: [eventType],
          symbols: [symbol],
        },
      },
    }];

    this.ws.send(JSON.stringify(unsubscribe));
  }

  private resubscribeAll(): void {
    // Resubscribe to trades
    this.tradeCallbacks.forEach((_, symbol) => {
      const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
      this.sendSubscription('Trade', dxSymbol);
    });

    // Resubscribe to quotes
    this.quoteCallbacks.forEach((_, symbol) => {
      const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
      this.sendSubscription('Quote', dxSymbol);
    });

    // Resubscribe to candles
    this.candleCallbacks.forEach((_, symbol) => {
      const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
      this.sendSubscription('Candle', `${dxSymbol}{=1m}`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  private emitTrade(trade: DxFeedTrade): void {
    // Emit to specific symbol subscribers
    const symbol = this.getGenericSymbol(trade.symbol);
    this.tradeCallbacks.get(symbol)?.forEach(cb => cb(trade));
    // Also emit to dxFeed symbol subscribers
    this.tradeCallbacks.get(trade.symbol)?.forEach(cb => cb(trade));
  }

  private emitQuote(quote: DxFeedQuote): void {
    const symbol = this.getGenericSymbol(quote.symbol);
    this.quoteCallbacks.get(symbol)?.forEach(cb => cb(quote));
    this.quoteCallbacks.get(quote.symbol)?.forEach(cb => cb(quote));
  }

  private emitCandle(candle: DxFeedCandle): void {
    const symbol = this.getGenericSymbol(candle.symbol);
    this.candleCallbacks.get(symbol)?.forEach(cb => cb(candle));
    this.candleCallbacks.get(candle.symbol)?.forEach(cb => cb(candle));
  }

  private getGenericSymbol(dxSymbol: string): string {
    // Remove leading slash and any suffix
    const base = dxSymbol.replace(/^\//, '').replace(/\{.*\}$/, '');
    // Find in mapping
    for (const [generic, dx] of Object.entries(CME_TO_DXFEED)) {
      if (dx === `/${base}` || dx === dxSymbol) {
        return generic;
      }
    }
    return dxSymbol;
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string): void {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  isConnected(): boolean {
    return this.connected;
  }

  getLastTrade(symbol: string): DxFeedTrade | undefined {
    const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
    return this.lastTrades.get(dxSymbol);
  }

  getLastQuote(symbol: string): DxFeedQuote | undefined {
    const dxSymbol = CME_TO_DXFEED[symbol] || symbol;
    return this.lastQuotes.get(dxSymbol);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const dxFeedWS = DxFeedWebSocket.getInstance();

export function getDxFeedWS(): DxFeedWebSocket {
  return DxFeedWebSocket.getInstance();
}

export default DxFeedWebSocket;
