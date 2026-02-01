import type { Candle, Trade } from '@/types/market';

const TRADOVATE_DEMO_WS = 'wss://demo.tradovateapi.com/v1/websocket';
const TRADOVATE_LIVE_WS = 'wss://live.tradovateapi.com/v1/websocket';
const TRADOVATE_DEMO_MD_WS = 'wss://md.tradovateapi.com/v1/websocket';

type KlineHandler = (candle: Candle, isClosed: boolean) => void;
type TradeHandler = (trade: Trade) => void;
type QuoteHandler = (quote: { bid: number; ask: number; last: number }) => void;

interface TradovateMessage {
  e?: string;       // event type
  d?: unknown;      // data
  i?: number;       // request id
  s?: number;       // status
}

interface ChartData {
  id: number;
  td: number;       // trade date
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

// CME Futures symbols mapping
export const CME_SYMBOLS: Record<string, { name: string; exchange: string; tickSize: number }> = {
  'MNQH5': { name: 'Micro E-mini Nasdaq Mar25', exchange: 'CME', tickSize: 0.25 },
  'MESH5': { name: 'Micro E-mini S&P Mar25', exchange: 'CME', tickSize: 0.25 },
  'NQH5': { name: 'E-mini Nasdaq Mar25', exchange: 'CME', tickSize: 0.25 },
  'ESH5': { name: 'E-mini S&P Mar25', exchange: 'CME', tickSize: 0.25 },
  'GCJ5': { name: 'Gold Apr25', exchange: 'COMEX', tickSize: 0.1 },
  'MGCJ5': { name: 'Micro Gold Apr25', exchange: 'COMEX', tickSize: 0.1 },
  // Current month contracts
  'MNQZ4': { name: 'Micro E-mini Nasdaq Dec24', exchange: 'CME', tickSize: 0.25 },
  'MESZ4': { name: 'Micro E-mini S&P Dec24', exchange: 'CME', tickSize: 0.25 },
  'NQZ4': { name: 'E-mini Nasdaq Dec24', exchange: 'CME', tickSize: 0.25 },
  'ESZ4': { name: 'E-mini S&P Dec24', exchange: 'CME', tickSize: 0.25 },
  'GCG5': { name: 'Gold Feb25', exchange: 'COMEX', tickSize: 0.1 },
  'MGCG5': { name: 'Micro Gold Feb25', exchange: 'COMEX', tickSize: 0.1 },
};

class TradovateWebSocket {
  private static instance: TradovateWebSocket;
  private ws: WebSocket | null = null;
  private mdWs: WebSocket | null = null;
  private accessToken: string | null = null;
  private isDemo = true;
  private requestId = 1;
  private connected = false;
  private mdConnected = false;

  private klineHandlers: Map<string, Set<KlineHandler>> = new Map();
  private tradeHandlers: Map<string, Set<TradeHandler>> = new Map();
  private quoteHandlers: Map<string, Set<QuoteHandler>> = new Map();

  private subscriptions: Map<string, number> = new Map(); // symbol -> subscription id
  private contractIds: Map<string, number> = new Map(); // symbol -> contract id
  private pendingRequests: Map<number, (data: unknown) => void> = new Map();

  private constructor() {}

  static getInstance(): TradovateWebSocket {
    if (!TradovateWebSocket.instance) {
      TradovateWebSocket.instance = new TradovateWebSocket();
    }
    return TradovateWebSocket.instance;
  }

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      // Get access token from our API route
      const authResponse = await fetch('/api/tradovate/auth');
      const authData = await authResponse.json();

      if (!authData.accessToken) {
        console.error('[Tradovate] Auth failed:', authData.error);
        return false;
      }

      this.accessToken = authData.accessToken;
      console.log('[Tradovate] Authenticated as:', authData.name);

      // Connect to market data WebSocket
      await this.connectMarketData();

      return true;
    } catch (error) {
      console.error('[Tradovate] Connection error:', error);
      return false;
    }
  }

  private connectMarketData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = TRADOVATE_DEMO_MD_WS;
      this.mdWs = new WebSocket(wsUrl);

      this.mdWs.onopen = () => {
        console.log('[Tradovate MD] WebSocket connected');
        // Authorize the connection
        this.sendMD(`authorize\n${this.accessToken}`);
      };

      this.mdWs.onmessage = (event) => {
        this.handleMDMessage(event.data);
        if (!this.mdConnected && event.data.includes('"s":200')) {
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
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.mdConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private sendMD(message: string): void {
    if (this.mdWs && this.mdWs.readyState === WebSocket.OPEN) {
      this.mdWs.send(message);
    }
  }

  private handleMDMessage(data: string): void {
    // Tradovate sends messages in format: "event\nJSON"
    const lines = data.split('\n');
    if (lines.length < 2) return;

    const event = lines[0];
    let payload: unknown;

    try {
      payload = JSON.parse(lines.slice(1).join('\n'));
    } catch {
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
    // Handle quote updates
    const contractId = data.contractId as number;
    const symbol = this.getSymbolByContractId(contractId);
    if (!symbol) return;

    const handlers = this.quoteHandlers.get(symbol);
    if (handlers) {
      const quote = {
        bid: (data.bid as { price: number })?.price || 0,
        ask: (data.offer as { price: number })?.price || 0,
        last: (data.trade as { price: number })?.price || 0,
      };
      handlers.forEach(h => h(quote));
    }

    // Handle trade updates
    if (data.trade) {
      const trade = data.trade as { price: number; size: number; timestamp: string; aggressor: number };
      const tradeHandlers = this.tradeHandlers.get(symbol);
      if (tradeHandlers) {
        const tradeData: Trade = {
          id: Date.now().toString(),
          price: trade.price,
          quantity: trade.size,
          time: new Date(trade.timestamp).getTime(),
          isBuyerMaker: trade.aggressor === 1, // 1 = sell, 2 = buy
        };
        tradeHandlers.forEach(h => h(tradeData));
      }
    }
  }

  private handleChartData(data: ChartData): void {
    const symbol = this.getSymbolByContractId(data.id);
    if (!symbol || !data.bars) return;

    const handlers = this.klineHandlers.get(symbol);
    if (!handlers) return;

    data.bars.forEach((bar, index) => {
      const candle: Candle = {
        time: Math.floor(new Date(bar.timestamp).getTime() / 1000),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.upVolume + bar.downVolume,
      };
      const isClosed = index < data.bars.length - 1;
      handlers.forEach(h => h(candle, isClosed));
    });
  }

  private handleDOMData(data: DOMData): void {
    // Handle depth of market data
    // Can be used for orderbook visualization
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
      const response = await fetch(`/api/tradovate/contract?symbol=${symbol}`);
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

  async subscribeQuotes(symbol: string, handler: QuoteHandler): Promise<() => void> {
    if (!this.mdConnected) {
      await this.connect();
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

    // Subscribe to market data
    this.sendMD(`md/subscribeQuote\n{"symbol":"${symbol}"}`);

    return () => {
      this.quoteHandlers.get(symbol)?.delete(handler);
      if (this.quoteHandlers.get(symbol)?.size === 0) {
        this.sendMD(`md/unsubscribeQuote\n{"symbol":"${symbol}"}`);
      }
    };
  }

  async subscribeChart(
    symbol: string,
    interval: number, // in minutes
    handler: KlineHandler
  ): Promise<() => void> {
    if (!this.mdConnected) {
      await this.connect();
    }

    const contractId = await this.getContractId(symbol);
    if (!contractId) {
      console.error('[Tradovate] Contract not found:', symbol);
      return () => {};
    }

    if (!this.klineHandlers.has(symbol)) {
      this.klineHandlers.set(symbol, new Set());
    }
    this.klineHandlers.get(symbol)!.add(handler);

    // Subscribe to chart data
    const request = {
      symbol,
      chartDescription: {
        underlyingType: 'MinuteBar',
        elementSize: interval,
        elementSizeUnit: 'UnderlyingUnits',
        withHistogram: true,
      },
      timeRange: {
        closestTimestamp: new Date().toISOString(),
        closestTickId: 0,
        asFarAsTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        asMuchAsElements: 500,
      },
    };

    this.sendMD(`md/getChart\n${JSON.stringify(request)}`);

    return () => {
      this.klineHandlers.get(symbol)?.delete(handler);
      if (this.klineHandlers.get(symbol)?.size === 0) {
        this.sendMD(`md/cancelChart\n{"subscriptionId":${this.subscriptions.get(symbol)}}`);
      }
    };
  }

  async subscribeTrades(symbol: string, handler: TradeHandler): Promise<() => void> {
    if (!this.mdConnected) {
      await this.connect();
    }

    if (!this.tradeHandlers.has(symbol)) {
      this.tradeHandlers.set(symbol, new Set());
    }
    this.tradeHandlers.get(symbol)!.add(handler);

    // Trades come with quote subscription
    this.sendMD(`md/subscribeQuote\n{"symbol":"${symbol}"}`);

    return () => {
      this.tradeHandlers.get(symbol)?.delete(handler);
    };
  }

  disconnect(): void {
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
  }

  isConnected(): boolean {
    return this.mdConnected;
  }
}

export const tradovateWS = TradovateWebSocket.getInstance();
export default TradovateWebSocket;
