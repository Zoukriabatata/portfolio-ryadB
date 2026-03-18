/**
 * ConnectionManager
 *
 * Manages WebSocket sessions per user.
 * Multiple browser tabs for the same user share ONE Tradovate connection.
 * When all tabs close, the proxy disconnects after a grace period.
 */

'use strict';

const { TradovateProxy } = require('./TradovateProxy');
const { WebSocket } = require('ws');

// Grace period before tearing down an idle proxy connection
const IDLE_DISCONNECT_DELAY = 60_000; // 60 seconds

class ConnectionManager {
  /** @type {ConnectionManager | null} */
  static _instance = null;

  constructor() {
    /** @type {Map<string, TradovateProxy>} userId → proxy */
    this._proxies = new Map();
    /** @type {Map<string, Set<import('ws').WebSocket>>} userId → browser clients */
    this._clients = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} userId → cleanup timer */
    this._cleanupTimers = new Map();
  }

  static getInstance() {
    if (!ConnectionManager._instance) {
      ConnectionManager._instance = new ConnectionManager();
    }
    return ConnectionManager._instance;
  }

  /**
   * Handle a new browser WebSocket connection.
   * Creates a Tradovate proxy for the user if none exists, otherwise reuses it.
   *
   * @param {import('ws').WebSocket} ws
   * @param {{ userId: string; username: string; password: string; mode: string }} payload
   */
  async handleClient(ws, payload) {
    const { userId, username, password, mode } = payload;
    console.log(`[CM] Client connected: user=${userId}`);

    // Cancel any pending cleanup timer for this user
    const existingTimer = this._cleanupTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this._cleanupTimers.delete(userId);
    }

    // Track browser client
    if (!this._clients.has(userId)) {
      this._clients.set(userId, new Set());
    }
    this._clients.get(userId).add(ws);

    // Create or reuse Tradovate proxy
    let proxy = this._proxies.get(userId);
    if (!proxy) {
      proxy = new TradovateProxy({ userId, username, password, mode });
      this._proxies.set(userId, proxy);

      // Forward all market data to this user's browser clients
      proxy.on('data', (msg) => this._broadcast(userId, msg));
      proxy.on('status', (msg) => this._broadcast(userId, msg));

      try {
        await proxy.connect();
      } catch (err) {
        console.error(`[CM] Proxy connect failed for user=${userId}:`, err.message);
        ws.send(JSON.stringify({ type: 'error', code: 'PROXY_FAILED', message: err.message }));
      }
    } else {
      // Send current connection status immediately to the new tab
      ws.send(JSON.stringify({ type: 'status', status: proxy.getStatus() }));
    }

    // Handle messages from browser (subscribe/unsubscribe/ping)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleClientMessage(userId, proxy, msg, ws);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      console.log(`[CM] Client disconnected: user=${userId}`);
      this._clients.get(userId)?.delete(ws);

      const remaining = this._clients.get(userId)?.size ?? 0;
      if (remaining === 0) {
        // Grace period: keep proxy alive for quick page refreshes
        const timer = setTimeout(() => {
          if ((this._clients.get(userId)?.size ?? 0) === 0) {
            console.log(`[CM] No clients for user=${userId} — disconnecting proxy`);
            this._proxies.get(userId)?.disconnect();
            this._proxies.delete(userId);
            this._clients.delete(userId);
            this._cleanupTimers.delete(userId);
          }
        }, IDLE_DISCONNECT_DELAY);
        this._cleanupTimers.set(userId, timer);
      }
    });

    ws.on('error', (err) => {
      console.error(`[CM] Client WS error user=${userId}:`, err.message);
    });
  }

  /**
   * Handle a message from a browser client.
   * Routes subscription commands to the Tradovate proxy.
   */
  _handleClientMessage(userId, proxy, msg, ws) {
    switch (msg.type) {
      case 'subscribe:quote':
        proxy.subscribeQuote(msg.symbol);
        break;

      case 'subscribe:dom':
        proxy.subscribeDom(msg.symbol);
        break;

      case 'subscribe:trades':
        // Trades arrive via quote subscription in Tradovate
        proxy.subscribeQuote(msg.symbol);
        break;

      case 'subscribe:chart':
        proxy.subscribeChart(msg.symbol, msg.interval || 1);
        break;

      case 'unsubscribe':
        proxy.unsubscribe(msg.symbol);
        break;

      case 'ping':
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
        break;

      default:
        console.warn(`[CM] Unknown message type: ${msg.type}`);
    }
  }

  /**
   * Broadcast a message to all browser clients for a given user.
   */
  _broadcast(userId, msg) {
    const clients = this._clients.get(userId);
    if (!clients?.size) return;

    const payload = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  getActiveCount() {
    return this._proxies.size;
  }

  /** Gracefully disconnect all proxies on server shutdown. */
  shutdown() {
    for (const timer of this._cleanupTimers.values()) {
      clearTimeout(timer);
    }
    for (const proxy of this._proxies.values()) {
      proxy.disconnect();
    }
    this._proxies.clear();
    this._clients.clear();
    this._cleanupTimers.clear();
  }
}

module.exports = { ConnectionManager };
