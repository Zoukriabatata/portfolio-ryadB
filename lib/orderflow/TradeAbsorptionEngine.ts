/**
 * TRADE ABSORPTION ENGINE
 *
 * Bridge between live trade feed (BinanceLiveWS) and passive liquidity simulator.
 * Ensures every trade is processed for passive order absorption.
 *
 * Usage:
 * 1. Get engine via getTradeAbsorptionEngine()
 * 2. Call feedTrade() for each incoming tick
 * 3. Subscribe to absorption events via onAbsorption()
 */

import {
  type AbsorptionTradeEvent,
  type AbsorptionResult,
  type AbsorptionStatistics,
} from '@/types/passive-liquidity';
import {
  getPassiveLiquiditySimulator,
  type PassiveLiquiditySimulator,
} from './PassiveLiquiditySimulator';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AbsorptionCallback = (result: AbsorptionResult) => void;

export interface TradeAbsorptionEngineConfig {
  /** Enable/disable trade processing */
  enabled: boolean;

  /** Minimum trade quantity to process (filter noise) */
  minTradeQuantity: number;

  /** Maximum trades per second (rate limiting) */
  maxTradesPerSecond: number;

  /** Enable statistics tracking */
  trackStatistics: boolean;
}

const DEFAULT_CONFIG: TradeAbsorptionEngineConfig = {
  enabled: true,
  minTradeQuantity: 0.001,
  maxTradesPerSecond: 1000,
  trackStatistics: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE ABSORPTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class TradeAbsorptionEngine {
  private simulator: PassiveLiquiditySimulator;
  private config: TradeAbsorptionEngineConfig;
  private listeners: Set<AbsorptionCallback> = new Set();

  // Rate limiting
  private tradeCount: number = 0;
  private lastRateReset: number = Date.now();

  // Statistics
  private totalTradesProcessed: number = 0;
  private totalVolumeAbsorbed: number = 0;
  private totalLevelsExecuted: number = 0;
  private totalTradesSkipped: number = 0;
  private startTime: number = Date.now();

  // Recent absorption history (for debugging/visualization)
  private recentAbsorptions: AbsorptionResult[] = [];
  private maxRecentAbsorptions: number = 50;

  constructor(config: Partial<TradeAbsorptionEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.simulator = getPassiveLiquiditySimulator();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<TradeAbsorptionEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TRADE PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Feed a trade into the absorption system
   *
   * Called from BinanceLiveWS.onTick() with tick data.
   * Maps Binance tick format to AbsorptionTradeEvent.
   *
   * @param tick - Raw tick from WebSocket
   * @returns AbsorptionResult or null if skipped
   */
  feedTrade(tick: {
    price: number;
    quantity: number;
    timestamp: number;
    isBuyerMaker: boolean;
  }): AbsorptionResult | null {
    // Skip if disabled
    if (!this.config.enabled) {
      return null;
    }

    // Skip tiny trades (noise filter)
    if (tick.quantity < this.config.minTradeQuantity) {
      this.totalTradesSkipped++;
      return null;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastRateReset >= 1000) {
      this.tradeCount = 0;
      this.lastRateReset = now;
    }

    if (this.tradeCount >= this.config.maxTradesPerSecond) {
      this.totalTradesSkipped++;
      return null;
    }

    this.tradeCount++;

    // Convert to AbsorptionTradeEvent
    const trade: AbsorptionTradeEvent = {
      price: tick.price,
      quantity: tick.quantity,
      timestamp: tick.timestamp,
      isBuyerMaker: tick.isBuyerMaker,
      tradeId: `${tick.timestamp}_${tick.price}_${Math.random().toString(36).substr(2, 9)}`,
    };

    // Process through simulator
    const result = this.simulator.processTrade(trade);

    // Update statistics
    if (this.config.trackStatistics) {
      this.totalTradesProcessed++;
      this.totalVolumeAbsorbed += result.volumeAbsorbed;
      if (result.levelExecuted) {
        this.totalLevelsExecuted++;
      }

      // Store in recent history
      if (result.volumeAbsorbed > 0) {
        this.recentAbsorptions.push(result);
        if (this.recentAbsorptions.length > this.maxRecentAbsorptions) {
          this.recentAbsorptions.shift();
        }
      }
    }

    // Notify listeners
    if (result.volumeAbsorbed > 0) {
      this.notifyListeners(result);
    }

    return result;
  }

  /**
   * Process a batch of trades at once
   * Useful for historical data replay
   */
  feedTrades(trades: Array<{
    price: number;
    quantity: number;
    timestamp: number;
    isBuyerMaker: boolean;
  }>): AbsorptionResult[] {
    const results: AbsorptionResult[] = [];

    for (const trade of trades) {
      const result = this.feedTrade(trade);
      if (result && result.volumeAbsorbed > 0) {
        results.push(result);
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to absorption events
   *
   * Called whenever a trade absorbs passive liquidity.
   * Use this to update UI, log events, or trigger alerts.
   *
   * @returns Unsubscribe function
   */
  onAbsorption(callback: AbsorptionCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(result: AbsorptionResult): void {
    for (const callback of this.listeners) {
      try {
        callback(result);
      } catch (error) {
        console.error('[TradeAbsorptionEngine] Listener error:', error);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get absorption statistics
   */
  getStatistics(): AbsorptionStatistics {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const absorptionRate = elapsedSeconds > 0
      ? this.totalVolumeAbsorbed / elapsedSeconds
      : 0;

    return {
      totalTradesProcessed: this.totalTradesProcessed,
      totalVolumeAbsorbed: this.totalVolumeAbsorbed,
      totalLevelsExecuted: this.totalLevelsExecuted,
      totalSpoofingDetected: this.simulator.getSpoofingEvents().length,
      absorptionRate,
    };
  }

  /**
   * Get recent absorption events
   */
  getRecentAbsorptions(): AbsorptionResult[] {
    return [...this.recentAbsorptions];
  }

  /**
   * Get simulator statistics
   */
  getSimulatorStatistics() {
    return this.simulator.getStatistics();
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.totalTradesProcessed = 0;
    this.totalVolumeAbsorbed = 0;
    this.totalLevelsExecuted = 0;
    this.totalTradesSkipped = 0;
    this.startTime = Date.now();
    this.recentAbsorptions = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SIMULATOR ACCESS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get the underlying simulator instance
   */
  getSimulator(): PassiveLiquiditySimulator {
    return this.simulator;
  }

  /**
   * Reset the simulator (clears all levels and regenerates)
   */
  resetSimulator(): void {
    this.simulator = getPassiveLiquiditySimulator();
    this.resetStatistics();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let engineInstance: TradeAbsorptionEngine | null = null;

export function getTradeAbsorptionEngine(): TradeAbsorptionEngine {
  if (!engineInstance) {
    engineInstance = new TradeAbsorptionEngine();
  }
  return engineInstance;
}

export function resetTradeAbsorptionEngine(): void {
  engineInstance = null;
}
