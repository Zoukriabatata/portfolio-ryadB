/**
 * WEBSOCKET SERVER
 *
 * Accepts browser connections, authenticates via JWT,
 * and routes messages to/from the GatewayManager.
 *
 * Protocol: JSON messages over WSS
 * Auth: First message must be { type: "auth", token: "jwt..." }
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { GatewayManager } from './GatewayManager';
import { config } from './config';
// Inline types to avoid rootDir issues
interface IBTrade {
  symbol: string; price: number; size: number;
  side: 'BID' | 'ASK'; timestamp: number; exchange: string;
}
interface IBDepthRow { price: number; size: number; numOrders: number; }
interface IBDepthUpdate { symbol: string; timestamp: number; bids: IBDepthRow[]; asks: IBDepthRow[]; }
interface IBQuote {
  symbol: string; bid: number; ask: number; last: number;
  bidSize: number; askSize: number; lastSize: number;
  volume: number; high: number; low: number; open: number; close: number;
  timestamp: number;
}
type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: 'trades' | 'depth' | 'quotes'; symbol: string }
  | { type: 'unsubscribe'; channel: 'trades' | 'depth' | 'quotes'; symbol: string }
  | { type: 'change_symbol'; symbol: string }
  | { type: 'ping' };
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

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  isAlive: boolean;
  authTimer: NodeJS.Timeout | null;
}

export class GatewayWebSocketServer {
  private wss: WSServer;
  private server: http.Server;
  private manager: GatewayManager;
  private clients: Map<WebSocket, AuthenticatedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(manager: GatewayManager) {
    this.manager = manager;

    // Create HTTP server (for health checks and WSS upgrade)
    this.server = http.createServer((req, res) => {
      if (req.url === '/health') {
        const stats = manager.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          ...stats,
          timestamp: Date.now(),
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    // Create WebSocket server
    this.wss = new WSServer({ server: this.server });
    this.setupWSS();
    this.startHeartbeat();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  start(): void {
    this.server.listen(config.port, config.host, () => {
      console.log(`[Gateway] WebSocket server listening on ws://${config.host}:${config.port}`);
      console.log(`[Gateway] Health check: http://${config.host}:${config.port}/health`);
    });
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    for (const [ws, client] of this.clients) {
      if (client.authTimer) clearTimeout(client.authTimer);
      ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    this.wss.close();
    this.server.close();
    console.log('[Gateway] Server stopped');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBSOCKET HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private setupWSS(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
      console.log(`[Gateway] New connection from ${ip}`);

      const client: AuthenticatedClient = {
        ws,
        userId: '',
        isAlive: true,
        authTimer: null,
      };

      this.clients.set(ws, client);

      // Must authenticate within 10 seconds
      client.authTimer = setTimeout(() => {
        if (!client.userId) {
          console.log(`[Gateway] Auth timeout for ${ip}`);
          this.sendToClient(ws, { type: 'auth_error', error: 'Authentication timeout' });
          ws.close(4001, 'Authentication timeout');
        }
      }, 10_000);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      ws.on('pong', () => {
        const c = this.clients.get(ws);
        if (c) c.isAlive = true;
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleDisconnect(ws, code, reason.toString());
      });

      ws.on('error', (err: Error) => {
        console.error(`[Gateway] WebSocket error:`, err.message);
      });
    });
  }

  private handleMessage(ws: WebSocket, raw: Buffer): void {
    const client = this.clients.get(ws);
    if (!client) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      this.sendToClient(ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }

    // First message must be auth
    if (!client.userId && msg.type !== 'auth') {
      this.sendToClient(ws, { type: 'auth_error', error: 'Must authenticate first' });
      return;
    }

    switch (msg.type) {
      case 'auth':
        this.handleAuth(ws, client, msg.token);
        break;

      case 'subscribe':
        this.manager.subscribe(client.userId, msg.channel, msg.symbol);
        break;

      case 'unsubscribe':
        this.manager.unsubscribe(client.userId, msg.channel, msg.symbol);
        break;

      case 'change_symbol':
        this.manager.changeSymbol(client.userId, msg.symbol);
        break;

      case 'ping':
        this.manager.recordActivity(client.userId);
        this.sendToClient(ws, { type: 'pong', serverTime: Date.now() });
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION
  // ═══════════════════════════════════════════════════════════════════════════

  private handleAuth(ws: WebSocket, client: AuthenticatedClient, token: string): void {
    if (client.authTimer) {
      clearTimeout(client.authTimer);
      client.authTimer = null;
    }

    // Verify JWT
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        id?: string;
        userId?: string;
        email?: string;
        sub?: string;
      };

      const userId = decoded.id || decoded.userId || decoded.sub;
      if (!userId) {
        this.sendToClient(ws, { type: 'auth_error', error: 'Invalid token: no user ID' });
        ws.close(4003, 'Invalid token');
        return;
      }

      client.userId = userId;

      // Create IB session for this user
      const success = this.manager.createSession(userId, (msg) => {
        this.sendToClient(ws, msg);
      });

      if (success) {
        this.sendToClient(ws, { type: 'auth_ok', userId });
        console.log(`[Gateway] Authenticated: ${userId}`);
      } else {
        ws.close(4004, 'Server at capacity');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Token verification failed';
      this.sendToClient(ws, { type: 'auth_error', error: errorMsg });
      ws.close(4003, 'Authentication failed');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISCONNECT HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  private handleDisconnect(ws: WebSocket, code: number, reason: string): void {
    const client = this.clients.get(ws);
    if (!client) return;

    if (client.authTimer) {
      clearTimeout(client.authTimer);
    }

    if (client.userId) {
      this.manager.destroySession(client.userId);
      console.log(`[Gateway] Disconnected: ${client.userId} (code=${code})`);
    }

    this.clients.delete(ws);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients) {
        if (!client.isAlive) {
          console.log(`[Gateway] Heartbeat timeout: ${client.userId || 'unauthenticated'}`);
          ws.terminate();
          this.handleDisconnect(ws, 1006, 'Heartbeat timeout');
          continue;
        }
        client.isAlive = false;
        ws.ping();
      }
    }, config.heartbeatIntervalMs);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private sendToClient(ws: WebSocket, msg: GatewayMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
