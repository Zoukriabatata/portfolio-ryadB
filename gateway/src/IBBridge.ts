/**
 * IB BRIDGE - Per-user connection to IB Gateway/TWS
 *
 * Uses @stoqey/ib to connect to a local IB Gateway process.
 * Each user gets their own IBBridge instance with a unique clientId.
 *
 * Data flow:
 *   IB Gateway (local) ──► @stoqey/ib ──► IBBridge ──► WebSocket ──► Browser
 */

import { IBApi, EventName, Contract, SecType, IBApiTickType } from '@stoqey/ib';
import { config } from './config';

// Inline types to avoid rootDir issues with ../../types/ib-protocol
interface IBTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  timestamp: number;
  exchange: string;
}

interface IBDepthRow {
  price: number;
  size: number;
  numOrders: number;
}

interface IBDepthUpdate {
  symbol: string;
  timestamp: number;
  bids: IBDepthRow[];
  asks: IBDepthRow[];
}

interface IBQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidSize: number;
  askSize: number;
  lastSize: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
}

type TradeCallback = (trade: IBTrade) => void;
type DepthCallback = (depth: IBDepthUpdate) => void;
type QuoteCallback = (quote: Partial<IBQuote>) => void;
type StatusCallback = (status: 'connected' | 'disconnected' | 'error', message?: string) => void;

interface SubscriptionInfo {
  reqId: number;
  symbol: string;
  channel: 'trades' | 'depth' | 'quotes';
}

// Tick type numeric values from IB API
const TICK = {
  BID_SIZE: 0,
  BID: 1,
  ASK: 2,
  ASK_SIZE: 3,
  LAST: 4,
  LAST_SIZE: 5,
  HIGH: 6,
  LOW: 7,
  VOLUME: 8,
  CLOSE: 9,
  OPEN: 14,
} as const;

export class IBBridge {
  private ib: IBApi;
  private clientId: number;
  private userId: string;
  private connected = false;
  private nextReqId = 1;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Subscriptions tracking
  private subscriptions: Map<number, SubscriptionInfo> = new Map();
  private symbolToReqIds: Map<string, number[]> = new Map();

  // Quote accumulator (IB sends field-by-field)
  private quoteAccumulator: Map<string, Partial<IBQuote>> = new Map();

  // Callbacks
  private tradeCallbacks: Set<TradeCallback> = new Set();
  private depthCallbacks: Set<DepthCallback> = new Set();
  private quoteCallbacks: Set<QuoteCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();

  // Depth book state (IB sends incremental updates)
  private depthBook: Map<string, { bids: Map<number, IBDepthRow>; asks: Map<number, IBDepthRow> }> = new Map();

  constructor(userId: string, clientId: number) {
    this.userId = userId;
    this.clientId = clientId;

    this.ib = new IBApi({
      host: config.ib.host,
      port: config.ib.port,
      clientId: this.clientId,
    });

    this.setupEventHandlers();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  connect(): void {
    if (this.connected) return;

    console.log(`[IBBridge:${this.userId}] Connecting to IB Gateway (clientId=${this.clientId})...`);
    this.ib.connect();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Cancel all active subscriptions
    for (const [reqId, sub] of this.subscriptions) {
      try {
        if (sub.channel === 'trades' || sub.channel === 'quotes') {
          this.ib.cancelMktData(reqId);
        } else if (sub.channel === 'depth') {
          this.ib.cancelMktDepth(reqId, false);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }

    this.subscriptions.clear();
    this.symbolToReqIds.clear();
    this.depthBook.clear();
    this.quoteAccumulator.clear();

    try {
      this.ib.disconnect();
    } catch {
      // Ignore
    }

    this.connected = false;
    console.log(`[IBBridge:${this.userId}] Disconnected`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private setupEventHandlers(): void {
    this.ib.on(EventName.connected, () => {
      console.log(`[IBBridge:${this.userId}] Connected to IB Gateway`);
      this.connected = true;
      this.reconnectAttempts = 0;

      // Request delayed market data type (free) as fallback when
      // real-time data is not subscribed. If the user has a live
      // subscription, IB will still send real-time data.
      // Type 3 = Delayed, Type 4 = Delayed Frozen
      try {
        (this.ib as any).reqMarketDataType(3);
        console.log(`[IBBridge:${this.userId}] Requested delayed market data type (fallback)`);
      } catch (e) {
        console.warn(`[IBBridge:${this.userId}] reqMarketDataType not available:`, e);
      }

      this.emitStatus('connected');
    });

    this.ib.on(EventName.disconnected, () => {
      console.log(`[IBBridge:${this.userId}] Disconnected from IB Gateway`);
      this.connected = false;
      this.emitStatus('disconnected');
      this.scheduleReconnect();
    });

    this.ib.on(EventName.error, (err: Error, code?: number, _reqId?: number) => {
      // Common IB error codes:
      // 200 = No security definition found
      // 354 = Not subscribed to requested market data
      // 10167 = Delayed market data instead of real-time
      const errCode = code || 0;
      const msg = `IB Error ${errCode}: ${err.message}`;

      // Info messages - not errors
      if (errCode === 2104 || errCode === 2106 || errCode === 2158) {
        console.debug(`[IBBridge:${this.userId}] Info: ${msg}`);
        return;
      }

      // Market data not subscribed - delayed data will be used instead
      // Don't treat as error since reqMarketDataType(3) enables delayed fallback
      if (errCode === 354) {
        console.warn(`[IBBridge:${this.userId}] ${msg} - Using delayed data`);
        return;
      }

      // Delayed market data is being used (info, not error)
      if (errCode === 10167) {
        console.debug(`[IBBridge:${this.userId}] Using delayed market data for this symbol`);
        return;
      }

      console.error(`[IBBridge:${this.userId}] ${msg}`);
      this.emitStatus('error', msg);
    });

    // Tick data (for trades and quotes)
    this.ib.on(EventName.tickPrice, (reqId: number, tickType: IBApiTickType, price: number) => {
      this.handleTickPrice(reqId, tickType as number, price);
    });

    (this.ib as any).on(EventName.tickSize, (reqId: number, tickType: number, size: number) => {
      this.handleTickSize(reqId, tickType, size);
    });

    // Market depth (Level 2)
    (this.ib as any).on(EventName.updateMktDepth, (
      reqId: number,
      position: number,
      operation: number,  // 0=insert, 1=update, 2=delete
      side: number,       // 0=ask, 1=bid
      price: number,
      size: number
    ) => {
      this.handleDepthUpdate(reqId, position, operation, side, price, size);
    });

    // Execution for trade detection
    (this.ib as any).on(EventName.execDetails, () => {
      // This fires for our own executions - we use tickPrice/tickSize for market trades
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TICK HANDLING (Trades + Quotes)
  // ═══════════════════════════════════════════════════════════════════════════

  private handleTickPrice(reqId: number, tickType: number, price: number): void {
    const sub = this.subscriptions.get(reqId);
    if (!sub || price <= 0) return;

    const quote = this.getOrCreateQuote(sub.symbol);

    switch (tickType) {
      case TICK.BID:
        quote.bid = price;
        this.emitQuote(quote);
        break;
      case TICK.ASK:
        quote.ask = price;
        this.emitQuote(quote);
        break;
      case TICK.LAST:
        quote.last = price;
        quote.timestamp = Date.now();
        this.emitQuote(quote);
        // Emit as trade
        this.emitTrade({
          symbol: sub.symbol,
          price,
          size: quote.lastSize || 1,
          side: this.classifyTrade(price, quote.bid || 0, quote.ask || 0),
          timestamp: Date.now(),
          exchange: 'CME',
        });
        break;
      case TICK.HIGH:
        quote.high = price;
        break;
      case TICK.LOW:
        quote.low = price;
        break;
      case TICK.OPEN:
        quote.open = price;
        break;
      case TICK.CLOSE:
        quote.close = price;
        break;
    }
  }

  private handleTickSize(reqId: number, tickType: number, size: number): void {
    const sub = this.subscriptions.get(reqId);
    if (!sub) return;

    const quote = this.getOrCreateQuote(sub.symbol);

    switch (tickType) {
      case TICK.BID_SIZE:
        quote.bidSize = size;
        break;
      case TICK.ASK_SIZE:
        quote.askSize = size;
        break;
      case TICK.LAST_SIZE:
        quote.lastSize = size;
        break;
      case TICK.VOLUME:
        quote.volume = size;
        break;
    }
  }

  /**
   * Classify trade as BID or ASK based on proximity to best bid/ask.
   * Trade at or above ask = buyer aggressor (ASK).
   * Trade at or below bid = seller aggressor (BID).
   */
  private classifyTrade(price: number, bid: number, ask: number): 'BID' | 'ASK' {
    if (bid <= 0 || ask <= 0) return 'ASK'; // Default
    const mid = (bid + ask) / 2;
    return price >= mid ? 'ASK' : 'BID';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPTH HANDLING (Level 2)
  // ═══════════════════════════════════════════════════════════════════════════

  private handleDepthUpdate(
    reqId: number,
    position: number,
    operation: number,
    side: number,
    price: number,
    size: number
  ): void {
    const sub = this.subscriptions.get(reqId);
    if (!sub) return;

    // Get or create depth book for this symbol
    if (!this.depthBook.has(sub.symbol)) {
      this.depthBook.set(sub.symbol, {
        bids: new Map(),
        asks: new Map(),
      });
    }
    const book = this.depthBook.get(sub.symbol)!;
    const bookSide = side === 1 ? book.bids : book.asks;

    switch (operation) {
      case 0: // Insert
      case 1: // Update
        bookSide.set(position, { price, size, numOrders: 1 });
        break;
      case 2: // Delete
        bookSide.delete(position);
        break;
    }

    // Emit full depth snapshot
    const bids: IBDepthRow[] = [];
    const asks: IBDepthRow[] = [];

    for (const row of book.bids.values()) bids.push(row);
    for (const row of book.asks.values()) asks.push(row);

    // Sort: bids descending, asks ascending
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    this.emitDepth({
      symbol: sub.symbol,
      timestamp: Date.now(),
      bids,
      asks,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  subscribeMarketData(symbol: string): number {
    const contract = this.buildContract(symbol);
    const reqId = this.nextReqId++;

    this.subscriptions.set(reqId, { reqId, symbol, channel: 'trades' });
    this.addSymbolReqId(symbol, reqId);

    // Request tick-by-tick data (trades + BBO)
    // genericTickList: "233" = RT Volume (trades with size and side)
    this.ib.reqMktData(reqId, contract, '233', false, false);

    console.log(`[IBBridge:${this.userId}] Subscribed market data: ${symbol} (reqId=${reqId})`);
    return reqId;
  }

  subscribeDepth(symbol: string, numRows: number = 10): number {
    const contract = this.buildContract(symbol);
    const reqId = this.nextReqId++;

    this.subscriptions.set(reqId, { reqId, symbol, channel: 'depth' });
    this.addSymbolReqId(symbol, reqId);

    this.ib.reqMktDepth(reqId, contract, numRows, false);

    console.log(`[IBBridge:${this.userId}] Subscribed depth: ${symbol} (reqId=${reqId})`);
    return reqId;
  }

  unsubscribe(symbol: string): void {
    const reqIds = this.symbolToReqIds.get(symbol);
    if (!reqIds) return;

    for (const reqId of reqIds) {
      const sub = this.subscriptions.get(reqId);
      if (!sub) continue;

      try {
        if (sub.channel === 'trades' || sub.channel === 'quotes') {
          this.ib.cancelMktData(reqId);
        } else if (sub.channel === 'depth') {
          this.ib.cancelMktDepth(reqId, false);
        }
      } catch {
        // Ignore cancel errors
      }

      this.subscriptions.delete(reqId);
    }

    this.symbolToReqIds.delete(symbol);
    this.depthBook.delete(symbol);
    this.quoteAccumulator.delete(symbol);

    console.log(`[IBBridge:${this.userId}] Unsubscribed: ${symbol}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  private buildContract(symbol: string): Contract {
    // Build IB Contract for CME futures
    // Uses continuous futures (front month)
    return {
      symbol: symbol.toUpperCase(),
      secType: SecType.FUT,
      exchange: this.getExchange(symbol),
      currency: 'USD',
      lastTradeDateOrContractMonth: this.getFrontMonth(),
    };
  }

  private getExchange(symbol: string): string {
    const exchangeMap: Record<string, string> = {
      ES: 'CME', MES: 'CME',
      NQ: 'CME', MNQ: 'CME',
      YM: 'CBOT',
      GC: 'COMEX', MGC: 'COMEX',
      CL: 'NYMEX', MCL: 'NYMEX',
    };
    return exchangeMap[symbol.toUpperCase()] || 'CME';
  }

  /**
   * Get front month contract expiry (YYYYMM format).
   * CME equity index futures: H(Mar), M(Jun), U(Sep), Z(Dec)
   */
  private getFrontMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    // Quarterly months: 3, 6, 9, 12
    const quarterlyMonths = [3, 6, 9, 12];

    // Find next quarterly month (including current if within expiry window)
    for (const qm of quarterlyMonths) {
      if (month <= qm) {
        return `${year}${qm.toString().padStart(2, '0')}`;
      }
    }

    // Wrap to next year March
    return `${year + 1}03`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getOrCreateQuote(symbol: string): Partial<IBQuote> {
    if (!this.quoteAccumulator.has(symbol)) {
      this.quoteAccumulator.set(symbol, { symbol, timestamp: Date.now() });
    }
    return this.quoteAccumulator.get(symbol)!;
  }

  private addSymbolReqId(symbol: string, reqId: number): void {
    if (!this.symbolToReqIds.has(symbol)) {
      this.symbolToReqIds.set(symbol, []);
    }
    this.symbolToReqIds.get(symbol)!.push(reqId);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= config.maxReconnectAttempts) {
      console.error(`[IBBridge:${this.userId}] Max reconnect attempts reached`);
      this.emitStatus('error', 'Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[IBBridge:${this.userId}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  onTrade(cb: TradeCallback): () => void {
    this.tradeCallbacks.add(cb);
    return () => this.tradeCallbacks.delete(cb);
  }

  onDepth(cb: DepthCallback): () => void {
    this.depthCallbacks.add(cb);
    return () => this.depthCallbacks.delete(cb);
  }

  onQuote(cb: QuoteCallback): () => void {
    this.quoteCallbacks.add(cb);
    return () => this.quoteCallbacks.delete(cb);
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private emitTrade(trade: IBTrade): void {
    this.tradeCallbacks.forEach(cb => cb(trade));
  }

  private emitDepth(depth: IBDepthUpdate): void {
    this.depthCallbacks.forEach(cb => cb(depth));
  }

  private emitQuote(quote: Partial<IBQuote>): void {
    this.quoteCallbacks.forEach(cb => cb(quote));
  }

  private emitStatus(status: 'connected' | 'disconnected' | 'error', message?: string): void {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }
}
