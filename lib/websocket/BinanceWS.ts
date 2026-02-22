import { wsManager } from './WebSocketManager';
import type { Candle, Trade } from '@/types/market';
import type { OrderbookUpdate } from '@/types/orderbook';

const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/stream';
const BINANCE_SPOT_WS = 'wss://stream.binance.com:9443/stream';

export type BinanceStreamType = 'kline' | 'depth' | 'aggTrade' | 'trade' | 'bookTicker';
export type BinanceMarket = 'futures' | 'spot';

interface BinanceKlineMessage {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    o: string; // Open
    c: string; // Close
    h: string; // High
    l: string; // Low
    v: string; // Base volume
    x: boolean; // Is closed
  };
}

interface BinanceAggTradeMessage {
  e: 'aggTrade';
  E: number;
  s: string;
  a: number; // Aggregate trade ID
  p: string; // Price
  q: string; // Quantity
  f: number; // First trade ID
  l: number; // Last trade ID
  T: number; // Trade time
  m: boolean; // Is buyer maker
}

interface BinanceDepthMessage {
  e: 'depthUpdate';
  E: number;
  s: string;
  U: number; // First update ID
  u: number; // Final update ID
  b: [string, string][]; // Bids [price, qty]
  a: [string, string][]; // Asks [price, qty]
}

interface BinanceStreamMessage {
  stream: string;
  data: BinanceKlineMessage | BinanceAggTradeMessage | BinanceDepthMessage;
}

type KlineHandler = (candle: Candle, isClosed: boolean) => void;
type TradeHandler = (trade: Trade) => void;
type DepthHandler = (update: OrderbookUpdate) => void;

class BinanceWebSocket {
  private static instance: BinanceWebSocket;
  private subscriptions: Map<string, Set<string>> = new Map(); // exchangeId -> streams
  private klineHandlers: Map<string, Set<KlineHandler>> = new Map();
  private tradeHandlers: Map<string, Set<TradeHandler>> = new Map();
  private depthHandlers: Map<string, Set<DepthHandler>> = new Map();
  private messageUnsubscribers: Map<string, () => void> = new Map(); // exchangeId -> unsub fn
  private subRequestId = 1; // Incrementing ID for SUBSCRIBE/UNSUBSCRIBE requests

  private constructor() {}

  static getInstance(): BinanceWebSocket {
    if (!BinanceWebSocket.instance) {
      BinanceWebSocket.instance = new BinanceWebSocket();
    }
    return BinanceWebSocket.instance;
  }

  connect(market: BinanceMarket = 'futures'): void {
    const exchangeId = `binance-${market}`;
    const status = wsManager.getStatus(exchangeId);

    // Already connected or connecting
    if (status === 'connected' || status === 'connecting') return;

    this.connectWithCurrentStreams(market);
  }

  disconnect(market: BinanceMarket = 'futures'): void {
    const exchangeId = `binance-${market}`;
    wsManager.disconnect(exchangeId);
  }

  subscribeKline(
    symbol: string,
    interval: string,
    handler: KlineHandler,
    market: BinanceMarket = 'futures'
  ): () => void {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    const exchangeId = `binance-${market}`;

    if (!this.klineHandlers.has(stream)) {
      this.klineHandlers.set(stream, new Set());
    }
    this.klineHandlers.get(stream)!.add(handler);

    this.addStreamDynamic(exchangeId, stream, market);

    return () => {
      this.klineHandlers.get(stream)?.delete(handler);
      if (this.klineHandlers.get(stream)?.size === 0) {
        this.removeStreamDynamic(exchangeId, stream, market);
      }
    };
  }

  subscribeTrades(
    symbol: string,
    handler: TradeHandler,
    market: BinanceMarket = 'futures'
  ): () => void {
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    const exchangeId = `binance-${market}`;

    if (!this.tradeHandlers.has(stream)) {
      this.tradeHandlers.set(stream, new Set());
    }
    this.tradeHandlers.get(stream)!.add(handler);

    this.addStreamDynamic(exchangeId, stream, market);

    return () => {
      this.tradeHandlers.get(stream)?.delete(handler);
      if (this.tradeHandlers.get(stream)?.size === 0) {
        this.removeStreamDynamic(exchangeId, stream, market);
      }
    };
  }

  subscribeDepth(
    symbol: string,
    handler: DepthHandler,
    market: BinanceMarket = 'futures',
    updateSpeed: '100ms' | '250ms' | '500ms' = '100ms'
  ): () => void {
    const stream = `${symbol.toLowerCase()}@depth@${updateSpeed}`;
    const exchangeId = `binance-${market}`;

    if (!this.depthHandlers.has(stream)) {
      this.depthHandlers.set(stream, new Set());
    }
    this.depthHandlers.get(stream)!.add(handler);

    this.addStreamDynamic(exchangeId, stream, market);

    return () => {
      this.depthHandlers.get(stream)?.delete(handler);
      if (this.depthHandlers.get(stream)?.size === 0) {
        this.removeStreamDynamic(exchangeId, stream, market);
      }
    };
  }

  /**
   * Add a stream dynamically. If not connected, connect with the stream.
   * If already connected, send SUBSCRIBE over the existing connection (no reconnect).
   */
  private addStreamDynamic(exchangeId: string, stream: string, market: BinanceMarket): void {
    if (!this.subscriptions.has(exchangeId)) {
      this.subscriptions.set(exchangeId, new Set());
    }
    const streams = this.subscriptions.get(exchangeId)!;

    // Already subscribed to this stream
    if (streams.has(stream)) return;

    streams.add(stream);

    const status = wsManager.getStatus(exchangeId);
    if (status === 'connected') {
      // Send SUBSCRIBE command over existing connection - no disconnect needed
      wsManager.send(exchangeId, {
        method: 'SUBSCRIBE',
        params: [stream],
        id: this.subRequestId++,
      });
    } else if (status !== 'connecting') {
      // Not connected yet, do initial connection
      this.connectWithCurrentStreams(market);
    }
  }

  /**
   * Remove a stream dynamically. Send UNSUBSCRIBE over existing connection.
   */
  private removeStreamDynamic(exchangeId: string, stream: string, market: BinanceMarket): void {
    const streams = this.subscriptions.get(exchangeId);
    if (!streams) return;

    streams.delete(stream);

    if (streams.size === 0) {
      wsManager.disconnect(exchangeId);
      return;
    }

    const status = wsManager.getStatus(exchangeId);
    if (status === 'connected') {
      // Send UNSUBSCRIBE command - no reconnect needed
      wsManager.send(exchangeId, {
        method: 'UNSUBSCRIBE',
        params: [stream],
        id: this.subRequestId++,
      });
    }
  }

  /**
   * Initial connection with all current streams in the URL.
   * Only called when there's no active connection.
   */
  private connectWithCurrentStreams(market: BinanceMarket): void {
    const exchangeId = `binance-${market}`;
    const baseUrl = market === 'futures' ? BINANCE_FUTURES_WS : BINANCE_SPOT_WS;
    const streams = this.subscriptions.get(exchangeId);

    if (!streams || streams.size === 0) return;

    const streamList = Array.from(streams).join('/');
    const url = `${baseUrl}?streams=${streamList}`;

    // Unsubscribe previous message handler
    this.messageUnsubscribers.get(exchangeId)?.();
    this.messageUnsubscribers.delete(exchangeId);

    wsManager.connect(exchangeId, url, () => {
      console.log(`[Binance ${market}] Connected with ${streams.size} streams`);
    });

    const unsub = wsManager.subscribe(exchangeId, '*', (data) => {
      this.handleMessage(data as BinanceStreamMessage);
    });
    this.messageUnsubscribers.set(exchangeId, unsub);
  }

  private handleMessage(message: BinanceStreamMessage): void {
    if (!message.stream || !message.data) return;

    const { stream, data } = message;

    if (data.e === 'kline') {
      this.handleKlineMessage(stream, data as BinanceKlineMessage);
    } else if (data.e === 'aggTrade') {
      this.handleAggTradeMessage(stream, data as BinanceAggTradeMessage);
    } else if (data.e === 'depthUpdate') {
      this.handleDepthMessage(stream, data as BinanceDepthMessage);
    }
  }

  private handleKlineMessage(stream: string, data: BinanceKlineMessage): void {
    const handlers = this.klineHandlers.get(stream);
    if (!handlers) return;

    const candle: Candle = {
      time: Math.floor(data.k.t / 1000), // Convert to seconds
      open: parseFloat(data.k.o),
      high: parseFloat(data.k.h),
      low: parseFloat(data.k.l),
      close: parseFloat(data.k.c),
      volume: parseFloat(data.k.v),
    };

    handlers.forEach((handler) => handler(candle, data.k.x));
  }

  private handleAggTradeMessage(stream: string, data: BinanceAggTradeMessage): void {
    const handlers = this.tradeHandlers.get(stream);
    if (!handlers) return;

    const trade: Trade = {
      id: data.a.toString(),
      price: parseFloat(data.p),
      quantity: parseFloat(data.q),
      time: data.T,
      isBuyerMaker: data.m,
    };

    handlers.forEach((handler) => handler(trade));
  }

  private handleDepthMessage(stream: string, data: BinanceDepthMessage): void {
    const update: OrderbookUpdate = {
      eventType: 'depthUpdate',
      eventTime: data.E,
      symbol: data.s,
      firstUpdateId: data.U,
      finalUpdateId: data.u,
      bids: data.b,
      asks: data.a,
    };

    // Try exact match first (O(1) instead of scanning all handlers)
    const handlers = this.depthHandlers.get(stream);
    if (handlers) {
      handlers.forEach((handler) => handler(update));
      return;
    }

    // Fallback: try matching with different speed suffixes
    const baseStream = stream.split('@').slice(0, 2).join('@');
    for (const [key, h] of this.depthHandlers) {
      if (key.startsWith(baseStream)) {
        h.forEach((handler) => handler(update));
        return;
      }
    }
  }
}

export const binanceWS = BinanceWebSocket.getInstance();
export default BinanceWebSocket;
