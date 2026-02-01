import { wsManager } from './WebSocketManager';
import type { Candle, Trade } from '@/types/market';
import type { OrderbookUpdate } from '@/types/orderbook';

// Bybit V5 WebSocket URLs
const BYBIT_LINEAR_WS = 'wss://stream.bybit.com/v5/public/linear'; // Perpetual futures
const BYBIT_SPOT_WS = 'wss://stream.bybit.com/v5/public/spot';

export type BybitMarket = 'linear' | 'spot';

interface BybitKlineMessage {
  topic: string;
  type: string;
  ts: number;
  data: Array<{
    start: number;
    end: number;
    interval: string;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    turnover: string;
    confirm: boolean;
    timestamp: number;
  }>;
}

interface BybitTradeMessage {
  topic: string;
  type: string;
  ts: number;
  data: Array<{
    T: number; // Timestamp
    s: string; // Symbol
    S: string; // Side: Buy/Sell
    v: string; // Volume
    p: string; // Price
    i: string; // Trade ID
  }>;
}

interface BybitOrderbookMessage {
  topic: string;
  type: string; // snapshot or delta
  ts: number;
  data: {
    s: string; // Symbol
    b: [string, string][]; // Bids [price, size]
    a: [string, string][]; // Asks [price, size]
    u: number; // Update ID
  };
}

interface BybitMessage {
  topic?: string;
  type?: string;
  op?: string;
  success?: boolean;
  ret_msg?: string;
  data?: unknown;
  ts?: number;
}

type KlineHandler = (candle: Candle, isClosed: boolean) => void;
type TradeHandler = (trade: Trade) => void;
type DepthHandler = (update: OrderbookUpdate) => void;

class BybitWebSocket {
  private static instance: BybitWebSocket;
  private klineHandlers: Map<string, Set<KlineHandler>> = new Map();
  private tradeHandlers: Map<string, Set<TradeHandler>> = new Map();
  private depthHandlers: Map<string, Set<DepthHandler>> = new Map();
  private subscribedTopics: Map<string, Set<string>> = new Map(); // exchangeId -> topics
  private pingInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): BybitWebSocket {
    if (!BybitWebSocket.instance) {
      BybitWebSocket.instance = new BybitWebSocket();
    }
    return BybitWebSocket.instance;
  }

  connect(market: BybitMarket = 'linear'): void {
    const exchangeId = `bybit-${market}`;
    const url = market === 'linear' ? BYBIT_LINEAR_WS : BYBIT_SPOT_WS;

    wsManager.connect(exchangeId, url, () => {
      console.log(`[Bybit ${market}] Connected`);

      // Subscribe to pending topics
      this.resubscribe(exchangeId);

      // Start ping interval (Bybit requires ping every 20s)
      this.startPing(exchangeId);
    });

    wsManager.subscribe(exchangeId, '*', (data) => {
      this.handleMessage(data as BybitMessage);
    });
  }

  disconnect(market: BybitMarket = 'linear'): void {
    const exchangeId = `bybit-${market}`;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    wsManager.disconnect(exchangeId);
  }

  private startPing(exchangeId: string): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = setInterval(() => {
      wsManager.send(exchangeId, { op: 'ping' });
    }, 18000); // Ping every 18 seconds
  }

  private resubscribe(exchangeId: string): void {
    const topics = this.subscribedTopics.get(exchangeId);
    if (topics && topics.size > 0) {
      const args = Array.from(topics);
      wsManager.send(exchangeId, {
        op: 'subscribe',
        args,
      });
    }
  }

  private addTopic(exchangeId: string, topic: string): void {
    if (!this.subscribedTopics.has(exchangeId)) {
      this.subscribedTopics.set(exchangeId, new Set());
    }
    this.subscribedTopics.get(exchangeId)!.add(topic);
  }

  private removeTopic(exchangeId: string, topic: string): void {
    this.subscribedTopics.get(exchangeId)?.delete(topic);
  }

  // Convert Binance-style interval to Bybit interval
  private convertInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1',
      '3m': '3',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '6h': '360',
      '12h': '720',
      '1d': 'D',
      '1w': 'W',
      '1M': 'M',
    };
    return map[interval] || '1';
  }

  subscribeKline(
    symbol: string,
    interval: string,
    handler: KlineHandler,
    market: BybitMarket = 'linear'
  ): () => void {
    const bybitInterval = this.convertInterval(interval);
    const topic = `kline.${bybitInterval}.${symbol.toUpperCase()}`;
    const exchangeId = `bybit-${market}`;

    this.addTopic(exchangeId, topic);

    if (!this.klineHandlers.has(topic)) {
      this.klineHandlers.set(topic, new Set());
    }
    this.klineHandlers.get(topic)!.add(handler);

    // Send subscribe message if connected
    wsManager.send(exchangeId, {
      op: 'subscribe',
      args: [topic],
    });

    return () => {
      this.klineHandlers.get(topic)?.delete(handler);
      if (this.klineHandlers.get(topic)?.size === 0) {
        this.klineHandlers.delete(topic);
        this.removeTopic(exchangeId, topic);
        wsManager.send(exchangeId, {
          op: 'unsubscribe',
          args: [topic],
        });
      }
    };
  }

  subscribeTrades(
    symbol: string,
    handler: TradeHandler,
    market: BybitMarket = 'linear'
  ): () => void {
    const topic = `publicTrade.${symbol.toUpperCase()}`;
    const exchangeId = `bybit-${market}`;

    this.addTopic(exchangeId, topic);

    if (!this.tradeHandlers.has(topic)) {
      this.tradeHandlers.set(topic, new Set());
    }
    this.tradeHandlers.get(topic)!.add(handler);

    wsManager.send(exchangeId, {
      op: 'subscribe',
      args: [topic],
    });

    return () => {
      this.tradeHandlers.get(topic)?.delete(handler);
      if (this.tradeHandlers.get(topic)?.size === 0) {
        this.tradeHandlers.delete(topic);
        this.removeTopic(exchangeId, topic);
        wsManager.send(exchangeId, {
          op: 'unsubscribe',
          args: [topic],
        });
      }
    };
  }

  subscribeDepth(
    symbol: string,
    handler: DepthHandler,
    market: BybitMarket = 'linear',
    depth: 50 | 200 | 500 = 50
  ): () => void {
    const topic = `orderbook.${depth}.${symbol.toUpperCase()}`;
    const exchangeId = `bybit-${market}`;

    this.addTopic(exchangeId, topic);

    if (!this.depthHandlers.has(topic)) {
      this.depthHandlers.set(topic, new Set());
    }
    this.depthHandlers.get(topic)!.add(handler);

    wsManager.send(exchangeId, {
      op: 'subscribe',
      args: [topic],
    });

    return () => {
      this.depthHandlers.get(topic)?.delete(handler);
      if (this.depthHandlers.get(topic)?.size === 0) {
        this.depthHandlers.delete(topic);
        this.removeTopic(exchangeId, topic);
        wsManager.send(exchangeId, {
          op: 'unsubscribe',
          args: [topic],
        });
      }
    };
  }

  private handleMessage(message: BybitMessage): void {
    // Handle pong
    if (message.op === 'pong') {
      return;
    }

    // Handle subscription confirmation
    if (message.success !== undefined) {
      if (!message.success) {
        console.error('[Bybit] Subscription failed:', message.ret_msg);
      }
      return;
    }

    // Handle data messages
    if (!message.topic) return;

    const topic = message.topic;

    if (topic.startsWith('kline.')) {
      this.handleKlineMessage(topic, message as unknown as BybitKlineMessage);
    } else if (topic.startsWith('publicTrade.')) {
      this.handleTradeMessage(topic, message as unknown as BybitTradeMessage);
    } else if (topic.startsWith('orderbook.')) {
      this.handleOrderbookMessage(topic, message as unknown as BybitOrderbookMessage);
    }
  }

  private handleKlineMessage(topic: string, message: BybitKlineMessage): void {
    const handlers = this.klineHandlers.get(topic);
    if (!handlers || !message.data?.[0]) return;

    const k = message.data[0];
    const candle: Candle = {
      time: Math.floor(k.start / 1000),
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
    };

    handlers.forEach((handler) => handler(candle, k.confirm));
  }

  private handleTradeMessage(topic: string, message: BybitTradeMessage): void {
    const handlers = this.tradeHandlers.get(topic);
    if (!handlers || !message.data) return;

    message.data.forEach((t) => {
      const trade: Trade = {
        id: t.i,
        price: parseFloat(t.p),
        quantity: parseFloat(t.v),
        time: t.T,
        isBuyerMaker: t.S === 'Sell', // Sell = buyer is maker
      };

      handlers.forEach((handler) => handler(trade));
    });
  }

  private handleOrderbookMessage(topic: string, message: BybitOrderbookMessage): void {
    const handlers = this.depthHandlers.get(topic);
    if (!handlers || !message.data) return;

    const { data } = message;
    const update: OrderbookUpdate = {
      eventType: message.type === 'snapshot' ? 'snapshot' : 'depthUpdate',
      eventTime: message.ts,
      symbol: data.s,
      firstUpdateId: data.u,
      finalUpdateId: data.u,
      bids: data.b,
      asks: data.a,
    };

    handlers.forEach((handler) => handler(update));
  }
}

export const bybitWS = BybitWebSocket.getInstance();
export default BybitWebSocket;
