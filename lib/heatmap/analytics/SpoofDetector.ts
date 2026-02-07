/**
 * SPOOF DETECTOR - Detection of Manipulative Order Patterns
 *
 * Identifies potential spoofing, layering, and quote stuffing patterns.
 * Uses multiple factors for confidence scoring.
 */

import type {
  OrderBookState,
  OrderLevel,
  SpoofPattern,
  SpoofReason,
  Trade,
} from '../core/types';

export interface SpoofDetectorConfig {
  minSizeMultiplier: number;     // Min size vs average to flag
  maxLifetimeMs: number;         // Max order lifetime to be suspicious
  minExecutionRatio: number;     // Min executed % to NOT be suspicious
  layeringLevels: number;        // Consecutive levels for layering
  layeringSizeRatio: number;     // Size ratio between layers
  quotesPerSecondThreshold: number; // For quote stuffing
  confidenceThreshold: number;   // Min confidence to report
  patternMemoryMs: number;       // How long to remember patterns
}

const DEFAULT_CONFIG: SpoofDetectorConfig = {
  minSizeMultiplier: 3,
  maxLifetimeMs: 1000,
  minExecutionRatio: 0.1,
  layeringLevels: 3,
  layeringSizeRatio: 0.8,
  quotesPerSecondThreshold: 50,
  confidenceThreshold: 0.6,
  patternMemoryMs: 30000,
};

interface OrderHistory {
  price: number;
  side: 'bid' | 'ask';
  size: number;
  firstSeen: number;
  lastSeen: number;
  modifications: number;
  wasExecuted: boolean;
  executedVolume: number;
}

export class SpoofDetector {
  private config: SpoofDetectorConfig;
  private patterns: Map<string, SpoofPattern> = new Map();
  private orderHistory: Map<string, OrderHistory> = new Map();
  private recentQuotes: Array<{ timestamp: number; side: 'bid' | 'ask' }> = [];
  private lastSnapshot: { bids: Set<string>; asks: Set<string> } = {
    bids: new Set(),
    asks: new Set(),
  };

  constructor(config: Partial<SpoofDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SpoofDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Analyze order book for spoofing patterns
   */
  analyze(
    orderBook: OrderBookState,
    trades: Trade[]
  ): SpoofPattern[] {
    const now = Date.now();
    const newPatterns: SpoofPattern[] = [];

    // Calculate average size for threshold
    const avgSize = this.calculateAverageSize(orderBook);
    const threshold = avgSize * this.config.minSizeMultiplier;

    // Track order changes
    this.trackOrderChanges(orderBook, now);

    // Detect pulled orders (large orders that disappeared without execution)
    const pulledPatterns = this.detectPulledOrders(orderBook, trades, now, threshold);
    newPatterns.push(...pulledPatterns);

    // Detect layering (multiple large orders at consecutive levels)
    const layeringPatterns = this.detectLayering(orderBook, threshold);
    newPatterns.push(...layeringPatterns);

    // Detect quote stuffing (rapid order modifications)
    const stuffingPatterns = this.detectQuoteStuffing(now);
    newPatterns.push(...stuffingPatterns);

    // Update pattern tracking
    this.updatePatterns(newPatterns, now);

    // Clean up old data
    this.cleanup(now);

    return this.getActivePatterns();
  }

  /**
   * Track order book changes
   */
  private trackOrderChanges(orderBook: OrderBookState, now: number): void {
    const currentBids = new Set<string>();
    const currentAsks = new Set<string>();

    // Process bids
    for (const [price, level] of orderBook.bids) {
      const key = `bid-${price}`;
      currentBids.add(key);

      const existing = this.orderHistory.get(key);
      if (existing) {
        if (existing.size !== level.size) {
          existing.modifications++;
          existing.size = level.size;
          existing.lastSeen = now;
          this.recentQuotes.push({ timestamp: now, side: 'bid' });
        }
      } else {
        this.orderHistory.set(key, {
          price,
          side: 'bid',
          size: level.size,
          firstSeen: now,
          lastSeen: now,
          modifications: 0,
          wasExecuted: false,
          executedVolume: 0,
        });
        this.recentQuotes.push({ timestamp: now, side: 'bid' });
      }
    }

    // Process asks
    for (const [price, level] of orderBook.asks) {
      const key = `ask-${price}`;
      currentAsks.add(key);

      const existing = this.orderHistory.get(key);
      if (existing) {
        if (existing.size !== level.size) {
          existing.modifications++;
          existing.size = level.size;
          existing.lastSeen = now;
          this.recentQuotes.push({ timestamp: now, side: 'ask' });
        }
      } else {
        this.orderHistory.set(key, {
          price,
          side: 'ask',
          size: level.size,
          firstSeen: now,
          lastSeen: now,
          modifications: 0,
          wasExecuted: false,
          executedVolume: 0,
        });
        this.recentQuotes.push({ timestamp: now, side: 'ask' });
      }
    }

    // Mark disappeared orders
    for (const key of this.lastSnapshot.bids) {
      if (!currentBids.has(key)) {
        const history = this.orderHistory.get(key);
        if (history) {
          history.lastSeen = now;
        }
      }
    }
    for (const key of this.lastSnapshot.asks) {
      if (!currentAsks.has(key)) {
        const history = this.orderHistory.get(key);
        if (history) {
          history.lastSeen = now;
        }
      }
    }

    this.lastSnapshot = { bids: currentBids, asks: currentAsks };
  }

  /**
   * Detect large orders that were pulled without execution
   */
  private detectPulledOrders(
    orderBook: OrderBookState,
    trades: Trade[],
    now: number,
    threshold: number
  ): SpoofPattern[] {
    const patterns: SpoofPattern[] = [];

    for (const [key, history] of this.orderHistory) {
      // Skip if order still exists
      if (
        (history.side === 'bid' && this.lastSnapshot.bids.has(key)) ||
        (history.side === 'ask' && this.lastSnapshot.asks.has(key))
      ) {
        continue;
      }

      // Check if it was a large order
      if (history.size < threshold) continue;

      // Check lifetime
      const lifetime = history.lastSeen - history.firstSeen;
      if (lifetime > this.config.maxLifetimeMs) continue;

      // Check execution
      const relevantTrades = trades.filter(
        t =>
          t.price === history.price &&
          t.timestamp >= history.firstSeen &&
          t.timestamp <= history.lastSeen
      );
      const executedVolume = relevantTrades.reduce((sum, t) => sum + t.quantity, 0);
      const executionRatio = executedVolume / history.size;

      if (executionRatio < this.config.minExecutionRatio) {
        // Suspicious - large order pulled with minimal execution
        const confidence = this.calculatePulledOrderConfidence(
          history,
          lifetime,
          executionRatio
        );

        if (confidence >= this.config.confidenceThreshold) {
          patterns.push({
            id: `pulled-${key}-${now}`,
            price: history.price,
            side: history.side,
            confidence,
            reason: 'large_order_pulled',
            size: history.size,
            lifetime,
            detectedAt: now,
            executedVolume,
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect layering patterns (multiple large orders at consecutive levels)
   */
  private detectLayering(
    orderBook: OrderBookState,
    threshold: number
  ): SpoofPattern[] {
    const patterns: SpoofPattern[] = [];
    const now = Date.now();

    // Check bid side
    const bidLayers = this.findLayers(orderBook.bids, threshold, 'bid');
    for (const layer of bidLayers) {
      patterns.push({
        id: `layering-bid-${layer.startPrice}-${now}`,
        price: layer.startPrice,
        side: 'bid',
        confidence: layer.confidence,
        reason: 'layering_detected',
        size: layer.totalSize,
        lifetime: 0,
        detectedAt: now,
        executedVolume: 0,
      });
    }

    // Check ask side
    const askLayers = this.findLayers(orderBook.asks, threshold, 'ask');
    for (const layer of askLayers) {
      patterns.push({
        id: `layering-ask-${layer.startPrice}-${now}`,
        price: layer.startPrice,
        side: 'ask',
        confidence: layer.confidence,
        reason: 'layering_detected',
        size: layer.totalSize,
        lifetime: 0,
        detectedAt: now,
        executedVolume: 0,
      });
    }

    return patterns;
  }

  /**
   * Find consecutive large orders (layers)
   */
  private findLayers(
    levels: Map<number, OrderLevel>,
    threshold: number,
    side: 'bid' | 'ask'
  ): Array<{ startPrice: number; totalSize: number; confidence: number }> {
    const results: Array<{ startPrice: number; totalSize: number; confidence: number }> = [];

    // Sort by price
    const sorted = Array.from(levels.entries()).sort((a, b) =>
      side === 'bid' ? b[0] - a[0] : a[0] - b[0]
    );

    let consecutiveLarge: Array<[number, OrderLevel]> = [];

    for (const [price, level] of sorted) {
      if (level.size >= threshold * 0.7) {
        consecutiveLarge.push([price, level]);
      } else {
        if (consecutiveLarge.length >= this.config.layeringLevels) {
          // Found a layering pattern
          const totalSize = consecutiveLarge.reduce((sum, [, l]) => sum + l.size, 0);
          const confidence = Math.min(
            0.9,
            0.5 + (consecutiveLarge.length - this.config.layeringLevels) * 0.1
          );

          results.push({
            startPrice: consecutiveLarge[0][0],
            totalSize,
            confidence,
          });
        }
        consecutiveLarge = [];
      }
    }

    // Check remaining
    if (consecutiveLarge.length >= this.config.layeringLevels) {
      const totalSize = consecutiveLarge.reduce((sum, [, l]) => sum + l.size, 0);
      const confidence = Math.min(
        0.9,
        0.5 + (consecutiveLarge.length - this.config.layeringLevels) * 0.1
      );

      results.push({
        startPrice: consecutiveLarge[0][0],
        totalSize,
        confidence,
      });
    }

    return results;
  }

  /**
   * Detect quote stuffing (excessive order modifications)
   */
  private detectQuoteStuffing(now: number): SpoofPattern[] {
    const patterns: SpoofPattern[] = [];

    // Count quotes in last second
    const oneSecondAgo = now - 1000;
    const recentCount = this.recentQuotes.filter(q => q.timestamp > oneSecondAgo).length;

    if (recentCount > this.config.quotesPerSecondThreshold) {
      const confidence = Math.min(
        0.95,
        0.6 + (recentCount - this.config.quotesPerSecondThreshold) / 100
      );

      patterns.push({
        id: `stuffing-${now}`,
        price: 0, // Not price-specific
        side: 'bid', // Could be either
        confidence,
        reason: 'quote_stuffing',
        size: 0,
        lifetime: 1000,
        detectedAt: now,
        executedVolume: 0,
      });
    }

    return patterns;
  }

  /**
   * Calculate confidence for pulled order
   */
  private calculatePulledOrderConfidence(
    history: OrderHistory,
    lifetime: number,
    executionRatio: number
  ): number {
    let confidence = 0.5;

    // Shorter lifetime = more suspicious
    if (lifetime < 200) confidence += 0.2;
    else if (lifetime < 500) confidence += 0.1;

    // More modifications = more suspicious
    if (history.modifications > 5) confidence += 0.15;
    else if (history.modifications > 2) confidence += 0.1;

    // Lower execution = more suspicious
    if (executionRatio < 0.01) confidence += 0.15;
    else if (executionRatio < 0.05) confidence += 0.1;

    return Math.min(0.95, confidence);
  }

  /**
   * Calculate average order size
   */
  private calculateAverageSize(orderBook: OrderBookState): number {
    const sizes: number[] = [];

    for (const level of orderBook.bids.values()) {
      if (level.size > 0) sizes.push(level.size);
    }
    for (const level of orderBook.asks.values()) {
      if (level.size > 0) sizes.push(level.size);
    }

    if (sizes.length === 0) return 1;
    return sizes.reduce((a, b) => a + b, 0) / sizes.length;
  }

  /**
   * Update pattern tracking
   */
  private updatePatterns(newPatterns: SpoofPattern[], now: number): void {
    for (const pattern of newPatterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  /**
   * Clean up old data
   */
  private cleanup(now: number): void {
    // Remove old patterns
    for (const [id, pattern] of this.patterns) {
      if (now - pattern.detectedAt > this.config.patternMemoryMs) {
        this.patterns.delete(id);
      }
    }

    // Remove old order history
    for (const [key, history] of this.orderHistory) {
      if (now - history.lastSeen > this.config.patternMemoryMs) {
        this.orderHistory.delete(key);
      }
    }

    // Remove old quotes
    const cutoff = now - 2000;
    this.recentQuotes = this.recentQuotes.filter(q => q.timestamp > cutoff);
  }

  /**
   * Get all active patterns
   */
  getActivePatterns(): SpoofPattern[] {
    return Array.from(this.patterns.values()).filter(
      p => p.confidence >= this.config.confidenceThreshold
    );
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.patterns.clear();
    this.orderHistory.clear();
    this.recentQuotes = [];
    this.lastSnapshot = { bids: new Set(), asks: new Set() };
  }
}
