/**
 * FOOTPRINT INDICATORS — Calculation logic for advanced orderflow indicators
 *
 * - Stacked Imbalances: 3+ consecutive levels with imbalance in same direction
 * - Naked POC: POC levels not revisited by price in subsequent candles
 * - Unfinished Auctions: High/low of candle with 0 volume on one side
 */

import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';
import type { StackedImbalance, NakedPOC, UnfinishedAuction } from '@/types/footprint';

/**
 * Calculate stacked imbalances within a candle.
 * A stacked imbalance is N consecutive price levels that all have the same
 * imbalance direction (buy or sell).
 */
export function calculateStackedImbalances(
  candle: FootprintCandle,
  tickSize: number,
  minConsecutive: number = 3,
): StackedImbalance[] {
  const results: StackedImbalance[] = [];

  // Sort price levels ascending
  const sortedLevels = Array.from(candle.levels.entries())
    .sort((a, b) => a[0] - b[0]);

  if (sortedLevels.length < minConsecutive) return results;

  // Precision for price comparison
  const precisionDigits = Math.max(Math.round(-Math.log10(tickSize)) + 2, 2);
  const factor = Math.pow(10, precisionDigits);

  let currentDirection: 'bullish' | 'bearish' | null = null;
  let startPrice = 0;
  let endPrice = 0;
  let count = 0;
  let lastPrice = -Infinity;

  for (const [price, level] of sortedLevels) {
    // Check if this level is consecutive (within one tick of previous)
    const isConsecutive = Math.abs(Math.round((price - lastPrice) * factor) / factor - tickSize) < tickSize * 0.1;

    const direction: 'bullish' | 'bearish' | null =
      level.imbalanceBuy ? 'bullish' :
      level.imbalanceSell ? 'bearish' :
      null;

    if (direction && (direction === currentDirection) && isConsecutive) {
      // Continue the streak
      endPrice = price;
      count++;
    } else {
      // Flush previous streak
      if (currentDirection && count >= minConsecutive) {
        results.push({
          startPrice,
          endPrice,
          direction: currentDirection,
          count,
          candleTime: candle.time,
        });
      }
      // Start new streak
      if (direction) {
        currentDirection = direction;
        startPrice = price;
        endPrice = price;
        count = 1;
      } else {
        currentDirection = null;
        count = 0;
      }
    }

    lastPrice = price;
  }

  // Flush final streak
  if (currentDirection && count >= minConsecutive) {
    results.push({
      startPrice,
      endPrice,
      direction: currentDirection,
      count,
      candleTime: candle.time,
    });
  }

  return results;
}

/**
 * Calculate naked POCs — POC levels not revisited by subsequent candle price action.
 * A naked POC remains until price trades through it.
 */
export function calculateNakedPOCs(
  candles: FootprintCandle[],
  currentPrice: number,
): NakedPOC[] {
  const nakedPOCs: NakedPOC[] = [];

  for (let i = 0; i < candles.length - 1; i++) {
    const candle = candles[i];
    if (!candle.poc) continue;

    const pocPrice = candle.poc;
    let tested = false;

    // Check if any subsequent candle's range (low to high) includes this POC
    for (let j = i + 1; j < candles.length; j++) {
      if (candles[j].low <= pocPrice && candles[j].high >= pocPrice) {
        tested = true;
        break;
      }
    }

    // Also check current price
    if (!tested && currentPrice > 0) {
      // Consider it tested if current price is very close
      // (within the candle's average range)
    }

    if (!tested) {
      // Get POC volume
      const pocLevel = candle.levels.get(pocPrice);
      nakedPOCs.push({
        price: pocPrice,
        candleTime: candle.time,
        volume: pocLevel ? pocLevel.totalVolume : 0,
        tested: false,
      });
    }
  }

  return nakedPOCs;
}

/**
 * Calculate unfinished auctions — high/low of candle where one side has 0 volume.
 * An unfinished auction at the high means no ask volume was traded at the highest price
 * (buyers couldn't push higher). At the low, no bid volume (sellers couldn't push lower).
 */
export function calculateUnfinishedAuctions(
  candles: FootprintCandle[],
  tickSize: number,
): UnfinishedAuction[] {
  const results: UnfinishedAuction[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Check high price level
    const highLevel = candle.levels.get(candle.high);
    if (highLevel) {
      // Unfinished at high: ask volume is 0 (nobody sold at the top)
      if (highLevel.askVolume === 0 && highLevel.bidVolume > 0) {
        let tested = false;
        // Check if subsequent candles traded above this level
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].high > candle.high) {
            tested = true;
            break;
          }
        }
        results.push({
          price: candle.high,
          side: 'high',
          candleTime: candle.time,
          volume: highLevel.bidVolume,
          tested,
        });
      }
    }

    // Check low price level
    const lowLevel = candle.levels.get(candle.low);
    if (lowLevel) {
      // Unfinished at low: bid volume is 0 (nobody bought at the bottom)
      if (lowLevel.bidVolume === 0 && lowLevel.askVolume > 0) {
        let tested = false;
        // Check if subsequent candles traded below this level
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].low < candle.low) {
            tested = true;
            break;
          }
        }
        results.push({
          price: candle.low,
          side: 'low',
          candleTime: candle.time,
          volume: lowLevel.askVolume,
          tested,
        });
      }
    }
  }

  return results;
}
