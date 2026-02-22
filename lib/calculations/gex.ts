import type { OptionData, GEXData, GEXSummary } from '@/types/options';

/**
 * GEX (Gamma Exposure) Calculation
 *
 * Formula: GEX = Gamma × Open Interest × Spot Price² × 0.01 × Contract Multiplier
 *
 * For crypto options on Deribit:
 * - Contract multiplier is typically 1 BTC or 1 ETH
 * - Calls contribute positive GEX (dealers are short gamma)
 * - Puts contribute negative GEX (dealers are long gamma)
 *
 * When dealers are short gamma (positive GEX):
 * - They buy on dips and sell on rallies (stabilizing)
 *
 * When dealers are long gamma (negative GEX):
 * - They sell on dips and buy on rallies (amplifying moves)
 */

const CONTRACT_MULTIPLIER = 1; // 1 BTC or 1 ETH per contract

/**
 * Calculate GEX for a single option
 */
export function calculateOptionGEX(
  gamma: number,
  openInterest: number,
  spotPrice: number,
  optionType: 'call' | 'put'
): number {
  const rawGEX = gamma * openInterest * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;

  // Calls = positive GEX, Puts = negative GEX
  return optionType === 'call' ? rawGEX : -rawGEX;
}

/**
 * Calculate GEX for all options and aggregate by strike
 */
export function calculateGEXByStrike(
  options: OptionData[],
  spotPrice: number
): Map<number, GEXData> {
  const gexByStrike = new Map<number, GEXData>();

  for (const option of options) {
    const { strike, optionType, greeks, openInterest } = option;
    const gamma = greeks?.gamma || 0;

    let data = gexByStrike.get(strike);
    if (!data) {
      data = {
        strike,
        callGEX: 0,
        putGEX: 0,
        netGEX: 0,
        callOI: 0,
        putOI: 0,
        callGamma: 0,
        putGamma: 0,
      };
      gexByStrike.set(strike, data);
    }

    const gex = calculateOptionGEX(gamma, openInterest, spotPrice, optionType);

    if (optionType === 'call') {
      data.callGEX += gex;
      data.callOI += openInterest;
      data.callGamma += gamma * openInterest;
    } else {
      data.putGEX += gex;
      data.putOI += openInterest;
      data.putGamma += gamma * openInterest;
    }

    data.netGEX = data.callGEX + data.putGEX;
  }

  return gexByStrike;
}

/**
 * Calculate GEX summary metrics
 */
export function calculateGEXSummary(
  gexByStrike: Map<number, GEXData>
): GEXSummary {
  let totalCallGEX = 0;
  let totalPutGEX = 0;
  let maxGammaStrike: number | null = null;
  let maxGammaValue = 0;
  let posGEXStrike: number | null = null;
  let maxPosGEX = 0;
  let negGEXStrike: number | null = null;
  let maxNegGEX = 0;

  for (const [strike, data] of gexByStrike) {
    totalCallGEX += data.callGEX;
    totalPutGEX += data.putGEX;

    // Track max gamma strike (highest absolute net GEX)
    const absNetGEX = Math.abs(data.netGEX);
    if (absNetGEX > maxGammaValue) {
      maxGammaValue = absNetGEX;
      maxGammaStrike = strike;
    }

    // Track highest positive GEX strike
    if (data.netGEX > maxPosGEX) {
      maxPosGEX = data.netGEX;
      posGEXStrike = strike;
    }

    // Track lowest negative GEX strike
    if (data.netGEX < maxNegGEX) {
      maxNegGEX = data.netGEX;
      negGEXStrike = strike;
    }
  }

  const netGEX = totalCallGEX + totalPutGEX;
  const gexRatio = totalPutGEX !== 0 ? Math.abs(totalCallGEX / totalPutGEX) : 0;

  // Calculate Zero Gamma Level (where cumulative GEX crosses zero)
  const zeroGammaLevel = findZeroGammaLevel(gexByStrike);

  return {
    totalCallGEX,
    totalPutGEX,
    netGEX,
    gexRatio,
    zeroGammaLevel,
    maxGammaStrike,
    posGEXStrike,
    negGEXStrike,
  };
}

/**
 * Find the Zero Gamma Level (HVL - High Volatility Level)
 *
 * This is the price level where cumulative GEX = 0
 * Above this level: positive gamma (stabilizing)
 * Below this level: negative gamma (amplifying)
 */
export function findZeroGammaLevel(
  gexByStrike: Map<number, GEXData>
): number | null {
  // Sort strikes
  const strikes = Array.from(gexByStrike.keys()).sort((a, b) => a - b);

  if (strikes.length < 2) return null;

  // Calculate cumulative GEX from low to high
  let cumulativeGEX = 0;
  let prevStrike = strikes[0];
  let prevCumulativeGEX = 0;

  for (const strike of strikes) {
    const data = gexByStrike.get(strike)!;
    cumulativeGEX += data.netGEX;

    // Check if we crossed zero
    if (prevCumulativeGEX * cumulativeGEX < 0) {
      // Linear interpolation to find exact crossing point
      const ratio = Math.abs(prevCumulativeGEX) / (Math.abs(prevCumulativeGEX) + Math.abs(cumulativeGEX));
      return prevStrike + ratio * (strike - prevStrike);
    }

    prevStrike = strike;
    prevCumulativeGEX = cumulativeGEX;
  }

  // If no crossing found, return null
  return null;
}

/**
 * Get GEX data sorted by strike for charting
 */
export function getGEXChartData(
  gexByStrike: Map<number, GEXData>
): GEXData[] {
  return Array.from(gexByStrike.values()).sort((a, b) => a.strike - b.strike);
}

/**
 * Normalize GEX values for display (in thousands or millions)
 */
export function formatGEX(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }

  return value.toFixed(2);
}
