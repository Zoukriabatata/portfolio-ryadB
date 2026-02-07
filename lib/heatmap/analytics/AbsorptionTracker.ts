/**
 * ABSORPTION TRACKER - Tracks Volume Absorption at Price Levels
 *
 * Monitors when large orders absorb market volume and tracks
 * whether price bounces or breaks through the level.
 */

import type {
  OrderBookState,
  OrderLevel,
  AbsorptionEvent,
  Trade,
} from '../core/types';

export interface AbsorptionTrackerConfig {
  minAbsorptionPercent: number;  // Min % of order absorbed to track
  minOrderSize: number;          // Min order size to consider
  bounceThresholdTicks: number;  // Ticks away to confirm bounce
  breakThresholdTicks: number;   // Ticks through to confirm break
  eventTimeoutMs: number;        // Max time before event expires
  maxEvents: number;             // Max events to track per side
}

const DEFAULT_CONFIG: AbsorptionTrackerConfig = {
  minAbsorptionPercent: 20,
  minOrderSize: 50,
  bounceThresholdTicks: 3,
  breakThresholdTicks: 2,
  eventTimeoutMs: 60000,
  maxEvents: 20,
};

interface TrackedLevel {
  price: number;
  side: 'bid' | 'ask';
  initialSize: number;
  currentSize: number;
  absorbedVolume: number;
  startTime: number;
  lastTradeTime: number;
  trades: Trade[];
}

export class AbsorptionTracker {
  private config: AbsorptionTrackerConfig;
  private trackedLevels: Map<string, TrackedLevel> = new Map();
  private completedEvents: AbsorptionEvent[] = [];
  private eventIdCounter: number = 0;
  private tickSize: number = 0.01;

  constructor(config: Partial<AbsorptionTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AbsorptionTrackerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set tick size for the instrument
   */
  setTickSize(tickSize: number): void {
    this.tickSize = tickSize;
  }

  /**
   * Process new trades and order book update
   */
  process(
    orderBook: OrderBookState,
    newTrades: Trade[],
    currentPrice: number
  ): AbsorptionEvent[] {
    const now = Date.now();

    // Update tracked levels with new order book state
    this.updateTrackedLevels(orderBook, now);

    // Process new trades
    for (const trade of newTrades) {
      this.processTrade(trade);
    }

    // Check for completed events (bounce or break)
    this.checkForCompletions(currentPrice, now);

    // Clean up old events
    this.cleanup(now);

    return this.getActiveEvents();
  }

  /**
   * Update tracked levels from order book
   */
  private updateTrackedLevels(orderBook: OrderBookState, now: number): void {
    // Process bid levels
    for (const [price, level] of orderBook.bids) {
      const key = `bid-${price}`;
      const existing = this.trackedLevels.get(key);

      if (existing) {
        // Update current size
        existing.currentSize = level.size;
      } else if (level.size >= this.config.minOrderSize) {
        // Start tracking new significant level
        this.trackedLevels.set(key, {
          price,
          side: 'bid',
          initialSize: level.size,
          currentSize: level.size,
          absorbedVolume: 0,
          startTime: now,
          lastTradeTime: 0,
          trades: [],
        });
      }
    }

    // Process ask levels
    for (const [price, level] of orderBook.asks) {
      const key = `ask-${price}`;
      const existing = this.trackedLevels.get(key);

      if (existing) {
        existing.currentSize = level.size;
      } else if (level.size >= this.config.minOrderSize) {
        this.trackedLevels.set(key, {
          price,
          side: 'ask',
          initialSize: level.size,
          currentSize: level.size,
          absorbedVolume: 0,
          startTime: now,
          lastTradeTime: 0,
          trades: [],
        });
      }
    }

    // Mark levels that no longer exist
    for (const [key, tracked] of this.trackedLevels) {
      const [side, priceStr] = key.split('-');
      const price = parseFloat(priceStr);
      const levels = side === 'bid' ? orderBook.bids : orderBook.asks;

      if (!levels.has(price)) {
        tracked.currentSize = 0;
      }
    }
  }

  /**
   * Process a single trade
   */
  private processTrade(trade: Trade): void {
    // Find matching tracked level
    // For a buy trade hitting asks, or sell trade hitting bids
    const side = trade.isBuyerMaker ? 'bid' : 'ask';
    const key = `${side}-${trade.price}`;
    const tracked = this.trackedLevels.get(key);

    if (tracked) {
      tracked.absorbedVolume += trade.quantity;
      tracked.lastTradeTime = trade.timestamp;
      tracked.trades.push(trade);

      // Keep only last 100 trades per level
      if (tracked.trades.length > 100) {
        tracked.trades.shift();
      }
    }
  }

  /**
   * Check for completed absorption events (bounce or break)
   */
  private checkForCompletions(currentPrice: number, now: number): void {
    for (const [key, tracked] of this.trackedLevels) {
      // Check if absorption threshold met
      const absorptionPercent = (tracked.absorbedVolume / tracked.initialSize) * 100;

      if (absorptionPercent < this.config.minAbsorptionPercent) {
        continue; // Not enough absorption yet
      }

      // Determine price action
      let priceAction: 'bounce' | 'break' | 'ongoing' = 'ongoing';

      if (tracked.side === 'bid') {
        const ticksAway = (currentPrice - tracked.price) / this.tickSize;

        if (ticksAway >= this.config.bounceThresholdTicks) {
          priceAction = 'bounce'; // Price bounced off bid wall
        } else if (ticksAway <= -this.config.breakThresholdTicks) {
          priceAction = 'break'; // Price broke through bid wall
        }
      } else {
        const ticksAway = (tracked.price - currentPrice) / this.tickSize;

        if (ticksAway >= this.config.bounceThresholdTicks) {
          priceAction = 'bounce'; // Price bounced off ask wall
        } else if (ticksAway <= -this.config.breakThresholdTicks) {
          priceAction = 'break'; // Price broke through ask wall
        }
      }

      // Check if level is depleted or event timed out
      const isCompleted =
        priceAction !== 'ongoing' ||
        tracked.currentSize <= tracked.initialSize * 0.1 ||
        now - tracked.startTime > this.config.eventTimeoutMs;

      if (isCompleted && priceAction === 'ongoing') {
        // Determine final action based on current position
        if (tracked.currentSize <= tracked.initialSize * 0.1) {
          priceAction = 'break'; // Level was depleted
        }
      }

      if (priceAction !== 'ongoing' || isCompleted) {
        // Create completed event
        const event: AbsorptionEvent = {
          id: `absorption-${this.eventIdCounter++}`,
          price: tracked.price,
          side: tracked.side,
          totalAbsorbed: tracked.absorbedVolume,
          remainingSize: tracked.currentSize,
          startTime: tracked.startTime,
          endTime: now,
          priceAction,
          strength: Math.min(1, tracked.absorbedVolume / tracked.initialSize),
          trades: tracked.trades.slice(-20), // Keep last 20 trades
        };

        this.completedEvents.push(event);

        // Stop tracking this level
        this.trackedLevels.delete(key);
      }
    }

    // Trim completed events
    while (this.completedEvents.length > this.config.maxEvents * 2) {
      this.completedEvents.shift();
    }
  }

  /**
   * Clean up old data
   */
  private cleanup(now: number): void {
    // Remove old tracked levels
    for (const [key, tracked] of this.trackedLevels) {
      if (
        tracked.currentSize === 0 &&
        now - tracked.startTime > 5000
      ) {
        this.trackedLevels.delete(key);
      }
    }

    // Remove old completed events
    this.completedEvents = this.completedEvents.filter(
      e => now - (e.endTime || e.startTime) < this.config.eventTimeoutMs
    );
  }

  /**
   * Get all active absorption events (both ongoing and recent completed)
   */
  getActiveEvents(): AbsorptionEvent[] {
    const ongoing: AbsorptionEvent[] = [];
    const now = Date.now();

    // Convert tracked levels to ongoing events
    for (const tracked of this.trackedLevels.values()) {
      const absorptionPercent = (tracked.absorbedVolume / tracked.initialSize) * 100;

      if (absorptionPercent >= this.config.minAbsorptionPercent) {
        ongoing.push({
          id: `ongoing-${tracked.side}-${tracked.price}`,
          price: tracked.price,
          side: tracked.side,
          totalAbsorbed: tracked.absorbedVolume,
          remainingSize: tracked.currentSize,
          startTime: tracked.startTime,
          endTime: null,
          priceAction: 'ongoing',
          strength: Math.min(1, tracked.absorbedVolume / tracked.initialSize),
          trades: tracked.trades.slice(-10),
        });
      }
    }

    // Get recent completed events
    const recentCompleted = this.completedEvents.filter(
      e => now - (e.endTime || 0) < 10000 // Show completed events for 10s
    );

    return [...ongoing, ...recentCompleted];
  }

  /**
   * Get events by side
   */
  getEventsBySide(side: 'bid' | 'ask'): AbsorptionEvent[] {
    return this.getActiveEvents().filter(e => e.side === side);
  }

  /**
   * Get absorption stats
   */
  getStats(): {
    totalAbsorbed: number;
    bidAbsorbed: number;
    askAbsorbed: number;
    bounces: number;
    breaks: number;
  } {
    const events = this.completedEvents;

    return {
      totalAbsorbed: events.reduce((sum, e) => sum + e.totalAbsorbed, 0),
      bidAbsorbed: events
        .filter(e => e.side === 'bid')
        .reduce((sum, e) => sum + e.totalAbsorbed, 0),
      askAbsorbed: events
        .filter(e => e.side === 'ask')
        .reduce((sum, e) => sum + e.totalAbsorbed, 0),
      bounces: events.filter(e => e.priceAction === 'bounce').length,
      breaks: events.filter(e => e.priceAction === 'break').length,
    };
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.trackedLevels.clear();
    this.completedEvents = [];
  }
}
