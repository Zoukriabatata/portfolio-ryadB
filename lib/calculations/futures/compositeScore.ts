/**
 * COMPOSITE MARKET PRESSURE SCORE (0-100)
 *
 * Synthesizes multiple futures signals into a single directional score.
 *
 * Components:
 * - Delta OI (25%) — Is OI building or unwinding?
 * - Funding Rate Extremity (20%) — How extreme is funding?
 * - L/S Imbalance (20%) — How skewed is positioning?
 * - Liquidations Intensity (20%) — How much forced closing?
 * - Volatility (15%) — How volatile is the market?
 */

export type CompositeDirection = 'bullish' | 'bearish' | 'neutral';

export interface CompositeResult {
  score: number;           // 0-100 (50 = neutral, >50 bullish bias, <50 bearish bias)
  direction: CompositeDirection;
  confidence: number;      // 0-100 (how converged the signals are)
  components: {
    deltaOI: number;       // -100 to +100
    funding: number;       // -100 to +100
    lsImbalance: number;   // -100 to +100
    liquidations: number;  // -100 to +100
    volatility: number;    // 0 to 100
  };
  alert: boolean;          // True if conditions are extreme
}

interface CompositeInput {
  oiHistory: Array<{ time: number; value: number }>;
  priceNow: number;
  priceStart: number;
  fundingRate: number;
  lsRatio: number;
  topTraderLsRatio: number;
  liquidationsIntensity: number; // liqs per minute
  recentLiqBuyVolume: number;    // Short liqs (bullish)
  recentLiqSellVolume: number;   // Long liqs (bearish)
  volatility: number;            // Percentage
}

export function calculateCompositeScore(input: CompositeInput): CompositeResult {
  // 1. Delta OI component (-100 to +100)
  let deltaOI = 0;
  if (input.oiHistory.length >= 2) {
    const firstOI = input.oiHistory[0].value;
    const lastOI = input.oiHistory[input.oiHistory.length - 1].value;
    if (firstOI > 0) {
      const oiChangePct = ((lastOI - firstOI) / firstOI) * 100;
      // OI rising + price rising = bullish
      // OI rising + price falling = bearish
      const priceDirection = input.priceStart > 0
        ? (input.priceNow - input.priceStart) / input.priceStart
        : 0;
      deltaOI = clamp(oiChangePct * (priceDirection >= 0 ? 1 : -1) * 10, -100, 100);
    }
  }

  // 2. Funding component (-100 to +100)
  // Positive funding = longs pay shorts = bearish contrarian signal
  // But extreme positive = market is bullish, use directionally
  const fundingPct = input.fundingRate * 10000; // In basis points
  const funding = clamp(fundingPct * 10, -100, 100);

  // 3. L/S Imbalance (-100 to +100)
  // ratio > 1 = more longs = slightly bullish sentiment
  const lsDeviation = input.lsRatio - 1;
  const lsImbalance = clamp(lsDeviation * 200, -100, 100);

  // 4. Liquidations component (-100 to +100)
  // More short liqs = bullish, more long liqs = bearish
  const totalLiq = input.recentLiqBuyVolume + input.recentLiqSellVolume;
  let liquidations = 0;
  if (totalLiq > 0) {
    const netLiqDirection = (input.recentLiqBuyVolume - input.recentLiqSellVolume) / totalLiq;
    liquidations = clamp(netLiqDirection * input.liquidationsIntensity * 20, -100, 100);
  }

  // 5. Volatility (0 to 100)
  const volatility = clamp(input.volatility * 20, 0, 100);

  // Weighted composite
  const weightedSum =
    deltaOI * 0.25 +
    funding * 0.20 +
    lsImbalance * 0.20 +
    liquidations * 0.20 +
    0; // Volatility doesn't have direction, used for confidence

  // Map from [-100, 100] to [0, 100]
  const score = clamp(50 + weightedSum / 2, 0, 100);

  // Direction
  let direction: CompositeDirection;
  if (score > 60) direction = 'bullish';
  else if (score < 40) direction = 'bearish';
  else direction = 'neutral';

  // Confidence — how much do signals agree?
  const signals = [deltaOI, funding, lsImbalance, liquidations];
  const positiveCount = signals.filter(s => s > 10).length;
  const negativeCount = signals.filter(s => s < -10).length;
  const convergence = Math.max(positiveCount, negativeCount) / signals.length;
  const confidence = clamp(
    convergence * 100 * (1 + volatility / 100) * 0.5,
    0,
    100
  );

  // Alert when extreme
  const alert = score > 80 || score < 20;

  return {
    score: Math.round(score),
    direction,
    confidence: Math.round(confidence),
    components: { deltaOI, funding, lsImbalance, liquidations, volatility },
    alert,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
