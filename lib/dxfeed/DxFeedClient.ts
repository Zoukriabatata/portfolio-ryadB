/**
 * DXFEED OFFICIAL API CLIENT
 *
 * Utilise @dxfeed/api - le package officiel dxFeed
 * Endpoint: wss://demo.dxfeed.com/webservice/cometd (delayed 15min)
 *
 * DONNÉES TICK-BY-TICK RÉELLES:
 * - Trade events: price, size, timestamp
 * - Quote events: bidPrice, askPrice, bidSize, askSize
 *
 * POURQUOI QUOTES + TRADES:
 * - Trades SEULS = pas de distinction bid/ask fiable
 * - Quotes = best bid/ask au moment du trade
 * - Combinaison = classification aggressor EXACTE comme ATAS
 */

// Note: @dxfeed/api is a browser/node package
// We need to handle the import dynamically for Next.js

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DxFeedTradeEvent {
  eventSymbol: string;
  eventTime: number;       // Timestamp in ms
  time: number;            // Trade time in ms
  timeNanoPart: number;    // Nanosecond part
  sequence: number;        // Sequence number
  exchangeCode: string;    // Exchange identifier
  price: number;           // Trade price
  size: number;            // Trade size (contracts)
  dayVolume: number;       // Cumulative day volume
  dayTurnover: number;     // Cumulative day turnover
  tickDirection: 'UPTICK' | 'DOWNTICK' | 'ZERO_UPTICK' | 'ZERO_DOWNTICK' | 'UNDEFINED';
  extendedTradingHours: boolean;
}

export interface DxFeedQuoteEvent {
  eventSymbol: string;
  eventTime: number;
  sequence: number;
  timeNanoPart: number;
  bidTime: number;
  bidExchangeCode: string;
  bidPrice: number;
  bidSize: number;
  askTime: number;
  askExchangeCode: string;
  askPrice: number;
  askSize: number;
}

export interface DxFeedCandleEvent {
  eventSymbol: string;
  eventTime: number;
  time: number;
  sequence: number;
  count: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  bidVolume: number;
  askVolume: number;
}

// Classified trade with aggressor side
export interface ClassifiedTrade {
  symbol: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'BID' | 'ASK';  // BID = sell aggressor, ASK = buy aggressor
  tickDirection: string;
}

type TradeCallback = (trade: ClassifiedTrade) => void;
type QuoteCallback = (quote: DxFeedQuoteEvent) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// CME FUTURES SPECIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CMEFuturesSpec {
  symbol: string;           // dxFeed symbol (e.g., "/NQ")
  tickSize: number;         // Minimum price increment
  tickValue: number;        // Dollar value per tick
  pointValue: number;       // Dollar value per point
  volumeMultiplier: number; // For micro/mini normalization
}

export const CME_SPECS: Record<string, CMEFuturesSpec> = {
  // E-mini Nasdaq 100: 1 tick = 0.25 points = $5.00
  '/NQ': {
    symbol: '/NQ',
    tickSize: 0.25,
    tickValue: 5.00,
    pointValue: 20.00,
    volumeMultiplier: 1,
  },
  // Micro E-mini Nasdaq 100: 1 tick = 0.25 points = $0.50
  '/MNQ': {
    symbol: '/MNQ',
    tickSize: 0.25,
    tickValue: 0.50,
    pointValue: 2.00,
    volumeMultiplier: 10,  // 10 MNQ = 1 NQ
  },
  // E-mini S&P 500: 1 tick = 0.25 points = $12.50
  '/ES': {
    symbol: '/ES',
    tickSize: 0.25,
    tickValue: 12.50,
    pointValue: 50.00,
    volumeMultiplier: 1,
  },
  // Micro E-mini S&P 500: 1 tick = 0.25 points = $1.25
  '/MES': {
    symbol: '/MES',
    tickSize: 0.25,
    tickValue: 1.25,
    pointValue: 5.00,
    volumeMultiplier: 10,
  },
  // Gold Futures: 1 tick = $0.10 = $10.00
  '/GC': {
    symbol: '/GC',
    tickSize: 0.10,
    tickValue: 10.00,
    pointValue: 100.00,
    volumeMultiplier: 1,
  },
  // Micro Gold: 1 tick = $0.10 = $1.00
  '/MGC': {
    symbol: '/MGC',
    tickSize: 0.10,
    tickValue: 1.00,
    pointValue: 10.00,
    volumeMultiplier: 10,
  },
};

// Map generic symbols to dxFeed format
export const SYMBOL_MAP: Record<string, string> = {
  'NQ': '/NQ',
  'MNQ': '/MNQ',
  'ES': '/ES',
  'MES': '/MES',
  'GC': '/GC',
  'MGC': '/MGC',
};

export function getDxFeedSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol] || (symbol.startsWith('/') ? symbol : `/${symbol}`);
}

export function getSpec(symbol: string): CMEFuturesSpec {
  const dxSymbol = getDxFeedSymbol(symbol);
  return CME_SPECS[dxSymbol] || CME_SPECS['/NQ'];
}

/**
 * Align price to exact tick
 * CRITICAL: Every price MUST be aligned to tick grid
 */
export function alignToTick(symbol: string, price: number): number {
  const spec = getSpec(symbol);
  return Math.round(price / spec.tickSize) * spec.tickSize;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BID/ASK CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CLASSIFICATION BID/ASK - MÉTHODE ATAS
 *
 * RÈGLE PRINCIPALE (Quote Rule):
 * - trade.price >= lastAsk → ASK (buy market order, lifted the offer)
 * - trade.price <= lastBid → BID (sell market order, hit the bid)
 *
 * FALLBACK (Tick Rule):
 * - price > lastPrice → ASK (uptick = buying pressure)
 * - price < lastPrice → BID (downtick = selling pressure)
 * - price == lastPrice → keep last classification
 *
 * ERREURS À ÉVITER:
 * - NE JAMAIS inverser bid/ask
 * - BUY aggressor = lifted the offer = ASK column
 * - SELL aggressor = hit the bid = BID column
 */

interface ClassificationState {
  lastBid: number;
  lastAsk: number;
  lastPrice: number;
  lastSide: 'BID' | 'ASK';
}

export class TradeClassifier {
  private states: Map<string, ClassificationState> = new Map();

  getState(symbol: string): ClassificationState {
    if (!this.states.has(symbol)) {
      this.states.set(symbol, {
        lastBid: 0,
        lastAsk: 0,
        lastPrice: 0,
        lastSide: 'ASK',
      });
    }
    return this.states.get(symbol)!;
  }

  /**
   * Update quote (bid/ask) cache
   * MUST be called BEFORE classifyTrade for accurate classification
   */
  updateQuote(quote: DxFeedQuoteEvent): void {
    const state = this.getState(quote.eventSymbol);

    if (quote.bidPrice > 0) {
      state.lastBid = quote.bidPrice;
    }
    if (quote.askPrice > 0) {
      state.lastAsk = quote.askPrice;
    }
  }

  /**
   * Classify a trade as BID or ASK
   * Returns classified trade with aggressor side
   */
  classifyTrade(trade: DxFeedTradeEvent): ClassifiedTrade {
    const state = this.getState(trade.eventSymbol);
    const price = trade.price;

    let side: 'BID' | 'ASK';

    // MÉTHODE 1: Quote Rule (preferred - most accurate)
    if (state.lastBid > 0 && state.lastAsk > 0) {
      if (price >= state.lastAsk) {
        // Trade at or above ask = buyer lifted the offer
        side = 'ASK';
      } else if (price <= state.lastBid) {
        // Trade at or below bid = seller hit the bid
        side = 'BID';
      } else {
        // Trade between bid and ask (mid-market)
        // Use tick rule as tiebreaker
        const mid = (state.lastBid + state.lastAsk) / 2;
        side = price >= mid ? 'ASK' : 'BID';
      }
    }
    // MÉTHODE 2: Tick Rule (fallback)
    else if (state.lastPrice > 0) {
      if (price > state.lastPrice) {
        side = 'ASK';  // Uptick = buy pressure
      } else if (price < state.lastPrice) {
        side = 'BID';  // Downtick = sell pressure
      } else {
        side = state.lastSide;  // No change = keep last
      }
    }
    // MÉTHODE 3: Tick Direction from exchange (if available)
    else if (trade.tickDirection) {
      if (trade.tickDirection === 'UPTICK' || trade.tickDirection === 'ZERO_UPTICK') {
        side = 'ASK';
      } else if (trade.tickDirection === 'DOWNTICK' || trade.tickDirection === 'ZERO_DOWNTICK') {
        side = 'BID';
      } else {
        side = state.lastSide;
      }
    }
    // Default
    else {
      side = state.lastSide;
    }

    // Update state
    state.lastPrice = price;
    state.lastSide = side;

    return {
      symbol: trade.eventSymbol,
      timestamp: trade.time || trade.eventTime,
      price: price,
      size: trade.size,
      side: side,
      tickDirection: trade.tickDirection || 'UNDEFINED',
    };
  }

  reset(symbol?: string): void {
    if (symbol) {
      this.states.delete(symbol);
    } else {
      this.states.clear();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DXFEED CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

// Import types from @dxfeed/api
interface FeedEndpoint {
  isConnected: () => boolean;
  registerStateChangeHandler: (handler: (state: { connected?: boolean }) => void) => void;
}

interface DxFeedAPI {
  endpoint: FeedEndpoint;
  connect: (url: string) => void;
  disconnect: () => void;
  subscribe: <T>(
    eventTypes: string[],
    eventSymbols: string[],
    onChange: (event: T) => void
  ) => () => void;
}

class DxFeedClient {
  private static instance: DxFeedClient;

  private feed: DxFeedAPI | null = null;
  private subscriptions: Map<string, () => void> = new Map();
  private connected = false;
  private connecting = false;

  private tradeCallbacks: Map<string, Set<TradeCallback>> = new Map();
  private quoteCallbacks: Map<string, Set<QuoteCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();

  private classifier = new TradeClassifier();

  // Pending subscriptions to process after connection
  private pendingSubscriptions: { type: 'Trade' | 'Quote'; symbol: string }[] = [];

  private constructor() {}

  static getInstance(): DxFeedClient {
    if (!DxFeedClient.instance) {
      DxFeedClient.instance = new DxFeedClient();
    }
    return DxFeedClient.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    // Already connected
    if (this.connected && this.feed?.endpoint?.isConnected()) {
      console.log('[dxFeed] Already connected');
      return true;
    }

    // Connection in progress
    if (this.connecting) {
      console.log('[dxFeed] Connection already in progress...');
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.connected) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
        // Timeout after 15 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(this.connected);
        }, 15000);
      });
    }

    this.connecting = true;
    this.emitStatus('connecting', 'Connecting to dxFeed...');

    try {
      // Dynamic import for @dxfeed/api (works in browser)
      console.log('[dxFeed] Loading @dxfeed/api...');
      const { Feed, EventType } = await import('@dxfeed/api');
      console.log('[dxFeed] @dxfeed/api loaded, EventType:', EventType);

      // Create feed instance
      this.feed = new Feed() as unknown as DxFeedAPI;

      // CORRECT dxFeed demo endpoint (15-min delayed data)
      const DXFEED_URL = 'wss://demo.dxfeed.com/webservice/cometd';
      console.log('[dxFeed] Target URL:', DXFEED_URL);

      // Set up connection state handler BEFORE connecting
      return new Promise((resolve) => {
        const connectionTimeout = setTimeout(() => {
          console.error('[dxFeed] Connection timeout after 15 seconds');
          this.connecting = false;
          this.emitStatus('error', 'Connection timeout');
          resolve(false);
        }, 15000);

        // Register state change handler to detect when connected
        this.feed!.endpoint.registerStateChangeHandler((state) => {
          console.log('[dxFeed] State change:', state);

          if (state.connected === true) {
            clearTimeout(connectionTimeout);
            this.connected = true;
            this.connecting = false;
            console.log('[dxFeed] ✓ CONNECTED to dxFeed demo');
            this.emitStatus('connected', 'Connected to dxFeed (15min delayed)');

            // Process pending subscriptions
            this.processPendingSubscriptions();

            // TEST: Subscribe to a known working symbol to verify data flow
            this.testConnectionWithSPY();

            resolve(true);
          } else if (state.connected === false && this.connected) {
            // Disconnection detected
            console.log('[dxFeed] Disconnected from dxFeed');
            this.connected = false;
            this.emitStatus('disconnected', 'Disconnected from dxFeed');
          }
        });

        // Now connect
        console.log('[dxFeed] Calling connect()...');
        this.feed!.connect(DXFEED_URL);
        console.log('[dxFeed] connect() called, waiting for state change...');
      });
    } catch (error) {
      console.error('[dxFeed] Connection failed:', error);
      this.connecting = false;
      this.emitStatus('error', error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  }

  private async processPendingSubscriptions(): Promise<void> {
    if (this.pendingSubscriptions.length === 0) return;

    console.log(`[dxFeed] Processing ${this.pendingSubscriptions.length} pending subscriptions...`);

    for (const { type, symbol } of this.pendingSubscriptions) {
      const dxSymbol = getDxFeedSymbol(symbol);
      if (type === 'Trade') {
        await this.subscribeToTradeEvents(dxSymbol);
      } else if (type === 'Quote') {
        await this.subscribeToQuoteEvents(dxSymbol);
      }
    }

    this.pendingSubscriptions = [];
  }

  /**
   * Test connection with SPY (known to work on demo)
   * This proves the connection works - if SPY trades arrive but /NQ doesn't,
   * it means CME futures are not available on the demo feed.
   */
  private async testConnectionWithSPY(): Promise<void> {
    if (!this.feed) return;

    try {
      const { EventType } = await import('@dxfeed/api');
      console.log('[dxFeed] 🧪 Testing connection with SPY (should work on demo)...');

      let spyTradeCount = 0;
      this.feed.subscribe<DxFeedTradeEvent>(
        [EventType.Trade],
        ['SPY'],  // SPY works on demo
        (trade) => {
          spyTradeCount++;
          if (spyTradeCount <= 3) {
            console.log(`[dxFeed] 🧪 SPY Trade #${spyTradeCount}: $${trade.price} x ${trade.size}`);
          }
          if (spyTradeCount === 1) {
            console.log('[dxFeed] ✓ Demo feed is working! SPY data received.');
            console.log('[dxFeed] ⚠ CME futures (/NQ, /ES) may not be available on free demo.');
            console.log('[dxFeed] ⚠ CME data requires paid dxFeed subscription.');
          }
        }
      );
    } catch (error) {
      console.error('[dxFeed] SPY test failed:', error);
    }
  }

  disconnect(): void {
    console.log('[dxFeed] Disconnecting...');

    // Unsubscribe all
    this.subscriptions.forEach((unsubFn) => {
      try {
        unsubFn();
      } catch (e) {
        console.warn('[dxFeed] Unsubscribe error:', e);
      }
    });
    this.subscriptions.clear();

    // Disconnect feed
    if (this.feed) {
      try {
        this.feed.disconnect();
      } catch (e) {
        console.warn('[dxFeed] Disconnect error:', e);
      }
    }

    this.feed = null;
    this.connected = false;
    this.connecting = false;
    this.pendingSubscriptions = [];
    this.classifier.reset();
    this.emitStatus('disconnected');
    console.log('[dxFeed] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to trades for a symbol
   * Trades are classified with bid/ask using the quote cache
   */
  subscribeTrades(symbol: string, callback: TradeCallback): () => void {
    const dxSymbol = getDxFeedSymbol(symbol);
    console.log(`[dxFeed] subscribeTrades called for ${symbol} (dxSymbol: ${dxSymbol})`);

    if (!this.tradeCallbacks.has(symbol)) {
      this.tradeCallbacks.set(symbol, new Set());
    }
    this.tradeCallbacks.get(symbol)!.add(callback);

    // Subscribe if connected, otherwise queue for later
    if (this.connected && this.feed) {
      this.subscribeToTradeEvents(dxSymbol);
    } else {
      console.log(`[dxFeed] Not connected yet, queuing Trade subscription for ${symbol}`);
      this.pendingSubscriptions.push({ type: 'Trade', symbol });
    }

    // Return unsubscribe function
    return () => {
      this.tradeCallbacks.get(symbol)?.delete(callback);
      if (this.tradeCallbacks.get(symbol)?.size === 0) {
        this.tradeCallbacks.delete(symbol);
        this.unsubscribeFromEvents(dxSymbol, 'Trade');
      }
    };
  }

  /**
   * Subscribe to quotes for a symbol
   * IMPORTANT: Subscribe to quotes BEFORE trades for accurate classification
   */
  subscribeQuotes(symbol: string, callback: QuoteCallback): () => void {
    const dxSymbol = getDxFeedSymbol(symbol);
    console.log(`[dxFeed] subscribeQuotes called for ${symbol} (dxSymbol: ${dxSymbol})`);

    if (!this.quoteCallbacks.has(symbol)) {
      this.quoteCallbacks.set(symbol, new Set());
    }
    this.quoteCallbacks.get(symbol)!.add(callback);

    // Subscribe if connected, otherwise queue for later
    if (this.connected && this.feed) {
      this.subscribeToQuoteEvents(dxSymbol);
    } else {
      console.log(`[dxFeed] Not connected yet, queuing Quote subscription for ${symbol}`);
      this.pendingSubscriptions.push({ type: 'Quote', symbol });
    }

    return () => {
      this.quoteCallbacks.get(symbol)?.delete(callback);
      if (this.quoteCallbacks.get(symbol)?.size === 0) {
        this.quoteCallbacks.delete(symbol);
        this.unsubscribeFromEvents(dxSymbol, 'Quote');
      }
    };
  }

  /**
   * Subscribe to both trades and quotes (recommended)
   * Quotes are used for bid/ask classification of trades
   */
  subscribeTradesAndQuotes(
    symbol: string,
    tradeCallback: TradeCallback,
    quoteCallback?: QuoteCallback
  ): () => void {
    // IMPORTANT: Subscribe to quotes FIRST
    const unsubQuote = this.subscribeQuotes(symbol, (quote) => {
      quoteCallback?.(quote);
    });

    // Then subscribe to trades
    const unsubTrade = this.subscribeTrades(symbol, tradeCallback);

    return () => {
      unsubTrade();
      unsubQuote();
    };
  }

  private async subscribeToTradeEvents(dxSymbol: string): Promise<void> {
    if (!this.feed) {
      console.warn('[dxFeed] Cannot subscribe to Trade: feed is null');
      return;
    }

    const key = `Trade_${dxSymbol}`;
    if (this.subscriptions.has(key)) {
      console.log(`[dxFeed] Already subscribed to Trade: ${dxSymbol}`);
      return;
    }

    try {
      const { EventType } = await import('@dxfeed/api');
      console.log(`[dxFeed] Subscribing to Trade events for ${dxSymbol}...`);

      const unsubscribe = this.feed.subscribe<DxFeedTradeEvent>(
        [EventType.Trade],
        [dxSymbol],
        (event) => {
          this.handleTradeEvent(event);
        }
      );

      this.subscriptions.set(key, unsubscribe);
      console.log(`[dxFeed] ✓ Subscribed to Trade: ${dxSymbol}`);
    } catch (error) {
      console.error(`[dxFeed] ✗ Failed to subscribe to Trade ${dxSymbol}:`, error);
    }
  }

  private async subscribeToQuoteEvents(dxSymbol: string): Promise<void> {
    if (!this.feed) {
      console.warn('[dxFeed] Cannot subscribe to Quote: feed is null');
      return;
    }

    const key = `Quote_${dxSymbol}`;
    if (this.subscriptions.has(key)) {
      console.log(`[dxFeed] Already subscribed to Quote: ${dxSymbol}`);
      return;
    }

    try {
      const { EventType } = await import('@dxfeed/api');
      console.log(`[dxFeed] Subscribing to Quote events for ${dxSymbol}...`);

      const unsubscribe = this.feed.subscribe<DxFeedQuoteEvent>(
        [EventType.Quote],
        [dxSymbol],
        (event) => {
          this.handleQuoteEvent(event);
        }
      );

      this.subscriptions.set(key, unsubscribe);
      console.log(`[dxFeed] ✓ Subscribed to Quote: ${dxSymbol}`);
    } catch (error) {
      console.error(`[dxFeed] ✗ Failed to subscribe to Quote ${dxSymbol}:`, error);
    }
  }

  private unsubscribeFromEvents(dxSymbol: string, type: 'Trade' | 'Quote'): void {
    const key = `${type}_${dxSymbol}`;
    const unsubscribeFn = this.subscriptions.get(key);

    if (unsubscribeFn) {
      try {
        // The subscribe() method returns an unsubscribe function
        unsubscribeFn();
        console.log(`[dxFeed] Unsubscribed from ${type}: ${dxSymbol}`);
      } catch (e) {
        console.warn(`[dxFeed] Unsubscribe error for ${key}:`, e);
      }
      this.subscriptions.delete(key);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private tradeCount = 0;
  private quoteCount = 0;

  private handleQuoteEvent(quote: DxFeedQuoteEvent): void {
    this.quoteCount++;

    // Log first few quotes for debugging
    if (this.quoteCount <= 3) {
      console.log(`[dxFeed] Quote #${this.quoteCount}:`, {
        symbol: quote.eventSymbol,
        bid: quote.bidPrice,
        ask: quote.askPrice,
        bidSize: quote.bidSize,
        askSize: quote.askSize,
      });
    }

    // Update classifier state (for trade classification)
    this.classifier.updateQuote(quote);

    // Emit to callbacks
    const symbol = Object.entries(SYMBOL_MAP).find(
      ([, dx]) => dx === quote.eventSymbol
    )?.[0] || quote.eventSymbol;

    this.quoteCallbacks.get(symbol)?.forEach(cb => cb(quote));
    this.quoteCallbacks.get(quote.eventSymbol)?.forEach(cb => cb(quote));
  }

  private handleTradeEvent(trade: DxFeedTradeEvent): void {
    // Skip invalid trades
    if (!trade.price || trade.price <= 0 || !trade.size || trade.size <= 0) {
      return;
    }

    this.tradeCount++;

    // Log first few trades for debugging
    if (this.tradeCount <= 5) {
      console.log(`[dxFeed] Trade #${this.tradeCount}:`, {
        symbol: trade.eventSymbol,
        price: trade.price,
        size: trade.size,
        time: trade.time,
        tickDirection: trade.tickDirection,
      });
    }

    // Classify trade using quote data
    const classified = this.classifier.classifyTrade(trade);

    // Find the generic symbol from dxFeed symbol
    const symbol = Object.entries(SYMBOL_MAP).find(
      ([, dx]) => dx === trade.eventSymbol
    )?.[0] || trade.eventSymbol;

    // Debug callback lookup
    const callbacksForSymbol = this.tradeCallbacks.get(symbol);
    const callbacksForDxSymbol = this.tradeCallbacks.get(trade.eventSymbol);

    if (this.tradeCount <= 3) {
      console.log(`[dxFeed] Callback lookup for trade:`, {
        eventSymbol: trade.eventSymbol,
        mappedSymbol: symbol,
        hasCallbacksForSymbol: !!callbacksForSymbol,
        callbackCountForSymbol: callbacksForSymbol?.size || 0,
        hasCallbacksForDxSymbol: !!callbacksForDxSymbol,
        callbackCountForDxSymbol: callbacksForDxSymbol?.size || 0,
        registeredKeys: Array.from(this.tradeCallbacks.keys()),
      });
    }

    // Emit to callbacks
    callbacksForSymbol?.forEach(cb => cb(classified));
    callbacksForDxSymbol?.forEach(cb => cb(classified));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    message?: string
  ): void {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFIER ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  getClassifier(): TradeClassifier {
    return this.classifier;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const dxFeedClient = DxFeedClient.getInstance();

export function getDxFeedClient(): DxFeedClient {
  return DxFeedClient.getInstance();
}

export default DxFeedClient;
