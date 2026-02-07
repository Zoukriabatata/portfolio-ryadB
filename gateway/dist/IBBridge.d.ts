/**
 * IB BRIDGE - Per-user connection to IB Gateway/TWS
 *
 * Uses @stoqey/ib to connect to a local IB Gateway process.
 * Each user gets their own IBBridge instance with a unique clientId.
 *
 * Data flow:
 *   IB Gateway (local) ──► @stoqey/ib ──► IBBridge ──► WebSocket ──► Browser
 */
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
export declare class IBBridge {
    private ib;
    private clientId;
    private userId;
    private connected;
    private nextReqId;
    private reconnectAttempts;
    private reconnectTimer;
    private subscriptions;
    private symbolToReqIds;
    private quoteAccumulator;
    private tradeCallbacks;
    private depthCallbacks;
    private quoteCallbacks;
    private statusCallbacks;
    private depthBook;
    constructor(userId: string, clientId: number);
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    private setupEventHandlers;
    private handleTickPrice;
    private handleTickSize;
    /**
     * Classify trade as BID or ASK based on proximity to best bid/ask.
     * Trade at or above ask = buyer aggressor (ASK).
     * Trade at or below bid = seller aggressor (BID).
     */
    private classifyTrade;
    private handleDepthUpdate;
    subscribeMarketData(symbol: string): number;
    subscribeDepth(symbol: string, numRows?: number): number;
    unsubscribe(symbol: string): void;
    private buildContract;
    private getExchange;
    /**
     * Get front month contract expiry (YYYYMM format).
     * CME equity index futures: H(Mar), M(Jun), U(Sep), Z(Dec)
     */
    private getFrontMonth;
    private getOrCreateQuote;
    private addSymbolReqId;
    private scheduleReconnect;
    onTrade(cb: TradeCallback): () => void;
    onDepth(cb: DepthCallback): () => void;
    onQuote(cb: QuoteCallback): () => void;
    onStatus(cb: StatusCallback): () => void;
    private emitTrade;
    private emitDepth;
    private emitQuote;
    private emitStatus;
}
export {};
//# sourceMappingURL=IBBridge.d.ts.map