/**
 * FOOTPRINT ENGINE - Professional Orderflow Processing
 *
 * Architecture style ATAS / NinjaTrader / Quantower
 *
 * Features:
 * - Fixed width footprint layout
 * - Bid x Ask clusters per price level
 * - Delta calculation (per level + total)
 * - Imbalance detection with configurable ratio
 * - POC (Point of Control) detection
 * - Volume Profile integration ready
 */

// ============ TYPES ============

export interface TradeData {
  price: number;
  quantity: number;
  side: 'buy' | 'sell';  // Aggressor side
  timestamp: number;     // Unix ms
}

export interface PriceLevel {
  price: number;
  bidVolume: number;     // Sell market orders (hitting bid)
  askVolume: number;     // Buy market orders (hitting ask)
  bidTrades: number;     // Number of trades
  askTrades: number;
  delta: number;         // askVolume - bidVolume
  totalVolume: number;
  imbalanceBuy: boolean; // Ask >> Bid below
  imbalanceSell: boolean; // Bid >> Ask above
}

export interface FootprintCandle {
  // Time
  time: number;          // Unix seconds (candle open time)
  timeClose: number;     // Unix seconds (candle close time)
  isClosed: boolean;

  // OHLC
  open: number;
  high: number;
  low: number;
  close: number;

  // Orderflow data
  levels: Map<number, PriceLevel>;  // Keyed by rounded price

  // Aggregates
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;

  // Key levels
  poc: number;           // Price of highest volume
  vah: number;           // Value Area High (70%)
  val: number;           // Value Area Low (70%)
  pocDelta: number;      // Price of highest absolute delta
}

export interface FootprintConfig {
  tickSize: number;           // Price rounding (e.g., 10 for BTC)
  imbalanceRatio: number;     // 3.0 = 300%
  imbalanceMinVolume: number; // Minimum volume for imbalance
  valueAreaPercent: number;   // 0.70 = 70%
}

export interface DeltaProfileLevel {
  price: number;
  delta: number;
  normalizedDelta: number;  // -1 to 1 for rendering
}

// ============ DEFAULT CONFIG ============

export const DEFAULT_FOOTPRINT_CONFIG: FootprintConfig = {
  tickSize: 10,
  imbalanceRatio: 3.0,
  imbalanceMinVolume: 0.1,
  valueAreaPercent: 0.70,
};

// ============ FOOTPRINT ENGINE ============

type FootprintCallback = (candle: FootprintCandle, timeframe: number) => void;

export class FootprintEngine {
  private config: FootprintConfig;
  private candles: Map<number, Map<number, FootprintCandle>> = new Map(); // timeframe -> time -> candle
  private activeTimeframes: Set<number> = new Set([60]); // Default 1m
  private listeners: Map<string, Set<FootprintCallback>> = new Map();

  constructor(config: Partial<FootprintConfig> = {}) {
    this.config = { ...DEFAULT_FOOTPRINT_CONFIG, ...config };
    this.listeners.set('footprint:update', new Set());
    this.listeners.set('footprint:close', new Set());
  }

  // ============ CONFIGURATION ============

  setConfig(config: Partial<FootprintConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): FootprintConfig {
    return { ...this.config };
  }

  setActiveTimeframes(timeframes: number[]): void {
    this.activeTimeframes = new Set(timeframes);
  }

  // ============ TRADE PROCESSING ============

  /**
   * Process a single trade
   */
  processTrade(trade: TradeData): void {
    const { price, quantity, side, timestamp } = trade;
    const roundedPrice = this.roundPrice(price);

    for (const tf of this.activeTimeframes) {
      const candleTime = this.getCandleTime(timestamp, tf);
      const candle = this.getOrCreateCandle(tf, candleTime, price);

      // Update OHLC
      if (price > candle.high) candle.high = price;
      if (price < candle.low) candle.low = price;
      candle.close = price;

      // Get or create price level
      let level = candle.levels.get(roundedPrice);
      if (!level) {
        level = this.createPriceLevel(roundedPrice);
        candle.levels.set(roundedPrice, level);
      }

      // Update level
      if (side === 'buy') {
        level.askVolume += quantity;
        level.askTrades++;
        candle.totalBuyVolume += quantity;
      } else {
        level.bidVolume += quantity;
        level.bidTrades++;
        candle.totalSellVolume += quantity;
      }

      level.totalVolume = level.bidVolume + level.askVolume;
      level.delta = level.askVolume - level.bidVolume;

      // Update candle aggregates
      candle.totalVolume += quantity;
      candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
      candle.totalTrades++;

      // Recalculate key levels
      this.updateKeyLevels(candle);

      // Calculate imbalances
      this.calculateImbalances(candle);

      // Emit update
      this.emit('footprint:update', candle, tf);
    }
  }

  /**
   * Process multiple trades (batch)
   */
  processTrades(trades: TradeData[]): void {
    for (const trade of trades) {
      this.processTrade(trade);
    }
  }

  // ============ CANDLE MANAGEMENT ============

  /**
   * Get candle start time for a timestamp
   */
  private getCandleTime(timestampMs: number, timeframeSeconds: number): number {
    const seconds = Math.floor(timestampMs / 1000);
    return Math.floor(seconds / timeframeSeconds) * timeframeSeconds;
  }

  /**
   * Get or create a candle
   */
  private getOrCreateCandle(
    timeframe: number,
    candleTime: number,
    price: number
  ): FootprintCandle {
    if (!this.candles.has(timeframe)) {
      this.candles.set(timeframe, new Map());
    }

    const tfCandles = this.candles.get(timeframe)!;

    if (!tfCandles.has(candleTime)) {
      const candle: FootprintCandle = {
        time: candleTime,
        timeClose: candleTime + timeframe,
        isClosed: false,
        open: price,
        high: price,
        low: price,
        close: price,
        levels: new Map(),
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalDelta: 0,
        totalTrades: 0,
        poc: price,
        vah: price,
        val: price,
        pocDelta: price,
      };
      tfCandles.set(candleTime, candle);

      // Check if previous candle should be closed
      const prevTime = candleTime - timeframe;
      const prevCandle = tfCandles.get(prevTime);
      if (prevCandle && !prevCandle.isClosed) {
        prevCandle.isClosed = true;
        this.emit('footprint:close', prevCandle, timeframe);
      }
    }

    return tfCandles.get(candleTime)!;
  }

  /**
   * Create empty price level
   */
  private createPriceLevel(price: number): PriceLevel {
    return {
      price,
      bidVolume: 0,
      askVolume: 0,
      bidTrades: 0,
      askTrades: 0,
      delta: 0,
      totalVolume: 0,
      imbalanceBuy: false,
      imbalanceSell: false,
    };
  }

  /**
   * Round price to tick size
   */
  private roundPrice(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  // ============ CALCULATIONS ============

  /**
   * Update POC, VAH, VAL
   */
  private updateKeyLevels(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    let maxVolume = 0;
    let maxDelta = 0;
    let pocPrice = candle.close;
    let pocDeltaPrice = candle.close;

    // Find POC and POC Delta
    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
      if (Math.abs(level.delta) > maxDelta) {
        maxDelta = Math.abs(level.delta);
        pocDeltaPrice = price;
      }
    });

    candle.poc = pocPrice;
    candle.pocDelta = pocDeltaPrice;

    // Calculate Value Area (70% of volume)
    this.calculateValueArea(candle);
  }

  /**
   * Calculate Value Area (VAH/VAL)
   */
  private calculateValueArea(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    const targetVolume = candle.totalVolume * this.config.valueAreaPercent;
    let accumulatedVolume = 0;

    // Sort levels by price descending
    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[0] - a[0]);

    // Start from POC and expand outward
    const pocIndex = sortedLevels.findIndex(([price]) => price === candle.poc);
    if (pocIndex === -1) return;

    let upperIndex = pocIndex;
    let lowerIndex = pocIndex;
    accumulatedVolume = sortedLevels[pocIndex][1].totalVolume;

    while (accumulatedVolume < targetVolume) {
      const canExpandUp = upperIndex > 0;
      const canExpandDown = lowerIndex < sortedLevels.length - 1;

      if (!canExpandUp && !canExpandDown) break;

      let expandUp = false;

      if (canExpandUp && canExpandDown) {
        // Compare which side has more volume
        const upVolume = sortedLevels[upperIndex - 1][1].totalVolume;
        const downVolume = sortedLevels[lowerIndex + 1][1].totalVolume;
        expandUp = upVolume >= downVolume;
      } else if (canExpandUp) {
        expandUp = true;
      }

      if (expandUp) {
        upperIndex--;
        accumulatedVolume += sortedLevels[upperIndex][1].totalVolume;
      } else {
        lowerIndex++;
        accumulatedVolume += sortedLevels[lowerIndex][1].totalVolume;
      }
    }

    candle.vah = sortedLevels[upperIndex][0];
    candle.val = sortedLevels[lowerIndex][0];
  }

  /**
   * Calculate imbalances (ATAS diagonal comparison)
   */
  private calculateImbalances(candle: FootprintCandle): void {
    const { imbalanceRatio, imbalanceMinVolume, tickSize } = this.config;

    candle.levels.forEach((level, price) => {
      // Reset
      level.imbalanceBuy = false;
      level.imbalanceSell = false;

      // Buy imbalance: Compare ASK at this level vs BID at level below
      const levelBelow = candle.levels.get(price - tickSize);
      if (levelBelow &&
          level.askVolume >= imbalanceMinVolume &&
          levelBelow.bidVolume > 0) {
        level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
      }

      // Sell imbalance: Compare BID at this level vs ASK at level above
      const levelAbove = candle.levels.get(price + tickSize);
      if (levelAbove &&
          level.bidVolume >= imbalanceMinVolume &&
          levelAbove.askVolume > 0) {
        level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
      }
    });
  }

  // ============ DATA ACCESS ============

  /**
   * Get all candles for a timeframe
   */
  getCandles(timeframe: number): FootprintCandle[] {
    const tfCandles = this.candles.get(timeframe);
    if (!tfCandles) return [];
    return Array.from(tfCandles.values()).sort((a, b) => a.time - b.time);
  }

  /**
   * Get candles in time range
   */
  getCandlesInRange(
    timeframe: number,
    startTime: number,
    endTime: number
  ): FootprintCandle[] {
    return this.getCandles(timeframe).filter(
      c => c.time >= startTime && c.time <= endTime
    );
  }

  /**
   * Get latest candle
   */
  getLatestCandle(timeframe: number): FootprintCandle | null {
    const candles = this.getCandles(timeframe);
    return candles.length > 0 ? candles[candles.length - 1] : null;
  }

  /**
   * Get delta profile for a candle
   */
  getDeltaProfile(candle: FootprintCandle): DeltaProfileLevel[] {
    if (candle.levels.size === 0) return [];

    let maxAbsDelta = 0;
    candle.levels.forEach(level => {
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(level.delta));
    });

    if (maxAbsDelta === 0) maxAbsDelta = 1;

    const profile: DeltaProfileLevel[] = [];
    candle.levels.forEach((level, price) => {
      profile.push({
        price,
        delta: level.delta,
        normalizedDelta: level.delta / maxAbsDelta,
      });
    });

    return profile.sort((a, b) => b.price - a.price);
  }

  /**
   * Get session delta profile (multiple candles)
   */
  getSessionDeltaProfile(candles: FootprintCandle[]): DeltaProfileLevel[] {
    const aggregated = new Map<number, number>();

    for (const candle of candles) {
      candle.levels.forEach((level, price) => {
        const current = aggregated.get(price) || 0;
        aggregated.set(price, current + level.delta);
      });
    }

    let maxAbsDelta = 0;
    aggregated.forEach(delta => {
      maxAbsDelta = Math.max(maxAbsDelta, Math.abs(delta));
    });

    if (maxAbsDelta === 0) maxAbsDelta = 1;

    const profile: DeltaProfileLevel[] = [];
    aggregated.forEach((delta, price) => {
      profile.push({
        price,
        delta,
        normalizedDelta: delta / maxAbsDelta,
      });
    });

    return profile.sort((a, b) => b.price - a.price);
  }

  // ============ EVENTS ============

  on(event: 'footprint:update' | 'footprint:close', callback: FootprintCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, candle: FootprintCandle, timeframe: number): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(candle, timeframe);
      } catch (e) {
        console.error('Error in footprint callback:', e);
      }
    });
  }

  // ============ CLEANUP ============

  /**
   * Clear old candles to save memory
   */
  pruneOldCandles(maxCandles: number = 500): void {
    this.candles.forEach((tfCandles, timeframe) => {
      if (tfCandles.size > maxCandles) {
        const sorted = Array.from(tfCandles.keys()).sort((a, b) => a - b);
        const toRemove = sorted.slice(0, tfCandles.size - maxCandles);
        toRemove.forEach(time => tfCandles.delete(time));
      }
    });
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.candles.clear();
  }
}

// ============ SINGLETON ============

let footprintEngine: FootprintEngine | null = null;

export function getFootprintEngine(): FootprintEngine {
  if (!footprintEngine) {
    footprintEngine = new FootprintEngine();
  }
  return footprintEngine;
}

export function resetFootprintEngine(): void {
  footprintEngine?.clearAll();
  footprintEngine = null;
}

export function configureFootprintEngine(config: Partial<FootprintConfig>): void {
  getFootprintEngine().setConfig(config);
}
