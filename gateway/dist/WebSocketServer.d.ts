/**
 * WEBSOCKET SERVER
 *
 * Accepts browser connections, authenticates via JWT,
 * and routes messages to/from the GatewayManager.
 *
 * Protocol: JSON messages over WSS
 * Auth: First message must be { type: "auth", token: "jwt..." }
 */
import { GatewayManager } from './GatewayManager';
export declare class GatewayWebSocketServer {
    private wss;
    private server;
    private manager;
    private clients;
    private heartbeatInterval;
    constructor(manager: GatewayManager);
    start(): void;
    stop(): void;
    private setupWSS;
    private handleMessage;
    private handleAuth;
    private handleDisconnect;
    private startHeartbeat;
    private sendToClient;
}
//# sourceMappingURL=WebSocketServer.d.ts.map