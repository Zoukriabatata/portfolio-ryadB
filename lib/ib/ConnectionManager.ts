/**
 * IB CONNECTION MANAGER
 *
 * High-level manager that coordinates:
 * - IBConnectorClient (WebSocket to gateway)
 * - IBHeatmapAdapter (depth/trades → heatmap format)
 * - IBFootprintAdapter (trades → footprint format)
 *
 * Provides a single entry point for React components.
 *
 * Usage:
 *   const mgr = getIBConnectionManager();
 *   mgr.connect(gatewayUrl, jwt, 'ES');
 *   // In render loop:
 *   const heatmapData = mgr.getHeatmapRenderData(width, height);
 *   const footprintCandles = mgr.getFootprintCandles();
 */

import { IBConnectorClient, getIBConnector } from './IBConnectorClient';
import { IBHeatmapAdapter, type HeatmapAdapterConfig } from './IBHeatmapAdapter';
import { IBFootprintAdapter, type FootprintAdapterConfig } from './IBFootprintAdapter';
import { CME_CONTRACTS, type CMEContractSpec, type GatewayConnectionStatus } from '@/types/ib-protocol';
import type { RenderData } from '@/lib/heatmap-webgl/HybridRenderer';

type StatusCallback = (status: GatewayConnectionStatus) => void;

export class IBConnectionManager {
  private static instance: IBConnectionManager;

  private connector: IBConnectorClient;
  private heatmapAdapter: IBHeatmapAdapter;
  private footprintAdapter: IBFootprintAdapter;

  private currentSymbol: string = '';
  private currentContract: CMEContractSpec | null = null;
  private cleanupFns: (() => void)[] = [];
  private statusCallbacks: Set<StatusCallback> = new Set();

  private constructor() {
    this.connector = getIBConnector();
    this.heatmapAdapter = new IBHeatmapAdapter();
    this.footprintAdapter = new IBFootprintAdapter();
  }

  static getInstance(): IBConnectionManager {
    if (!IBConnectionManager.instance) {
      IBConnectionManager.instance = new IBConnectionManager();
    }
    return IBConnectionManager.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Connect to the IB Gateway and subscribe to a symbol.
   */
  connect(gatewayUrl: string, jwtToken: string, symbol: string): void {
    // Cleanup previous connections
    this.cleanup();

    this.currentSymbol = symbol.toUpperCase();
    this.currentContract = CME_CONTRACTS[this.currentSymbol] || null;

    if (this.currentContract) {
      this.heatmapAdapter.setContract(this.currentContract);
      this.footprintAdapter.setContract(this.currentContract);
    }

    // Wire up data flow
    this.cleanupFns.push(
      this.connector.onTrade((trade) => {
        this.heatmapAdapter.feedTrade(trade);
        this.footprintAdapter.processTrade(trade);
      })
    );

    this.cleanupFns.push(
      this.connector.onDepth((depth) => {
        this.heatmapAdapter.feedDepth(depth);
      })
    );

    this.cleanupFns.push(
      this.connector.onQuote((quote) => {
        this.heatmapAdapter.feedQuote(quote);
      })
    );

    this.cleanupFns.push(
      this.connector.onStatus((status) => {
        this.statusCallbacks.forEach(cb => cb(status));

        // Auto-subscribe when connected
        if (status === 'connected' || status === 'connecting_ib') {
          this.connector.subscribe('trades', this.currentSymbol);
          this.connector.subscribe('depth', this.currentSymbol);
        }
      })
    );

    // Connect to gateway
    this.connector.connect(gatewayUrl, jwtToken);
  }

  /**
   * Change the active symbol.
   */
  changeSymbol(symbol: string): void {
    const upper = symbol.toUpperCase();
    if (upper === this.currentSymbol) return;

    this.currentSymbol = upper;
    this.currentContract = CME_CONTRACTS[upper] || null;

    if (this.currentContract) {
      this.heatmapAdapter.setContract(this.currentContract);
      this.footprintAdapter.setContract(this.currentContract);
    }

    this.connector.changeSymbol(upper);
  }

  /**
   * Disconnect everything.
   */
  disconnect(): void {
    this.connector.disconnect();
    this.cleanup();
  }

  private cleanup(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
    this.heatmapAdapter.reset();
    this.footprintAdapter.reset();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA ACCESS (for render loops)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get heatmap render data for the WebGL HybridRenderer.
   */
  getHeatmapRenderData(canvasWidth: number, canvasHeight: number): RenderData {
    return this.heatmapAdapter.toRenderData(canvasWidth, canvasHeight);
  }

  /**
   * Get footprint candles for the FootprintRenderer.
   */
  getFootprintCandles() {
    return this.footprintAdapter.getCandles();
  }

  /**
   * Get the current open footprint candle.
   */
  getCurrentFootprintCandle() {
    return this.footprintAdapter.getCurrentCandle();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.connector.getStatus());
    return () => this.statusCallbacks.delete(callback);
  }

  getStatus(): GatewayConnectionStatus {
    return this.connector.getStatus();
  }

  isConnected(): boolean {
    return this.connector.isConnected();
  }

  getCurrentPrice(): number {
    return this.connector.getCurrentPrice();
  }

  getCurrentSymbol(): string {
    return this.currentSymbol;
  }

  getCurrentContract(): CMEContractSpec | null {
    return this.currentContract;
  }

  getStats() {
    return {
      status: this.connector.getStatus(),
      symbol: this.currentSymbol,
      tradeCount: this.connector.getTradeCount(),
      currentPrice: this.connector.getCurrentPrice(),
      heatmapSnapshots: this.heatmapAdapter.getSnapshotCount(),
      footprintCandles: this.footprintAdapter.getCandles().length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setFootprintTimeframe(timeframeSec: number): void {
    this.footprintAdapter.setTimeframe(timeframeSec);
  }
}

export function getIBConnectionManager(): IBConnectionManager {
  return IBConnectionManager.getInstance();
}
