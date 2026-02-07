"use strict";
/**
 * GATEWAY CONFIGURATION
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    // WebSocket server
    port: parseInt(process.env.GATEWAY_PORT || '4000', 10),
    host: process.env.GATEWAY_HOST || '0.0.0.0',
    // IB Gateway/TWS connection
    ib: {
        host: process.env.IB_HOST || '127.0.0.1',
        port: parseInt(process.env.IB_PORT || '4002', 10), // 4001=TWS live, 4002=IB Gateway live, 7497=TWS paper, 7496=IB Gateway paper
        clientIdBase: parseInt(process.env.IB_CLIENT_ID_BASE || '100', 10), // Each user gets clientIdBase + index
    },
    // JWT verification (must match Next.js NEXTAUTH_SECRET)
    jwtSecret: process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || '',
    // Limits
    maxUsersPerGateway: parseInt(process.env.MAX_USERS || '12', 10),
    heartbeatIntervalMs: 15_000,
    heartbeatTimeoutMs: 45_000,
    reconnectDelayMs: 5_000,
    maxReconnectAttempts: 10,
};
//# sourceMappingURL=config.js.map