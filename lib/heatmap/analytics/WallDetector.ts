/**
 * WALL DETECTOR - Statistical Detection of Liquidity Walls
 *
 * Identifies significant liquidity levels using statistical analysis.
 * Detects walls that are defending price levels (absorbing volume).
 */

import type {
  OrderBookState,
  OrderLevel,
  WallInfo,
  Trade,
  LiquidityStats,
} from '../core/types';
import { HistoryBuffer } from '../core/HistoryBuffer';

export interface WallDetectorConfig {
  thresholdSigma: number;      // Standard deviations above mean (default: 2.5)
  minPersistenceMs: number;    // Minimum time to be considered a wall
  absorptionThreshold: number; // Min absorption ratio to be "defending"
  maxWalls: number;            // Max walls to track per side
}

const DEFAULT_CONFIG: WallDetectorConfig = {
  thresholdSigma: 2.5,
  minPersistenceMs: 2000,
  absorptionThreshold: 0.2,
  maxWalls: 10,
};

export class WallDetector {
  private config: WallDetectorConfig;
  private walls: Map<string, WallInfo> = new Map();
  private lastUpdateTime: number = 0;

  constructor(config: Partial<WallDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<WallDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Detect walls in the current order book
   */
  detect(
    orderBook: OrderBookState,
    trades: Trade[],
    history: HistoryBuffer
  ): WallInfo[] {
    const now = Date.now();
    const stats = this.calculateStats(orderBook);
    const threshold = stats.mean + stats.stdDev * this.config.thresholdSigma;

    const detectedWalls: WallInfo[] = [];

    // Detect bid walls
    const bidWalls = this.detectSideWalls(
      orderBook.bids,
      'bid',
      threshold,
      stats,
      trades,
      now
    );
    detectedWalls.push(...bidWalls);

    // Detect ask walls
    const askWalls = this.detectSideWalls(
      orderBook.asks,
      'ask',
      threshold,
      stats,
      trades,
      now
    );
    detectedWalls.push(...askWalls);

    // Update wall tracking
    this.updateWallTracking(detectedWalls, now);

    this.lastUpdateTime = now;
    return this.getActiveWalls();
  }

  /**
   * Detect walls on one side of the book
   */
  private detectSideWalls(
    levels: Map<number, OrderLevel>,
    side: 'bid' | 'ask',
    threshold: number,
    stats: LiquidityStats,
    trades: Trade[],
    now: number
  ): WallInfo[] {
    const walls: WallInfo[] = [];

    for (const [price, level] of levels) {
      if (level.size < threshold) continue;

      // Calculate wall strength (how many sigmas above mean)
      const strength = (level.size - stats.mean) / stats.stdDev;

      // Calculate persistence
      const persistence = now - level.firstSeen;

      // Calculate absorption ratio
      const recentTrades = trades.filter(
        t => t.price === price && t.timestamp > level.firstSeen
      );
      const totalAbsorbed = recentTrades.reduce((sum, t) => sum + t.quantity, 0);
      const absorptionRatio = level.size > 0 ? totalAbsorbed / level.size : 0;

      // Determine if wall is actively defending
      const isDefending =
        absorptionRatio > this.config.absorptionThreshold &&
        persistence > this.config.minPersistenceMs;

      walls.push({
        price,
        side,
        size: level.size,
        strength,
        persistence,
        absorptionRatio,
        isDefending,
        firstSeen: level.firstSeen,
        lastSeen: now,
      });
    }

    // Sort by size and take top N
    return walls
      .sort((a, b) => b.size - a.size)
      .slice(0, this.config.maxWalls);
  }

  /**
   * Calculate statistics for threshold determination
   */
  private calculateStats(orderBook: OrderBookState): LiquidityStats {
    const sizes: number[] = [];

    for (const level of orderBook.bids.values()) {
      if (level.size > 0) sizes.push(level.size);
    }
    for (const level of orderBook.asks.values()) {
      if (level.size > 0) sizes.push(level.size);
    }

    if (sizes.length === 0) {
      return {
        mean: 0,
        stdDev: 1,
        min: 0,
        max: 1,
        p5: 0,
        p25: 0,
        p50: 0,
        p75: 1,
        p95: 1,
        p97: 1,
      };
    }

    sizes.sort((a, b) => a - b);

    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sizes.length;
    const stdDev = Math.sqrt(variance) || 1;

    const percentile = (arr: number[], p: number): number => {
      const index = Math.floor((arr.length - 1) * p);
      return arr[index];
    };

    return {
      mean,
      stdDev,
      min: sizes[0],
      max: sizes[sizes.length - 1],
      p5: percentile(sizes, 0.05),
      p25: percentile(sizes, 0.25),
      p50: percentile(sizes, 0.50),
      p75: percentile(sizes, 0.75),
      p95: percentile(sizes, 0.95),
      p97: percentile(sizes, 0.97),
    };
  }

  /**
   * Update wall tracking over time
   */
  private updateWallTracking(detectedWalls: WallInfo[], now: number): void {
    // Mark walls that are no longer present
    for (const [key, wall] of this.walls) {
      const stillPresent = detectedWalls.some(
        w => w.price === wall.price && w.side === wall.side
      );

      if (!stillPresent) {
        // Wall disappeared - keep it briefly for fade-out
        if (now - wall.lastSeen > 2000) {
          this.walls.delete(key);
        }
      }
    }

    // Update or add detected walls
    for (const wall of detectedWalls) {
      const key = `${wall.side}-${wall.price}`;
      const existing = this.walls.get(key);

      if (existing) {
        // Update existing wall
        existing.size = wall.size;
        existing.strength = wall.strength;
        existing.absorptionRatio = wall.absorptionRatio;
        existing.isDefending = wall.isDefending;
        existing.lastSeen = now;
        existing.persistence = now - existing.firstSeen;
      } else {
        // Add new wall
        this.walls.set(key, { ...wall });
      }
    }
  }

  /**
   * Get all currently active walls
   */
  getActiveWalls(): WallInfo[] {
    return Array.from(this.walls.values());
  }

  /**
   * Get walls for a specific side
   */
  getWallsBySide(side: 'bid' | 'ask'): WallInfo[] {
    return this.getActiveWalls().filter(w => w.side === side);
  }

  /**
   * Check if a price level is a wall
   */
  isWall(price: number, side: 'bid' | 'ask'): boolean {
    const key = `${side}-${price}`;
    return this.walls.has(key);
  }

  /**
   * Get wall info for a specific price
   */
  getWallAt(price: number, side: 'bid' | 'ask'): WallInfo | null {
    const key = `${side}-${price}`;
    return this.walls.get(key) || null;
  }

  /**
   * Clear all tracked walls
   */
  clear(): void {
    this.walls.clear();
  }
}
