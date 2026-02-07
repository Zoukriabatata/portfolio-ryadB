/**
 * TWAP ENGINE - Time Weighted Average Price
 *
 * Orderflow-based calculation engine for institutional-grade TWAP computation.
 *
 * FORMULA:
 *   TWAP = Σ(Price_i) / N
 *
 * Where:
 *   - Price_i = Price at time slice i (last trade price, or interpolated)
 *   - N = Number of time slices
 *
 * KEY DIFFERENCE FROM VWAP:
 *   - TWAP ignores volume entirely
 *   - TWAP weights all time periods equally
 *   - TWAP is less affected by block trades
 *
 * USE CASES:
 *   - Execution benchmark when volume is thin
 *   - Comparison with VWAP to detect volume clustering
 *   - Fair value estimation in low-liquidity periods
 */

// ============ TYPES ============

export interface TWAPTrade {
  timestamp: number;  // Unix ms
  price: number;      // Trade price
}

export interface TimeSlice {
  startTime: number;      // Slice start timestamp
  endTime: number;        // Slice end timestamp
  price: number | null;   // Price in this slice (null if no trades)
  tradeCount: number;     // Number of trades in slice
  lastPrice: number;      // Last trade price (for carry-forward)
}

export interface TWAPState {
  slices: TimeSlice[];           // Completed time slices
  currentSlice: TimeSlice | null; // Active slice
  twap: number;                   // Current TWAP value
  sliceCount: number;             // Total slices with data
  startTime: number;              // Calculation start
  lastUpdateTime: number;         // Last update timestamp
}

export interface TWAPConfig {
  sliceDurationMs: number;        // Time slice duration in milliseconds
  carryForwardPrice: boolean;     // Use last price for empty slices
  maxSlices: number;              // Maximum slices to keep (memory limit)
  interpolateEmpty: boolean;      // Interpolate empty slices
}

export type TWAPMode = 'discrete' | 'continuous';

// ============ DEFAULT CONFIGS ============

export const TWAP_CONFIGS: Record<string, TWAPConfig> = {
  // 1-second slices for high-frequency
  HFT: {
    sliceDurationMs: 1000,
    carryForwardPrice: true,
    maxSlices: 86400, // 24 hours
    interpolateEmpty: false,
  },
  // 1-minute slices for standard trading
  STANDARD: {
    sliceDurationMs: 60000,
    carryForwardPrice: true,
    maxSlices: 1440, // 24 hours
    interpolateEmpty: true,
  },
  // 5-minute slices for swing trading
  SWING: {
    sliceDurationMs: 300000,
    carryForwardPrice: true,
    maxSlices: 288, // 24 hours
    interpolateEmpty: true,
  },
  // 100ms slices for tick-by-tick
  TICK: {
    sliceDurationMs: 100,
    carryForwardPrice: true,
    maxSlices: 360000, // 10 hours
    interpolateEmpty: false,
  },
};

// ============ TWAP ENGINE ============

export class TWAPEngine {
  private state: TWAPState;
  private config: TWAPConfig;
  private mode: TWAPMode;

  // For continuous TWAP
  private continuousSum: number = 0;
  private continuousCount: number = 0;
  private lastKnownPrice: number = 0;

  // Trade buffer for current slice
  private currentSliceTrades: TWAPTrade[] = [];

  constructor(config: TWAPConfig = TWAP_CONFIGS.STANDARD, mode: TWAPMode = 'discrete') {
    this.config = config;
    this.mode = mode;
    this.state = this.createEmptyState();
  }

  // ============ CORE CALCULATION ============

  /**
   * Process a single trade
   *
   * DISCRETE TWAP:
   *   - Collects trades into time slices
   *   - At slice boundary, uses last price (or VWAP of slice)
   *   - TWAP = average of slice prices
   *
   * CONTINUOUS TWAP:
   *   - Every trade contributes equally
   *   - TWAP = simple average of all trade prices
   *   - More responsive but noisier
   */
  processTrade(trade: TWAPTrade): number {
    if (!this.isValidTrade(trade)) {
      return this.state.twap;
    }

    this.lastKnownPrice = trade.price;
    this.state.lastUpdateTime = trade.timestamp;

    if (this.mode === 'continuous') {
      return this.processContinuous(trade);
    } else {
      return this.processDiscrete(trade);
    }
  }

  /**
   * Discrete TWAP calculation
   *
   * Divides time into equal slices. Each slice contributes one price point.
   * This approach:
   *   - Reduces noise from rapid price fluctuations
   *   - Provides stable benchmark
   *   - Standard for execution algorithms
   */
  private processDiscrete(trade: TWAPTrade): number {
    // Initialize first slice if needed
    if (!this.state.currentSlice) {
      this.state.startTime = this.getSliceStart(trade.timestamp);
      this.state.currentSlice = this.createSlice(this.state.startTime);
    }

    // Check if we've moved to a new slice
    const sliceStart = this.getSliceStart(trade.timestamp);

    while (this.state.currentSlice && sliceStart > this.state.currentSlice.startTime) {
      // Finalize current slice
      this.finalizeSlice();

      // Handle gap slices (periods with no trades)
      const nextSliceStart = this.state.currentSlice.startTime + this.config.sliceDurationMs;

      if (sliceStart > nextSliceStart) {
        // There are gap slices
        this.handleGapSlices(nextSliceStart, sliceStart);
      }

      // Create new current slice
      this.state.currentSlice = this.createSlice(sliceStart);
    }

    // Add trade to current slice
    if (this.state.currentSlice) {
      this.state.currentSlice.tradeCount++;
      this.state.currentSlice.price = trade.price; // Last price in slice
      this.state.currentSlice.lastPrice = trade.price;
      this.currentSliceTrades.push(trade);
    }

    return this.state.twap;
  }

  /**
   * Continuous TWAP calculation
   *
   * Simple running average of all trade prices.
   * Each trade has equal weight regardless of time.
   */
  private processContinuous(trade: TWAPTrade): number {
    if (this.state.startTime === 0) {
      this.state.startTime = trade.timestamp;
    }

    this.continuousSum += trade.price;
    this.continuousCount++;

    this.state.twap = this.continuousSum / this.continuousCount;
    this.state.sliceCount = this.continuousCount;

    return this.state.twap;
  }

  /**
   * Process multiple trades (batch)
   */
  processTrades(trades: TWAPTrade[]): number {
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sorted) {
      this.processTrade(trade);
    }

    return this.state.twap;
  }

  // ============ SLICE MANAGEMENT ============

  private getSliceStart(timestamp: number): number {
    return Math.floor(timestamp / this.config.sliceDurationMs) * this.config.sliceDurationMs;
  }

  private createSlice(startTime: number): TimeSlice {
    return {
      startTime,
      endTime: startTime + this.config.sliceDurationMs,
      price: null,
      tradeCount: 0,
      lastPrice: this.lastKnownPrice,
    };
  }

  private finalizeSlice(): void {
    if (!this.state.currentSlice) return;

    const slice = this.state.currentSlice;

    // Determine slice price
    if (slice.tradeCount > 0) {
      // Use last trade price (standard TWAP)
      // Alternative: use VWAP of trades in slice
      // slice.price is already set to last trade price
    } else if (this.config.carryForwardPrice && this.lastKnownPrice > 0) {
      // No trades in slice - carry forward last known price
      slice.price = this.lastKnownPrice;
    }

    // Only add slice if it has a valid price
    if (slice.price !== null) {
      this.state.slices.push({ ...slice });
      this.state.sliceCount++;

      // Enforce max slices limit
      if (this.state.slices.length > this.config.maxSlices) {
        this.state.slices.shift();
      }

      // Recalculate TWAP
      this.recalculateTWAP();
    }

    // Clear trade buffer
    this.currentSliceTrades = [];
  }

  /**
   * Handle gap slices (periods with no trades)
   *
   * Options:
   * 1. Carry forward last price (default)
   * 2. Interpolate between known prices
   * 3. Skip empty slices entirely
   */
  private handleGapSlices(fromTime: number, toTime: number): void {
    if (!this.config.carryForwardPrice && !this.config.interpolateEmpty) {
      return; // Skip empty slices
    }

    let currentTime = fromTime;

    while (currentTime < toTime) {
      const gapSlice: TimeSlice = {
        startTime: currentTime,
        endTime: currentTime + this.config.sliceDurationMs,
        price: null,
        tradeCount: 0,
        lastPrice: this.lastKnownPrice,
      };

      if (this.config.carryForwardPrice && this.lastKnownPrice > 0) {
        gapSlice.price = this.lastKnownPrice;
        this.state.slices.push(gapSlice);
        this.state.sliceCount++;
      }

      currentTime += this.config.sliceDurationMs;
    }

    // Enforce max slices
    while (this.state.slices.length > this.config.maxSlices) {
      this.state.slices.shift();
    }
  }

  /**
   * Recalculate TWAP from all slices
   *
   * TWAP = Σ(SlicePrice_i) / N
   */
  private recalculateTWAP(): void {
    const validSlices = this.state.slices.filter(s => s.price !== null);

    if (validSlices.length === 0) {
      this.state.twap = 0;
      return;
    }

    const sum = validSlices.reduce((acc, slice) => acc + (slice.price || 0), 0);
    this.state.twap = sum / validSlices.length;
  }

  // ============ REAL-TIME UPDATE ============

  /**
   * Force update current slice (for real-time display)
   *
   * Call this periodically to update TWAP even without new trades.
   * Useful for:
   *   - Updating TWAP during low-volume periods
   *   - Triggering slice transitions
   */
  tick(currentTime: number): number {
    if (this.mode === 'continuous') {
      return this.state.twap;
    }

    if (!this.state.currentSlice) {
      return this.state.twap;
    }

    const sliceStart = this.getSliceStart(currentTime);

    // Check if we've crossed into a new slice
    if (sliceStart > this.state.currentSlice.startTime) {
      this.finalizeSlice();

      // Handle any gap slices
      const nextSliceStart = this.state.currentSlice
        ? this.state.currentSlice.startTime + this.config.sliceDurationMs
        : sliceStart;

      if (sliceStart > nextSliceStart) {
        this.handleGapSlices(nextSliceStart, sliceStart);
      }

      this.state.currentSlice = this.createSlice(sliceStart);
      this.recalculateTWAP();
    }

    return this.state.twap;
  }

  // ============ EDGE CASES ============

  /**
   * Validate trade data
   */
  private isValidTrade(trade: TWAPTrade): boolean {
    if (trade.price <= 0) return false;
    if (trade.timestamp <= 0) return false;

    // Sanity check for extreme price moves
    if (this.lastKnownPrice > 0) {
      const deviation = Math.abs(trade.price - this.lastKnownPrice) / this.lastKnownPrice;
      if (deviation > 0.99) return false;
    }

    return true;
  }

  /**
   * Handle missing trades in time slice
   *
   * When no trades occur in a slice:
   * 1. carryForwardPrice=true: Use last known price
   * 2. interpolateEmpty=true: Linear interpolation
   * 3. Both false: Skip slice (reduces denominator)
   */
  applyInterpolation(): void {
    if (!this.config.interpolateEmpty) return;

    const slices = this.state.slices;
    let lastValidPrice: number | null = null;
    let lastValidIndex = -1;

    for (let i = 0; i < slices.length; i++) {
      if (slices[i].price !== null) {
        // Interpolate between lastValidIndex and i
        if (lastValidIndex >= 0 && i - lastValidIndex > 1 && lastValidPrice !== null) {
          const startPrice = lastValidPrice;
          const endPrice = slices[i].price!;
          const steps = i - lastValidIndex;

          for (let j = lastValidIndex + 1; j < i; j++) {
            const ratio = (j - lastValidIndex) / steps;
            slices[j].price = startPrice + (endPrice - startPrice) * ratio;
          }
        }

        lastValidPrice = slices[i].price;
        lastValidIndex = i;
      }
    }

    this.recalculateTWAP();
  }

  // ============ COMPARISON WITH VWAP ============

  /**
   * TWAP vs VWAP deviation
   *
   * When TWAP > VWAP:
   *   - Volume clustered at lower prices
   *   - Large sells executed at lower levels
   *
   * When TWAP < VWAP:
   *   - Volume clustered at higher prices
   *   - Large buys executed at higher levels
   *
   * Use case:
   *   - Detect volume timing/clustering
   *   - Evaluate execution quality
   */
  compareWithVWAP(vwap: number): {
    twap: number;
    vwap: number;
    deviation: number;        // TWAP - VWAP
    deviationPercent: number; // (TWAP - VWAP) / VWAP * 100
    volumeSkew: 'high' | 'low' | 'neutral'; // Where volume clustered
  } {
    const deviation = this.state.twap - vwap;
    const deviationPercent = vwap !== 0 ? (deviation / vwap) * 100 : 0;

    let volumeSkew: 'high' | 'low' | 'neutral' = 'neutral';
    if (Math.abs(deviationPercent) > 0.05) { // 0.05% threshold
      volumeSkew = deviation > 0 ? 'low' : 'high';
    }

    return {
      twap: this.state.twap,
      vwap,
      deviation,
      deviationPercent,
      volumeSkew,
    };
  }

  // ============ MARKET VOLATILITY ANALYSIS ============

  /**
   * Analyze TWAP behavior during different market conditions
   *
   * Volatile markets:
   *   - Large price swings within slices
   *   - TWAP may lag actual price significantly
   *
   * Flat markets:
   *   - Slices have similar prices
   *   - TWAP closely tracks current price
   */
  getVolatilityMetrics(): {
    sliceVariance: number;     // Variance of slice prices
    sliceStdDev: number;       // Standard deviation
    maxSliceRange: number;     // Max price swing in any slice
    avgTradesPerSlice: number; // Average trades per slice
  } {
    const validSlices = this.state.slices.filter(s => s.price !== null);

    if (validSlices.length < 2) {
      return {
        sliceVariance: 0,
        sliceStdDev: 0,
        maxSliceRange: 0,
        avgTradesPerSlice: 0,
      };
    }

    // Calculate variance
    const prices = validSlices.map(s => s.price!);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const squaredDiffs = prices.map(p => (p - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    // Max range
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const maxRange = maxPrice - minPrice;

    // Average trades per slice
    const totalTrades = validSlices.reduce((a, s) => a + s.tradeCount, 0);
    const avgTrades = totalTrades / validSlices.length;

    return {
      sliceVariance: variance,
      sliceStdDev: stdDev,
      maxSliceRange: maxRange,
      avgTradesPerSlice: avgTrades,
    };
  }

  // ============ STATE MANAGEMENT ============

  private createEmptyState(): TWAPState {
    return {
      slices: [],
      currentSlice: null,
      twap: 0,
      sliceCount: 0,
      startTime: 0,
      lastUpdateTime: 0,
    };
  }

  getTWAP(): number {
    return this.state.twap;
  }

  getState(): Readonly<TWAPState> {
    return {
      ...this.state,
      slices: [...this.state.slices],
      currentSlice: this.state.currentSlice ? { ...this.state.currentSlice } : null,
    };
  }

  getSlices(): ReadonlyArray<TimeSlice> {
    return this.state.slices;
  }

  reset(): void {
    this.state = this.createEmptyState();
    this.continuousSum = 0;
    this.continuousCount = 0;
    this.lastKnownPrice = 0;
    this.currentSliceTrades = [];
  }

  setConfig(config: TWAPConfig): void {
    this.config = config;
  }

  setMode(mode: TWAPMode): void {
    this.mode = mode;
    this.reset();
  }

  // ============ SERIALIZATION ============

  toJSON(): string {
    return JSON.stringify({
      state: this.state,
      config: this.config,
      mode: this.mode,
      continuousSum: this.continuousSum,
      continuousCount: this.continuousCount,
      lastKnownPrice: this.lastKnownPrice,
    });
  }

  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.state = data.state;
    this.config = data.config;
    this.mode = data.mode;
    this.continuousSum = data.continuousSum;
    this.continuousCount = data.continuousCount;
    this.lastKnownPrice = data.lastKnownPrice;
  }
}

// ============ SINGLETON ============

let twapEngineInstance: TWAPEngine | null = null;

export function getTWAPEngine(): TWAPEngine {
  if (!twapEngineInstance) {
    twapEngineInstance = new TWAPEngine();
  }
  return twapEngineInstance;
}

export function resetTWAPEngine(): void {
  twapEngineInstance = null;
}
