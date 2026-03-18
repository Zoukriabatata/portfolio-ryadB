/**
 * DxFeedWS — dxLink WebSocket client (browser-compatible)
 *
 * Protocol: dxLink v0.1
 * Default endpoint: wss://demo.dxfeed.com/dxlink-ws
 *
 * Flow:
 *   1. Fetch user's API token from /api/datafeed/credentials?provider=DXFEED
 *   2. Connect WebSocket
 *   3. SETUP → AUTH → CHANNEL_REQUEST → FEED_SETUP → FEED_SUBSCRIPTION
 *   4. Receive FEED_DATA events and dispatch to handlers
 *
 * Symbol format for dxFeed:
 *   - Candle 1m: "NQ{=1m}"
 *   - Candle 5m: "NQ{=5m}"
 *   - Quote:     "NQ"
 *   - Trade:     "NQ"
 */

import type { Candle, Trade } from '@/types/market';

const DEFAULT_ENDPOINT = 'wss://demo.dxfeed.com/dxlink-ws';
const FEED_CHANNEL = 1;
const KEEPALIVE_INTERVAL_MS = 30_000;

type KlineHandler = (candle: Candle, isClosed: boolean) => void;
type TradeHandler = (trade: Trade) => void;
type QuoteHandler = (quote: { bid: number; ask: number; last: number }) => void;
export type DOMLevel    = { price: number; size: number };
export type DOMSnapshot = { bids: DOMLevel[]; asks: DOMLevel[]; timestamp: number };
type DOMHandler = (dom: DOMSnapshot) => void;

// Map our generic root symbols → dxFeed CME continuous-contract format (/ES = front month)
export const CME_SYMBOL_MAP: Record<string, string> = {
  ES:  '/ES',
  MES: '/MES',
  NQ:  '/NQ',
  MNQ: '/MNQ',
  YM:  '/YM',
  MYM: '/MYM',
  RTY: '/RTY',
  M2K: '/M2K',
  GC:  '/GC',
  MGC: '/MGC',
  SI:  '/SI',
  CL:  '/CL',
  MCL: '/MCL',
  NG:  '/NG',
};

/** Convert our internal symbol (e.g. "MNQ") to dxFeed format ("/MNQ"). */
export function toCMEDxSymbol(symbol: string): string {
  return CME_SYMBOL_MAP[symbol.toUpperCase()] ?? symbol;
}

/** Convert dxFeed symbol ("/MNQ") back to our internal symbol ("MNQ"). */
export function fromCMEDxSymbol(dxSymbol: string): string {
  for (const [ours, dx] of Object.entries(CME_SYMBOL_MAP)) {
    if (dx === dxSymbol) return ours;
  }
  return dxSymbol;
}

type ConnectionState = 'disconnected' | 'connecting' | 'authorizing' | 'connected' | 'error';

interface DxLinkMessage {
  type: string;
  channel: number;
  [key: string]: unknown;
}

interface FeedDataPayload {
  type: string;
  channel: number;
  data: Array<[string, Record<string, unknown>]>;
}

// Maps internal timeframe strings to dxFeed Candle period notation
const TIMEFRAME_TO_DXFEED: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  // Sub-minute: fetch 1m and handle client-side
  '15s': '1m',
  '30s': '1m',
};

class DxFeedWebSocket {
  private static instance: DxFeedWebSocket;

  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private apiToken: string | null = null;
  private endpoint: string = DEFAULT_ENDPOINT;

  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private channelOpen = false;

  // symbol → handlers
  private klineHandlers: Map<string, Set<KlineHandler>> = new Map();
  private tradeHandlers: Map<string, Set<TradeHandler>> = new Map();
  private quoteHandlers: Map<string, Set<QuoteHandler>> = new Map();
  private domHandlers:   Map<string, Set<DOMHandler>>   = new Map();

  // active subscriptions: "symbol|type" → true
  private activeSubscriptions: Set<string> = new Set();

  // pending subscriptions queued while connecting
  private pendingSubscriptions: Array<{ eventType: string; symbol: string }> = [];

  private constructor() {}

  static getInstance(): DxFeedWebSocket {
    if (!DxFeedWebSocket.instance) {
      DxFeedWebSocket.instance = new DxFeedWebSocket();
    }
    return DxFeedWebSocket.instance;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    if (this.state === 'connected') return true;
    if (this.state === 'connecting' || this.state === 'authorizing') {
      return this.waitForConnection();
    }

    this.state = 'connecting';

    try {
      const creds = await this.fetchCredentials();
      if (!creds) {
        console.error('[dxFeed] No credentials configured — go to /boutique to connect dxFeed');
        this.state = 'error';
        return false;
      }
      this.apiToken = creds.apiKey;
      this.endpoint = creds.host || DEFAULT_ENDPOINT;
    } catch (err) {
      console.error('[dxFeed] Failed to fetch credentials:', err);
      this.state = 'error';
      return false;
    }

    return this.openWebSocket();
  }

  /** Subscribe to OHLCV candles for a symbol+timeframe */
  async subscribeCandles(
    symbol: string,
    timeframe: string,
    handler: KlineHandler
  ): Promise<() => void> {
    const dxPeriod = TIMEFRAME_TO_DXFEED[timeframe] || '1m';
    const dxSymbol = `${symbol}{=${dxPeriod}}`;
    const key = symbol;

    if (!this.klineHandlers.has(key)) this.klineHandlers.set(key, new Set());
    this.klineHandlers.get(key)!.add(handler);

    await this.ensureSubscribed('Candle', dxSymbol);

    return () => {
      this.klineHandlers.get(key)?.delete(handler);
      if (this.klineHandlers.get(key)?.size === 0) {
        this.unsubscribe('Candle', dxSymbol);
      }
    };
  }

  /** Subscribe to best bid/ask quotes */
  async subscribeQuotes(symbol: string, handler: QuoteHandler): Promise<() => void> {
    if (!this.quoteHandlers.has(symbol)) this.quoteHandlers.set(symbol, new Set());
    this.quoteHandlers.get(symbol)!.add(handler);

    const dxSym = toCMEDxSymbol(symbol);
    await this.ensureSubscribed('Quote', dxSym);

    return () => {
      this.quoteHandlers.get(symbol)?.delete(handler);
      if (this.quoteHandlers.get(symbol)?.size === 0) {
        this.unsubscribe('Quote', dxSym);
      }
    };
  }

  /** Subscribe to individual trades (TimeAndSale events) */
  async subscribeTrades(symbol: string, handler: TradeHandler): Promise<() => void> {
    if (!this.tradeHandlers.has(symbol)) this.tradeHandlers.set(symbol, new Set());
    this.tradeHandlers.get(symbol)!.add(handler);

    // Use CME continuous-contract format for dxFeed (/MNQ etc.)
    const dxSym = toCMEDxSymbol(symbol);
    await this.ensureSubscribed('TimeAndSale', dxSym);

    return () => {
      this.tradeHandlers.get(symbol)?.delete(handler);
      if (this.tradeHandlers.get(symbol)?.size === 0) {
        this.unsubscribe('TimeAndSale', dxSym);
      }
    };
  }

  /** Subscribe to Level 2 DOM (OrderDepth events). Requires CME depth subscription. */
  async subscribeDom(symbol: string, handler: DOMHandler): Promise<() => void> {
    if (!this.domHandlers.has(symbol)) this.domHandlers.set(symbol, new Set());
    this.domHandlers.get(symbol)!.add(handler);

    const dxSym = toCMEDxSymbol(symbol);
    await this.ensureSubscribed('OrderDepth', dxSym);

    return () => {
      this.domHandlers.get(symbol)?.delete(handler);
      if (this.domHandlers.get(symbol)?.size === 0) {
        this.unsubscribe('OrderDepth', dxSym);
        this.domHandlers.delete(symbol);
      }
    };
  }

  disconnect(): void {
    this.cleanup();
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async fetchCredentials(): Promise<{ apiKey: string; host?: string } | null> {
    try {
      const res = await fetch('/api/datafeed/credentials?provider=DXFEED');
      if (!res.ok) return null;
      const data = await res.json();
      const creds = data.credentials;
      if (!creds?.apiKey) return null;
      return { apiKey: creds.apiKey, host: creds.host || undefined };
    } catch {
      return null;
    }
  }

  private openWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      this.ws = new WebSocket(this.endpoint);

      this.ws.onopen = () => {
        console.log('[dxFeed] WebSocket connected, sending SETUP');
        this.send({
          type: 'SETUP',
          channel: 0,
          version: '0.1',
          keepaliveTimeout: 60,
          acceptKeepaliveTimeout: 60,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: DxLinkMessage = JSON.parse(event.data as string);
          this.handleMessage(msg, resolve);
        } catch {
          // ignore malformed frames
        }
      };

      this.ws.onerror = (err) => {
        console.error('[dxFeed] WebSocket error:', err);
        this.state = 'error';
        resolve(false);
      };

      this.ws.onclose = () => {
        console.log('[dxFeed] WebSocket closed');
        this.state = 'disconnected';
        this.channelOpen = false;
        this.stopKeepalive();
      };

      // Timeout after 10s
      setTimeout(() => {
        if (this.state !== 'connected') {
          console.error('[dxFeed] Connection timeout');
          this.cleanup();
          resolve(false);
        }
      }, 10_000);
    });
  }

  private handleMessage(msg: DxLinkMessage, resolve?: (ok: boolean) => void): void {
    switch (msg.type) {
      case 'SETUP':
        // Server confirmed SETUP — send AUTH
        this.state = 'authorizing';
        this.send({ type: 'AUTH', channel: 0, token: this.apiToken });
        break;

      case 'AUTH_STATE':
        if (msg.state === 'AUTHORIZED') {
          console.log('[dxFeed] Authorized, opening feed channel');
          this.send({
            type: 'CHANNEL_REQUEST',
            channel: FEED_CHANNEL,
            service: 'FEED',
            parameters: { contract: 'AUTO' },
          });
        } else if (msg.state === 'UNAUTHORIZED') {
          console.error('[dxFeed] Auth failed — check your API token');
          this.state = 'error';
          resolve?.(false);
        }
        break;

      case 'CHANNEL_OPENED':
        if (msg.channel === FEED_CHANNEL) {
          this.channelOpen = true;
          // Tell server which fields we want for each event type
          this.send({
            type: 'FEED_SETUP',
            channel: FEED_CHANNEL,
            acceptDataFormat: 'FULL',
            acceptEventFields: {
              Quote: ['eventSymbol', 'bidPrice', 'askPrice', 'bidSize', 'askSize'],
              TimeAndSale: ['eventSymbol', 'time', 'price', 'size', 'side'],
              Candle: ['eventSymbol', 'time', 'open', 'high', 'low', 'close', 'volume'],
              OrderDepth: ['eventSymbol', 'time', 'bids', 'asks'],
            },
          });

          this.state = 'connected';
          this.startKeepalive();
          resolve?.(true);

          // Flush pending subscriptions
          if (this.pendingSubscriptions.length > 0) {
            this.sendSubscriptions(this.pendingSubscriptions);
            this.pendingSubscriptions = [];
          }
        }
        break;

      case 'FEED_DATA':
        this.handleFeedData(msg as unknown as FeedDataPayload);
        break;

      case 'KEEPALIVE':
        // Echo back to keep connection alive
        this.send({ type: 'KEEPALIVE', channel: 0 });
        break;

      case 'ERROR':
        console.error('[dxFeed] Server error:', msg.message || msg.error);
        break;
    }
  }

  private handleFeedData(payload: FeedDataPayload): void {
    if (!Array.isArray(payload.data)) return;

    for (const [eventType, fields] of payload.data) {
      switch (eventType) {
        case 'Candle':
          this.dispatchCandle(fields);
          break;
        case 'Quote':
          this.dispatchQuote(fields);
          break;
        case 'TimeAndSale':
          this.dispatchTrade(fields);
          break;
        case 'OrderDepth':
          this.dispatchDOM(fields);
          break;
      }
    }
  }

  private dispatchCandle(fields: Record<string, unknown>): void {
    // dxFeed Candle symbol: "NQ{=1m}" → extract base symbol "NQ"
    const rawSymbol = fields.eventSymbol as string;
    const baseSymbol = rawSymbol.replace(/\{.*\}/, '');

    const handlers = this.klineHandlers.get(baseSymbol);
    if (!handlers || handlers.size === 0) return;

    const timeMs = fields.time as number;
    if (!timeMs || !fields.open) return;

    const candle: Candle = {
      time: Math.floor(timeMs / 1000),
      open: fields.open as number,
      high: fields.high as number,
      low: fields.low as number,
      close: fields.close as number,
      volume: (fields.volume as number) || 0,
    };

    // dxFeed sends candle updates as the bar forms — last one received is the current open bar
    handlers.forEach(h => h(candle, false));
  }

  private dispatchQuote(fields: Record<string, unknown>): void {
    const dxSymbol  = fields.eventSymbol as string;
    const ourSymbol = fromCMEDxSymbol(dxSymbol);
    const handlers  = this.quoteHandlers.get(ourSymbol) ?? this.quoteHandlers.get(dxSymbol);
    if (!handlers || handlers.size === 0) return;

    const quote = {
      bid:  (fields.bidPrice as number) || 0,
      ask:  (fields.askPrice as number) || 0,
      last: 0,
    };
    handlers.forEach(h => h(quote));
  }

  private dispatchTrade(fields: Record<string, unknown>): void {
    // dxFeed uses CME-format symbols (/MNQ) — map back for handler lookup
    const dxSymbol  = fields.eventSymbol as string;
    const ourSymbol = fromCMEDxSymbol(dxSymbol);
    const handlers  = this.tradeHandlers.get(ourSymbol) ?? this.tradeHandlers.get(dxSymbol);
    if (!handlers || handlers.size === 0) return;

    const trade: Trade = {
      id: `${fields.time}-${fields.price}`,
      price: (fields.price as number) || 0,
      quantity: (fields.size as number) || 0,
      time: (fields.time as number) || Date.now(),
      isBuyerMaker: fields.side === 'SELL',
    };
    handlers.forEach(h => h(trade));
  }

  private dispatchDOM(fields: Record<string, unknown>): void {
    const dxSymbol  = fields.eventSymbol as string;
    const ourSymbol = fromCMEDxSymbol(dxSymbol);
    const handlers  = this.domHandlers.get(ourSymbol) ?? this.domHandlers.get(dxSymbol);
    if (!handlers || handlers.size === 0) return;

    const snapshot: DOMSnapshot = {
      bids:      (fields.bids  as DOMLevel[]) ?? [],
      asks:      (fields.asks  as DOMLevel[]) ?? [],
      timestamp: (fields.time  as number)     ?? Date.now(),
    };
    handlers.forEach(h => h(snapshot));
  }

  private async ensureSubscribed(eventType: string, symbol: string): Promise<void> {
    const subKey = `${eventType}|${symbol}`;
    if (this.activeSubscriptions.has(subKey)) return;

    this.activeSubscriptions.add(subKey);

    if (this.state !== 'connected' || !this.channelOpen) {
      // Queue for after connection
      this.pendingSubscriptions.push({ eventType, symbol });
      await this.connect();
      return;
    }

    this.sendSubscriptions([{ eventType, symbol }]);
  }

  private unsubscribe(eventType: string, symbol: string): void {
    const subKey = `${eventType}|${symbol}`;
    this.activeSubscriptions.delete(subKey);

    if (!this.channelOpen) return;

    this.send({
      type: 'FEED_SUBSCRIPTION',
      channel: FEED_CHANNEL,
      remove: [{ type: eventType, symbol }],
    });
  }

  private sendSubscriptions(subs: Array<{ eventType: string; symbol: string }>): void {
    if (subs.length === 0) return;
    this.send({
      type: 'FEED_SUBSCRIPTION',
      channel: FEED_CHANNEL,
      add: subs.map(s => ({ type: s.eventType, symbol: s.symbol })),
    });
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      this.send({ type: 'KEEPALIVE', channel: 0 });
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private cleanup(): void {
    this.stopKeepalive();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
    this.channelOpen = false;
    this.activeSubscriptions.clear();
    this.pendingSubscriptions = [];
    this.domHandlers.clear();
  }

  private waitForConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.state === 'connected') { clearInterval(check); resolve(true); }
        else if (this.state === 'error' || this.state === 'disconnected') {
          clearInterval(check);
          resolve(false);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(false); }, 10_000);
    });
  }
}

export const dxFeedWS = DxFeedWebSocket.getInstance();
export default DxFeedWebSocket;
