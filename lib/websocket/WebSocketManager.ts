type MessageHandler = (data: unknown) => void;
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type StatusHandler = (status: ConnectionStatus) => void;

interface Connection {
  ws: WebSocket | null;
  status: ConnectionStatus;
  reconnectAttempts: number;
  reconnectTimeout: NodeJS.Timeout | null;
  messageHandlers: Map<string, Set<MessageHandler>>;
  statusHandlers: Set<StatusHandler>;
  pendingSubscriptions: string[];
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

class WebSocketManager {
  private static instance: WebSocketManager;
  private connections: Map<string, Connection> = new Map();

  private constructor() {}

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  connect(
    exchangeId: string,
    url: string,
    onOpen?: () => void
  ): void {
    if (typeof window === 'undefined') return; // SSR guard

    let connection = this.connections.get(exchangeId);

    if (!connection) {
      connection = {
        ws: null,
        status: 'disconnected',
        reconnectAttempts: 0,
        reconnectTimeout: null,
        messageHandlers: new Map(),
        statusHandlers: new Set(),
        pendingSubscriptions: [],
      };
      this.connections.set(exchangeId, connection);
    }

    if (connection.status === 'connected' || connection.status === 'connecting') {
      return;
    }

    // Reset reconnect counter so a fresh connect() after disconnect() works
    connection.reconnectAttempts = 0;

    this.updateStatus(exchangeId, 'connecting');

    try {
      const ws = new WebSocket(url);
      connection.ws = ws;

      ws.onopen = () => {
        connection!.reconnectAttempts = 0;
        this.updateStatus(exchangeId, 'connected');

        // Resubscribe to pending subscriptions
        connection!.pendingSubscriptions.forEach((msg) => {
          ws.send(msg);
        });

        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(exchangeId, data);
        } catch (error) {
          // Check if it's a JSON parse error or a handler error
          if (error instanceof SyntaxError) {
            console.error(`[${exchangeId}] Failed to parse message:`, event.data);
          } else {
            console.error(`[${exchangeId}] Error handling message:`, error);
          }
        }
      };

      ws.onerror = (event) => {
        // WebSocket error events don't contain useful info, log the URL instead
        console.error(`[${exchangeId}] WebSocket connection failed to: ${url}`);
        console.error(`[${exchangeId}] This may be due to network issues or regional restrictions`);
        this.updateStatus(exchangeId, 'error');
      };

      ws.onclose = () => {
        this.updateStatus(exchangeId, 'disconnected');
        this.scheduleReconnect(exchangeId, url, onOpen);
      };
    } catch (error) {
      console.error(`[${exchangeId}] Failed to create WebSocket:`, error);
      this.updateStatus(exchangeId, 'error');
      this.scheduleReconnect(exchangeId, url, onOpen);
    }
  }

  private scheduleReconnect(
    exchangeId: string,
    url: string,
    onOpen?: () => void
  ): void {
    const connection = this.connections.get(exchangeId);
    if (!connection) return;

    // Never give up — cap the counter so backoff stays at MAX_RECONNECT_DELAY
    if (connection.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      connection.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    }

    // Clear any existing timeout
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, connection.reconnectAttempts) + Math.random() * 1000,
      MAX_RECONNECT_DELAY
    );

    console.log(`[${exchangeId}] Reconnecting in ${delay}ms (attempt ${connection.reconnectAttempts + 1})`);

    connection.reconnectTimeout = setTimeout(() => {
      connection.reconnectAttempts++;
      connection.ws = null;
      this.connect(exchangeId, url, onOpen);
    }, delay);
  }

  disconnect(exchangeId: string): void {
    const connection = this.connections.get(exchangeId);
    if (!connection) return;

    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
      connection.reconnectTimeout = null;
    }

    connection.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect

    if (connection.ws) {
      connection.ws.close();
      connection.ws = null;
    }

    this.updateStatus(exchangeId, 'disconnected');
  }

  send(exchangeId: string, message: unknown): boolean {
    const connection = this.connections.get(exchangeId);
    if (!connection || !connection.ws || connection.status !== 'connected') {
      // Store for later if not connected
      if (connection && typeof message === 'string') {
        connection.pendingSubscriptions.push(message);
      }
      return false;
    }

    try {
      const msg = typeof message === 'string' ? message : JSON.stringify(message);
      connection.ws.send(msg);
      return true;
    } catch (error) {
      console.error(`[${exchangeId}] Failed to send message:`, error);
      return false;
    }
  }

  subscribe(exchangeId: string, channel: string, handler: MessageHandler): () => void {
    const connection = this.connections.get(exchangeId);
    if (!connection) {
      console.warn(`[${exchangeId}] No connection found for subscription`);
      return () => {};
    }

    if (!connection.messageHandlers.has(channel)) {
      connection.messageHandlers.set(channel, new Set());
    }
    connection.messageHandlers.get(channel)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = connection.messageHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          connection.messageHandlers.delete(channel);
        }
      }
    };
  }

  onStatusChange(exchangeId: string, handler: StatusHandler): () => void {
    let connection = this.connections.get(exchangeId);
    if (!connection) {
      connection = {
        ws: null,
        status: 'disconnected',
        reconnectAttempts: 0,
        reconnectTimeout: null,
        messageHandlers: new Map(),
        statusHandlers: new Set(),
        pendingSubscriptions: [],
      };
      this.connections.set(exchangeId, connection);
    }

    connection.statusHandlers.add(handler);

    // Immediately notify current status
    handler(connection.status);

    return () => {
      connection?.statusHandlers.delete(handler);
    };
  }

  getStatus(exchangeId: string): ConnectionStatus {
    return this.connections.get(exchangeId)?.status ?? 'disconnected';
  }

  private updateStatus(exchangeId: string, status: ConnectionStatus): void {
    const connection = this.connections.get(exchangeId);
    if (!connection) return;

    connection.status = status;
    connection.statusHandlers.forEach((handler) => handler(status));
  }

  private handleMessage(exchangeId: string, data: unknown): void {
    const connection = this.connections.get(exchangeId);
    if (!connection) return;

    // Notify all handlers for 'all' channel
    connection.messageHandlers.get('*')?.forEach((handler) => handler(data));

    // Try to route to specific channel based on data structure
    // This will be customized per exchange in the specific handlers
  }
}

export const wsManager = WebSocketManager.getInstance();
export default WebSocketManager;
