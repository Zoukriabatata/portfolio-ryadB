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

import { IBBridge } from './IBBridge';
import { config } from './config';

// Inline types to avoid rootDir issues
interface IBTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  timestamp: number;
  exchange: string;
}
interface IBDepthRow { price: number; size: number; numOrders: number; }
interface IBDepthUpdate { symbol: string; timestamp: number; bids: IBDepthRow[]; asks: IBDepthRow[]; }
interface IBQuote {
  symbol: string; bid: number; ask: number; last: number;
  bidSize: number; askSize: number; lastSize: number;
  volume: number; high: number; low: number; open: number; close: number;
  timestamp: number;
}
type GatewayMessage =
  | { type: 'auth_ok'; userId: string }
  | { type: 'auth_error'; error: string }
  | { type: 'connected'; ibStatus: 'connected' | 'connecting' }
  | { type: 'disconnected'; reason: string }
  | { type: 'error'; error: string; code?: string }
  | { type: 'pong'; serverTime: number }
  | { type: 'trade'; data: IBTrade }
  | { type: 'depth'; data: IBDepthUpdate }
  | { type: 'quote'; data: IBQuote }
  | { type: 'subscribed'; channel: string; symbol: string }
  | { type: 'unsubscribed'; channel: string; symbol: string };

interface UserSession {
  userId: string;
  bridge: IBBridge;
  clientId: number;
  subscribedSymbols: Set<string>;
  sendMessage: (msg: GatewayMessage) => void;
  connectedAt: number;
  lastActivity: number;
  cleanupFns: (() => void)[];
}

export class GatewayManager {
  private sessions: Map<string, UserSession> = new Map();
  private nextClientId: number;
  private inactivityTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.nextClientId = config.ib.clientIdBase;
    this.startInactivityCheck();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new user session with its own IB connection.
   * Returns false if max users reached.
   */
  createSession(
    userId: string,
    sendMessage: (msg: GatewayMessage) => void
  ): boolean {
    // Check if user already has a session
    if (this.sessions.has(userId)) {
      console.log(`[GatewayManager] User ${userId} already connected, replacing session`);
      this.destroySession(userId);
    }

    // Check capacity
    if (this.sessions.size >= config.maxUsersPerGateway) {
      console.warn(`[GatewayManager] Max users reached (${config.maxUsersPerGateway})`);
      sendMessage({ type: 'error', error: 'Server at capacity', code: 'MAX_USERS' });
      return false;
    }

    const clientId = this.nextClientId++;
    const bridge = new IBBridge(userId, clientId);
    const cleanupFns: (() => void)[] = [];

    const session: UserSession = {
      userId,
      bridge,
      clientId,
      subscribedSymbols: new Set(),
      sendMessage,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      cleanupFns,
    };

    // Wire bridge events to WebSocket
    cleanupFns.push(
      bridge.onTrade((trade: IBTrade) => {
        sendMessage({ type: 'trade', data: trade });
      })
    );

    cleanupFns.push(
      bridge.onDepth((depth: IBDepthUpdate) => {
        sendMessage({ type: 'depth', data: depth });
      })
    );

    cleanupFns.push(
      bridge.onQuote((quote: Partial<IBQuote>) => {
        sendMessage({ type: 'quote', data: quote as IBQuote });
      })
    );

    cleanupFns.push(
      bridge.onStatus((status, message) => {
        if (status === 'connected') {
          sendMessage({ type: 'connected', ibStatus: 'connected' });
        } else if (status === 'disconnected') {
          sendMessage({ type: 'disconnected', reason: message || 'IB connection lost' });
        } else {
          sendMessage({ type: 'error', error: message || 'IB error' });
        }
      })
    );

    this.sessions.set(userId, session);

    // Connect to IB
    bridge.connect();
    sendMessage({ type: 'connected', ibStatus: 'connecting' });

    console.log(`[GatewayManager] Session created for ${userId} (clientId=${clientId}, total=${this.sessions.size})`);
    return true;
  }

  /**
   * Destroy a user session and clean up all resources.
   */
  destroySession(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    // Clean up all event listeners
    for (const cleanup of session.cleanupFns) {
      cleanup();
    }

    // Disconnect IB bridge
    session.bridge.disconnect();

    this.sessions.delete(userId);
    console.log(`[GatewayManager] Session destroyed for ${userId} (remaining=${this.sessions.size})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe a user to market data for a symbol.
   */
  subscribe(userId: string, channel: 'trades' | 'depth' | 'quotes', symbol: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    session.lastActivity = Date.now();
    const upperSymbol = symbol.toUpperCase();

    // Avoid duplicate subscriptions
    const subKey = `${channel}:${upperSymbol}`;
    if (session.subscribedSymbols.has(subKey)) {
      session.sendMessage({ type: 'subscribed', channel, symbol: upperSymbol });
      return;
    }

    session.subscribedSymbols.add(subKey);

    if (channel === 'trades' || channel === 'quotes') {
      session.bridge.subscribeMarketData(upperSymbol);
    } else if (channel === 'depth') {
      session.bridge.subscribeDepth(upperSymbol);
    }

    session.sendMessage({ type: 'subscribed', channel, symbol: upperSymbol });
    console.log(`[GatewayManager] ${userId} subscribed to ${channel}:${upperSymbol}`);
  }

  /**
   * Unsubscribe a user from a symbol.
   */
  unsubscribe(userId: string, channel: 'trades' | 'depth' | 'quotes', symbol: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    session.lastActivity = Date.now();
    const upperSymbol = symbol.toUpperCase();
    const subKey = `${channel}:${upperSymbol}`;

    session.subscribedSymbols.delete(subKey);

    // Only unsubscribe from IB if no other channels need the symbol
    const hasOtherSubs = ['trades', 'depth', 'quotes'].some(
      ch => ch !== channel && session.subscribedSymbols.has(`${ch}:${upperSymbol}`)
    );

    if (!hasOtherSubs) {
      session.bridge.unsubscribe(upperSymbol);
    }

    session.sendMessage({ type: 'unsubscribed', channel, symbol: upperSymbol });
  }

  /**
   * Change the primary symbol for a user (unsubscribe old, subscribe new).
   */
  changeSymbol(userId: string, newSymbol: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    // Unsubscribe from all current symbols
    for (const subKey of session.subscribedSymbols) {
      const [, sym] = subKey.split(':');
      session.bridge.unsubscribe(sym);
    }
    session.subscribedSymbols.clear();

    // Subscribe to new symbol (trades + depth)
    this.subscribe(userId, 'trades', newSymbol);
    this.subscribe(userId, 'depth', newSymbol);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY & CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  recordActivity(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  private startInactivityCheck(): void {
    // Check every 60 seconds for inactive sessions
    this.inactivityTimer = setInterval(() => {
      const now = Date.now();
      const maxInactive = 10 * 60 * 1000; // 10 minutes

      for (const [userId, session] of this.sessions) {
        if (now - session.lastActivity > maxInactive) {
          console.log(`[GatewayManager] Removing inactive session: ${userId}`);
          session.sendMessage({ type: 'disconnected', reason: 'Inactivity timeout' });
          this.destroySession(userId);
        }
      }
    }, 60_000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  getConnectedUsers(): number {
    return this.sessions.size;
  }

  hasSession(userId: string): boolean {
    return this.sessions.has(userId);
  }

  getStats(): { connectedUsers: number; uptime: number } {
    return {
      connectedUsers: this.sessions.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Graceful shutdown - disconnect all users.
   */
  shutdown(): void {
    console.log(`[GatewayManager] Shutting down (${this.sessions.size} active sessions)...`);

    if (this.inactivityTimer) {
      clearInterval(this.inactivityTimer);
    }

    for (const userId of this.sessions.keys()) {
      this.destroySession(userId);
    }
  }
}
