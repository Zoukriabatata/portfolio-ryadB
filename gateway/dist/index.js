"use strict";
/**
 * IB GATEWAY BRIDGE - Entry Point
 *
 * Standalone Node.js server that bridges IB Gateway/TWS to browser WebSockets.
 * Run on a VPS alongside IB Gateway.
 *
 * Usage:
 *   npm run dev    # Development with hot reload
 *   npm run build  # Compile TypeScript
 *   npm start      # Production
 *
 * Environment variables:
 *   GATEWAY_PORT=4000          # WebSocket server port
 *   IB_HOST=127.0.0.1         # IB Gateway host
 *   IB_PORT=4002              # IB Gateway port (4002=live, 7496=paper)
 *   JWT_SECRET=...            # Must match Next.js NEXTAUTH_SECRET
 *   MAX_USERS=12              # Max concurrent users
 */
Object.defineProperty(exports, "__esModule", { value: true });
const GatewayManager_1 = require("./GatewayManager");
const WebSocketServer_1 = require("./WebSocketServer");
const config_1 = require("./config");
console.log('═══════════════════════════════════════════');
console.log('  OrderFlow Gateway - IB Bridge Server');
console.log('═══════════════════════════════════════════');
console.log(`  Port:       ${config_1.config.port}`);
console.log(`  IB Host:    ${config_1.config.ib.host}:${config_1.config.ib.port}`);
console.log(`  Max Users:  ${config_1.config.maxUsersPerGateway}`);
console.log(`  JWT:        ${config_1.config.jwtSecret ? 'configured' : 'WARNING: not set!'}`);
console.log('═══════════════════════════════════════════');
if (!config_1.config.jwtSecret) {
    console.error('[FATAL] JWT_SECRET or NEXTAUTH_SECRET must be set');
    process.exit(1);
}
// Create manager and server
const manager = new GatewayManager_1.GatewayManager();
const server = new WebSocketServer_1.GatewayWebSocketServer(manager);
// Start server
server.start();
// Graceful shutdown
function shutdown(signal) {
    console.log(`\n[Gateway] Received ${signal}, shutting down...`);
    manager.shutdown();
    server.stop();
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Unhandled error handlers
process.on('uncaughtException', (err) => {
    console.error('[Gateway] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Gateway] Unhandled rejection:', reason);
});
//# sourceMappingURL=index.js.map