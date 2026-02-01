// Absorption Detection Utilities

import type { AbsorptionEvent } from '@/types/footprint';
import type { Trade } from '@/types/market';

export interface AbsorptionContext {
  recentTrades: Trade[];
  priceBeforeWindow: number;
  volumeThreshold: number;       // Large order threshold
  priceMovementThreshold: number; // Max movement for "no movement"
  tickSize: number;
}

/**
 * Detect absorption: large volume executed with minimal price impact
 * Absorption indicates strong support/resistance at a level
 */
export function detectAbsorption(ctx: AbsorptionContext): AbsorptionEvent | null {
  if (ctx.recentTrades.length === 0) return null;

  const totalVolume = ctx.recentTrades.reduce((sum, t) => sum + t.quantity, 0);

  // Not enough volume to be significant
  if (totalVolume < ctx.volumeThreshold) return null;

  const lastTrade = ctx.recentTrades[ctx.recentTrades.length - 1];
  const priceChange = Math.abs(lastTrade.price - ctx.priceBeforeWindow);

  // Price moved too much - not absorption
  if (priceChange > ctx.priceMovementThreshold * ctx.tickSize) return null;

  // Calculate dominant side (who was absorbing)
  const netDelta = ctx.recentTrades.reduce((acc, t) => {
    return acc + (t.isBuyerMaker ? -t.quantity : t.quantity);
  }, 0);

  // Determine which side absorbed
  // If netDelta > 0, buyers were aggressive but price didn't move up = asks absorbed
  // If netDelta < 0, sellers were aggressive but price didn't move down = bids absorbed
  const side: 'bid' | 'ask' = netDelta > 0 ? 'ask' : 'bid';

  return {
    price: lastTrade.price,
    volume: totalVolume,
    side,
    priceChange,
    timestamp: Date.now(),
  };
}

/**
 * Track absorption events over time with a sliding window
 */
export class AbsorptionTracker {
  private windowMs: number;
  private trades: Trade[] = [];
  private lastPrice: number = 0;
  private volumeThreshold: number;
  private priceThreshold: number;
  private tickSize: number;

  constructor(
    windowMs: number = 5000,
    volumeThreshold: number = 100,
    priceThreshold: number = 3,
    tickSize: number = 0.1
  ) {
    this.windowMs = windowMs;
    this.volumeThreshold = volumeThreshold;
    this.priceThreshold = priceThreshold;
    this.tickSize = tickSize;
  }

  addTrade(trade: Trade): AbsorptionEvent | null {
    const now = Date.now();

    // Store price before adding trade
    if (this.trades.length === 0) {
      this.lastPrice = trade.price;
    }

    // Clean old trades outside window
    this.trades = this.trades.filter(t => now - t.time < this.windowMs);

    // Add new trade
    this.trades.push(trade);

    // Check for absorption
    const event = detectAbsorption({
      recentTrades: this.trades,
      priceBeforeWindow: this.lastPrice,
      volumeThreshold: this.volumeThreshold,
      priceMovementThreshold: this.priceThreshold,
      tickSize: this.tickSize,
    });

    // Update last price if we detected absorption (reset window)
    if (event) {
      this.lastPrice = trade.price;
      this.trades = [];
    }

    return event;
  }

  setThresholds(volume: number, price: number): void {
    this.volumeThreshold = volume;
    this.priceThreshold = price;
  }

  reset(): void {
    this.trades = [];
    this.lastPrice = 0;
  }
}

/**
 * Calculate absorption strength (0-1)
 * Higher values = more significant absorption
 */
export function calculateAbsorptionStrength(
  volumeAbsorbed: number,
  avgVolume: number,
  priceChange: number,
  expectedChange: number
): number {
  if (avgVolume === 0 || expectedChange === 0) return 0;

  // Volume factor: how much larger than average
  const volumeFactor = Math.min(volumeAbsorbed / avgVolume, 5) / 5;

  // Price factor: how little price moved compared to expected
  const priceFactor = 1 - Math.min(priceChange / expectedChange, 1);

  // Combined strength
  return volumeFactor * priceFactor;
}
