/**
 * RITHMIC WEBSOCKET CLIENT
 *
 * Client Next.js pour recevoir les trades CME depuis le bridge Python Rithmic.
 *
 * Architecture:
 *   Rithmic (Topstep) → Python Bridge → WebSocket → Ce client → Footprint Engine
 *
 * Usage:
 *   import { rithmicClient } from '@/lib/rithmic';
 *
 *   rithmicClient.connect();
 *   rithmicClient.subscribeTrades('NQ', (trade) => {
 *     console.log('Trade:', trade);
 *   });
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RithmicTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'bid' | 'ask' | 'unknown';
  timestamp: number;
  exchange: string;
}

export interface ClassifiedTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  timestamp: number;
}

type TradeCallback = (trade: ClassifiedTrade) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;

interface WebSocketMessage {
  type: 'welcome' | 'trade' | 'subscribed' | 'status' | 'pong';
  data?: RithmicTrade;
  message?: string;
  symbols?: string[];
  trade_count?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_WS_URL = 'ws://localhost:8765';

// CME Futures specifications
export const CME_SPECS: Record<string, { tickSize: number; tickValue: number }> = {
  'NQ': { tickSize: 0.25, tickValue: 5.00 },
  'MNQ': { tickSize: 0.25, tickValue: 0.50 },
  'ES': { tickSize: 0.25, tickValue: 12.50 },
  'MES': { tickSize: 0.25, tickValue: 1.25 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// RITHMIC CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

class RithmicClient {
  private static instance: RithmicClient;

  private ws: WebSocket | null = null;
  private wsUrl: string;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Callbacks
  private tradeCallbacks: Map<string, Set<TradeCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();

  // Stats
  private tradeCount = 0;
  private lastTradeTime = 0;

  private constructor(wsUrl: string = DEFAULT_WS_URL) {
    this.wsUrl = wsUrl;
  }

  static getInstance(wsUrl?: string): RithmicClient {
    if (!RithmicClient.instance) {
      RithmicClient.instance = new RithmicClient(wsUrl);
    }
    return RithmicClient.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  connect(url?: string): void {
    if (url) {
      this.wsUrl = url;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[Rithmic] Already connected or connecting');
      return;
    }

    this.emitStatus('connecting', 'Connecting to Rithmic bridge...');
    console.log(`[Rithmic] Connecting to ${this.wsUrl}...`);

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[Rithmic] ✓ Connected to bridge');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emitStatus('connected', 'Connected to Rithmic bridge');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Rithmic] WebSocket error:', error);
        this.emitStatus('error', 'WebSocket error');
      };

      this.ws.onclose = (event) => {
        console.log(`[Rithmic] Disconnected: ${event.code} - ${event.reason || 'No reason'}`);
        this.connected = false;
        this.stopHeartbeat();
        this.emitStatus('disconnected', 'Disconnected from bridge');
        this.scheduleReconnect();
      };

    } catch (error) {
      console.error('[Rithmic] Connection error:', error);
      this.emitStatus('error', 'Failed to connect');
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    console.log('[Rithmic] Disconnecting...');
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.connected = false;
    this.tradeCallbacks.clear();
    this.emitStatus('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Rithmic] Max reconnect attempts reached');
      this.emitStatus('error', 'Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[Rithmic] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case 'welcome':
          console.log('[Rithmic] Welcome:', message.message);
          console.log('[Rithmic] Available symbols:', message.symbols);
          break;

        case 'trade':
          if (message.data) {
            this.handleTrade(message.data);
          }
          break;

        case 'subscribed':
          console.log('[Rithmic] Subscribed to:', message.symbols);
          break;

        case 'status':
          console.log('[Rithmic] Status:', message);
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          console.log('[Rithmic] Unknown message:', message);
      }
    } catch (error) {
      console.error('[Rithmic] Failed to parse message:', error);
    }
  }

  private handleTrade(trade: RithmicTrade): void {
    this.tradeCount++;
    this.lastTradeTime = Date.now();

    // Log first few trades
    if (this.tradeCount <= 5) {
      console.log(`[Rithmic] Trade #${this.tradeCount}:`, {
        symbol: trade.symbol,
        price: trade.price,
        size: trade.size,
        side: trade.side,
      });
    }

    // Convert to ClassifiedTrade format
    const classified: ClassifiedTrade = {
      symbol: trade.symbol,
      price: trade.price,
      size: trade.size,
      side: trade.side === 'ask' ? 'ASK' : trade.side === 'bid' ? 'BID' : 'ASK',
      timestamp: trade.timestamp,
    };

    // Emit to callbacks
    this.tradeCallbacks.get(trade.symbol)?.forEach(cb => cb(classified));
    this.tradeCallbacks.get('*')?.forEach(cb => cb(classified)); // Wildcard subscribers
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  subscribeTrades(symbol: string, callback: TradeCallback): () => void {
    console.log(`[Rithmic] Subscribing to trades: ${symbol}`);

    if (!this.tradeCallbacks.has(symbol)) {
      this.tradeCallbacks.set(symbol, new Set());
    }
    this.tradeCallbacks.get(symbol)!.add(callback);

    // Request subscription from bridge
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        symbols: [symbol],
      }));
    }

    // Return unsubscribe function
    return () => {
      this.tradeCallbacks.get(symbol)?.delete(callback);
      if (this.tradeCallbacks.get(symbol)?.size === 0) {
        this.tradeCallbacks.delete(symbol);
      }
    };
  }

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
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  isConnected(): boolean {
    return this.connected;
  }

  getTradeCount(): number {
    return this.tradeCount;
  }

  getLastTradeTime(): number {
    return this.lastTradeTime;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const rithmicClient = RithmicClient.getInstance();

export function getRithmicClient(wsUrl?: string): RithmicClient {
  return RithmicClient.getInstance(wsUrl);
}

export default RithmicClient;
