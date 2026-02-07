/**
 * GATEWAY CONFIGURATION
 */
export declare const config: {
    port: number;
    host: string;
    ib: {
        host: string;
        port: number;
        clientIdBase: number;
    };
    jwtSecret: string;
    maxUsersPerGateway: number;
    heartbeatIntervalMs: number;
    heartbeatTimeoutMs: number;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
};
//# sourceMappingURL=config.d.ts.map