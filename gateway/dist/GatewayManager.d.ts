/**
 * GATEWAY MANAGER
 *
 * Manages per-user IBBridge instances.
 * Each authenticated user gets their own IB connection with a unique clientId.
 *
 * Lifecycle:
 *   User connects via WebSocket → JWT verified → IBBridge created → Data flows
 *   User disconnects → IBBridge destroyed → IB connection closed
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
type GatewayMessage = {
    type: 'auth_ok';
    userId: string;
} | {
    type: 'auth_error';
    error: string;
} | {
    type: 'connected';
    ibStatus: 'connected' | 'connecting';
} | {
    type: 'disconnected';
    reason: string;
} | {
    type: 'error';
    error: string;
    code?: string;
} | {
    type: 'pong';
    serverTime: number;
} | {
    type: 'trade';
    data: IBTrade;
} | {
    type: 'depth';
    data: IBDepthUpdate;
} | {
    type: 'quote';
    data: IBQuote;
} | {
    type: 'subscribed';
    channel: string;
    symbol: string;
} | {
    type: 'unsubscribed';
    channel: string;
    symbol: string;
};
export declare class GatewayManager {
    private sessions;
    private nextClientId;
    private inactivityTimer;
    constructor();
    /**
     * Create a new user session with its own IB connection.
     * Returns false if max users reached.
     */
    createSession(userId: string, sendMessage: (msg: GatewayMessage) => void): boolean;
    /**
     * Destroy a user session and clean up all resources.
     */
    destroySession(userId: string): void;
    /**
     * Subscribe a user to market data for a symbol.
     */
    subscribe(userId: string, channel: 'trades' | 'depth' | 'quotes', symbol: string): void;
    /**
     * Unsubscribe a user from a symbol.
     */
    unsubscribe(userId: string, channel: 'trades' | 'depth' | 'quotes', symbol: string): void;
    /**
     * Change the primary symbol for a user (unsubscribe old, subscribe new).
     */
    changeSymbol(userId: string, newSymbol: string): void;
    recordActivity(userId: string): void;
    private startInactivityCheck;
    getConnectedUsers(): number;
    hasSession(userId: string): boolean;
    getStats(): {
        connectedUsers: number;
        uptime: number;
    };
    /**
     * Graceful shutdown - disconnect all users.
     */
    shutdown(): void;
}
export {};
//# sourceMappingURL=GatewayManager.d.ts.map