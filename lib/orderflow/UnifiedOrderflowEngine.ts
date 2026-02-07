/**
 * UNIFIED ORDERFLOW ENGINE - Market Microstructure Analysis
 *
 * Combines VWAP, TWAP, and Volume Profile into a single coherent engine.
 * Designed for professional orderflow analysis and execution benchmarking.
 *
 * ARCHITECTURE:
 * - Single trade input feeds all three engines
 * - Consistent timestamp handling
 * - Shared session management
 * - Deterministic, reproducible calculations
 *
 * GUARANTEES:
 * - No repainting: calculations are final once made
 * - No look-ahead bias: only uses data up to current timestamp
 * - Deterministic: same input produces same output
 * - Scalable: O(1) per trade for VWAP/TWAP, O(1) amortized for Volume Profile
 */

import {
  VWAPEngine,
  type Trade,
  type VWAPState,
  type VWAPBand,
  type SessionConfig,
  type AnchoredVWAPConfig,
  SESSION_PRESETS,
} from './VWAPEngine';

import {
  TWAPEngine,
  type TWAPTrade,
  type TWAPState,
  type TimeSlice,
  type TWAPConfig,
  type TWAPMode,
  TWAP_CONFIGS,
} from './TWAPEngine';

import {
  VolumeProfileEngine,
  type ProfileTrade,
  type PriceBin,
  type ValueArea,
  type ProfileConfig,
  PROFILE_CONFIGS,
} from './VolumeProfileEngine';

// ============ TYPES ============

export interface OrderflowTrade {
  timestamp: number;      // Unix ms
  price: number;          // Execution price
  size: number;           // Trade size
  side: 'buy' | 'sell';   // Aggressor side
  isBlockTrade?: boolean; // Optional: flag for block trades
}

export interface UnifiedOrderflowState {
  // VWAP
  vwap: number;
  vwapBands: VWAPBand[];
  vwapState: VWAPState;

  // TWAP
  twap: number;
  twapState: TWAPState;

  // VWAP vs TWAP
  vwapTwapDeviation: number;
  volumeSkew: 'high' | 'low' | 'neutral';

  // Volume Profile
  poc: number;
  vah: number;
  val: number;
  valueArea: ValueArea;
  totalVolume: number;
  totalDelta: number;

  // Session info
  sessionStart: number;
  lastUpdate: number;
  tradeCount: number;
}

export interface UnifiedOrderflowConfig {
  vwapSession: SessionConfig;
  twapConfig: TWAPConfig;
  twapMode: TWAPMode;
  profileConfig: ProfileConfig;
  stdDevBands: number[];  // Standard deviation multipliers for VWAP bands
}

// ============ DEFAULT CONFIG ============

export const DEFAULT_UNIFIED_CONFIG: UnifiedOrderflowConfig = {
  vwapSession: SESSION_PRESETS.CRYPTO_24H,
  twapConfig: TWAP_CONFIGS.STANDARD,
  twapMode: 'discrete',
  profileConfig: PROFILE_CONFIGS.CRYPTO_1,
  stdDevBands: [1, 2, 3],
};

// ============ UNIFIED ORDERFLOW ENGINE ============

export class UnifiedOrderflowEngine {
  private vwapEngine: VWAPEngine;
  private twapEngine: TWAPEngine;
  private volumeProfileEngine: VolumeProfileEngine;
  private config: UnifiedOrderflowConfig;

  // State tracking
  private tradeCount: number = 0;
  private sessionStart: number = 0;
  private lastUpdate: number = 0;

  constructor(config: UnifiedOrderflowConfig = DEFAULT_UNIFIED_CONFIG) {
    this.config = config;
    this.vwapEngine = new VWAPEngine(config.vwapSession);
    this.twapEngine = new TWAPEngine(config.twapConfig, config.twapMode);
    this.volumeProfileEngine = new VolumeProfileEngine(config.profileConfig);
  }

  // ============ CORE PROCESSING ============

  /**
   * Process a single trade through all engines
   *
   * This is the main entry point for tick data.
   * Each trade updates VWAP, TWAP, and Volume Profile atomically.
   */
  processTrade(trade: OrderflowTrade): UnifiedOrderflowState {
    // Validate trade
    if (!this.isValidTrade(trade)) {
      return this.getState();
    }

    // Initialize session
    if (this.sessionStart === 0) {
      this.sessionStart = trade.timestamp;
    }

    // Convert to engine-specific trade formats
    const vwapTrade: Trade = {
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: trade.side,
      isBlockTrade: trade.isBlockTrade,
    };

    const twapTrade: TWAPTrade = {
      timestamp: trade.timestamp,
      price: trade.price,
    };

    const profileTrade: ProfileTrade = {
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: trade.side,
    };

    // Process through all engines
    this.vwapEngine.processTrade(vwapTrade);
    this.twapEngine.processTrade(twapTrade);
    this.volumeProfileEngine.processTrade(profileTrade);

    // Update tracking
    this.tradeCount++;
    this.lastUpdate = trade.timestamp;

    return this.getState();
  }

  /**
   * Process multiple trades (batch)
   *
   * For historical data loading or replay.
   * Trades are processed in chronological order.
   */
  processTrades(trades: OrderflowTrade[]): UnifiedOrderflowState {
    // Sort by timestamp for deterministic order
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sorted) {
      this.processTrade(trade);
    }

    return this.getState();
  }

  /**
   * Process from OHLCV bar data (less accurate)
   *
   * When tick data is unavailable, use bar data.
   * Note: This is an approximation. True orderflow requires tick data.
   */
  processBar(bar: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyVolume?: number;   // If available from delta data
    sellVolume?: number;
  }): UnifiedOrderflowState {
    // VWAP from bar
    this.vwapEngine.processBar(bar);

    // TWAP from bar (use typical price)
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    this.twapEngine.processTrade({
      timestamp: bar.timestamp,
      price: typicalPrice,
    });

    // Volume Profile from bar
    // If we have buy/sell volume breakdown, use it
    // Otherwise, approximate 50/50 split
    const buyVolume = bar.buyVolume ?? bar.volume * 0.5;
    const sellVolume = bar.sellVolume ?? bar.volume * 0.5;

    // Distribute volume across price range
    const priceStep = (bar.high - bar.low) / 10; // 10 levels
    for (let i = 0; i <= 10; i++) {
      const price = bar.low + priceStep * i;
      const levelVolume = bar.volume / 11;
      const levelBuyVolume = buyVolume / 11;
      const levelSellVolume = sellVolume / 11;

      // Process as synthetic trades
      if (levelBuyVolume > 0) {
        this.volumeProfileEngine.processTrade({
          timestamp: bar.timestamp,
          price,
          size: levelBuyVolume,
          side: 'buy',
        });
      }
      if (levelSellVolume > 0) {
        this.volumeProfileEngine.processTrade({
          timestamp: bar.timestamp,
          price,
          size: levelSellVolume,
          side: 'sell',
        });
      }
    }

    this.tradeCount++;
    this.lastUpdate = bar.timestamp;

    return this.getState();
  }

  // ============ STATE ACCESS ============

  /**
   * Get complete orderflow state
   */
  getState(): UnifiedOrderflowState {
    const vwap = this.vwapEngine.getVWAP();
    const twap = this.twapEngine.getTWAP();
    const valueArea = this.volumeProfileEngine.calculateValueArea();
    const profileState = this.volumeProfileEngine.getState();

    // Calculate VWAP-TWAP deviation
    const comparison = this.twapEngine.compareWithVWAP(vwap);

    return {
      // VWAP
      vwap,
      vwapBands: this.vwapEngine.getBands(this.config.stdDevBands),
      vwapState: this.vwapEngine.getState(),

      // TWAP
      twap,
      twapState: this.twapEngine.getState(),

      // Deviation analysis
      vwapTwapDeviation: comparison.deviation,
      volumeSkew: comparison.volumeSkew,

      // Volume Profile
      poc: valueArea.poc,
      vah: valueArea.vah,
      val: valueArea.val,
      valueArea,
      totalVolume: profileState.totalVolume,
      totalDelta: profileState.totalDelta,

      // Session
      sessionStart: this.sessionStart,
      lastUpdate: this.lastUpdate,
      tradeCount: this.tradeCount,
    };
  }

  // ============ INDIVIDUAL ENGINE ACCESS ============

  getVWAP(): number {
    return this.vwapEngine.getVWAP();
  }

  getVWAPBands(): VWAPBand[] {
    return this.vwapEngine.getBands(this.config.stdDevBands);
  }

  getTWAP(): number {
    return this.twapEngine.getTWAP();
  }

  getPOC(): number {
    return this.volumeProfileEngine.calculateValueArea().poc;
  }

  getVAH(): number {
    return this.volumeProfileEngine.calculateValueArea().vah;
  }

  getVAL(): number {
    return this.volumeProfileEngine.calculateValueArea().val;
  }

  getValueArea(): ValueArea {
    return this.volumeProfileEngine.calculateValueArea();
  }

  getVolumeBins(): PriceBin[] {
    return this.volumeProfileEngine.getBins();
  }

  getVWAPEngine(): VWAPEngine {
    return this.vwapEngine;
  }

  getTWAPEngine(): TWAPEngine {
    return this.twapEngine;
  }

  getVolumeProfileEngine(): VolumeProfileEngine {
    return this.volumeProfileEngine;
  }

  // ============ ANCHORED VWAP ============

  /**
   * Create an anchored VWAP
   */
  createAnchoredVWAP(id: string, config: AnchoredVWAPConfig): void {
    this.vwapEngine.createAnchoredVWAP(id, config);
  }

  getAnchoredVWAP(id: string): number | null {
    return this.vwapEngine.getAnchoredVWAP(id);
  }

  removeAnchoredVWAP(id: string): void {
    this.vwapEngine.removeAnchoredVWAP(id);
  }

  // ============ ANALYSIS METHODS ============

  /**
   * Get current price position relative to key levels
   */
  getPricePosition(currentPrice: number): {
    relativeToVWAP: 'above' | 'below' | 'at';
    relativeToTWAP: 'above' | 'below' | 'at';
    relativeToPOC: 'above' | 'below' | 'at';
    inValueArea: boolean;
    nearVAH: boolean;  // Within 1 tick
    nearVAL: boolean;  // Within 1 tick
  } {
    const vwap = this.getVWAP();
    const twap = this.getTWAP();
    const va = this.getValueArea();
    const tickSize = this.config.profileConfig.tickSize;

    const threshold = tickSize * 0.5; // Half tick tolerance for "at"

    return {
      relativeToVWAP:
        currentPrice > vwap + threshold ? 'above' :
          currentPrice < vwap - threshold ? 'below' : 'at',
      relativeToTWAP:
        currentPrice > twap + threshold ? 'above' :
          currentPrice < twap - threshold ? 'below' : 'at',
      relativeToPOC:
        currentPrice > va.poc + threshold ? 'above' :
          currentPrice < va.poc - threshold ? 'below' : 'at',
      inValueArea: currentPrice >= va.val && currentPrice <= va.vah,
      nearVAH: Math.abs(currentPrice - va.vah) <= tickSize,
      nearVAL: Math.abs(currentPrice - va.val) <= tickSize,
    };
  }

  /**
   * Get orderflow bias (buying vs selling pressure)
   */
  getOrderflowBias(): {
    delta: number;
    deltaPercent: number;
    bias: 'bullish' | 'bearish' | 'neutral';
    aggressiveBuyVolume: number;
    aggressiveSellVolume: number;
  } {
    const state = this.volumeProfileEngine.getState();
    const totalVolume = state.totalVolume;
    const delta = state.totalDelta;

    const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;

    let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (deltaPercent > 5) bias = 'bullish';
    else if (deltaPercent < -5) bias = 'bearish';

    return {
      delta,
      deltaPercent,
      bias,
      aggressiveBuyVolume: state.totalAskVolume,
      aggressiveSellVolume: state.totalBidVolume,
    };
  }

  /**
   * Get volume distribution metrics
   */
  getVolumeDistribution(): {
    hvnLevels: PriceBin[];      // High Volume Nodes
    lvnLevels: PriceBin[];      // Low Volume Nodes
    absorptionLevels: PriceBin[]; // Potential absorption
    stopRunLevels: { price: number; side: 'buy' | 'sell'; volume: number }[];
  } {
    const nodes = this.volumeProfileEngine.getVolumeNodes();
    const absorption = this.volumeProfileEngine.detectAbsorption();
    const stopRuns = this.volumeProfileEngine.detectStopRuns();

    return {
      hvnLevels: nodes.hvn,
      lvnLevels: nodes.lvn,
      absorptionLevels: absorption,
      stopRunLevels: stopRuns.slice(0, 5), // Top 5
    };
  }

  // ============ REAL-TIME UPDATES ============

  /**
   * Tick update for time-based calculations
   *
   * Call this periodically (e.g., every second) to:
   * - Update TWAP slices during low-volume periods
   * - Trigger session resets
   */
  tick(currentTime: number): void {
    this.twapEngine.tick(currentTime);
  }

  // ============ SESSION MANAGEMENT ============

  /**
   * Reset all engines for new session
   */
  resetSession(): void {
    this.vwapEngine.reset();
    this.twapEngine.reset();
    this.volumeProfileEngine.reset();
    this.tradeCount = 0;
    this.sessionStart = 0;
    this.lastUpdate = 0;
  }

  /**
   * Set VWAP session configuration
   */
  setVWAPSession(session: SessionConfig): void {
    this.config.vwapSession = session;
    this.vwapEngine.setSessionConfig(session);
  }

  /**
   * Set Volume Profile tick size
   */
  setProfileTickSize(tickSize: number): void {
    this.config.profileConfig.tickSize = tickSize;
    this.volumeProfileEngine.setTickSize(tickSize);
  }

  /**
   * Set TWAP configuration
   */
  setTWAPConfig(config: TWAPConfig, mode?: TWAPMode): void {
    this.config.twapConfig = config;
    if (mode) this.config.twapMode = mode;
    this.twapEngine.setConfig(config);
    if (mode) this.twapEngine.setMode(mode);
  }

  // ============ VALIDATION ============

  private isValidTrade(trade: OrderflowTrade): boolean {
    if (trade.price <= 0) return false;
    if (trade.size <= 0) return false;
    if (trade.timestamp <= 0) return false;
    if (!['buy', 'sell'].includes(trade.side)) return false;
    return true;
  }

  // ============ SERIALIZATION ============

  toJSON(): string {
    return JSON.stringify({
      vwap: this.vwapEngine.toJSON(),
      twap: this.twapEngine.toJSON(),
      profile: this.volumeProfileEngine.toJSON(),
      config: this.config,
      tradeCount: this.tradeCount,
      sessionStart: this.sessionStart,
      lastUpdate: this.lastUpdate,
    });
  }

  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.config = data.config;
    this.tradeCount = data.tradeCount;
    this.sessionStart = data.sessionStart;
    this.lastUpdate = data.lastUpdate;

    this.vwapEngine = new VWAPEngine(this.config.vwapSession);
    this.vwapEngine.fromJSON(data.vwap);

    this.twapEngine = new TWAPEngine(this.config.twapConfig, this.config.twapMode);
    this.twapEngine.fromJSON(data.twap);

    this.volumeProfileEngine = new VolumeProfileEngine(this.config.profileConfig);
    this.volumeProfileEngine.fromJSON(data.profile);
  }
}

// ============ SINGLETON ============

let unifiedEngineInstance: UnifiedOrderflowEngine | null = null;

export function getUnifiedOrderflowEngine(): UnifiedOrderflowEngine {
  if (!unifiedEngineInstance) {
    unifiedEngineInstance = new UnifiedOrderflowEngine();
  }
  return unifiedEngineInstance;
}

export function resetUnifiedOrderflowEngine(): void {
  unifiedEngineInstance = null;
}

// ============ RE-EXPORTS ============

export {
  SESSION_PRESETS,
  TWAP_CONFIGS,
  PROFILE_CONFIGS,
};

export type {
  Trade,
  VWAPState,
  VWAPBand,
  SessionConfig,
  AnchoredVWAPConfig,
  TWAPTrade,
  TWAPState,
  TimeSlice,
  TWAPConfig,
  TWAPMode,
  ProfileTrade,
  PriceBin,
  ValueArea,
  ProfileConfig,
};
