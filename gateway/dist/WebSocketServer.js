"use strict";
/**
 * WEBSOCKET SERVER
 *
 * Accepts browser connections, authenticates via JWT,
 * and routes messages to/from the GatewayManager.
 *
 * Protocol: JSON messages over WSS
 * Auth: First message must be { type: "auth", token: "jwt..." }
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayWebSocketServer = void 0;
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("./config");
class GatewayWebSocketServer {
    wss;
    server;
    manager;
    clients = new Map();
    heartbeatInterval = null;
    constructor(manager) {
        this.manager = manager;
        // Create HTTP server (for health checks and WSS upgrade)
        this.server = http_1.default.createServer((req, res) => {
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
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.setupWSS();
        this.startHeartbeat();
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // SERVER LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════════
    start() {
        this.server.listen(config_1.config.port, config_1.config.host, () => {
            console.log(`[Gateway] WebSocket server listening on ws://${config_1.config.host}:${config_1.config.port}`);
            console.log(`[Gateway] Health check: http://${config_1.config.host}:${config_1.config.port}/health`);
        });
    }
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        // Close all client connections
        for (const [ws, client] of this.clients) {
            if (client.authTimer)
                clearTimeout(client.authTimer);
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
    setupWSS() {
        this.wss.on('connection', (ws, req) => {
            const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || 'unknown';
            console.log(`[Gateway] New connection from ${ip}`);
            const client = {
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
            ws.on('message', (data) => {
                this.handleMessage(ws, data);
            });
            ws.on('pong', () => {
                const c = this.clients.get(ws);
                if (c)
                    c.isAlive = true;
            });
            ws.on('close', (code, reason) => {
                this.handleDisconnect(ws, code, reason.toString());
            });
            ws.on('error', (err) => {
                console.error(`[Gateway] WebSocket error:`, err.message);
            });
        });
    }
    handleMessage(ws, raw) {
        const client = this.clients.get(ws);
        if (!client)
            return;
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch {
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
    handleAuth(ws, client, token) {
        if (client.authTimer) {
            clearTimeout(client.authTimer);
            client.authTimer = null;
        }
        // Verify JWT
        try {
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
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
            }
            else {
                ws.close(4004, 'Server at capacity');
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Token verification failed';
            this.sendToClient(ws, { type: 'auth_error', error: errorMsg });
            ws.close(4003, 'Authentication failed');
        }
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // DISCONNECT HANDLING
    // ═══════════════════════════════════════════════════════════════════════════
    handleDisconnect(ws, code, reason) {
        const client = this.clients.get(ws);
        if (!client)
            return;
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
    startHeartbeat() {
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
        }, config_1.config.heartbeatIntervalMs);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    sendToClient(ws, msg) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }
}
exports.GatewayWebSocketServer = GatewayWebSocketServer;
//# sourceMappingURL=WebSocketServer.js.map