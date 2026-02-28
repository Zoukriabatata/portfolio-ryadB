/**
 * MARKET REGIME DETECTION & RISK TEMPERATURE
 *
 * Determines market regime (trending/range/expansion/compression)
 * and risk temperature (low/moderate/high/extreme) from available
 * futures data.
 */

export type MarketRegime = 'trending' | 'range' | 'expansion' | 'compression';
export type RiskTemperature = 'low' | 'moderate' | 'high' | 'extreme';

interface RegimeInput {
  priceHistory: Array<{ time: number; price: number }>;
  oiHistory: Array<{ time: number; value: number }>;
  fundingRate: number;
  liquidationsIntensity: number; // liqs per minute
  lsRatio: number;
}

/**
 * Calculate returns volatility (standard deviation of % returns)
 */
function calculateVolatility(prices: number[]): number {
  if (prices.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

/**
 * Simple directional strength (pseudo-ADX)
 * Measures how consistently price has moved in one direction.
 */
function calculateDirectionalStrength(prices: number[]): number {
  if (prices.length < 3) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  const netMove = Math.abs(last - first);

  // Sum of absolute per-step moves
  let totalMove = 0;
  for (let i = 1; i < prices.length; i++) {
    totalMove += Math.abs(prices[i] - prices[i - 1]);
  }
  if (totalMove === 0) return 0;

  // Efficiency ratio: 1 = perfect trend, 0 = pure chop
  return netMove / totalMove;
}

/**
 * Bollinger Band width as measure of expansion/compression
 */
function calculateBBWidth(prices: number[]): number {
  if (prices.length < 5) return 0;
  const recent = prices.slice(-20);
  const mean = recent.reduce((s, p) => s + p, 0) / recent.length;
  if (mean === 0) return 0;
  const stdDev = Math.sqrt(recent.reduce((s, p) => s + (p - mean) ** 2, 0) / recent.length);
  return (stdDev * 2) / mean; // Normalized BB width
}

export function detectMarketRegime(input: RegimeInput): MarketRegime {
  const prices = input.priceHistory.map(p => p.price);
  if (prices.length < 5) return 'range';

  const dirStrength = calculateDirectionalStrength(prices);
  const bbWidth = calculateBBWidth(prices);

  // Thresholds
  if (dirStrength > 0.6) return 'trending';
  if (bbWidth < 0.003) return 'compression';
  if (bbWidth > 0.015) return 'expansion';
  return 'range';
}

export function calculateRiskTemperature(input: RegimeInput): RiskTemperature {
  const prices = input.priceHistory.map(p => p.price);
  const vol = calculateVolatility(prices);

  // OI change rate
  let oiChangeRate = 0;
  if (input.oiHistory.length >= 2) {
    const first = input.oiHistory[0].value;
    const last = input.oiHistory[input.oiHistory.length - 1].value;
    oiChangeRate = first > 0 ? Math.abs((last - first) / first) : 0;
  }

  // Funding extremity
  const fundingExtremity = Math.abs(input.fundingRate) / 0.001; // Normalize: 0.001 = extreme

  // L/S imbalance (deviation from 1.0)
  const lsImbalance = Math.abs(input.lsRatio - 1);

  // Composite risk score
  const score =
    vol * 200 +                         // Volatility weight
    oiChangeRate * 30 +                 // OI change weight
    fundingExtremity * 20 +             // Funding weight
    input.liquidationsIntensity * 5 +   // Liquidations weight
    lsImbalance * 15;                   // L/S weight

  if (score > 50) return 'extreme';
  if (score > 25) return 'high';
  if (score > 10) return 'moderate';
  return 'low';
}

export function calculateVolatilityFromPrices(prices: number[]): number {
  return calculateVolatility(prices) * 100; // Return as percentage
}
