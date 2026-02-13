/**
 * BROADCAST CHANNEL MANAGER
 *
 * Handles cross-tab and cross-chart synchronization using BroadcastChannel API.
 * Syncs crosshair position, symbol, and timeframe between charts.
 */

// ============ MESSAGE TYPES ============

export interface SyncCrosshairMessage {
  type: 'crosshair';
  sourceId: string;
  price: number;
  time: number;
  visible: boolean;
}

export interface SyncSymbolMessage {
  type: 'symbol';
  sourceId: string;
  symbol: string;
}

export interface SyncTimeframeMessage {
  type: 'timeframe';
  sourceId: string;
  timeframe: number;
}

export type SyncMessage = SyncCrosshairMessage | SyncSymbolMessage | SyncTimeframeMessage;

// ============ LISTENERS ============

export interface SyncListeners {
  onCrosshair?: (msg: SyncCrosshairMessage) => void;
  onSymbol?: (msg: SyncSymbolMessage) => void;
  onTimeframe?: (msg: SyncTimeframeMessage) => void;
}

// ============ MANAGER ============

const CHANNEL_NAME = 'orderflow-chart-sync';

export class BroadcastChannelManager {
  private channel: BroadcastChannel | null = null;
  private sourceId: string;
  private listeners: SyncListeners = {};

  constructor(sourceId: string) {
    this.sourceId = sourceId;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = this.handleMessage.bind(this);
      } catch {
        console.warn('[ChartSync] BroadcastChannel not available');
      }
    }
  }

  setListeners(listeners: SyncListeners): void {
    this.listeners = listeners;
  }

  private handleMessage(event: MessageEvent<SyncMessage>): void {
    const msg = event.data;

    // Ignore messages from self
    if (msg.sourceId === this.sourceId) return;

    switch (msg.type) {
      case 'crosshair':
        this.listeners.onCrosshair?.(msg);
        break;
      case 'symbol':
        this.listeners.onSymbol?.(msg);
        break;
      case 'timeframe':
        this.listeners.onTimeframe?.(msg);
        break;
    }
  }

  broadcastCrosshair(price: number, time: number, visible: boolean): void {
    this.post({ type: 'crosshair', sourceId: this.sourceId, price, time, visible });
  }

  broadcastSymbol(symbol: string): void {
    this.post({ type: 'symbol', sourceId: this.sourceId, symbol });
  }

  broadcastTimeframe(timeframe: number): void {
    this.post({ type: 'timeframe', sourceId: this.sourceId, timeframe });
  }

  private post(msg: SyncMessage): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      // Channel may be closed
    }
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
  }
}
