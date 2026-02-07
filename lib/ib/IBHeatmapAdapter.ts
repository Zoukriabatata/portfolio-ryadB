/**
 * IB HEATMAP ADAPTER
 *
 * Converts IB Gateway data (trades + depth) into the format expected by
 * the WebGL HybridRenderer (PassiveOrderData[], TradeData[], bid/ask lines).
 *
 * Maintains a rolling history of depth snapshots to generate the time-series
 * heatmap columns, and accumulates trades for bubble rendering.
 */

import type { IBTrade, IBDepthUpdate, IBDepthRow, IBQuote, CMEContractSpec } from '@/types/ib-protocol';
import type { PassiveOrderData, TradeData } from '@/lib/heatmap-webgl/types';
import type { RenderData } from '@/lib/heatmap-webgl/HybridRenderer';

interface DepthSnapshot {
  timestamp: number;
  bids: IBDepthRow[];
  asks: IBDepthRow[];
}

interface TradeAccumulator {
  price: number;
  buySize: number;
  sellSize: number;
  timestamp: number;
}

export interface HeatmapAdapterConfig {
  maxSnapshots: number;      // Max depth snapshots to keep (columns)
  snapshotIntervalMs: number; // How often to sample depth
  maxTrades: number;         // Max trade bubbles to render
  tradeMaxAgeMs: number;     // Trades older than this fade out
  depthRows: number;         // Number of depth rows per side
  contract: CMEContractSpec;
}

const DEFAULT_CONFIG: HeatmapAdapterConfig = {
  maxSnapshots: 300,
  snapshotIntervalMs: 200,
  maxTrades: 500,
  tradeMaxAgeMs: 60_000,
  depthRows: 20,
  contract: {
    symbol: 'ES',
    exchange: 'CME',
    secType: 'FUT',
    tickSize: 0.25,
    tickValue: 12.50,
    pointValue: 50,
    description: 'E-mini S&P 500',
    tradingHours: 'CME Globex',
  },
};

export class IBHeatmapAdapter {
  private config: HeatmapAdapterConfig;

  // Depth history (time-series columns for heatmap)
  private depthHistory: DepthSnapshot[] = [];
  private lastSnapshotTime = 0;
  private latestDepth: IBDepthUpdate | null = null;

  // Trade history
  private trades: IBTrade[] = [];

  // Quote state
  private bestBid = 0;
  private bestAsk = 0;
  private currentPrice = 0;

  // Best bid/ask history for staircase lines
  private bidHistory: { x: number; price: number }[] = [];
  private askHistory: { x: number; price: number }[] = [];

  constructor(config?: Partial<HeatmapAdapterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA INPUT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process an incoming depth update from IB.
   */
  feedDepth(depth: IBDepthUpdate): void {
    this.latestDepth = depth;

    // Update best bid/ask
    if (depth.bids.length > 0) this.bestBid = depth.bids[0].price;
    if (depth.asks.length > 0) this.bestAsk = depth.asks[0].price;

    // Sample at configured interval
    const now = Date.now();
    if (now - this.lastSnapshotTime >= this.config.snapshotIntervalMs) {
      this.depthHistory.push({
        timestamp: now,
        bids: [...depth.bids],
        asks: [...depth.asks],
      });

      // Prune old snapshots
      if (this.depthHistory.length > this.config.maxSnapshots) {
        this.depthHistory.splice(0, this.depthHistory.length - this.config.maxSnapshots);
      }

      this.lastSnapshotTime = now;
    }
  }

  /**
   * Process an incoming trade from IB.
   */
  feedTrade(trade: IBTrade): void {
    this.trades.push(trade);
    this.currentPrice = trade.price;

    // Prune old trades
    const cutoff = Date.now() - this.config.tradeMaxAgeMs;
    while (this.trades.length > 0 && this.trades[0].timestamp < cutoff) {
      this.trades.shift();
    }
    if (this.trades.length > this.config.maxTrades) {
      this.trades.splice(0, this.trades.length - this.config.maxTrades);
    }
  }

  /**
   * Process a quote update from IB.
   */
  feedQuote(quote: IBQuote): void {
    if (quote.bid > 0) this.bestBid = quote.bid;
    if (quote.ask > 0) this.bestAsk = quote.ask;
    if (quote.last > 0) this.currentPrice = quote.last;
  }

  /**
   * Update contract spec (when symbol changes).
   */
  setContract(contract: CMEContractSpec): void {
    this.config.contract = contract;
    this.reset();
  }

  /**
   * Clear all accumulated data.
   */
  reset(): void {
    this.depthHistory = [];
    this.trades = [];
    this.bidHistory = [];
    this.askHistory = [];
    this.lastSnapshotTime = 0;
    this.latestDepth = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER DATA GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate RenderData for the WebGL HybridRenderer.
   * Call this in requestAnimationFrame.
   */
  toRenderData(canvasWidth: number, canvasHeight: number): RenderData {
    const now = Date.now();
    const tickSize = this.config.contract.tickSize;

    // Calculate price range from depth + recent trades
    const { priceMin, priceMax } = this.calculatePriceRange();

    // Generate passive order data from depth history
    const passiveOrders = this.generatePassiveOrders(canvasWidth, priceMin, priceMax);

    // Generate trade data
    const trades = this.generateTradeData(canvasWidth, now);

    // Generate bid/ask staircase lines
    const bestBidPoints = this.generateBidAskLine('bid', canvasWidth);
    const bestAskPoints = this.generateBidAskLine('ask', canvasWidth);

    return {
      priceMin,
      priceMax,
      tickSize,
      currentPrice: this.currentPrice || (this.bestBid + this.bestAsk) / 2,
      passiveOrders,
      trades,
      bestBidPoints,
      bestAskPoints,
      contrast: 1.0,
      upperCutoff: 0.95,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL GENERATORS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculatePriceRange(): { priceMin: number; priceMax: number } {
    const tickSize = this.config.contract.tickSize;
    const price = this.currentPrice || this.bestBid || this.bestAsk;

    if (price <= 0) {
      return { priceMin: 0, priceMax: 100 };
    }

    // Show ~40 ticks above and below current price
    const range = tickSize * 40;
    return {
      priceMin: price - range,
      priceMax: price + range,
    };
  }

  /**
   * Convert depth history into PassiveOrderData[] for the heatmap.
   * Each depth snapshot becomes a column of passive orders.
   */
  private generatePassiveOrders(
    canvasWidth: number,
    priceMin: number,
    priceMax: number,
  ): PassiveOrderData[] {
    const orders: PassiveOrderData[] = [];
    const snapCount = this.depthHistory.length;
    if (snapCount === 0) return orders;

    // Find max size across all snapshots for intensity normalization
    let maxSize = 0;
    for (const snap of this.depthHistory) {
      for (const row of snap.bids) maxSize = Math.max(maxSize, row.size);
      for (const row of snap.asks) maxSize = Math.max(maxSize, row.size);
    }
    if (maxSize === 0) maxSize = 1;

    // Map each snapshot to an X position
    for (let i = 0; i < snapCount; i++) {
      const snap = this.depthHistory[i];
      const x = (i / Math.max(1, snapCount - 1)) * canvasWidth;

      // Bids
      for (const row of snap.bids) {
        if (row.price < priceMin || row.price > priceMax) continue;
        orders.push({
          price: row.price,
          size: row.size,
          side: 'bid',
          intensity: Math.min(1, row.size / maxSize),
          x,
        });
      }

      // Asks
      for (const row of snap.asks) {
        if (row.price < priceMin || row.price > priceMax) continue;
        orders.push({
          price: row.price,
          size: row.size,
          side: 'ask',
          intensity: Math.min(1, row.size / maxSize),
          x,
        });
      }
    }

    return orders;
  }

  /**
   * Convert trade history into TradeData[] for bubble rendering.
   */
  private generateTradeData(canvasWidth: number, now: number): TradeData[] {
    if (this.trades.length === 0) return [];

    const oldest = this.trades[0].timestamp;
    const timeRange = now - oldest;
    if (timeRange === 0) return [];

    // Find max size for scaling
    let maxSize = 0;
    for (const t of this.trades) maxSize = Math.max(maxSize, t.size);
    if (maxSize === 0) maxSize = 1;

    return this.trades.map(t => ({
      price: t.price,
      size: t.size,
      side: t.side === 'ASK' ? 'buy' as const : 'sell' as const,
      x: ((t.timestamp - oldest) / timeRange) * canvasWidth,
      buyRatio: t.side === 'ASK' ? 1 : 0,
      age: Math.min(1, (now - t.timestamp) / this.config.tradeMaxAgeMs),
    }));
  }

  /**
   * Generate staircase line points for best bid/ask.
   */
  private generateBidAskLine(
    side: 'bid' | 'ask',
    canvasWidth: number,
  ): { x: number; price: number }[] {
    const snapCount = this.depthHistory.length;
    if (snapCount === 0) return [];

    const points: { x: number; price: number }[] = [];

    for (let i = 0; i < snapCount; i++) {
      const snap = this.depthHistory[i];
      const x = (i / Math.max(1, snapCount - 1)) * canvasWidth;
      const rows = side === 'bid' ? snap.bids : snap.asks;

      if (rows.length > 0) {
        points.push({ x, price: rows[0].price });
      }
    }

    return points;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  getBestBid(): number {
    return this.bestBid;
  }

  getBestAsk(): number {
    return this.bestAsk;
  }

  getSnapshotCount(): number {
    return this.depthHistory.length;
  }

  getTradeCount(): number {
    return this.trades.length;
  }
}
