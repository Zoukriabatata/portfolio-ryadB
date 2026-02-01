// Heatmap Analysis Utilities

import type {
  LiquidityDelta,
  WhaleOrder,
  LiquidityVelocity,
  TimeWeightedLevel,
} from '@/types/heatmap';
import type { OrderbookSnapshot } from '@/types/orderbook';
import { calculateOrderbookStatistics, calculateZScore } from './statisticalAnalysis';

/**
 * Calculate liquidity delta between two orderbook snapshots
 */
export function calculateLiquidityDelta(
  previous: { bids: Map<number, number>; asks: Map<number, number> },
  current: { bids: Map<number, number>; asks: Map<number, number> }
): LiquidityDelta[] {
  const deltas: LiquidityDelta[] = [];
  const now = Date.now();

  // Process bids
  const allBidPrices = new Set([...previous.bids.keys(), ...current.bids.keys()]);
  allBidPrices.forEach(price => {
    const prev = previous.bids.get(price) || 0;
    const curr = current.bids.get(price) || 0;
    const delta = curr - prev;

    if (Math.abs(delta) > 0.001) {
      deltas.push({
        price,
        previousQty: prev,
        currentQty: curr,
        delta,
        isAddition: delta > 0,
        timestamp: now,
      });
    }
  });

  // Process asks
  const allAskPrices = new Set([...previous.asks.keys(), ...current.asks.keys()]);
  allAskPrices.forEach(price => {
    const prev = previous.asks.get(price) || 0;
    const curr = current.asks.get(price) || 0;
    const delta = curr - prev;

    if (Math.abs(delta) > 0.001) {
      deltas.push({
        price,
        previousQty: prev,
        currentQty: curr,
        delta,
        isAddition: delta > 0,
        timestamp: now,
      });
    }
  });

  return deltas;
}

/**
 * Detect whale orders (orders significantly larger than average)
 */
export function detectWhaleOrders(
  bids: Map<number, number>,
  asks: Map<number, number>,
  thresholdStdDev: number = 3.0
): WhaleOrder[] {
  const stats = calculateOrderbookStatistics(bids, asks);
  const whales: WhaleOrder[] = [];
  const threshold = stats.mean + stats.stdDev * thresholdStdDev;
  const now = Date.now();

  bids.forEach((qty, price) => {
    if (qty > threshold) {
      whales.push({
        price,
        quantity: qty,
        side: 'bid',
        standardDeviations: calculateZScore(qty, stats.mean, stats.stdDev),
        timestamp: now,
        isActive: true,
      });
    }
  });

  asks.forEach((qty, price) => {
    if (qty > threshold) {
      whales.push({
        price,
        quantity: qty,
        side: 'ask',
        standardDeviations: calculateZScore(qty, stats.mean, stats.stdDev),
        timestamp: now,
        isActive: true,
      });
    }
  });

  // Sort by size (largest first)
  return whales.sort((a, b) => b.standardDeviations - a.standardDeviations);
}

/**
 * Velocity Tracker - tracks rate of change in liquidity
 */
export class VelocityTracker {
  private history: Array<{
    timestamp: number;
    bids: Map<number, number>;
    asks: Map<number, number>;
  }> = [];
  private windowMs: number;

  constructor(windowSeconds: number = 30) {
    this.windowMs = windowSeconds * 1000;
  }

  addSnapshot(bids: Map<number, number>, asks: Map<number, number>): void {
    const now = Date.now();

    // Clean old entries
    this.history = this.history.filter(h => now - h.timestamp < this.windowMs);

    // Add new snapshot
    this.history.push({
      timestamp: now,
      bids: new Map(bids),
      asks: new Map(asks),
    });
  }

  getVelocity(): Map<number, LiquidityVelocity> {
    if (this.history.length < 2) {
      return new Map();
    }

    const velocities = new Map<number, LiquidityVelocity>();
    const oldest = this.history[0];
    const newest = this.history[this.history.length - 1];
    const timeSeconds = (newest.timestamp - oldest.timestamp) / 1000;

    if (timeSeconds < 1) return velocities;

    // Get all prices from both bids and asks
    const allPrices = new Set([
      ...oldest.bids.keys(),
      ...oldest.asks.keys(),
      ...newest.bids.keys(),
      ...newest.asks.keys(),
    ]);

    allPrices.forEach(price => {
      const oldBid = oldest.bids.get(price) || 0;
      const oldAsk = oldest.asks.get(price) || 0;
      const newBid = newest.bids.get(price) || 0;
      const newAsk = newest.asks.get(price) || 0;

      const oldTotal = oldBid + oldAsk;
      const newTotal = newBid + newAsk;
      const delta = newTotal - oldTotal;

      velocities.set(price, {
        price,
        additionRate: delta > 0 ? delta / timeSeconds : 0,
        removalRate: delta < 0 ? Math.abs(delta) / timeSeconds : 0,
        netRate: delta / timeSeconds,
        windowSeconds: timeSeconds,
      });
    });

    return velocities;
  }

  reset(): void {
    this.history = [];
  }
}

/**
 * Time-Weighted Analysis - tracks how long liquidity sits at each level
 */
export class TimeWeightedAnalysis {
  private levels: Map<number, {
    firstSeen: number;
    lastSeen: number;
    volumeIntegral: number;
    lastVolume: number;
    lastUpdateTime: number;
  }> = new Map();

  update(bids: Map<number, number>, asks: Map<number, number>): void {
    const now = Date.now();
    const currentVolumes = new Map<number, number>();

    // Merge bids and asks
    bids.forEach((qty, price) => {
      currentVolumes.set(price, (currentVolumes.get(price) || 0) + qty);
    });
    asks.forEach((qty, price) => {
      currentVolumes.set(price, (currentVolumes.get(price) || 0) + qty);
    });

    // Update existing levels
    this.levels.forEach((data, price) => {
      const currentVolume = currentVolumes.get(price);

      if (currentVolume === undefined || currentVolume === 0) {
        // Level is gone
        this.levels.delete(price);
        return;
      }

      // Add to integral: volume * time since last update
      const timeDelta = (now - data.lastUpdateTime) / 1000;
      data.volumeIntegral += data.lastVolume * timeDelta;
      data.lastVolume = currentVolume;
      data.lastSeen = now;
      data.lastUpdateTime = now;
    });

    // Add new levels
    currentVolumes.forEach((volume, price) => {
      if (!this.levels.has(price) && volume > 0) {
        this.levels.set(price, {
          firstSeen: now,
          lastSeen: now,
          volumeIntegral: 0,
          lastVolume: volume,
          lastUpdateTime: now,
        });
      }
    });
  }

  getTimeWeightedLevels(): TimeWeightedLevel[] {
    const now = Date.now();

    return Array.from(this.levels.entries()).map(([price, data]) => {
      const totalTime = (now - data.firstSeen) / 1000;

      return {
        price,
        timeAtLevel: totalTime,
        volumeTimeProduct: data.volumeIntegral,
        averageVolume: totalTime > 0 ? data.volumeIntegral / totalTime : data.lastVolume,
      };
    });
  }

  reset(): void {
    this.levels.clear();
  }
}

/**
 * Calculate stacked depth (cumulative volume at each price)
 */
export function calculateStackedDepth(
  bids: Map<number, number>,
  asks: Map<number, number>
): Array<{ price: number; cumulativeBid: number; cumulativeAsk: number }> {
  const result: Array<{ price: number; cumulativeBid: number; cumulativeAsk: number }> = [];

  // Sort bids descending (best bid first)
  const bidPrices = Array.from(bids.keys()).sort((a, b) => b - a);
  let cumulativeBid = 0;

  bidPrices.forEach(price => {
    cumulativeBid += bids.get(price) || 0;
    const existing = result.find(r => r.price === price);
    if (existing) {
      existing.cumulativeBid = cumulativeBid;
    } else {
      result.push({ price, cumulativeBid, cumulativeAsk: 0 });
    }
  });

  // Sort asks ascending (best ask first)
  const askPrices = Array.from(asks.keys()).sort((a, b) => a - b);
  let cumulativeAsk = 0;

  askPrices.forEach(price => {
    cumulativeAsk += asks.get(price) || 0;
    const existing = result.find(r => r.price === price);
    if (existing) {
      existing.cumulativeAsk = cumulativeAsk;
    } else {
      result.push({ price, cumulativeBid: 0, cumulativeAsk });
    }
  });

  return result.sort((a, b) => b.price - a.price);
}
