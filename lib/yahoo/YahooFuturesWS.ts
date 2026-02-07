/**
 * YAHOO FINANCE FUTURES WEBSOCKET
 *
 * FREE real-time data for CME futures via Yahoo Finance WebSocket
 * No API key required!
 *
 * Symbols:
 * - NQ=F  → E-mini Nasdaq 100
 * - ES=F  → E-mini S&P 500
 * - YM=F  → E-mini Dow
 * - RTY=F → E-mini Russell 2000
 * - GC=F  → Gold
 * - SI=F  → Silver
 * - CL=F  → Crude Oil
 *
 * Note: Data has slight delay (1-3 seconds) vs exchange feed
 * Perfect for footprint charts and analysis, not HFT
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface YahooQuote {
  id: string;           // Symbol (e.g., "NQ=F")
  price: number;        // Last price
  time: number;         // Unix timestamp (ms)
  exchange: string;     // Exchange name
  quoteType: string;    // "FUTURE"
  marketHours: string;  // "REGULAR_MARKET", "PRE_MARKET", etc.
  changePercent: number;
  change: number;
  priceHint: number;
  vol24h?: number;      // 24h volume if available
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

export interface YahooPricingData {
  id: string;
  price: number;
  time: string;
  exchange: string;
  quoteType: string;
  marketHours: string;
  changePercent: number;
  change: number;
  priceHint: number;
  dayVolume?: string;
  dayHigh?: number;
  dayLow?: number;
  openPrice?: number;
}

type QuoteCallback = (quote: YahooQuote) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

// Map our generic symbols to Yahoo Finance symbols
export const CME_TO_YAHOO: Record<string, string> = {
  // Index Futures
  'NQ': 'NQ=F',
  'MNQ': 'NQ=F',    // Micro uses same price as full-size
  'ES': 'ES=F',
  'MES': 'ES=F',    // Micro uses same price as full-size
  'YM': 'YM=F',
  'RTY': 'RTY=F',
  // Metals
  'GC': 'GC=F',
  'MGC': 'GC=F',
  'SI': 'SI=F',
  // Energy
  'CL': 'CL=F',
  'NG': 'NG=F',
};

// Tick sizes for CME futures
export const CME_TICK_SIZES: Record<string, number> = {
  'NQ': 0.25,
  'MNQ': 0.25,
  'ES': 0.25,
  'MES': 0.25,
  'YM': 1,
  'RTY': 0.1,
  'GC': 0.1,
  'MGC': 0.1,
  'SI': 0.005,
  'CL': 0.01,
  'NG': 0.001,
};

// ═══════════════════════════════════════════════════════════════════════════════
// YAHOO WEBSOCKET CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

class YahooFuturesWebSocket {
  private static instance: YahooFuturesWebSocket;
  private ws: WebSocket | null = null;
  private connected = false;
  private subscriptions: Map<string, Set<QuoteCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private lastQuotes: Map<string, YahooQuote> = new Map();

  private constructor() {}

  static getInstance(): YahooFuturesWebSocket {
    if (!YahooFuturesWebSocket.instance) {
      YahooFuturesWebSocket.instance = new YahooFuturesWebSocket();
    }
    return YahooFuturesWebSocket.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.emitStatus('connecting');
    console.log('[Yahoo WS] Connecting...');

    try {
      // Yahoo Finance WebSocket endpoint
      this.ws = new WebSocket('wss://streamer.finance.yahoo.com/');

      this.ws.onopen = () => {
        console.log('[Yahoo WS] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emitStatus('connected');

        // Re-subscribe to all symbols
        this.resubscribeAll();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Yahoo WS] Error:', error);
        this.emitStatus('error');
      };

      this.ws.onclose = () => {
        console.log('[Yahoo WS] Disconnected');
        this.connected = false;
        this.emitStatus('disconnected');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[Yahoo WS] Connection failed:', error);
      this.emitStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Yahoo WS] Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[Yahoo WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.subscriptions.clear();
    this.emitStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(data: string): void {
    try {
      // Yahoo sends base64 encoded protobuf, but also JSON for some messages
      // Try to decode as base64 first
      const decoded = this.decodeMessage(data);
      if (!decoded) return;

      const quote = this.parseQuote(decoded);
      if (!quote) return;

      // Store last quote
      this.lastQuotes.set(quote.id, quote);

      // Notify subscribers
      // Check both the Yahoo symbol and our mapped symbols
      const callbacks = this.subscriptions.get(quote.id);
      if (callbacks) {
        callbacks.forEach(cb => cb(quote));
      }

      // Also notify subscribers using our generic symbol names
      Object.entries(CME_TO_YAHOO).forEach(([generic, yahoo]) => {
        if (yahoo === quote.id) {
          const genericCallbacks = this.subscriptions.get(generic);
          if (genericCallbacks) {
            genericCallbacks.forEach(cb => cb(quote));
          }
        }
      });
    } catch (error) {
      // Silently ignore parse errors (common with binary data)
    }
  }

  private decodeMessage(data: string): YahooPricingData | null {
    try {
      // Try base64 decode
      const decoded = atob(data);
      // Try to parse as JSON (Yahoo sometimes sends JSON)
      const json = JSON.parse(decoded);
      return json;
    } catch {
      try {
        // Direct JSON parse
        const json = JSON.parse(data);
        return json;
      } catch {
        // Binary protobuf - would need protobuf decoder
        // For now, we'll use the REST API fallback for historical data
        return null;
      }
    }
  }

  private parseQuote(data: YahooPricingData): YahooQuote | null {
    if (!data.id || !data.price) return null;

    return {
      id: data.id,
      price: data.price,
      time: data.time ? new Date(data.time).getTime() : Date.now(),
      exchange: data.exchange || 'CME',
      quoteType: data.quoteType || 'FUTURE',
      marketHours: data.marketHours || 'REGULAR_MARKET',
      changePercent: data.changePercent || 0,
      change: data.change || 0,
      priceHint: data.priceHint || 2,
      vol24h: data.dayVolume ? parseInt(data.dayVolume) : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  subscribe(symbol: string, callback: QuoteCallback): () => void {
    // Convert to Yahoo symbol if needed
    const yahooSymbol = CME_TO_YAHOO[symbol] || symbol;

    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(callback);

    // Connect if not connected
    if (!this.connected) {
      this.connect();
    }

    // Send subscription message
    this.sendSubscribe([yahooSymbol]);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(symbol)?.delete(callback);
      if (this.subscriptions.get(symbol)?.size === 0) {
        this.subscriptions.delete(symbol);
        this.sendUnsubscribe([yahooSymbol]);
      }
    };
  }

  private sendSubscribe(symbols: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({
      subscribe: symbols,
    });

    this.ws.send(message);
    console.log('[Yahoo WS] Subscribed to:', symbols);
  }

  private sendUnsubscribe(symbols: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({
      unsubscribe: symbols,
    });

    this.ws.send(message);
  }

  private resubscribeAll(): void {
    const allSymbols = new Set<string>();

    this.subscriptions.forEach((_, symbol) => {
      const yahooSymbol = CME_TO_YAHOO[symbol] || symbol;
      allSymbols.add(yahooSymbol);
    });

    if (allSymbols.size > 0) {
      this.sendSubscribe(Array.from(allSymbols));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLastQuote(symbol: string): YahooQuote | undefined {
    const yahooSymbol = CME_TO_YAHOO[symbol] || symbol;
    return this.lastQuotes.get(yahooSymbol);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const yahooFuturesWS = YahooFuturesWebSocket.getInstance();

export function getYahooFuturesWS(): YahooFuturesWebSocket {
  return YahooFuturesWebSocket.getInstance();
}

export default YahooFuturesWebSocket;
