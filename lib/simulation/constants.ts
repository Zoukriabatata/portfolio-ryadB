/**
 * Shared simulation constants
 *
 * Single source of truth for base prices, IV levels, and deterministic RNG.
 * Used by GEXSimulator and VolatilitySimulator to ensure consistency.
 */

// Base prices for ETFs/stocks (updated periodically)
export const BASE_PRICES: Record<string, number> = {
  SPY: 600, QQQ: 530, IWM: 230, DIA: 440,
  AAPL: 195, TSLA: 270, NVDA: 930, MSFT: 430, AMZN: 200, META: 525,
};

// Base implied volatility (annualized) per symbol
export const BASE_IV: Record<string, number> = {
  SPY: 0.17, QQQ: 0.21, IWM: 0.23, DIA: 0.15,
  AAPL: 0.28, TSLA: 0.55, NVDA: 0.45, MSFT: 0.25, AMZN: 0.31, META: 0.36,
  DEFAULT: 0.25,
};

/**
 * Seeded pseudo-random number generator
 *
 * Returns a function that generates deterministic values in [0, 1)
 * for a given seed. Same seed = same sequence every time.
 */
export function createSeededRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Get a time-based seed that changes every 5 minutes.
 * Includes symbol hash so different symbols get different sequences.
 */
export function getTimeSeed(symbol: string): number {
  const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash + symbol.charCodeAt(i)) | 0;
  }
  return timeBucket * 31 + Math.abs(hash);
}
