/**
 * POSITIONING ANALYSIS — OI Interpretation & Squeeze Detection
 *
 * Provides interpretive readings from OI, price, and L/S data.
 */

export type PositioningReading =
  | 'build-up'       // OI rising + price rising = new longs
  | 'short-build-up' // OI rising + price falling = new shorts
  | 'long-squeeze'   // OI falling + price falling = longs closing/liquidated
  | 'short-squeeze'  // OI falling + price rising = shorts closing/liquidated
  | 'short-covering' // OI falling + price rising = shorts covering
  | 'neutral';

export type SqueezeRisk = 'none' | 'low' | 'moderate' | 'high' | 'critical';

interface PositioningInput {
  oiHistory: Array<{ time: number; value: number }>;
  priceNow: number;
  priceStart: number; // Price at start of OI history window
  lsRatio: number;
  topTraderLsRatio: number;
  liquidationsIntensity: number;
}

/**
 * Determine positioning interpretation from OI & price changes
 */
export function interpretPositioning(input: PositioningInput): PositioningReading {
  if (input.oiHistory.length < 2) return 'neutral';

  const firstOI = input.oiHistory[0].value;
  const lastOI = input.oiHistory[input.oiHistory.length - 1].value;
  if (firstOI === 0) return 'neutral';

  const oiChange = (lastOI - firstOI) / firstOI;
  const priceChange = input.priceStart > 0
    ? (input.priceNow - input.priceStart) / input.priceStart
    : 0;

  const OI_THRESHOLD = 0.005;   // 0.5% OI change
  const PRICE_THRESHOLD = 0.002; // 0.2% price change

  const oiRising = oiChange > OI_THRESHOLD;
  const oiFalling = oiChange < -OI_THRESHOLD;
  const priceRising = priceChange > PRICE_THRESHOLD;
  const priceFalling = priceChange < -PRICE_THRESHOLD;

  if (oiRising && priceRising) return 'build-up';
  if (oiRising && priceFalling) return 'short-build-up';
  if (oiFalling && priceFalling) return 'long-squeeze';
  if (oiFalling && priceRising) return 'short-squeeze';
  return 'neutral';
}

/**
 * Detect squeeze probability based on extreme positioning
 */
export function detectSqueezeRisk(input: PositioningInput): { direction: 'long' | 'short' | 'none'; risk: SqueezeRisk } {
  const { lsRatio, topTraderLsRatio, liquidationsIntensity } = input;

  // OI build-up (more fuel for squeeze)
  let oiBuildUp = 0;
  if (input.oiHistory.length >= 2) {
    const firstOI = input.oiHistory[0].value;
    const lastOI = input.oiHistory[input.oiHistory.length - 1].value;
    oiBuildUp = firstOI > 0 ? (lastOI - firstOI) / firstOI : 0;
  }

  // Detect short squeeze conditions
  const shortSqueezeScore =
    (lsRatio < 0.8 ? 30 : lsRatio < 0.9 ? 15 : 0) +           // Extreme short bias
    (topTraderLsRatio < 0.7 ? 25 : topTraderLsRatio < 0.85 ? 10 : 0) +
    (oiBuildUp > 0.02 ? 20 : oiBuildUp > 0.01 ? 10 : 0) +      // OI buildup
    (liquidationsIntensity > 3 ? 15 : liquidationsIntensity > 1 ? 5 : 0);

  // Detect long squeeze conditions
  const longSqueezeScore =
    (lsRatio > 1.25 ? 30 : lsRatio > 1.15 ? 15 : 0) +          // Extreme long bias
    (topTraderLsRatio > 1.4 ? 25 : topTraderLsRatio > 1.2 ? 10 : 0) +
    (oiBuildUp > 0.02 ? 20 : oiBuildUp > 0.01 ? 10 : 0) +
    (liquidationsIntensity > 3 ? 15 : liquidationsIntensity > 1 ? 5 : 0);

  const maxScore = Math.max(shortSqueezeScore, longSqueezeScore);
  const direction = maxScore === 0 ? 'none' as const
    : shortSqueezeScore > longSqueezeScore ? 'short' as const : 'long' as const;

  let risk: SqueezeRisk;
  if (maxScore >= 70) risk = 'critical';
  else if (maxScore >= 50) risk = 'high';
  else if (maxScore >= 30) risk = 'moderate';
  else if (maxScore >= 15) risk = 'low';
  else risk = 'none';

  return { direction, risk };
}
