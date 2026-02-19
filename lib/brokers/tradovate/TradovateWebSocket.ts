/**
 * Tradovate WebSocket Client
 *
 * Handles real-time market data and order/position updates.
 * Protocol: Tradovate uses a frame-based protocol over WebSocket.
 *
 * Frame format:
 *   a]<json>  - authorize
 *   md/... - market data endpoints
 *   <url>\n<id>\n<body> - standard request frame
 */

import { TradovateAuth } from './TradovateAuth';

export type TradovateWSEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; error: string }
  | { type: 'quote'; data: TradovateQuote }
  | { type: 'dom'; data: TradovateDom }
  | { type: 'chart'; data: TradovateChartBar }
  | { type: 'order'; data: unknown }
  | { type: 'position'; data: unknown };

export interface TradovateQuote {
  contractId: number;
  timestamp: string;
  bidPrice: number;
  bidSize: number;
  offerPrice: number;
  offerSize: number;
  lastPrice?: number;
  lastSize?: number;
  volume?: number;
}

export interface TradovateDom {
  contractId: number;
  timestamp: string;
  bids: { price: number; size: number }[];
  offers: { price: number; size: number }[];
}

export interface TradovateChartBar {
  contractId: number;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type EventHandler = (event: TradovateWSEvent) => void;

export class TradovateWebSocket {
  private auth: TradovateAuth;
  private ws: WebSocket | null = null;
  private mdWs: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private requestId = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;
  private subscriptions: Map<string, number> = new Map(); // symbol -> contractId

  constructor(auth: TradovateAuth) {
    this.auth = auth;
  }

  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: TradovateWSEvent): void {
    this.handlers.forEach((h) => h(event));
  }

  async connect(): Promise<void> {
    if (!this.auth.isAuthenticated) {
      throw new Error('Must authenticate before connecting WebSocket');
    }

    return new Promise((resolve, reject) => {
      try {
        // Main WebSocket (orders, positions, user events)
        this.ws = new WebSocket(this.auth.wsUrl);

        this.ws.onopen = () => {
          this.authorize(this.ws!);
          this.startHeartbeat(this.ws!);
          this.emit({ type: 'connected' });
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string, 'main');
        };

        this.ws.onclose = (event) => {
          this.emit({ type: 'disconnected', reason: event.reason || 'Connection closed' });
          this.stopHeartbeat();
        };

        this.ws.onerror = () => {
          reject(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  async connectMarketData(): Promise<void> {
    if (!this.auth.isAuthenticated) {
      throw new Error('Must authenticate before connecting market data');
    }

    return new Promise((resolve, reject) => {
      try {
        this.mdWs = new WebSocket(this.auth.mdWsUrl);

        this.mdWs.onopen = () => {
          this.authorize(this.mdWs!);
          this.startHeartbeat(this.mdWs!);
          resolve();
        };

        this.mdWs.onmessage = (event) => {
          this.handleMessage(event.data as string, 'md');
        };

        this.mdWs.onclose = () => {
          // Attempt reconnect for market data
          if (!this.reconnecting) {
            this.reconnecting = true;
            setTimeout(() => {
              this.reconnecting = false;
              this.connectMarketData().catch(console.error);
            }, 5000);
          }
        };

        this.mdWs.onerror = () => {
          reject(new Error('Market data WebSocket connection failed'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  subscribeQuotes(contractId: number): void {
    if (!this.mdWs || this.mdWs.readyState !== WebSocket.OPEN) return;
    const id = ++this.requestId;
    this.sendFrame(this.mdWs, `md/subscribeQuote\n${id}\n${JSON.stringify({ symbol: contractId })}`);
  }

  subscribeDom(contractId: number): void {
    if (!this.mdWs || this.mdWs.readyState !== WebSocket.OPEN) return;
    const id = ++this.requestId;
    this.sendFrame(this.mdWs, `md/subscribeDOM\n${id}\n${JSON.stringify({ symbol: contractId })}`);
  }

  unsubscribeQuotes(contractId: number): void {
    if (!this.mdWs || this.mdWs.readyState !== WebSocket.OPEN) return;
    const id = ++this.requestId;
    this.sendFrame(this.mdWs, `md/unsubscribeQuote\n${id}\n${JSON.stringify({ symbol: contractId })}`);
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.subscriptions.clear();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.mdWs) {
      this.mdWs.onclose = null;
      this.mdWs.close();
      this.mdWs = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── Internal ───

  private authorize(ws: WebSocket): void {
    const token = this.auth.token;
    if (!token) return;
    ws.send(`authorize\n0\n\n${token}`);
  }

  private sendFrame(ws: WebSocket, frame: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame);
    }
  }

  private handleMessage(raw: string, source: 'main' | 'md'): void {
    // Tradovate sends different frame types
    if (!raw || raw === '[]') return;

    try {
      // Heartbeat response
      if (raw.startsWith('h')) return;

      // Try parsing as JSON array of events
      const events = JSON.parse(raw);
      if (!Array.isArray(events)) return;

      for (const event of events) {
        if (!event.e) continue;

        switch (event.e) {
          case 'md/quote':
            if (event.d) {
              this.emit({ type: 'quote', data: event.d });
            }
            break;
          case 'md/dom':
            if (event.d) {
              this.emit({ type: 'dom', data: event.d });
            }
            break;
          case 'md/chart':
            if (event.d) {
              this.emit({ type: 'chart', data: event.d });
            }
            break;
          case 'order':
          case 'order/item':
            this.emit({ type: 'order', data: event.d });
            break;
          case 'position':
          case 'position/item':
            this.emit({ type: 'position', data: event.d });
            break;
        }
      }
    } catch {
      // Not JSON, could be auth response or heartbeat
    }
  }

  private startHeartbeat(ws: WebSocket): void {
    // Tradovate expects periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('[]');
      }
    }, 2500);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
