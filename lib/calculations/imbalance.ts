// Imbalance Detection Utilities

import type { ImbalanceDirection, ImbalanceCell, StackedImbalance } from '@/types/footprint';
import type { FootprintLevel } from '@/stores/useFootprintStore';

/**
 * Detect imbalance at a single price level
 */
export function detectImbalance(
  bidVolume: number,
  askVolume: number,
  threshold: number = 3.0
): { ratio: number; direction: ImbalanceDirection; isStrong: boolean } {
  // Handle edge cases
  if (bidVolume === 0 && askVolume === 0) {
    return { ratio: 0, direction: 'neutral', isStrong: false };
  }

  // Calculate ratio (always >= 1)
  let ratio: number;
  let direction: ImbalanceDirection;

  if (askVolume > bidVolume) {
    // More buyers (lifting asks) = bullish
    ratio = bidVolume > 0 ? askVolume / bidVolume : askVolume;
    direction = 'bullish';
  } else if (bidVolume > askVolume) {
    // More sellers (hitting bids) = bearish
    ratio = askVolume > 0 ? bidVolume / askVolume : bidVolume;
    direction = 'bearish';
  } else {
    return { ratio: 1, direction: 'neutral', isStrong: false };
  }

  const isStrong = ratio >= threshold;

  return { ratio, direction, isStrong };
}

/**
 * Detect imbalances for all levels in a candle
 */
export function detectCandleImbalances(
  levels: Map<number, FootprintLevel>,
  threshold: number = 3.0
): ImbalanceCell[] {
  const imbalances: ImbalanceCell[] = [];

  levels.forEach((level) => {
    const { ratio, direction, isStrong } = detectImbalance(
      level.bidVolume,
      level.askVolume,
      threshold
    );

    if (isStrong) {
      imbalances.push({
        price: level.price,
        ratio,
        direction,
        isStrong,
      });
    }
  });

  return imbalances;
}

/**
 * Detect stacked imbalances (3+ consecutive imbalances in same direction)
 */
export function detectStackedImbalances(
  levels: Map<number, FootprintLevel>,
  tickSize: number,
  threshold: number = 3.0,
  minStack: number = 3
): StackedImbalance[] {
  // Sort prices in descending order (high to low)
  const sortedPrices = Array.from(levels.keys()).sort((a, b) => b - a);
  const stacks: StackedImbalance[] = [];

  let currentStack: {
    prices: number[];
    direction: 'bullish' | 'bearish';
  } | null = null;

  for (let i = 0; i < sortedPrices.length; i++) {
    const price = sortedPrices[i];
    const level = levels.get(price)!;
    const { direction, isStrong } = detectImbalance(
      level.bidVolume,
      level.askVolume,
      threshold
    );

    // Check if prices are consecutive (within one tick)
    const isConsecutive = i === 0 ||
      Math.abs(sortedPrices[i - 1] - price - tickSize) < tickSize * 0.1;

    if (isStrong && direction !== 'neutral' && isConsecutive) {
      if (!currentStack) {
        // Start new stack
        currentStack = {
          prices: [price],
          direction: direction as 'bullish' | 'bearish',
        };
      } else if (currentStack.direction === direction) {
        // Continue current stack
        currentStack.prices.push(price);
      } else {
        // Direction changed, finalize current and start new
        if (currentStack.prices.length >= minStack) {
          stacks.push({
            startPrice: Math.max(...currentStack.prices),
            endPrice: Math.min(...currentStack.prices),
            direction: currentStack.direction,
            count: currentStack.prices.length,
            candleTime: 0, // Set by caller
          });
        }
        currentStack = {
          prices: [price],
          direction: direction as 'bullish' | 'bearish',
        };
      }
    } else {
      // No imbalance or not consecutive, finalize current stack
      if (currentStack && currentStack.prices.length >= minStack) {
        stacks.push({
          startPrice: Math.max(...currentStack.prices),
          endPrice: Math.min(...currentStack.prices),
          direction: currentStack.direction,
          count: currentStack.prices.length,
          candleTime: 0,
        });
      }
      currentStack = null;
    }
  }

  // Don't forget the last stack
  if (currentStack && currentStack.prices.length >= minStack) {
    stacks.push({
      startPrice: Math.max(...currentStack.prices),
      endPrice: Math.min(...currentStack.prices),
      direction: currentStack.direction,
      count: currentStack.prices.length,
      candleTime: 0,
    });
  }

  return stacks;
}

/**
 * Get color for imbalance cell based on direction and strength
 */
export function getImbalanceColor(
  direction: ImbalanceDirection,
  ratio: number,
  maxRatio: number = 10
): { fill: string; opacity: number } {
  if (direction === 'neutral') {
    return { fill: 'transparent', opacity: 0 };
  }

  // Normalize ratio to 0-1 range
  const normalizedRatio = Math.min(ratio / maxRatio, 1);
  const opacity = 0.3 + normalizedRatio * 0.5;

  if (direction === 'bullish') {
    return { fill: '#22c55e', opacity };
  } else {
    return { fill: '#ef4444', opacity };
  }
}
