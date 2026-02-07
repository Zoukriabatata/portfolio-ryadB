/**
 * VWAP ENGINE - Volume Weighted Average Price
 *
 * Orderflow-based calculation engine for institutional-grade VWAP computation.
 *
 * FORMULA:
 *   VWAP = Σ(Price_i × Volume_i) / Σ(Volume_i)
 *
 * Where:
 *   - Price_i = Trade execution price (NOT midpoint, NOT OHLC average)
 *   - Volume_i = Trade size at that price
 *
 * IMPORTANT: Uses TRADE PRICE, not theoretical prices.
 * In orderflow context, VWAP represents the average price at which
 * volume actually transacted, weighted by size.
 */

// ============ TYPES ============

export interface Trade {
  timestamp: number;      // Unix ms
  price: number;          // Execution price
  size: number;           // Trade size (contracts/shares)
  side: 'buy' | 'sell';   // Aggressor side (taker)
  isBlockTrade?: boolean; // Flag for block/negotiated trades
}

export interface VWAPState {
  cumulativePV: number;      // Σ(Price × Volume)
  cumulativeVolume: number;  // Σ(Volume)
  vwap: number;              // Current VWAP value
  tradeCount: number;        // Number of trades processed
  lastUpdateTime: number;    // Last calculation timestamp
  sessionStart: number;      // Session start timestamp
  highOfDay: number;         // Session high
  lowOfDay: number;          // Session low
}

export interface VWAPBand {
  stdDev: number;           // Standard deviation multiplier
  upperBand: number;        // VWAP + (stdDev × σ)
  lowerBand: number;        // VWAP - (stdDev × σ)
}

export interface SessionConfig {
  type: 'RTH' | 'ETH' | 'FULL' | 'CUSTOM';
  startHour: number;        // 0-23 (in exchange timezone)
  startMinute: number;      // 0-59
  endHour: number;          // 0-23
  endMinute: number;        // 0-59
  timezone: string;         // IANA timezone (e.g., 'America/New_York')
  resetOnSessionStart: boolean;
}

export interface AnchoredVWAPConfig {
  anchorTimestamp: number;  // Start calculation from this timestamp
  anchorPrice?: number;     // Optional: anchor at specific price event
  anchorType: 'time' | 'high' | 'low' | 'volume_spike' | 'manual';
}

// ============ SESSION PRESETS ============

export const SESSION_PRESETS: Record<string, SessionConfig> = {
  // CME E-mini (ES, NQ, etc.)
  CME_RTH: {
    type: 'RTH',
    startHour: 9,
    startMinute: 30,
    endHour: 16,
    endMinute: 0,
    timezone: 'America/New_York',
    resetOnSessionStart: true,
  },
  CME_ETH: {
    type: 'ETH',
    startHour: 18,
    startMinute: 0,
    endHour: 17,
    endMinute: 0, // Next day
    timezone: 'America/New_York',
    resetOnSessionStart: true,
  },
  // Crypto 24/7 - resets at UTC midnight
  CRYPTO_24H: {
    type: 'FULL',
    startHour: 0,
    startMinute: 0,
    endHour: 23,
    endMinute: 59,
    timezone: 'UTC',
    resetOnSessionStart: true,
  },
  // Forex - Sunday open to Friday close
  FOREX_WEEK: {
    type: 'FULL',
    startHour: 17, // Sunday 5pm EST
    startMinute: 0,
    endHour: 17, // Friday 5pm EST
    endMinute: 0,
    timezone: 'America/New_York',
    resetOnSessionStart: false,
  },
};

// ============ VWAP ENGINE ============

export class VWAPEngine {
  private state: VWAPState;
  private sessionConfig: SessionConfig;
  private anchoredConfigs: Map<string, AnchoredVWAPConfig> = new Map();
  private anchoredStates: Map<string, VWAPState> = new Map();

  // For standard deviation calculation (bands)
  private priceSquaredSum: number = 0;  // Σ(Price² × Volume)
  private trades: Trade[] = [];          // Store for variance calculation
  private maxTradesForVariance: number = 10000; // Limit memory usage

  constructor(sessionConfig: SessionConfig = SESSION_PRESETS.CRYPTO_24H) {
    this.sessionConfig = sessionConfig;
    this.state = this.createEmptyState();
  }

  // ============ CORE CALCULATION ============

  /**
   * Process a single trade tick
   *
   * This is the fundamental VWAP update operation.
   * Each trade updates the cumulative sums incrementally.
   *
   * COMPLEXITY: O(1) per trade
   * MEMORY: O(1) for VWAP, O(n) if storing trades for bands
   */
  processTrade(trade: Trade): number {
    // Validate trade
    if (!this.isValidTrade(trade)) {
      return this.state.vwap;
    }

    // Check for session reset
    if (this.shouldResetSession(trade.timestamp)) {
      this.resetSession(trade.timestamp);
    }

    // Handle block trades (optional: different weighting)
    const effectiveSize = this.getEffectiveSize(trade);

    // Core VWAP calculation
    // VWAP_new = (VWAP_old × V_old + P_new × V_new) / (V_old + V_new)
    // Simplified to: cumPV / cumV

    const priceVolume = trade.price * effectiveSize;

    this.state.cumulativePV += priceVolume;
    this.state.cumulativeVolume += effectiveSize;
    this.state.tradeCount++;
    this.state.lastUpdateTime = trade.timestamp;

    // Update VWAP
    if (this.state.cumulativeVolume > 0) {
      this.state.vwap = this.state.cumulativePV / this.state.cumulativeVolume;
    }

    // Update session high/low
    this.state.highOfDay = Math.max(this.state.highOfDay, trade.price);
    this.state.lowOfDay = Math.min(this.state.lowOfDay, trade.price);

    // For standard deviation bands
    this.priceSquaredSum += (trade.price * trade.price) * effectiveSize;

    // Store trade for variance (with limit)
    if (this.trades.length < this.maxTradesForVariance) {
      this.trades.push(trade);
    }

    // Update anchored VWAPs
    this.updateAnchoredVWAPs(trade);

    return this.state.vwap;
  }

  /**
   * Process multiple trades (batch update)
   *
   * For historical data loading or replay.
   * Processes in chronological order.
   */
  processTrades(trades: Trade[]): number {
    // Sort by timestamp to ensure deterministic order
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sorted) {
      this.processTrade(trade);
    }

    return this.state.vwap;
  }

  // ============ VWAP FROM AGGREGATED BARS ============

  /**
   * Calculate VWAP from OHLCV bars (less accurate than tick data)
   *
   * When tick data is unavailable, we use typical price:
   *   Typical Price = (High + Low + Close) / 3
   *
   * This is an APPROXIMATION. True VWAP requires trade-by-trade data.
   *
   * WARNING: This method introduces estimation error.
   */
  processBar(bar: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }): number {
    if (bar.volume === 0) {
      return this.state.vwap;
    }

    // Check for session reset
    if (this.shouldResetSession(bar.timestamp)) {
      this.resetSession(bar.timestamp);
    }

    // Typical price approximation
    // Alternative formulas:
    //   - (H + L + C) / 3 (typical)
    //   - (H + L + 2C) / 4 (weighted close)
    //   - (O + H + L + C) / 4 (average)
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;

    const priceVolume = typicalPrice * bar.volume;

    this.state.cumulativePV += priceVolume;
    this.state.cumulativeVolume += bar.volume;
    this.state.tradeCount++;
    this.state.lastUpdateTime = bar.timestamp;

    if (this.state.cumulativeVolume > 0) {
      this.state.vwap = this.state.cumulativePV / this.state.cumulativeVolume;
    }

    this.state.highOfDay = Math.max(this.state.highOfDay, bar.high);
    this.state.lowOfDay = Math.min(this.state.lowOfDay, bar.low);

    this.priceSquaredSum += (typicalPrice * typicalPrice) * bar.volume;

    return this.state.vwap;
  }

  // ============ STANDARD DEVIATION BANDS ============

  /**
   * Calculate VWAP bands using population standard deviation
   *
   * Formula:
   *   σ = sqrt(Σ(V × P²) / Σ(V) - VWAP²)
   *   Upper Band = VWAP + (n × σ)
   *   Lower Band = VWAP - (n × σ)
   *
   * This is the volume-weighted standard deviation.
   */
  getBands(stdDevMultipliers: number[] = [1, 2, 3]): VWAPBand[] {
    if (this.state.cumulativeVolume === 0) {
      return stdDevMultipliers.map(m => ({
        stdDev: m,
        upperBand: 0,
        lowerBand: 0,
      }));
    }

    // Volume-weighted variance
    // Var = E[X²] - E[X]²
    // Var = (Σ(V × P²) / Σ(V)) - VWAP²
    const meanSquare = this.priceSquaredSum / this.state.cumulativeVolume;
    const squaredMean = this.state.vwap * this.state.vwap;
    const variance = Math.max(0, meanSquare - squaredMean); // Ensure non-negative
    const stdDev = Math.sqrt(variance);

    return stdDevMultipliers.map(multiplier => ({
      stdDev: multiplier,
      upperBand: this.state.vwap + (multiplier * stdDev),
      lowerBand: this.state.vwap - (multiplier * stdDev),
    }));
  }

  // ============ ANCHORED VWAP ============

  /**
   * Create an anchored VWAP from a specific point
   *
   * Anchored VWAP calculates VWAP from a user-defined anchor point.
   * Useful for:
   *   - Swing high/low analysis
   *   - News event impact
   *   - Session open analysis
   *   - Gap analysis
   */
  createAnchoredVWAP(id: string, config: AnchoredVWAPConfig): void {
    this.anchoredConfigs.set(id, config);
    this.anchoredStates.set(id, this.createEmptyState(config.anchorTimestamp));
  }

  getAnchoredVWAP(id: string): number | null {
    const state = this.anchoredStates.get(id);
    return state ? state.vwap : null;
  }

  removeAnchoredVWAP(id: string): void {
    this.anchoredConfigs.delete(id);
    this.anchoredStates.delete(id);
  }

  private updateAnchoredVWAPs(trade: Trade): void {
    for (const [id, config] of this.anchoredConfigs) {
      if (trade.timestamp >= config.anchorTimestamp) {
        const state = this.anchoredStates.get(id);
        if (state) {
          const effectiveSize = this.getEffectiveSize(trade);
          state.cumulativePV += trade.price * effectiveSize;
          state.cumulativeVolume += effectiveSize;
          state.tradeCount++;
          state.lastUpdateTime = trade.timestamp;

          if (state.cumulativeVolume > 0) {
            state.vwap = state.cumulativePV / state.cumulativeVolume;
          }
        }
      }
    }
  }

  // ============ SESSION HANDLING ============

  /**
   * Check if we should reset for a new session
   */
  private shouldResetSession(timestamp: number): boolean {
    if (!this.sessionConfig.resetOnSessionStart) {
      return false;
    }

    const currentDate = new Date(timestamp);
    const sessionStart = this.getSessionStartTime(currentDate);

    // Reset if:
    // 1. This is the first trade
    // 2. Session start time has passed since last update
    return (
      this.state.sessionStart === 0 ||
      (sessionStart > this.state.sessionStart && timestamp >= sessionStart)
    );
  }

  private getSessionStartTime(date: Date): number {
    // Create date in exchange timezone
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    // Create session start time
    const sessionStart = new Date(
      year, month, day,
      this.sessionConfig.startHour,
      this.sessionConfig.startMinute,
      0, 0
    );

    return sessionStart.getTime();
  }

  private resetSession(timestamp: number): void {
    const sessionStart = this.getSessionStartTime(new Date(timestamp));
    this.state = this.createEmptyState(sessionStart);
    this.priceSquaredSum = 0;
    this.trades = [];
  }

  // ============ EDGE CASES ============

  /**
   * Validate trade data
   */
  private isValidTrade(trade: Trade): boolean {
    // Price must be positive
    if (trade.price <= 0) return false;

    // Size must be positive
    if (trade.size <= 0) return false;

    // Timestamp must be valid
    if (trade.timestamp <= 0) return false;

    // Price sanity check (>99% move is likely bad data)
    if (this.state.vwap > 0) {
      const deviation = Math.abs(trade.price - this.state.vwap) / this.state.vwap;
      if (deviation > 0.99) return false;
    }

    return true;
  }

  /**
   * Get effective trade size
   *
   * Block trades might be weighted differently in some implementations.
   * By default, we treat all trades equally.
   */
  private getEffectiveSize(trade: Trade): number {
    // Standard implementation: use actual size
    return trade.size;

    // Alternative: Cap block trades to reduce impact
    // const maxBlockSize = this.state.cumulativeVolume * 0.1;
    // return trade.isBlockTrade ? Math.min(trade.size, maxBlockSize) : trade.size;
  }

  /**
   * Handle zero volume edge case
   *
   * When cumulative volume is zero, VWAP is undefined.
   * We return 0 or the last known VWAP.
   */
  getVWAP(): number {
    if (this.state.cumulativeVolume === 0) {
      return 0; // Or could return NaN to indicate undefined
    }
    return this.state.vwap;
  }

  // ============ AGGRESSIVE FLOW ANALYSIS ============

  /**
   * Analyze VWAP movement relative to aggressive buying/selling
   *
   * When aggressive buyers dominate:
   *   - Trades occur at ASK price
   *   - VWAP tends to rise
   *   - Price trades above VWAP
   *
   * When aggressive sellers dominate:
   *   - Trades occur at BID price
   *   - VWAP tends to fall
   *   - Price trades below VWAP
   */
  getAggressiveFlowImpact(): {
    buyVolume: number;
    sellVolume: number;
    netFlow: number;
    buyVWAP: number;
    sellVWAP: number;
    flowImbalance: number; // -1 to 1
  } {
    let buyVolume = 0;
    let sellVolume = 0;
    let buyPV = 0;
    let sellPV = 0;

    for (const trade of this.trades) {
      if (trade.side === 'buy') {
        buyVolume += trade.size;
        buyPV += trade.price * trade.size;
      } else {
        sellVolume += trade.size;
        sellPV += trade.price * trade.size;
      }
    }

    const totalVolume = buyVolume + sellVolume;

    return {
      buyVolume,
      sellVolume,
      netFlow: buyVolume - sellVolume,
      buyVWAP: buyVolume > 0 ? buyPV / buyVolume : 0,
      sellVWAP: sellVolume > 0 ? sellPV / sellVolume : 0,
      flowImbalance: totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0,
    };
  }

  // ============ STATE MANAGEMENT ============

  private createEmptyState(sessionStart: number = 0): VWAPState {
    return {
      cumulativePV: 0,
      cumulativeVolume: 0,
      vwap: 0,
      tradeCount: 0,
      lastUpdateTime: 0,
      sessionStart,
      highOfDay: -Infinity,
      lowOfDay: Infinity,
    };
  }

  getState(): Readonly<VWAPState> {
    return { ...this.state };
  }

  reset(): void {
    this.state = this.createEmptyState();
    this.priceSquaredSum = 0;
    this.trades = [];
    this.anchoredConfigs.clear();
    this.anchoredStates.clear();
  }

  setSessionConfig(config: SessionConfig): void {
    this.sessionConfig = config;
  }

  // ============ SERIALIZATION ============

  toJSON(): string {
    return JSON.stringify({
      state: this.state,
      priceSquaredSum: this.priceSquaredSum,
      sessionConfig: this.sessionConfig,
    });
  }

  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.state = data.state;
    this.priceSquaredSum = data.priceSquaredSum;
    this.sessionConfig = data.sessionConfig;
  }
}

// ============ SINGLETON ============

let vwapEngineInstance: VWAPEngine | null = null;

export function getVWAPEngine(): VWAPEngine {
  if (!vwapEngineInstance) {
    vwapEngineInstance = new VWAPEngine();
  }
  return vwapEngineInstance;
}

export function resetVWAPEngine(): void {
  vwapEngineInstance = null;
}
