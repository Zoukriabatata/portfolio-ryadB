/**
 * IB CONNECTOR CLIENT - Browser-side
 *
 * WebSocket client that connects to the IB Gateway Bridge server.
 * Handles authentication, reconnection, and message routing.
 *
 * Usage:
 *   const client = IBConnectorClient.getInstance();
 *   client.connect('wss://gateway.example.com', jwtToken);
 *   client.subscribe('trades', 'ES');
 *   client.onTrade((trade) => { ... });
 */

import type {
  ClientMessage,
  GatewayMessage,
  IBTrade,
  IBDepthUpdate,
  IBQuote,
  GatewayConnectionStatus,
} from '@/types/ib-protocol';

type TradeCallback = (trade: IBTrade) => void;
type DepthCallback = (depth: IBDepthUpdate) => void;
type QuoteCallback = (quote: IBQuote) => void;
type StatusCallback = (status: GatewayConnectionStatus, message?: string) => void;

export class IBConnectorClient {
  private static instance: IBConnectorClient;

  private ws: WebSocket | null = null;
  private gatewayUrl: string = '';
  private jwtToken: string = '';
  private authenticated = false;
  private status: GatewayConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private tradeCallbacks: Set<TradeCallback> = new Set();
  private depthCallbacks: Set<DepthCallback> = new Set();
  private quoteCallbacks: Set<QuoteCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();

  // Pending subscriptions (queued before auth completes)
  private pendingSubscriptions: ClientMessage[] = [];

  // Stats
  private tradeCount = 0;
  private lastTradeTime = 0;
  private currentPrice = 0;

  private constructor() {}

  static getInstance(): IBConnectorClient {
    if (!IBConnectorClient.instance) {
      IBConnectorClient.instance = new IBConnectorClient();
    }
    return IBConnectorClient.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  connect(gatewayUrl: string, jwtToken: string): void {
    this.gatewayUrl = gatewayUrl;
    this.jwtToken = jwtToken;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setStatus('authenticating');

    try {
      this.ws = new WebSocket(this.gatewayUrl);

      this.ws.onopen = () => {
        console.debug('[IBClient] Connected to gateway, authenticating...');
        this.send({ type: 'auth', token: this.jwtToken });
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onerror = () => {
        console.warn('[IBClient] WebSocket error');
      };

      this.ws.onclose = (event) => {
        console.debug(`[IBClient] Closed: ${event.code}`);
        this.stopHeartbeat();
        this.authenticated = false;
        this.setStatus('disconnected');
        this.attemptReconnect();
      };
    } catch (error) {
      console.error('[IBClient] Connection error:', error);
      this.setStatus('error');
      this.attemptReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.authenticated = false;
    this.setStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(raw: string): void {
    let msg: GatewayMessage;
    try {
      msg = JSON.parse(raw) as GatewayMessage;
    } catch {
      console.error('[IBClient] Invalid JSON from gateway');
      return;
    }

    switch (msg.type) {
      case 'auth_ok':
        this.authenticated = true;
        this.reconnectAttempts = 0;
        this.setStatus('connecting_ib');
        console.debug(`[IBClient] Authenticated as ${msg.userId}`);
        // Flush pending subscriptions
        this.flushPendingSubscriptions();
        break;

      case 'auth_error':
        console.error(`[IBClient] Auth failed: ${msg.error}`);
        this.setStatus('error');
        // Don't reconnect on auth failure
        this.reconnectAttempts = this.maxReconnectAttempts;
        break;

      case 'connected':
        if (msg.ibStatus === 'connected') {
          this.setStatus('connected');
        }
        break;

      case 'disconnected':
        this.setStatus('disconnected');
        break;

      case 'error':
        console.error(`[IBClient] Gateway error: ${msg.error}`);
        if (msg.code === 'MAX_USERS') {
          this.setStatus('error');
        }
        break;

      case 'pong':
        // Heartbeat response OK
        break;

      case 'trade':
        this.tradeCount++;
        this.lastTradeTime = Date.now();
        this.currentPrice = msg.data.price;
        this.tradeCallbacks.forEach(cb => cb(msg.data));
        break;

      case 'depth':
        this.depthCallbacks.forEach(cb => cb(msg.data));
        break;

      case 'quote':
        if (msg.data.last) {
          this.currentPrice = msg.data.last;
        }
        this.quoteCallbacks.forEach(cb => cb(msg.data));
        break;

      case 'subscribed':
        console.debug(`[IBClient] Subscribed: ${msg.channel}:${msg.symbol}`);
        break;

      case 'unsubscribed':
        console.debug(`[IBClient] Unsubscribed: ${msg.channel}:${msg.symbol}`);
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  subscribe(channel: 'trades' | 'depth' | 'quotes', symbol: string): void {
    const msg: ClientMessage = { type: 'subscribe', channel, symbol };
    if (this.authenticated) {
      this.send(msg);
    } else {
      this.pendingSubscriptions.push(msg);
    }
  }

  unsubscribe(channel: 'trades' | 'depth' | 'quotes', symbol: string): void {
    this.send({ type: 'unsubscribe', channel, symbol });
  }

  changeSymbol(symbol: string): void {
    this.send({ type: 'change_symbol', symbol });
  }

  private flushPendingSubscriptions(): void {
    for (const msg of this.pendingSubscriptions) {
      this.send(msg);
    }
    this.pendingSubscriptions = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  onTrade(callback: TradeCallback): () => void {
    this.tradeCallbacks.add(callback);
    return () => this.tradeCallbacks.delete(callback);
  }

  onDepth(callback: DepthCallback): () => void {
    this.depthCallbacks.add(callback);
    return () => this.depthCallbacks.delete(callback);
  }

  onQuote(callback: QuoteCallback): () => void {
    this.quoteCallbacks.add(callback);
    return () => this.quoteCallbacks.delete(callback);
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.status);
    return () => this.statusCallbacks.delete(callback);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  getStatus(): GatewayConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  getTradeCount(): number {
    return this.tradeCount;
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  getLastTradeTime(): number {
    return this.lastTradeTime;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNALS
  // ═══════════════════════════════════════════════════════════════════════════

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setStatus(status: GatewayConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusCallbacks.forEach(cb => cb(status));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 15_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('error');
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;

    console.debug(`[IBClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }
}

export function getIBConnector(): IBConnectorClient {
  return IBConnectorClient.getInstance();
}
