import type { Candle, Trade, Timeframe } from '@/types/market';

const TRADOVATE_DEMO_MD_WS = 'wss://md.tradovateapi.com/v1/websocket';

type KlineHandler = (candle: Candle, isClosed: boolean) => void;
type HistoryHandler = (candles: Candle[]) => void;
type TradeHandler = (trade: Trade) => void;
type QuoteHandler = (quote: { bid: number; ask: number; last: number }) => void;

interface ChartData {
  id: number;
  td: number;
  bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    upVolume: number;
    downVolume: number;
    upTicks: number;
    downTicks: number;
    bidVolume: number;
    offerVolume: number;
  }>;
}

interface DOMData {
  contractId: number;
  timestamp: string;
  bids: Array<{ price: number; size: number }>;
  offers: Array<{ price: number; size: number }>;
}

// CME Futures — generic symbols (auto-resolve to front month at Tradovate)
export const CME_SYMBOLS: Record<string, { name: string; exchange: string; tickSize: number }> = {
  'NQ': { name: 'E-mini Nasdaq', exchange: 'CME', tickSize: 0.25 },
  'MNQ': { name: 'Micro E-mini Nasdaq', exchange: 'CME', tickSize: 0.25 },
  'ES': { name: 'E-mini S&P 500', exchange: 'CME', tickSize: 0.25 },
  'MES': { name: 'Micro E-mini S&P 500', exchange: 'CME', tickSize: 0.25 },
  'GC': { name: 'Gold Futures', exchange: 'COMEX', tickSize: 0.1 },
  'MGC': { name: 'Micro Gold', exchange: 'COMEX', tickSize: 0.1 },
};

// Convert Timeframe string to minutes for Tradovate API
export function timeframeToMinutes(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  return map[tf] || 1;
}

class TradovateWebSocket {
  private static instance: TradovateWebSocket;
  private ws: WebSocket | null = null;
  private mdWs: WebSocket | null = null;
  private accessToken: string | null = null;
  private connected = false;
  private mdConnected = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private klineHandlers: Map<string, Set<KlineHandler>> = new Map();
  private tradeHandlers: Map<string, Set<TradeHandler>> = new Map();
  private quoteHandlers: Map<string, Set<QuoteHandler>> = new Map();

  // Called once with the initial batch of historical bars
  private historyHandler: HistoryHandler | null = null;
  private receivedHistory = false;

  private subscriptions: Map<string, number> = new Map();
  private contractIds: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): TradovateWebSocket {
    if (!TradovateWebSocket.instance) {
      TradovateWebSocket.instance = new TradovateWebSocket();
    }
    return TradovateWebSocket.instance;
  }

  async connect(): Promise<boolean> {
    if (this.mdConnected) return true;

    try {
      const authResponse = await fetch('/api/tradovate/auth');
      const authData = await authResponse.json();

      if (!authData.accessToken) {
        console.error('[Tradovate] Auth failed:', authData.error);
        return false;
      }

      this.accessToken = authData.accessToken;
      this.connected = true;
      console.log('[Tradovate] Authenticated as:', authData.name);

      await this.connectMarketData();
      return true;
    } catch (error) {
      console.error('[Tradovate] Connection error:', error);
      return false;
    }
  }

  private connectMarketData(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mdWs = new WebSocket(TRADOVATE_DEMO_MD_WS);

      this.mdWs.onopen = () => {
        console.log('[Tradovate MD] WebSocket connected');
        this.sendMD(`authorize\n${this.requestId()}\n\n${this.accessToken}`);

        // Tradovate requires heartbeat every 2.5s
        this.heartbeatInterval = setInterval(() => {
          this.sendMD('[]');
        }, 2500);
      };

      this.mdWs.onmessage = (event) => {
        const msg = event.data as string;
        this.handleMDMessage(msg);
        if (!this.mdConnected && msg.includes('"s":200')) {
          this.mdConnected = true;
          console.log('[Tradovate MD] Authorized');
          resolve();
        }
      };

      this.mdWs.onerror = (error) => {
        console.error('[Tradovate MD] WebSocket error:', error);
        reject(error);
      };

      this.mdWs.onclose = () => {
        console.log('[Tradovate MD] WebSocket closed');
        this.mdConnected = false;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      };

      setTimeout(() => {
        if (!this.mdConnected) reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  private requestId(): number {
    return Date.now();
  }

  private sendMD(message: string): void {
    if (this.mdWs && this.mdWs.readyState === WebSocket.OPEN) {
      this.mdWs.send(message);
    }
  }

  private handleMDMessage(data: string): void {
    // Tradovate frame format: "endpoint\nrequestId\nbody"
    // Or simplified: "event\nJSON"
    const lines = data.split('\n');
    if (lines.length < 2) return;

    const event = lines[0];
    let payload: unknown;

    try {
      payload = JSON.parse(lines.slice(1).join('\n'));
    } catch {
      // Some messages (like auth responses) may not parse as JSON
      return;
    }

    switch (event) {
      case 'md':
        this.handleMarketData(payload as Record<string, unknown>);
        break;
      case 'chart':
        this.handleChartData(payload as ChartData);
        break;
      case 'dom':
        this.handleDOMData(payload as DOMData);
        break;
    }
  }

  private handleMarketData(data: Record<string, unknown>): void {
    const contractId = data.contractId as number;
    const symbol = this.getSymbolByContractId(contractId);
    if (!symbol) return;

    // Quote updates
    const handlers = this.quoteHandlers.get(symbol);
    if (handlers) {
      const quote = {
        bid: (data.bid as { price: number })?.price || 0,
        ask: (data.offer as { price: number })?.price || 0,
        last: (data.trade as { price: number })?.price || 0,
      };
      handlers.forEach(h => h(quote));
    }

    // Trade updates
    if (data.trade) {
      const trade = data.trade as { price: number; size: number; timestamp: string; aggressor: number };
      const tradeHandlers = this.tradeHandlers.get(symbol);
      if (tradeHandlers) {
        const tradeData: Trade = {
          id: Date.now().toString(),
          price: trade.price,
          quantity: trade.size,
          time: new Date(trade.timestamp).getTime(),
          isBuyerMaker: trade.aggressor === 1,
        };
        tradeHandlers.forEach(h => h(tradeData));
      }
    }
  }

  private handleChartData(data: ChartData): void {
    const symbol = this.getSymbolByContractId(data.id);
    if (!symbol || !data.bars || data.bars.length === 0) return;

    const candles: Candle[] = data.bars.map(bar => ({
      time: Math.floor(new Date(bar.timestamp).getTime() / 1000),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.upVolume + bar.downVolume,
    }));

    // First batch = historical data
    if (!this.receivedHistory && this.historyHandler && candles.length > 1) {
      this.receivedHistory = true;
      this.historyHandler(candles);
      return;
    }

    // Subsequent messages = live updates
    const handlers = this.klineHandlers.get(symbol);
    if (!handlers) return;

    candles.forEach((candle, index) => {
      const isClosed = index < candles.length - 1;
      handlers.forEach(h => h(candle, isClosed));
    });
  }

  private handleDOMData(_data: DOMData): void {
    // Reserved for orderbook visualization
  }

  private getSymbolByContractId(contractId: number): string | undefined {
    for (const [symbol, id] of this.contractIds) {
      if (id === contractId) return symbol;
    }
    return undefined;
  }

  async getContractId(symbol: string): Promise<number | null> {
    if (this.contractIds.has(symbol)) {
      return this.contractIds.get(symbol)!;
    }

    try {
      const response = await fetch(`/api/tradovate/contract?symbol=${encodeURIComponent(symbol)}`);
      const data = await response.json();
      if (data.id) {
        this.contractIds.set(symbol, data.id);
        return data.id;
      }
    } catch (error) {
      console.error('[Tradovate] Failed to get contract:', error);
    }
    return null;
  }

  /**
   * Subscribe to chart bars (historical + live).
   * The first batch of bars triggers `onHistory` callback.
   * Subsequent bars trigger the `handler` callback.
   */
  async subscribeChart(
    symbol: string,
    interval: number,
    handler: KlineHandler,
    onHistory?: HistoryHandler
  ): Promise<() => void> {
    if (!this.mdConnected) {
      const ok = await this.connect();
      if (!ok) return () => {};
    }

    const contractId = await this.getContractId(symbol);
    if (!contractId) {
      console.error('[Tradovate] Contract not found:', symbol);
      return () => {};
    }

    // Reset history state for new subscription
    this.receivedHistory = false;
    this.historyHandler = onHistory || null;

    if (!this.klineHandlers.has(symbol)) {
      this.klineHandlers.set(symbol, new Set());
    }
    this.klineHandlers.get(symbol)!.add(handler);

    // Calculate time range based on interval
    const barsNeeded = 500;
    const msPerBar = interval * 60 * 1000;
    const lookbackMs = barsNeeded * msPerBar;

    const request = {
      symbol,
      chartDescription: {
        underlyingType: interval >= 1440 ? 'DailyBar' : 'MinuteBar',
        elementSize: interval >= 1440 ? 1 : interval,
        elementSizeUnit: 'UnderlyingUnits',
        withHistogram: true,
      },
      timeRange: {
        asFarAsTimestamp: new Date(Date.now() - lookbackMs).toISOString(),
        asMuchAsElements: barsNeeded,
      },
    };

    this.sendMD(`md/getChart\n${this.requestId()}\n\n${JSON.stringify(request)}`);

    return () => {
      this.klineHandlers.get(symbol)?.delete(handler);
      this.historyHandler = null;
      if (this.klineHandlers.get(symbol)?.size === 0) {
        const subId = this.subscriptions.get(symbol);
        if (subId) {
          this.sendMD(`md/cancelChart\n${this.requestId()}\n\n${JSON.stringify({ subscriptionId: subId })}`);
        }
      }
    };
  }

  async subscribeQuotes(symbol: string, handler: QuoteHandler): Promise<() => void> {
    if (!this.mdConnected) {
      const ok = await this.connect();
      if (!ok) return () => {};
    }

    const contractId = await this.getContractId(symbol);
    if (!contractId) {
      console.error('[Tradovate] Contract not found:', symbol);
      return () => {};
    }

    if (!this.quoteHandlers.has(symbol)) {
      this.quoteHandlers.set(symbol, new Set());
    }
    this.quoteHandlers.get(symbol)!.add(handler);

    this.sendMD(`md/subscribeQuote\n${this.requestId()}\n\n${JSON.stringify({ symbol })}`);

    return () => {
      this.quoteHandlers.get(symbol)?.delete(handler);
      if (this.quoteHandlers.get(symbol)?.size === 0) {
        this.sendMD(`md/unsubscribeQuote\n${this.requestId()}\n\n${JSON.stringify({ symbol })}`);
      }
    };
  }

  async subscribeTrades(symbol: string, handler: TradeHandler): Promise<() => void> {
    if (!this.mdConnected) {
      const ok = await this.connect();
      if (!ok) return () => {};
    }

    if (!this.tradeHandlers.has(symbol)) {
      this.tradeHandlers.set(symbol, new Set());
    }
    this.tradeHandlers.get(symbol)!.add(handler);

    // Trades come via quote subscription
    this.sendMD(`md/subscribeQuote\n${this.requestId()}\n\n${JSON.stringify({ symbol })}`);

    return () => {
      this.tradeHandlers.get(symbol)?.delete(handler);
    };
  }

  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.mdWs) {
      this.mdWs.close();
      this.mdWs = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.mdConnected = false;
    this.receivedHistory = false;
    this.historyHandler = null;
    this.klineHandlers.clear();
    this.tradeHandlers.clear();
    this.quoteHandlers.clear();
  }

  isConnectedMD(): boolean {
    return this.mdConnected;
  }
}

export const tradovateWS = TradovateWebSocket.getInstance();
export default TradovateWebSocket;
