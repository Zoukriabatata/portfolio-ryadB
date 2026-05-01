/**
 * LIVE WEBSOCKET — Bybit Linear Perpetuals
 *
 * Remplace Binance Futures (bloqué régionalement) par Bybit V5.
 * Interface publique identique — aucune modification requise côté consumers.
 *
 * STREAMS (multiplexés sur une seule connexion) :
 * ================================================
 * publicTrade.{SYMBOL}    — ticks temps réel (prix, quantité, side)
 * orderbook.50.{SYMBOL}   — carnet d'ordres 50 niveaux (snapshot + delta)
 * tickers.{SYMBOL}        — mark price, index price, funding rate
 * liquidation.{SYMBOL}    — ordres liquidés
 *
 * ARCHITECTURE :
 * ==============
 * BybitLiveWS ──► HierarchicalAggregator ──► FootprintChartPro
 *     │                     │
 *     │ ticks               │ candles 15s/30s/1m/5m
 *     ▼                     ▼
 *   WebSocket            Events
 */

import { getAggregator, type Tick, type LiveCandle, type TimeframeSeconds } from './HierarchicalAggregator';
import type { MarkPriceUpdate, LiquidationEvent } from '@/types/futures';

const BYBIT_LINEAR_WS = 'wss://stream.bybit.com/v5/public/linear';
const PING_INTERVAL_MS = 18_000;
const BASE_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

type MarkPriceCallback = (update: MarkPriceUpdate) => void;
type LiquidationCallback = (event: LiquidationEvent) => void;
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;
type TickCallback = (tick: Tick) => void;

export interface DepthSnapshot {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}
type DepthCallback = (depth: DepthSnapshot) => void;

class BybitLiveWS {
  private ws: WebSocket | null = null;
  private symbol = 'BTCUSDT';
  private status: ConnectionStatus = 'disconnected';
  private intentionalDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private statusListeners = new Set<StatusCallback>();
  private tickListeners = new Set<TickCallback>();
  private depthListeners = new Set<DepthCallback>();
  private markPriceListeners = new Set<MarkPriceCallback>();
  private liquidationListeners = new Set<LiquidationCallback>();

  private pendingTick: Tick | null = null;
  private rafId: number | null = null;
  private pendingDepth: DepthSnapshot | null = null;
  private depthRafId: number | null = null;
  private depthSnapshot: DepthSnapshot | null = null;

  private tickCount = 0;
  private lastTickTime = 0;
  private currentPrice = 0;
  private lastPongTime = Date.now();

  connect(symbol = 'BTCUSDT'): void {
    this.symbol = symbol.toUpperCase();
    this.intentionalDisconnect = false;
    this.depthSnapshot = null;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    this.setStatus('connecting');
    try {
      this.ws = new WebSocket(BYBIT_LINEAR_WS);

      this.ws.onopen = () => {
        console.debug(`[Bybit WS] Connected — ${this.symbol}`);
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.sendSubscribe();
        this.startPing();
      };

      this.ws.onmessage = (event) => this.handleMessage(event.data as string);

      this.ws.onerror = () => {
        console.warn('[Bybit WS] Connection error — waiting for close event');
      };

      this.ws.onclose = (event) => {
        console.debug(`[Bybit WS] Closed: code=${event.code} reason=${event.reason || '(none)'} clean=${event.wasClean}`);
        this.stopPing();
        this.setStatus('disconnected');
        if (!this.intentionalDisconnect) this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[Bybit WS] Failed to open:', err);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private sendSubscribe(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const sym = this.symbol;
    // Bybit V5 batch subscriptions are all-or-nothing: one invalid topic rejects all.
    // `liquidation.{sym}` was deprecated → renamed `allLiquidation.{sym}` in V5.
    this.ws.send(JSON.stringify({
      op: 'subscribe',
      args: [
        `publicTrade.${sym}`,
        `orderbook.50.${sym}`,
        `tickers.${sym}`,
        `allLiquidation.${sym}`,
      ],
    }));
  }

  private startPing(): void {
    this.stopPing();
    this.lastPongTime = Date.now();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      // Pong not received since last ping → silent death → force reconnect.
      // NOTE: browsers only allow close codes 1000 or 3000-4999 from JS.
      // Code 1001 ("going away") is reserved server-side and throws
      // InvalidAccessError if used here, blocking the reconnect entirely.
      if (Date.now() - this.lastPongTime > PING_INTERVAL_MS + 5_000) {
        console.warn('[Bybit WS] Pong timeout — forcing reconnect');
        try { this.ws.close(4000, 'pong timeout'); } catch { /* ignore */ }
        return;
      }

      this.ws.send(JSON.stringify({ op: 'ping' }));
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as Record<string, unknown>;
      if (msg['op'] === 'pong' || msg['success'] !== undefined) {
        this.lastPongTime = Date.now();
        return;
      }

      const topic = (msg['topic'] as string) ?? '';

      if (topic.startsWith('publicTrade.')) {
        this.handleTrade(msg['data'] as Array<{ T: number; p: string; v: string; S: string }>);
      } else if (topic.startsWith('orderbook.')) {
        this.handleOrderbook(msg['data'] as { b: [string, string][]; a: [string, string][]; u: number });
      } else if (topic.startsWith('tickers.')) {
        this.handleTicker(msg['data'] as Record<string, string>);
      } else if (topic.startsWith('allLiquidation.')) {
        // V5 allLiquidation pushes an array of liquidations, not a single object
        const arr = msg['data'] as Array<Record<string, unknown>>;
        if (Array.isArray(arr)) {
          for (const item of arr) this.handleLiquidation(item);
        }
      }
    } catch (err) {
      console.error('[Bybit WS] Parse error:', err);
    }
  }

  private handleTrade(data: Array<{ T: number; p: string; v: string; S: string }>): void {
    if (!data?.length || this.intentionalDisconnect) return;
    for (const t of data) {
      const tick: Tick = {
        price: parseFloat(t.p),
        quantity: parseFloat(t.v),
        timestamp: t.T,
        isBuyerMaker: t.S === 'Sell', // Sell aggressor = buyer is maker (passive)
      };
      this.tickCount++;
      this.lastTickTime = Date.now();
      this.currentPrice = tick.price;
      getAggregator().processTick(tick);
      this.pendingTick = tick;
    }
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (this.pendingTick) {
          const t = this.pendingTick;
          this.pendingTick = null;
          this.tickListeners.forEach(cb => cb(t));
        }
      });
    }
  }

  private handleOrderbook(data: { b: [string, string][]; a: [string, string][]; u: number }): void {
    if (!data) return;
    this.depthSnapshot = { bids: data.b, asks: data.a, lastUpdateId: data.u };
    this.pendingDepth = this.depthSnapshot;
    if (this.depthRafId === null) {
      this.depthRafId = requestAnimationFrame(() => {
        this.depthRafId = null;
        if (this.pendingDepth) {
          const d = this.pendingDepth;
          this.pendingDepth = null;
          this.depthListeners.forEach(cb => cb(d));
        }
      });
    }
  }

  private handleTicker(data: Record<string, string>): void {
    if (!data?.markPrice) return;
    const update: MarkPriceUpdate = {
      symbol: this.symbol,
      markPrice: parseFloat(data.markPrice),
      indexPrice: parseFloat(data.indexPrice ?? data.markPrice),
      fundingRate: parseFloat(data.fundingRate ?? '0'),
      nextFundingTime: parseInt(data.nextFundingTime ?? '0'),
      estimatedSettlePrice: parseFloat(data.markPrice),
    };
    this.markPriceListeners.forEach(cb => cb(update));
  }

  private handleLiquidation(data: Record<string, unknown>): void {
    if (!data) return;
    const event: LiquidationEvent = {
      symbol: (data.symbol as string) ?? this.symbol,
      side: ((data.side as string) === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
      quantity: parseFloat((data.size as string) ?? '0'),
      price: parseFloat((data.price as string) ?? '0'),
      averagePrice: parseFloat((data.price as string) ?? '0'),
      status: 'Filled',
      lastFilledQty: parseFloat((data.size as string) ?? '0'),
      cumulativeFilledQty: parseFloat((data.size as string) ?? '0'),
      time: (data.time as number) ?? Date.now(),
    };
    this.liquidationListeners.forEach(cb => cb(event));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_DELAY);
    console.debug(`[Bybit WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    this.reconnectTimer = setTimeout(() => {
      if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopPing();
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.depthRafId !== null) { cancelAnimationFrame(this.depthRafId); this.depthRafId = null; }
    this.pendingTick = null;
    this.pendingDepth = null;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { this.ws.close(); this.ws = null; }
    this.setStatus('disconnected');
  }

  changeSymbol(symbol: string): void {
    const newSym = symbol.toUpperCase();
    if (newSym === this.symbol) return;
    getAggregator().reset();
    this.disconnect();
    this.connect(newSym);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status));
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  onTick(cb: TickCallback): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  onDepthUpdate(cb: DepthCallback): () => void {
    this.depthListeners.add(cb);
    if (this.depthSnapshot) cb(this.depthSnapshot);
    return () => this.depthListeners.delete(cb);
  }

  onMarkPrice(cb: MarkPriceCallback): () => void {
    this.markPriceListeners.add(cb);
    return () => this.markPriceListeners.delete(cb);
  }

  onLiquidation(cb: LiquidationCallback): () => void {
    this.liquidationListeners.add(cb);
    return () => this.liquidationListeners.delete(cb);
  }

  getStatus(): ConnectionStatus { return this.status; }
  getSymbol(): string { return this.symbol; }
  getTickCount(): number { return this.tickCount; }
  getLastTickTime(): number { return this.lastTickTime; }
  getCurrentPrice(): number { return this.currentPrice; }
}

let wsInstance: BybitLiveWS | null = null;

export function getBinanceLiveWS(): BybitLiveWS {
  if (!wsInstance) wsInstance = new BybitLiveWS();
  return wsInstance;
}

export type { ConnectionStatus, TickCallback, DepthCallback, MarkPriceCallback, LiquidationCallback };
