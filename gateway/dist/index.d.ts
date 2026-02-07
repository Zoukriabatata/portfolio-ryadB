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
export {};
//# sourceMappingURL=index.d.ts.map