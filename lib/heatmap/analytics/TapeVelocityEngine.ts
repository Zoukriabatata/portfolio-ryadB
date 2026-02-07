/**
 * TAPE VELOCITY ENGINE
 *
 * Tracks and analyzes the speed and aggression of the tape (trade flow).
 * Key metrics for orderflow traders:
 * - Trades per second (tape speed)
 * - Buy/Sell pressure ratio
 * - Stop run detection (rapid breaks through multiple levels)
 * - Momentum shifts
 */

export interface TapeVelocityStats {
  tradesPerSecond: number;
  buyPressure: number;        // 0-1 ratio of buy volume
  sellPressure: number;       // 0-1 ratio of sell volume
  velocity: 'slow' | 'normal' | 'fast' | 'aggressive';
  momentum: 'bullish' | 'bearish' | 'neutral';
  stopRunDetected: boolean;
  stopRunSide?: 'buy' | 'sell';
  recentTrades: number;
  recentBuyVolume: number;
  recentSellVolume: number;
}

export interface TapeVelocityConfig {
  windowMs: number;           // Time window for calculations (default 5s)
  slowThreshold: number;      // trades/s threshold for slow
  normalThreshold: number;    // trades/s threshold for normal
  fastThreshold: number;      // trades/s threshold for fast
  stopRunLevels: number;      // Number of levels broken for stop run
  stopRunTimeMs: number;      // Time window for stop run detection
}

export const DEFAULT_TAPE_VELOCITY_CONFIG: TapeVelocityConfig = {
  windowMs: 5000,
  slowThreshold: 10,
  normalThreshold: 30,
  fastThreshold: 50,
  stopRunLevels: 3,
  stopRunTimeMs: 2000,
};

interface TradeRecord {
  timestamp: number;
  price: number;
  volume: number;
  isBuy: boolean;
}

interface LevelBreak {
  timestamp: number;
  price: number;
  side: 'buy' | 'sell';
}

export class TapeVelocityEngine {
  private config: TapeVelocityConfig;
  private trades: TradeRecord[] = [];
  private levelBreaks: LevelBreak[] = [];
  private lastStopRunTime: number = 0;
  private lastStopRunSide: 'buy' | 'sell' | null = null;

  constructor(config: Partial<TapeVelocityConfig> = {}) {
    this.config = { ...DEFAULT_TAPE_VELOCITY_CONFIG, ...config };
  }

  updateConfig(config: Partial<TapeVelocityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Record a trade for velocity calculation
   */
  recordTrade(price: number, volume: number, isBuy: boolean): void {
    const now = Date.now();

    this.trades.push({
      timestamp: now,
      price,
      volume,
      isBuy,
    });

    // Clean old trades
    this.cleanOldRecords();
  }

  /**
   * Record a level being broken (for stop run detection)
   */
  recordLevelBreak(price: number, side: 'buy' | 'sell'): void {
    const now = Date.now();

    this.levelBreaks.push({
      timestamp: now,
      price,
      side,
    });

    // Check for stop run
    this.checkStopRun();

    // Clean old level breaks
    this.cleanOldRecords();
  }

  /**
   * Clean records older than the window
   */
  private cleanOldRecords(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const stopRunCutoff = now - this.config.stopRunTimeMs;

    this.trades = this.trades.filter(t => t.timestamp > cutoff);
    this.levelBreaks = this.levelBreaks.filter(l => l.timestamp > stopRunCutoff);
  }

  /**
   * Check if a stop run is happening
   */
  private checkStopRun(): void {
    const now = Date.now();
    const recentBreaks = this.levelBreaks.filter(
      l => now - l.timestamp < this.config.stopRunTimeMs
    );

    // Count breaks by side
    const buyBreaks = recentBreaks.filter(l => l.side === 'buy').length;
    const sellBreaks = recentBreaks.filter(l => l.side === 'sell').length;

    if (buyBreaks >= this.config.stopRunLevels) {
      this.lastStopRunTime = now;
      this.lastStopRunSide = 'buy';
    } else if (sellBreaks >= this.config.stopRunLevels) {
      this.lastStopRunTime = now;
      this.lastStopRunSide = 'sell';
    }
  }

  /**
   * Get current tape velocity stats
   */
  getStats(): TapeVelocityStats {
    const now = Date.now();
    this.cleanOldRecords();

    // Calculate trades per second
    const windowSeconds = this.config.windowMs / 1000;
    const tradesPerSecond = this.trades.length / windowSeconds;

    // Calculate buy/sell volumes
    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of this.trades) {
      if (trade.isBuy) {
        buyVolume += trade.volume;
      } else {
        sellVolume += trade.volume;
      }
    }

    const totalVolume = buyVolume + sellVolume;
    const buyPressure = totalVolume > 0 ? buyVolume / totalVolume : 0.5;
    const sellPressure = totalVolume > 0 ? sellVolume / totalVolume : 0.5;

    // Determine velocity category
    let velocity: 'slow' | 'normal' | 'fast' | 'aggressive';
    if (tradesPerSecond < this.config.slowThreshold) {
      velocity = 'slow';
    } else if (tradesPerSecond < this.config.normalThreshold) {
      velocity = 'normal';
    } else if (tradesPerSecond < this.config.fastThreshold) {
      velocity = 'fast';
    } else {
      velocity = 'aggressive';
    }

    // Determine momentum
    let momentum: 'bullish' | 'bearish' | 'neutral';
    if (buyPressure > 0.6) {
      momentum = 'bullish';
    } else if (sellPressure > 0.6) {
      momentum = 'bearish';
    } else {
      momentum = 'neutral';
    }

    // Check if stop run is still recent (5s window)
    const stopRunDetected = now - this.lastStopRunTime < 5000;

    return {
      tradesPerSecond,
      buyPressure,
      sellPressure,
      velocity,
      momentum,
      stopRunDetected,
      stopRunSide: stopRunDetected ? this.lastStopRunSide ?? undefined : undefined,
      recentTrades: this.trades.length,
      recentBuyVolume: buyVolume,
      recentSellVolume: sellVolume,
    };
  }

  /**
   * Get velocity as a percentage (0-100) for UI display
   */
  getVelocityPercent(): number {
    const stats = this.getStats();
    // Map 0-100 trades/s to 0-100%
    return Math.min(100, stats.tradesPerSecond * 2);
  }

  /**
   * Get color for current velocity
   */
  getVelocityColor(): string {
    const stats = this.getStats();

    switch (stats.velocity) {
      case 'slow':
        return '#22c55e';     // Green
      case 'normal':
        return '#eab308';     // Yellow
      case 'fast':
        return '#f97316';     // Orange
      case 'aggressive':
        return '#ef4444';     // Red
    }
  }

  /**
   * Reset all stats
   */
  reset(): void {
    this.trades = [];
    this.levelBreaks = [];
    this.lastStopRunTime = 0;
    this.lastStopRunSide = null;
  }
}
