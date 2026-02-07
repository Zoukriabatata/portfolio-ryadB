/**
 * LIQUIDITY ENGINE - Main Orchestrator
 *
 * Central engine that coordinates data ingestion, analytics,
 * and provides data to the rendering layer.
 */

import type {
  OrderBookState,
  OrderLevel,
  Trade,
  HeatmapSettings,
  WallInfo,
  SpoofPattern,
  AbsorptionEvent,
  LiquidityStats,
  PriceRange,
  TimeRange,
  DEFAULT_HEATMAP_SETTINGS,
} from './types';

import { HistoryBuffer } from './HistoryBuffer';
import { WallDetector } from '../analytics/WallDetector';
import { SpoofDetector } from '../analytics/SpoofDetector';
import { AbsorptionTracker } from '../analytics/AbsorptionTracker';

export interface LiquidityEngineState {
  orderBook: OrderBookState;
  history: HistoryBuffer;
  walls: WallInfo[];
  spoofPatterns: SpoofPattern[];
  absorptionEvents: AbsorptionEvent[];
  stats: LiquidityStats;
  priceRange: PriceRange;
  timeRange: TimeRange | null;
}

export class LiquidityEngine {
  // Core data
  private orderBook: OrderBookState;
  private history: HistoryBuffer;
  private trades: Trade[] = [];
  private maxTrades: number = 5000;

  // Analytics
  private wallDetector: WallDetector;
  private spoofDetector: SpoofDetector;
  private absorptionTracker: AbsorptionTracker;

  // Settings
  private settings: HeatmapSettings;
  private tickSize: number = 0.01;

  // Timing
  private lastColumnTime: number = 0;
  private lastDecayTime: number = 0;
  private lastAnalyticsTime: number = 0;

  // Callbacks
  private onUpdate: ((state: LiquidityEngineState) => void) | null = null;

  constructor(settings?: Partial<HeatmapSettings>) {
    // Initialize settings
    this.settings = {
      liquidityThreshold: 0,
      upperCutoffPercent: 97,
      lowerCutoffPercent: 5,
      decayEnabled: true,
      decayHalfLifeMs: 5000,
      colorScheme: 'bookmap',
      bidBaseColor: '#22d3ee',
      askBaseColor: '#ef4444',
      useLogScale: true,
      gamma: 1.2,
      showWalls: true,
      wallThresholdSigma: 2.5,
      showAbsorption: true,
      absorptionMinPercent: 20,
      showSpoofing: true,
      spoofingConfidenceThreshold: 0.7,
      showBids: true,
      showAsks: true,
      showTrades: true,
      tradeMinSize: 0.1,
      tradeBubbleScale: 1.0,
      priceZoom: 1.0,
      timeZoom: 1.0,
      autoCenter: true,
      updateIntervalMs: 100,
      maxHistoryColumns: 2000,
      columnWidthMs: 250,
      ...settings,
    };

    // Initialize order book
    this.orderBook = {
      bids: new Map(),
      asks: new Map(),
      bestBid: 0,
      bestAsk: 0,
      midPrice: 0,
      spread: 0,
      imbalance: 0,
      lastUpdateTime: 0,
      updateCount: 0,
    };

    // Initialize history buffer
    this.history = new HistoryBuffer(
      this.settings.maxHistoryColumns,
      this.settings.columnWidthMs
    );

    // Initialize analytics
    this.wallDetector = new WallDetector({
      thresholdSigma: this.settings.wallThresholdSigma,
    });

    this.spoofDetector = new SpoofDetector({
      confidenceThreshold: this.settings.spoofingConfidenceThreshold,
    });

    this.absorptionTracker = new AbsorptionTracker({
      minAbsorptionPercent: this.settings.absorptionMinPercent,
    });
  }

  /**
   * Set tick size for the instrument
   */
  setTickSize(tickSize: number): void {
    this.tickSize = tickSize;
    this.absorptionTracker.setTickSize(tickSize);
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<HeatmapSettings>): void {
    this.settings = { ...this.settings, ...settings };

    // Update analytics configs
    this.wallDetector.setConfig({
      thresholdSigma: this.settings.wallThresholdSigma,
    });

    this.spoofDetector.setConfig({
      confidenceThreshold: this.settings.spoofingConfidenceThreshold,
    });

    this.absorptionTracker.setConfig({
      minAbsorptionPercent: this.settings.absorptionMinPercent,
    });

    // Resize history if needed
    if (this.settings.maxHistoryColumns !== this.history.getBufferInfo().capacity) {
      this.history.resize(this.settings.maxHistoryColumns);
    }
  }

  /**
   * Set callback for state updates
   */
  setOnUpdate(callback: (state: LiquidityEngineState) => void): void {
    this.onUpdate = callback;
  }

  /**
   * Process order book snapshot
   */
  processOrderBook(
    bids: Map<number, number> | Array<[number, number]>,
    asks: Map<number, number> | Array<[number, number]>
  ): void {
    const now = Date.now();

    // Convert arrays to maps if needed
    const bidMap = bids instanceof Map ? bids : new Map(bids);
    const askMap = asks instanceof Map ? asks : new Map(asks);

    // Update order book state
    this.updateOrderBookState(bidMap, askMap, now);

    // Push to history at column interval
    if (now - this.lastColumnTime >= this.settings.columnWidthMs) {
      this.pushHistoryColumn(now);
      this.lastColumnTime = now;
    }

    // Apply decay
    if (this.settings.decayEnabled && now - this.lastDecayTime >= 100) {
      const deltaMs = now - this.lastDecayTime;
      this.history.applyDecay(this.settings.decayHalfLifeMs, deltaMs);
      this.lastDecayTime = now;
    }

    // Run analytics at lower frequency
    if (now - this.lastAnalyticsTime >= 200) {
      this.runAnalytics(now);
      this.lastAnalyticsTime = now;
    }

    // Notify listeners
    this.notifyUpdate();
  }

  /**
   * Update internal order book state
   */
  private updateOrderBookState(
    bids: Map<number, number>,
    asks: Map<number, number>,
    now: number
  ): void {
    // Update bids
    const currentBidPrices = new Set(bids.keys());
    for (const [price, size] of bids) {
      const existing = this.orderBook.bids.get(price);
      if (existing) {
        existing.previousSize = existing.size;
        existing.size = size;
        existing.lastModified = now;
        if (existing.previousSize > size) {
          // Size decreased - potential absorption
          existing.cumulativeAbsorption += existing.previousSize - size;
        }
      } else {
        this.orderBook.bids.set(price, {
          price,
          size,
          orderCount: 1,
          firstSeen: now,
          lastModified: now,
          previousSize: size,
          cumulativeAbsorption: 0,
          sizeHistory: [],
        });
      }
    }

    // Remove disappeared bid levels
    for (const price of this.orderBook.bids.keys()) {
      if (!currentBidPrices.has(price)) {
        this.orderBook.bids.delete(price);
      }
    }

    // Update asks
    const currentAskPrices = new Set(asks.keys());
    for (const [price, size] of asks) {
      const existing = this.orderBook.asks.get(price);
      if (existing) {
        existing.previousSize = existing.size;
        existing.size = size;
        existing.lastModified = now;
        if (existing.previousSize > size) {
          existing.cumulativeAbsorption += existing.previousSize - size;
        }
      } else {
        this.orderBook.asks.set(price, {
          price,
          size,
          orderCount: 1,
          firstSeen: now,
          lastModified: now,
          previousSize: size,
          cumulativeAbsorption: 0,
          sizeHistory: [],
        });
      }
    }

    // Remove disappeared ask levels
    for (const price of this.orderBook.asks.keys()) {
      if (!currentAskPrices.has(price)) {
        this.orderBook.asks.delete(price);
      }
    }

    // Calculate best bid/ask and metrics
    this.orderBook.bestBid = bids.size > 0 ? Math.max(...bids.keys()) : 0;
    this.orderBook.bestAsk = asks.size > 0 ? Math.min(...asks.keys()) : 0;
    this.orderBook.midPrice =
      this.orderBook.bestBid > 0 && this.orderBook.bestAsk > 0
        ? (this.orderBook.bestBid + this.orderBook.bestAsk) / 2
        : 0;
    this.orderBook.spread = this.orderBook.bestAsk - this.orderBook.bestBid;

    // Calculate imbalance
    let totalBid = 0;
    let totalAsk = 0;
    for (const level of this.orderBook.bids.values()) totalBid += level.size;
    for (const level of this.orderBook.asks.values()) totalAsk += level.size;
    const total = totalBid + totalAsk;
    this.orderBook.imbalance = total > 0 ? (totalBid - totalAsk) / total : 0;

    this.orderBook.lastUpdateTime = now;
    this.orderBook.updateCount++;
  }

  /**
   * Push current state to history buffer
   */
  private pushHistoryColumn(now: number): void {
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();

    for (const [price, level] of this.orderBook.bids) {
      bids.set(price, level.size);
    }
    for (const [price, level] of this.orderBook.asks) {
      asks.set(price, level.size);
    }

    this.history.push(
      now,
      bids,
      asks,
      this.orderBook.bestBid,
      this.orderBook.bestAsk,
      0 // TODO: Calculate volatility
    );
  }

  /**
   * Run analytics
   */
  private runAnalytics(now: number): void {
    // Detect walls
    if (this.settings.showWalls) {
      this.wallDetector.detect(this.orderBook, this.trades, this.history);
    }

    // Detect spoofing
    if (this.settings.showSpoofing) {
      this.spoofDetector.analyze(this.orderBook, this.trades);
    }

    // Track absorption
    if (this.settings.showAbsorption) {
      const recentTrades = this.trades.filter(t => now - t.timestamp < 5000);
      this.absorptionTracker.process(
        this.orderBook,
        recentTrades,
        this.orderBook.midPrice
      );
    }
  }

  /**
   * Add a trade
   */
  addTrade(trade: Trade): void {
    this.trades.push(trade);

    // Keep trades trimmed
    if (this.trades.length > this.maxTrades) {
      this.trades = this.trades.slice(-this.maxTrades);
    }
  }

  /**
   * Add multiple trades
   */
  addTrades(trades: Trade[]): void {
    for (const trade of trades) {
      this.addTrade(trade);
    }
  }

  /**
   * Get current state for rendering
   */
  getState(): LiquidityEngineState {
    const stats = this.history.getStats();
    const priceRange = this.calculatePriceRange();
    const timeRange = this.history.getTimeRange();

    return {
      orderBook: this.orderBook,
      history: this.history,
      walls: this.settings.showWalls ? this.wallDetector.getActiveWalls() : [],
      spoofPatterns: this.settings.showSpoofing
        ? this.spoofDetector.getActivePatterns()
        : [],
      absorptionEvents: this.settings.showAbsorption
        ? this.absorptionTracker.getActiveEvents()
        : [],
      stats,
      priceRange,
      timeRange,
    };
  }

  /**
   * Calculate visible price range
   */
  private calculatePriceRange(): PriceRange {
    const midPrice = this.orderBook.midPrice || 100000;
    const baseRange = this.tickSize * 100; // 100 ticks
    const effectiveRange = baseRange / this.settings.priceZoom;

    return {
      min: midPrice - effectiveRange / 2,
      max: midPrice + effectiveRange / 2,
    };
  }

  /**
   * Notify update callback
   */
  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.getState());
    }
  }

  /**
   * Get filtered trades for rendering
   */
  getFilteredTrades(timeWindowMs: number = 60000): Trade[] {
    const now = Date.now();
    const cutoff = now - timeWindowMs;

    return this.trades.filter(
      t =>
        t.timestamp > cutoff &&
        t.quantity >= this.settings.tradeMinSize
    );
  }

  /**
   * Get order book snapshot
   */
  getOrderBook(): OrderBookState {
    return this.orderBook;
  }

  /**
   * Get history buffer
   */
  getHistory(): HistoryBuffer {
    return this.history;
  }

  /**
   * Get current settings
   */
  getSettings(): HeatmapSettings {
    return { ...this.settings };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.orderBook.bids.clear();
    this.orderBook.asks.clear();
    this.orderBook.bestBid = 0;
    this.orderBook.bestAsk = 0;
    this.orderBook.midPrice = 0;
    this.orderBook.updateCount = 0;

    this.history.clear();
    this.trades = [];

    this.wallDetector.clear();
    this.spoofDetector.clear();
    this.absorptionTracker.clear();
  }

  /**
   * Destroy engine
   */
  destroy(): void {
    this.clear();
    this.onUpdate = null;
  }
}
