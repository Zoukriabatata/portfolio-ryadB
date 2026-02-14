/**
 * LIVE DATA ENGINE - Real-time Binance data for Heatmap
 *
 * Converts Binance WebSocket data into MarketState format
 * compatible with HeatmapRenderer.
 *
 * Streams used:
 * - aggTrade: real-time trades
 * - depth20@100ms: orderbook depth 20 levels
 */

import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import type { Tick } from '@/lib/live/HierarchicalAggregator';
import {
  MarketState,
  PricePoint,
  Trade,
  TradeCluster,
  PassiveOrder,
  HeatmapCell,
  CumulativeLevel,
  InterestZone,
  SimulationConfig,
  DEFAULT_CONFIG,
  ImbalanceLevel,
  AbsorptionEvent,
  IcebergOrder,
  VWAPData,
  CumulativeDeltaData,
  DeltaPoint,
  TapeVelocityData,
  VelocityPoint,
  LargeTradeAlertsData,
  LargeTrade,
  PressureMeterData,
  PressurePoint,
  SessionStats,
  DrawingsData,
} from './types';

export interface LiveDataConfig extends SimulationConfig {
  symbol: string;
  maxHistoryLength: number;
  maxTrades: number;
  tradeLifetimeMs: number;
}

const DEFAULT_LIVE_CONFIG: LiveDataConfig = {
  ...DEFAULT_CONFIG,
  symbol: 'btcusdt',
  maxHistoryLength: 120,  // ~30 seconds at 250ms update interval
  maxTrades: 200,
  tradeLifetimeMs: 4000,
};

export class LiveDataEngine {
  private config: LiveDataConfig;
  private state: MarketState;
  private tradeCounter = 0;
  private onUpdate: ((state: MarketState) => void) | null = null;
  private unsubscribers: (() => void)[] = [];
  private animationFrame: number = 0;
  private isRunning = false;

  // Time-series heatmap snapshots
  private snapshotFrameCounter = 0;
  private snapshotInterval = 6;         // Every 6 frames (~360ms at 60fps)
  private heatmapTimeIndex = 0;
  private lastPriceHistoryUpdate = 0;
  private priceHistoryInterval = 250;   // Add price history point every 250ms (not every frame)         // Monotonically increasing time column index
  private prevBidSnapshot: Map<number, number> = new Map(); // price → intensity
  private prevAskSnapshot: Map<number, number> = new Map();

  constructor(config: Partial<LiveDataConfig> = {}) {
    this.config = { ...DEFAULT_LIVE_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  private createInitialState(): MarketState {
    const now = Date.now();
    const { basePrice, tickSize } = this.config;

    return {
      currentBid: basePrice - tickSize,
      currentAsk: basePrice,
      midPrice: basePrice - tickSize / 2,
      priceHistory: [],
      trades: [],
      tradeClusters: [],
      cumulativeLevels: new Map(),
      bids: new Map(),
      asks: new Map(),
      interestZones: new Map(),
      heatmapHistory: new Map(),
      traces: [],
      // Advanced orderflow features
      imbalances: [],
      absorptionEvents: [],
      icebergs: new Map(),
      vwap: {
        vwap: basePrice,
        upperBand: basePrice + tickSize * 5,
        lowerBand: basePrice - tickSize * 5,
        cumulativeVolume: 0,
        cumulativePV: 0,
      },
      cumulativeDelta: {
        points: [],
        currentDelta: 0,
        sessionHigh: 0,
        sessionLow: 0,
        maxAbsDelta: 1,
      },
      tapeVelocity: {
        points: [],
        currentTPS: 0,
        currentVPS: 0,
        avgTPS: 0,
        maxTPS: 0,
        isAccelerating: false,
        accelerationLevel: 'normal',
      },
      largeTradeAlerts: {
        trades: [],
        largeThreshold: 1,
        hugeThreshold: 5,
        massiveThreshold: 10,
        avgTradeSize: 0.5,
        maxTradeSize: 0.5,
        totalLargeTrades: 0,
      },
      pressureMeter: {
        points: [],
        currentRatio: 0,
        smoothedRatio: 0,
        shortTermBuyVol: 0,
        shortTermSellVol: 0,
        mediumTermBuyVol: 0,
        mediumTermSellVol: 0,
        momentum: 'neutral',
        momentumStrength: 0,
      },
      sessionStats: {
        sessionHigh: basePrice,
        sessionLow: basePrice,
        sessionOpen: basePrice,
        poc: basePrice,
        vah: basePrice + tickSize * 5,
        val: basePrice - tickSize * 5,
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        delta: 0,
        deltaPercent: 0,
        totalTrades: 0,
        avgTradeSize: 0,
        largestTrade: 0,
        sessionStart: now,
        lastUpdate: now,
      },
      drawings: {
        drawings: [],
        selectedId: null,
        activeToolType: null,
      },
      timestamp: now,
    };
  }

  private roundToTick(price: number): number {
    const { tickSize } = this.config;
    return Math.round(price / tickSize) * tickSize;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════════════════

  setOnUpdate(callback: (state: MarketState) => void): void {
    this.onUpdate = callback;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const ws = getBinanceLiveWS();

    // Subscribe to trades
    const unsubTick = ws.onTick((tick: Tick) => {
      this.processTrade(tick);
    });
    this.unsubscribers.push(unsubTick);

    // Subscribe to depth updates
    const unsubDepth = ws.onDepthUpdate((depth) => {
      this.processDepth(depth);
    });
    this.unsubscribers.push(unsubDepth);

    // Connect to Binance
    ws.connect(this.config.symbol);

    // Start render loop
    this.startRenderLoop();

    console.debug(`[LiveDataEngine] Started for ${this.config.symbol}`);
  }

  destroy(): void {
    this.isRunning = false;

    // Unsubscribe from all listeners
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Cancel animation frame
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    console.debug('[LiveDataEngine] Destroyed');
  }

  private startRenderLoop(): void {
    const tick = () => {
      if (!this.isRunning) return;

      this.updateState();

      if (this.onUpdate) {
        this.onUpdate(this.state);
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    tick();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRADE PROCESSING
  // ══════════════════════════════════════════════════════════════════════════

  private processTrade(tick: Tick): void {
    const now = Date.now();
    const price = this.roundToTick(tick.price);
    const side = tick.isBuyerMaker ? 'sell' : 'buy';

    // Create trade object
    const trade: Trade = {
      id: `trade_${this.tradeCounter++}`,
      timestamp: tick.timestamp,
      price: tick.price,
      size: tick.quantity,
      side,
      historyIndex: this.state.priceHistory.length - 1,
      opacity: 1,
      scale: 1,
    };

    // Add to trades list
    this.state.trades.push(trade);

    // Update cumulative levels
    const cumKey = price;
    let cumLevel = this.state.cumulativeLevels.get(cumKey);
    if (!cumLevel) {
      cumLevel = {
        price,
        totalBuySize: 0,
        totalSellSize: 0,
        buyCount: 0,
        sellCount: 0,
      };
      this.state.cumulativeLevels.set(cumKey, cumLevel);
    }

    if (side === 'buy') {
      cumLevel.totalBuySize += tick.quantity;
      cumLevel.buyCount++;
    } else {
      cumLevel.totalSellSize += tick.quantity;
      cumLevel.sellCount++;
    }

    // Mark absorption in heatmap
    this.markAbsorption(price, side === 'buy' ? 'ask' : 'bid', now);

    // Update cumulative delta
    this.updateCumulativeDelta(tick.timestamp, side, tick.quantity);

    // Check for large trade
    this.checkLargeTrade(trade);

    // Update price
    if (side === 'buy') {
      this.state.currentAsk = tick.price;
      this.state.currentBid = tick.price - this.config.tickSize;
    } else {
      this.state.currentBid = tick.price;
      this.state.currentAsk = tick.price + this.config.tickSize;
    }
    this.state.midPrice = (this.state.currentBid + this.state.currentAsk) / 2;
  }

  private markAbsorption(price: number, side: 'bid' | 'ask', now: number): void {
    const orders = side === 'bid' ? this.state.bids : this.state.asks;
    const order = orders.get(price);

    if (order) {
      order.state = 'absorbing';
      order.stateChangeTime = now;

      // Create trace
      this.state.traces.push({
        price,
        side,
        type: 'absorbed',
        opacity: 0.8,
        timestamp: now,
      });
    }
  }

  private updateCumulativeDelta(timestamp: number, side: 'buy' | 'sell', size: number): void {
    const cd = this.state.cumulativeDelta;
    const delta = side === 'buy' ? size : -size;

    cd.currentDelta += delta;

    // Add or update data point (aggregate every ~200ms)
    const shouldAddPoint = cd.points.length === 0 ||
      timestamp - cd.points[cd.points.length - 1].timestamp >= 200;

    if (shouldAddPoint) {
      cd.points.push({
        timestamp,
        delta: cd.currentDelta,
        buyVolume: side === 'buy' ? size : 0,
        sellVolume: side === 'sell' ? size : 0,
        price: this.state.midPrice,
      });

      // Limit points to ~5 minutes of data
      const maxPoints = 1500;
      if (cd.points.length > maxPoints) {
        cd.points = cd.points.slice(-maxPoints);
      }
    } else if (cd.points.length > 0) {
      // Update last point
      const lastPoint = cd.points[cd.points.length - 1];
      lastPoint.delta = cd.currentDelta;
      if (side === 'buy') {
        lastPoint.buyVolume += size;
      } else {
        lastPoint.sellVolume += size;
      }
      lastPoint.price = this.state.midPrice;
    }

    // Update session extremes
    cd.sessionHigh = Math.max(cd.sessionHigh, cd.currentDelta);
    cd.sessionLow = Math.min(cd.sessionLow, cd.currentDelta);
    cd.maxAbsDelta = Math.max(Math.abs(cd.sessionHigh), Math.abs(cd.sessionLow), 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPTH PROCESSING (Orderbook)
  // ══════════════════════════════════════════════════════════════════════════

  private processDepth(depth: { bids: [string, string][]; asks: [string, string][] }): void {
    const now = Date.now();

    // Process bids
    for (const [priceStr, qtyStr] of depth.bids) {
      const price = this.roundToTick(parseFloat(priceStr));
      const qty = parseFloat(qtyStr);

      if (qty > 0) {
        this.updatePassiveOrder(price, 'bid', qty, now);
      } else {
        // Order removed
        this.removePassiveOrder(price, 'bid', now);
      }
    }

    // Process asks
    for (const [priceStr, qtyStr] of depth.asks) {
      const price = this.roundToTick(parseFloat(priceStr));
      const qty = parseFloat(qtyStr);

      if (qty > 0) {
        this.updatePassiveOrder(price, 'ask', qty, now);
      } else {
        // Order removed
        this.removePassiveOrder(price, 'ask', now);
      }
    }

    // Update best bid/ask from depth
    if (depth.bids.length > 0) {
      this.state.currentBid = parseFloat(depth.bids[0][0]);
    }
    if (depth.asks.length > 0) {
      this.state.currentAsk = parseFloat(depth.asks[0][0]);
    }
    this.state.midPrice = (this.state.currentBid + this.state.currentAsk) / 2;
  }

  private updatePassiveOrder(price: number, side: 'bid' | 'ask', size: number, now: number): void {
    const orders = side === 'bid' ? this.state.bids : this.state.asks;
    let order = orders.get(price);

    if (!order) {
      // New order
      order = {
        price,
        side,
        size,
        initialSize: size,
        displaySize: 0, // Will animate in
        state: 'appearing',
        firstSeen: now,
        lastModified: now,
        stateChangeTime: now,
        lastVolumeAdd: now,
        timesReinforced: 0,
        wasPartiallyAbsorbed: false,
        opacity: 0,
        intensity: this.calculateIntensity(size),
        isSignificant: size > this.config.baseLiquidity * 2,
      };
      orders.set(price, order);

      // Mark as interest zone if significant
      if (order.isSignificant) {
        this.state.interestZones.set(price, {
          price,
          side,
          strength: order.intensity,
          totalVolume: size,
          orderCount: 1,
          firstSeen: now,
          lastActivity: now,
          wasTestedByPrice: false,
        });
      }
    } else {
      // Update existing order
      const wasReinforced = size > order.size;
      order.size = size;
      order.lastModified = now;
      order.intensity = this.calculateIntensity(size);
      order.isSignificant = size > this.config.baseLiquidity * 2;

      if (wasReinforced) {
        order.state = 'reinforcing';
        order.stateChangeTime = now;
        order.lastVolumeAdd = now;
        order.timesReinforced++;
      } else if (size < order.initialSize * 0.5) {
        order.state = 'absorbing';
        order.stateChangeTime = now;
        order.wasPartiallyAbsorbed = true;
      } else if (order.state === 'appearing') {
        order.state = 'stable';
        order.stateChangeTime = now;
      }
    }

    // Update heatmap cell
    const historyIndex = this.state.priceHistory.length - 1;
    const cellKey = `${price}_${Math.floor(historyIndex / 10)}`;
    this.state.heatmapHistory.set(cellKey, {
      price,
      timeIndex: Math.floor(historyIndex / 10),
      bidIntensity: side === 'bid' ? order.intensity : 0,
      askIntensity: side === 'ask' ? order.intensity : 0,
      wasAbsorbed: false,
      timestamp: now,
    });
  }

  private removePassiveOrder(price: number, side: 'bid' | 'ask', now: number): void {
    const orders = side === 'bid' ? this.state.bids : this.state.asks;
    const order = orders.get(price);

    if (order) {
      // Check if it was absorbed or cancelled
      if (order.wasPartiallyAbsorbed) {
        order.state = 'absorbed';
      } else {
        order.state = 'fading';
      }
      order.stateChangeTime = now;

      // Add trace
      this.state.traces.push({
        price,
        side,
        type: order.wasPartiallyAbsorbed ? 'absorbed' : 'cancelled',
        opacity: 0.6,
        timestamp: now,
      });
    }
  }

  // Adaptive normalization: windowed max over 60 seconds
  private recentMaxSizes: number[] = new Array(60).fill(0);
  private maxSizeIndex: number = 0;
  private lastMaxUpdateTime: number = 0;
  private currentSecondMax: number = 0;

  private calculateIntensity(size: number): number {
    // Track max size within current second
    if (size > this.currentSecondMax) {
      this.currentSecondMax = size;
    }

    const now = Date.now();
    // Rotate circular buffer once per second
    if (now - this.lastMaxUpdateTime >= 1000) {
      this.recentMaxSizes[this.maxSizeIndex] = this.currentSecondMax;
      this.maxSizeIndex = (this.maxSizeIndex + 1) % 60;
      this.currentSecondMax = size;
      this.lastMaxUpdateTime = now;
    }

    // Use 95th percentile of recent max sizes as reference
    const nonZero = this.recentMaxSizes.filter(s => s > 0);
    let observedMax: number;
    if (nonZero.length >= 3) {
      nonZero.sort((a, b) => a - b);
      observedMax = nonZero[Math.floor(nonZero.length * 0.95)];
    } else {
      observedMax = this.currentSecondMax;
    }

    const ref = Math.max(observedMax * 0.3, this.config.baseLiquidity);
    return Math.min(1, Math.pow(size / ref, 0.6));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIME-SERIES HEATMAP SNAPSHOTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Capture a full orderbook snapshot for the time-series heatmap.
   * Called periodically (every ~360ms) to build a depth visualization style view.
   */
  private captureFullSnapshot(now: number): void {
    this.heatmapTimeIndex++;

    // Snapshot all bids
    for (const [price, order] of this.state.bids) {
      if (order.opacity <= 0) continue;

      const cellKey = `${price}_${this.heatmapTimeIndex}`;
      const prevIntensity = this.prevBidSnapshot.get(price) ?? 0;
      const wasAbsorbed = prevIntensity > 0.3 && order.intensity < prevIntensity * 0.3;

      this.state.heatmapHistory.set(cellKey, {
        price,
        timeIndex: this.heatmapTimeIndex,
        bidIntensity: order.intensity,
        askIntensity: 0,
        wasAbsorbed,
        timestamp: now,
      });
    }

    // Snapshot all asks
    for (const [price, order] of this.state.asks) {
      if (order.opacity <= 0) continue;

      const cellKey = `${price}_${this.heatmapTimeIndex}`;
      const existing = this.state.heatmapHistory.get(cellKey);
      const prevIntensity = this.prevAskSnapshot.get(price) ?? 0;
      const wasAbsorbed = prevIntensity > 0.3 && order.intensity < prevIntensity * 0.3;

      if (existing) {
        existing.askIntensity = order.intensity;
        if (wasAbsorbed) existing.wasAbsorbed = true;
      } else {
        this.state.heatmapHistory.set(cellKey, {
          price,
          timeIndex: this.heatmapTimeIndex,
          bidIntensity: 0,
          askIntensity: order.intensity,
          wasAbsorbed,
          timestamp: now,
        });
      }
    }

    // Detect levels that completely disappeared (absorption)
    for (const [price, prevIntensity] of this.prevBidSnapshot) {
      if (prevIntensity > 0.3 && !this.state.bids.has(price)) {
        const cellKey = `${price}_${this.heatmapTimeIndex}`;
        const existing = this.state.heatmapHistory.get(cellKey);
        if (existing) {
          existing.wasAbsorbed = true;
        }
      }
    }
    for (const [price, prevIntensity] of this.prevAskSnapshot) {
      if (prevIntensity > 0.3 && !this.state.asks.has(price)) {
        const cellKey = `${price}_${this.heatmapTimeIndex}`;
        const existing = this.state.heatmapHistory.get(cellKey);
        if (existing) {
          existing.wasAbsorbed = true;
        }
      }
    }

    // Store current state as previous for next comparison
    this.prevBidSnapshot.clear();
    for (const [price, order] of this.state.bids) {
      this.prevBidSnapshot.set(price, order.intensity);
    }
    this.prevAskSnapshot.clear();
    for (const [price, order] of this.state.asks) {
      this.prevAskSnapshot.set(price, order.intensity);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATE UPDATE (Animation Loop)
  // ══════════════════════════════════════════════════════════════════════════

  private updateState(): void {
    const now = Date.now();
    const { tradeLifetimeMs, orderFadeInMs, orderFadeOutMs } = this.config;

    // Add price history point (throttled to avoid too many points)
    if (now - this.lastPriceHistoryUpdate >= this.priceHistoryInterval) {
      this.state.priceHistory.push({
        timestamp: now,
        bid: this.state.currentBid,
        ask: this.state.currentAsk,
      });
      this.lastPriceHistoryUpdate = now;

      // Limit history (with throttled updates, we can keep fewer points)
      if (this.state.priceHistory.length > 120) {  // ~30 seconds at 250ms interval
        this.state.priceHistory.splice(0, this.state.priceHistory.length - 120);
      }
    }

    // Periodic full orderbook snapshot for time-series heatmap
    this.snapshotFrameCounter++;
    if (this.snapshotFrameCounter >= this.snapshotInterval) {
      this.snapshotFrameCounter = 0;
      this.captureFullSnapshot(now);
    }

    // Update trades (fade out old ones) - in-place compaction (zero allocation)
    {
      let w = 0;
      for (let i = 0; i < this.state.trades.length; i++) {
        const trade = this.state.trades[i];
        const age = now - trade.timestamp;
        if (age > tradeLifetimeMs) continue;
        trade.opacity = Math.max(0, 1 - age / tradeLifetimeMs);
        trade.scale = 1 + (1 - trade.opacity) * 0.3;
        trade.historyIndex = Math.max(0, this.state.priceHistory.length - 1 - Math.floor(age / 100));
        this.state.trades[w++] = trade;
      }
      this.state.trades.length = w;
    }

    // Update passive orders
    this.updatePassiveOrders(this.state.bids, now);
    this.updatePassiveOrders(this.state.asks, now);

    // Update traces - in-place compaction (zero allocation)
    {
      let w = 0;
      for (let i = 0; i < this.state.traces.length; i++) {
        const trace = this.state.traces[i];
        const age = now - trace.timestamp;
        if (age > 3000) continue;
        trace.opacity = Math.max(0, 0.6 - age / 5000);
        if (trace.opacity <= 0.01) continue;
        this.state.traces[w++] = trace;
      }
      this.state.traces.length = w;
    }

    // Cleanup heatmap history - keep last 500 time indices (~3 minutes)
    const minKeepTimeIndex = this.heatmapTimeIndex - 500;
    if (this.state.heatmapHistory.size > 15000) {
      for (const [key, cell] of this.state.heatmapHistory) {
        if (cell.timeIndex < minKeepTimeIndex) {
          this.state.heatmapHistory.delete(key);
        }
      }
    }

    // Cleanup stale cumulative levels far from current price
    if (this.state.cumulativeLevels.size > 500) {
      const { tickSize, orderBookDepth } = this.config;
      const maxDistance = orderBookDepth * tickSize * 3;
      for (const [price] of this.state.cumulativeLevels) {
        if (Math.abs(price - this.state.midPrice) > maxDistance) {
          this.state.cumulativeLevels.delete(price);
        }
      }
    }

    // Rebuild trade clusters
    this.rebuildTradeClusters();

    // Update tape velocity
    this.updateTapeVelocity(now);

    // Update large trade alerts animations
    this.updateLargeTradeAlerts(now);

    // Update pressure meter
    this.updatePressureMeter(now);

    // Update session stats
    this.updateSessionStats(now);

    this.state.timestamp = now;
  }

  private updateTapeVelocity(now: number): void {
    const tv = this.state.tapeVelocity;
    const windowMs = 1000; // 1 second window

    // Count trades and volume in the last second
    let tradeCount = 0;
    let totalVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of this.state.trades) {
      if (now - trade.timestamp <= windowMs) {
        tradeCount++;
        totalVolume += trade.size;
        if (trade.side === 'buy') {
          buyVolume += trade.size;
        } else {
          sellVolume += trade.size;
        }
      }
    }

    tv.currentTPS = tradeCount;
    tv.currentVPS = totalVolume;

    // Add data point every 500ms
    const shouldAddPoint = tv.points.length === 0 ||
      now - tv.points[tv.points.length - 1].timestamp >= 500;

    if (shouldAddPoint) {
      tv.points.push({
        timestamp: now,
        tradesPerSecond: tradeCount,
        volumePerSecond: totalVolume,
        buyVolume,
        sellVolume,
      });

      // Limit points to ~2 minutes of data
      const maxPoints = 240;
      if (tv.points.length > maxPoints) {
        tv.points = tv.points.slice(-maxPoints);
      }
    }

    // Update max TPS
    tv.maxTPS = Math.max(tv.maxTPS, tradeCount);

    // Calculate average TPS
    if (tv.points.length > 0) {
      const sum = tv.points.reduce((acc, p) => acc + p.tradesPerSecond, 0);
      tv.avgTPS = sum / tv.points.length;
    }

    // Determine acceleration level
    if (tv.avgTPS > 0) {
      const ratio = tv.currentTPS / tv.avgTPS;
      tv.isAccelerating = ratio > 1.5;

      if (ratio <= 1.2) {
        tv.accelerationLevel = 'normal';
      } else if (ratio <= 2.0) {
        tv.accelerationLevel = 'elevated';
      } else if (ratio <= 3.0) {
        tv.accelerationLevel = 'high';
      } else {
        tv.accelerationLevel = 'extreme';
      }
    }
  }

  private largeTradeCounter = 0;

  private checkLargeTrade(trade: Trade): void {
    const lta = this.state.largeTradeAlerts;

    // Update average trade size
    if (this.state.trades.length > 0) {
      const totalSize = this.state.trades.reduce((sum, t) => sum + t.size, 0);
      lta.avgTradeSize = totalSize / this.state.trades.length;

      // Update dynamic thresholds
      lta.largeThreshold = Math.max(0.5, lta.avgTradeSize * 2);
      lta.hugeThreshold = Math.max(1, lta.avgTradeSize * 5);
      lta.massiveThreshold = Math.max(2, lta.avgTradeSize * 10);
    }

    // Check if this trade qualifies as large
    if (trade.size >= lta.largeThreshold) {
      let level: 'large' | 'huge' | 'massive' = 'large';
      if (trade.size >= lta.massiveThreshold) {
        level = 'massive';
      } else if (trade.size >= lta.hugeThreshold) {
        level = 'huge';
      }

      const largeTrade: LargeTrade = {
        id: `lt_${++this.largeTradeCounter}`,
        timestamp: trade.timestamp,
        price: trade.price,
        size: trade.size,
        side: trade.side,
        level,
        opacity: 1,
        pulsePhase: 0,
        historyIndex: trade.historyIndex,
      };

      lta.trades.push(largeTrade);
      lta.totalLargeTrades++;
      lta.maxTradeSize = Math.max(lta.maxTradeSize, trade.size);
    }
  }

  private updateLargeTradeAlerts(now: number): void {
    const lta = this.state.largeTradeAlerts;

    // Update large trade animations and cleanup old ones
    lta.trades = lta.trades.filter(lt => {
      const age = now - lt.timestamp;

      // Large trades persist for 30 seconds
      if (age > 30000) return false;

      // Pulse animation for first 3 seconds
      if (age < 3000) {
        lt.pulsePhase = (age / 300) % 1;
        lt.opacity = 1;
      } else {
        // Gradual fade after 3 seconds
        lt.pulsePhase = 0;
        lt.opacity = Math.max(0.3, 1 - (age - 3000) / 27000);
      }

      // Update history index for positioning
      lt.historyIndex = Math.max(0, this.state.priceHistory.length - 1 - Math.floor(age / 100));

      return true;
    });
  }

  private updatePressureMeter(now: number): void {
    const pm = this.state.pressureMeter;
    const shortWindow = 5000;   // 5 seconds
    const mediumWindow = 30000; // 30 seconds

    // Calculate volumes in time windows
    let shortBuy = 0, shortSell = 0;
    let mediumBuy = 0, mediumSell = 0;

    for (const trade of this.state.trades) {
      const age = now - trade.timestamp;

      if (age <= shortWindow) {
        if (trade.side === 'buy') shortBuy += trade.size;
        else shortSell += trade.size;
      }

      if (age <= mediumWindow) {
        if (trade.side === 'buy') mediumBuy += trade.size;
        else mediumSell += trade.size;
      }
    }

    pm.shortTermBuyVol = shortBuy;
    pm.shortTermSellVol = shortSell;
    pm.mediumTermBuyVol = mediumBuy;
    pm.mediumTermSellVol = mediumSell;

    // Calculate current ratio (-1 to 1)
    const totalShort = shortBuy + shortSell;
    if (totalShort > 0) {
      pm.currentRatio = (shortBuy - shortSell) / totalShort;
    } else {
      pm.currentRatio = 0;
    }

    // EMA smoothing
    const alpha = 0.1;
    pm.smoothedRatio = pm.smoothedRatio * (1 - alpha) + pm.currentRatio * alpha;

    // Determine momentum
    const ratio = pm.smoothedRatio;
    if (ratio > 0.5) {
      pm.momentum = 'strong_buy';
      pm.momentumStrength = Math.min(1, (ratio - 0.5) * 2);
    } else if (ratio > 0.15) {
      pm.momentum = 'buy';
      pm.momentumStrength = (ratio - 0.15) / 0.35;
    } else if (ratio < -0.5) {
      pm.momentum = 'strong_sell';
      pm.momentumStrength = Math.min(1, (-ratio - 0.5) * 2);
    } else if (ratio < -0.15) {
      pm.momentum = 'sell';
      pm.momentumStrength = (-ratio - 0.15) / 0.35;
    } else {
      pm.momentum = 'neutral';
      pm.momentumStrength = 0;
    }

    // Add data point every 200ms
    const shouldAddPoint = pm.points.length === 0 ||
      now - pm.points[pm.points.length - 1].timestamp >= 200;

    if (shouldAddPoint) {
      const buyPressure = totalShort > 0 ? shortBuy / totalShort : 0.5;
      const sellPressure = totalShort > 0 ? shortSell / totalShort : 0.5;

      pm.points.push({
        timestamp: now,
        buyPressure,
        sellPressure,
        ratio: pm.currentRatio,
      });

      // Limit points
      const maxPoints = 300;
      if (pm.points.length > maxPoints) {
        pm.points = pm.points.slice(-maxPoints);
      }
    }
  }

  // Throttle for VAH/VAL calculation (expensive sort)
  private lastVahValUpdate: number = 0;

  private updateSessionStats(now: number): void {
    const ss = this.state.sessionStats;
    const { midPrice, cumulativeLevels, trades } = this.state;

    // Update high/low
    ss.sessionHigh = Math.max(ss.sessionHigh, midPrice);
    ss.sessionLow = Math.min(ss.sessionLow, midPrice);

    // Incremental POC: track running max while computing totals
    let totalBuy = 0;
    let totalSell = 0;
    let maxVolumePrice = midPrice;
    let maxVolume = 0;

    for (const [price, level] of cumulativeLevels) {
      const levelVolume = level.totalBuySize + level.totalSellSize;
      totalBuy += level.totalBuySize;
      totalSell += level.totalSellSize;

      if (levelVolume > maxVolume) {
        maxVolume = levelVolume;
        maxVolumePrice = price;
      }
    }

    ss.totalBuyVolume = totalBuy;
    ss.totalSellVolume = totalSell;
    ss.totalVolume = totalBuy + totalSell;
    ss.delta = totalBuy - totalSell;
    ss.deltaPercent = ss.totalVolume > 0 ? (ss.delta / ss.totalVolume) * 100 : 0;
    ss.poc = maxVolumePrice;

    // Throttled VAH/VAL: sort only once per second
    if (now - this.lastVahValUpdate >= 1000 && cumulativeLevels.size > 0) {
      this.lastVahValUpdate = now;
      const volumeByPrice: { price: number; volume: number }[] = [];
      for (const [price, level] of cumulativeLevels) {
        volumeByPrice.push({ price, volume: level.totalBuySize + level.totalSellSize });
      }
      volumeByPrice.sort((a, b) => b.volume - a.volume);
      const targetVolume = ss.totalVolume * 0.7;
      let accumulatedVolume = 0;
      let vah = 0, val = Infinity;

      for (const { price, volume } of volumeByPrice) {
        if (accumulatedVolume >= targetVolume) break;
        if (price > vah) vah = price;
        if (price < val) val = price;
        accumulatedVolume += volume;
      }

      if (vah > 0) ss.vah = vah;
      if (val < Infinity) ss.val = val;
    }

    // Trade stats
    ss.totalTrades = trades.length;
    if (trades.length > 0) {
      const totalSize = trades.reduce((sum, t) => sum + t.size, 0);
      ss.avgTradeSize = totalSize / trades.length;
      ss.largestTrade = Math.max(...trades.map(t => t.size));
    }

    ss.lastUpdate = now;
  }

  private updatePassiveOrders(orders: Map<number, PassiveOrder>, now: number): void {
    const { orderFadeInMs, orderFadeOutMs } = this.config;

    for (const [price, order] of orders) {
      const timeSinceStateChange = now - order.stateChangeTime;

      switch (order.state) {
        case 'appearing':
          order.opacity = Math.min(1, timeSinceStateChange / orderFadeInMs);
          order.displaySize = order.size * order.opacity;
          if (timeSinceStateChange > orderFadeInMs) {
            order.state = 'stable';
            order.stateChangeTime = now;
          }
          break;

        case 'stable':
        case 'reinforcing':
          order.opacity = 1;
          order.displaySize = order.size;
          break;

        case 'absorbing':
          // Flash effect
          const flashPhase = Math.sin(timeSinceStateChange / 100 * Math.PI * 2);
          order.opacity = 0.7 + flashPhase * 0.3;
          order.displaySize = order.size;
          if (timeSinceStateChange > 1000) {
            order.state = order.size > 0 ? 'stable' : 'absorbed';
            order.stateChangeTime = now;
          }
          break;

        case 'absorbed':
        case 'fading':
          order.opacity = Math.max(0, 1 - timeSinceStateChange / orderFadeOutMs);
          order.displaySize = order.size * order.opacity;
          if (order.opacity <= 0) {
            order.state = 'gone';
            orders.delete(price);
          }
          break;

        case 'gone':
          orders.delete(price);
          break;
      }
    }
  }

  private rebuildTradeClusters(): void {
    const clusters = new Map<string, TradeCluster>();

    for (const trade of this.state.trades) {
      const key = `${this.roundToTick(trade.price)}_${trade.side}`;
      let cluster = clusters.get(key);

      if (!cluster) {
        cluster = {
          price: this.roundToTick(trade.price),
          side: trade.side,
          totalSize: 0,
          count: 0,
          trades: [],
          avgHistoryIndex: 0,
          opacity: 0,
          scale: 1,
        };
        clusters.set(key, cluster);
      }

      cluster.trades.push(trade);
      cluster.totalSize += trade.size;
      cluster.count++;
      cluster.avgHistoryIndex += trade.historyIndex;
      cluster.opacity = Math.max(cluster.opacity, trade.opacity);
    }

    // Finalize clusters
    for (const cluster of clusters.values()) {
      cluster.avgHistoryIndex /= cluster.count;
    }

    this.state.tradeClusters = Array.from(clusters.values());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ══════════════════════════════════════════════════════════════════════════

  getState(): MarketState {
    return this.state;
  }

  getConfig(): LiveDataConfig {
    return this.config;
  }
}

// Singleton
let liveDataEngine: LiveDataEngine | null = null;

export function getLiveDataEngine(config?: Partial<LiveDataConfig>): LiveDataEngine {
  if (!liveDataEngine) {
    liveDataEngine = new LiveDataEngine(config);
  }
  return liveDataEngine;
}

export function resetLiveDataEngine(): void {
  if (liveDataEngine) {
    liveDataEngine.destroy();
    liveDataEngine = null;
  }
}
