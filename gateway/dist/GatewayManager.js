"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayManager = void 0;
const IBBridge_1 = require("./IBBridge");
const config_1 = require("./config");
class GatewayManager {
    sessions = new Map();
    nextClientId;
    inactivityTimer = null;
    constructor() {
        this.nextClientId = config_1.config.ib.clientIdBase;
        this.startInactivityCheck();
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // USER SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Create a new user session with its own IB connection.
     * Returns false if max users reached.
     */
    createSession(userId, sendMessage) {
        // Check if user already has a session
        if (this.sessions.has(userId)) {
            console.log(`[GatewayManager] User ${userId} already connected, replacing session`);
            this.destroySession(userId);
        }
        // Check capacity
        if (this.sessions.size >= config_1.config.maxUsersPerGateway) {
            console.warn(`[GatewayManager] Max users reached (${config_1.config.maxUsersPerGateway})`);
            sendMessage({ type: 'error', error: 'Server at capacity', code: 'MAX_USERS' });
            return false;
        }
        const clientId = this.nextClientId++;
        const bridge = new IBBridge_1.IBBridge(userId, clientId);
        const cleanupFns = [];
        const session = {
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
        cleanupFns.push(bridge.onTrade((trade) => {
            sendMessage({ type: 'trade', data: trade });
        }));
        cleanupFns.push(bridge.onDepth((depth) => {
            sendMessage({ type: 'depth', data: depth });
        }));
        cleanupFns.push(bridge.onQuote((quote) => {
            sendMessage({ type: 'quote', data: quote });
        }));
        cleanupFns.push(bridge.onStatus((status, message) => {
            if (status === 'connected') {
                sendMessage({ type: 'connected', ibStatus: 'connected' });
            }
            else if (status === 'disconnected') {
                sendMessage({ type: 'disconnected', reason: message || 'IB connection lost' });
            }
            else {
                sendMessage({ type: 'error', error: message || 'IB error' });
            }
        }));
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
    destroySession(userId) {
        const session = this.sessions.get(userId);
        if (!session)
            return;
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
    subscribe(userId, channel, symbol) {
        const session = this.sessions.get(userId);
        if (!session)
            return;
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
        }
        else if (channel === 'depth') {
            session.bridge.subscribeDepth(upperSymbol);
        }
        session.sendMessage({ type: 'subscribed', channel, symbol: upperSymbol });
        console.log(`[GatewayManager] ${userId} subscribed to ${channel}:${upperSymbol}`);
    }
    /**
     * Unsubscribe a user from a symbol.
     */
    unsubscribe(userId, channel, symbol) {
        const session = this.sessions.get(userId);
        if (!session)
            return;
        session.lastActivity = Date.now();
        const upperSymbol = symbol.toUpperCase();
        const subKey = `${channel}:${upperSymbol}`;
        session.subscribedSymbols.delete(subKey);
        // Only unsubscribe from IB if no other channels need the symbol
        const hasOtherSubs = ['trades', 'depth', 'quotes'].some(ch => ch !== channel && session.subscribedSymbols.has(`${ch}:${upperSymbol}`));
        if (!hasOtherSubs) {
            session.bridge.unsubscribe(upperSymbol);
        }
        session.sendMessage({ type: 'unsubscribed', channel, symbol: upperSymbol });
    }
    /**
     * Change the primary symbol for a user (unsubscribe old, subscribe new).
     */
    changeSymbol(userId, newSymbol) {
        const session = this.sessions.get(userId);
        if (!session)
            return;
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
    recordActivity(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }
    startInactivityCheck() {
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
    getConnectedUsers() {
        return this.sessions.size;
    }
    hasSession(userId) {
        return this.sessions.has(userId);
    }
    getStats() {
        return {
            connectedUsers: this.sessions.size,
            uptime: process.uptime(),
        };
    }
    /**
     * Graceful shutdown - disconnect all users.
     */
    shutdown() {
        console.log(`[GatewayManager] Shutting down (${this.sessions.size} active sessions)...`);
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer);
        }
        for (const userId of this.sessions.keys()) {
            this.destroySession(userId);
        }
    }
}
exports.GatewayManager = GatewayManager;
//# sourceMappingURL=GatewayManager.js.map