/**
 * BLACK-SCHOLES GREEKS ESTIMATION
 *
 * Estimates option Greeks (Delta, Gamma, Vanna, Charm) using Black-Scholes model.
 * Used when data sources don't provide higher-order Greeks.
 *
 * Formulas:
 *   d1 = (ln(S/K) + (r + σ²/2)T) / (σ√T)
 *   d2 = d1 - σ√T
 *
 *   Delta  = N(d1)       for calls,  N(d1) - 1 for puts
 *   Gamma  = N'(d1) / (S × σ × √T)
 *   Vanna  = -N'(d1) × d2 / σ          (∂Delta/∂σ)
 *   Charm  = -N'(d1) × (2rT - d2σ√T) / (2Tσ√T)   (∂Delta/∂t)
 */

import type { MultiGreekData, MultiGreekSummary } from '@/types/options';

// Standard normal PDF
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF (Abramowitz & Stegun approximation)
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1 + sign * y);
}

export interface GreekEstimates {
  delta: number;
  gamma: number;
  vanna: number;
  charm: number;
}

/**
 * Estimate all Greeks for a single option using Black-Scholes
 *
 * @param S  - Spot price
 * @param K  - Strike price
 * @param T  - Time to expiration in years (must be > 0)
 * @param sigma - Implied volatility (annualized, e.g. 0.30 = 30%)
 * @param r  - Risk-free rate (annualized, e.g. 0.05 = 5%)
 * @param type - 'call' or 'put'
 */
export function estimateGreeks(
  S: number,
  K: number,
  T: number,
  sigma: number,
  r: number,
  type: 'call' | 'put'
): GreekEstimates {
  // Guard against zero/negative time or volatility
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, vanna: 0, charm: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const sigSqrtT = sigma * sqrtT;

  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / sigSqrtT;
  const d2 = d1 - sigSqrtT;

  const nd1 = normPdf(d1); // N'(d1)

  // Delta
  const delta = type === 'call' ? normCdf(d1) : normCdf(d1) - 1;

  // Gamma = N'(d1) / (S × σ × √T)
  const gamma = nd1 / (S * sigSqrtT);

  // Vanna = -N'(d1) × d2 / σ  (sensitivity of delta to vol)
  const vanna = -nd1 * d2 / sigma;

  // Charm = -N'(d1) × (2rT - d2σ√T) / (2Tσ√T)  (delta decay)
  const charm = -nd1 * (2 * r * T - d2 * sigSqrtT) / (2 * T * sigSqrtT);

  return { delta, gamma, vanna, charm };
}

export interface OptionInput {
  strike: number;
  expiration: number; // Unix timestamp
  optionType: 'call' | 'put';
  openInterest: number;
  impliedVolatility: number; // Annualized, e.g. 0.30
  volume?: number;
}

/**
 * Calculate multi-Greek exposure for a set of options at a given spot price
 *
 * Returns per-strike aggregated data: GEX, VEX, CEX, DEX
 *
 * GEX = Gamma × OI × Spot² × 0.01 × 100  (per contract, sign: + for calls, - for puts)
 * VEX = Vanna × OI × Spot × IV
 * CEX = Charm × OI × Spot
 * DEX = Delta × OI × Spot × 0.01
 */
export function calculateMultiGreekExposure(
  options: OptionInput[],
  spotPrice: number,
  riskFreeRate: number = 0.05
): Map<number, MultiGreekData> {
  const byStrike = new Map<number, MultiGreekData>();
  const now = Date.now() / 1000; // Current time in seconds

  for (const opt of options) {
    // Time to expiration in years
    const T = Math.max((opt.expiration - now) / (365.25 * 24 * 3600), 1 / 365); // Min 1 day
    const sigma = opt.impliedVolatility;

    const greeks = estimateGreeks(spotPrice, opt.strike, T, sigma, riskFreeRate, opt.optionType);

    // Get or create strike entry
    if (!byStrike.has(opt.strike)) {
      byStrike.set(opt.strike, {
        strike: opt.strike,
        gex: 0,
        vex: 0,
        cex: 0,
        dex: 0,
        callOI: 0,
        putOI: 0,
        callIV: 0,
        putIV: 0,
      });
    }
    const entry = byStrike.get(opt.strike)!;

    const oi = opt.openInterest;
    const sign = opt.optionType === 'call' ? 1 : -1;

    // GEX: gamma × OI × spot² × 0.01 × contractMultiplier(100)
    entry.gex += sign * greeks.gamma * oi * spotPrice * spotPrice * 0.01 * 100;

    // VEX: vanna × OI × spot × IV (sign convention: calls positive, puts negative)
    entry.vex += sign * greeks.vanna * oi * spotPrice * sigma;

    // CEX: charm × OI × spot
    entry.cex += sign * greeks.charm * oi * spotPrice;

    // DEX: delta × OI × spot × 0.01
    entry.dex += greeks.delta * oi * spotPrice * 0.01;

    // Track OI and IV per side
    if (opt.optionType === 'call') {
      entry.callOI += oi;
      // Weighted IV (will normalize later)
      entry.callIV = sigma;
    } else {
      entry.putOI += oi;
      entry.putIV = sigma;
    }
  }

  return byStrike;
}

/**
 * Calculate summary metrics from multi-Greek data
 */
export function calculateMultiGreekSummary(
  data: MultiGreekData[],
  spotPrice: number,
  history?: { netGEX: number[] }
): MultiGreekSummary {
  let netGEX = 0, netVEX = 0, netCEX = 0, netDEX = 0;
  let maxCallGEX = 0, callWallStrike = spotPrice;
  let maxPutGEX = 0, putWallStrike = spotPrice;
  let totalCallOI = 0, totalPutOI = 0;

  // Max pain calculation
  const strikes: number[] = [];

  for (const d of data) {
    netGEX += d.gex;
    netVEX += d.vex;
    netCEX += d.cex;
    netDEX += d.dex;
    totalCallOI += d.callOI;
    totalPutOI += d.putOI;
    strikes.push(d.strike);

    // Call wall = strike with highest positive GEX
    if (d.gex > 0 && d.callOI > 0 && d.gex > maxCallGEX) {
      maxCallGEX = d.gex;
      callWallStrike = d.strike;
    }
    // Put wall = strike with most negative GEX
    if (d.gex < 0 && d.putOI > 0 && Math.abs(d.gex) > maxPutGEX) {
      maxPutGEX = Math.abs(d.gex);
      putWallStrike = d.strike;
    }
  }

  // Zero gamma level (cumulative GEX cross)
  const sorted = [...data].sort((a, b) => a.strike - b.strike);
  let cumGEX = 0;
  let zeroGammaLevel = spotPrice;

  for (let i = 0; i < sorted.length; i++) {
    const prev = cumGEX;
    cumGEX += sorted[i].gex;

    if (prev * cumGEX < 0 && i > 0) {
      // Linear interpolation
      const ratio = Math.abs(prev) / (Math.abs(prev) + Math.abs(cumGEX));
      zeroGammaLevel = sorted[i - 1].strike + ratio * (sorted[i].strike - sorted[i - 1].strike);
      break;
    }
  }

  // Max pain: strike where total OI loss is minimum
  let maxPain = spotPrice;
  let minPain = Infinity;

  for (const testStrike of strikes) {
    let totalPain = 0;
    for (const d of data) {
      // Call loss
      if (testStrike > d.strike) {
        totalPain += (testStrike - d.strike) * d.callOI;
      }
      // Put loss
      if (testStrike < d.strike) {
        totalPain += (d.strike - testStrike) * d.putOI;
      }
    }
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPain = testStrike;
    }
  }

  // Implied move from ATM straddle (simplified)
  const atmData = sorted.reduce((closest, d) =>
    Math.abs(d.strike - spotPrice) < Math.abs(closest.strike - spotPrice) ? d : closest
  , sorted[0]);
  const avgATMIV = (atmData.callIV + atmData.putIV) / 2 || 0.25;
  const impliedMove = spotPrice * avgATMIV * Math.sqrt(7 / 365); // 7-day implied move

  // Regime
  const regime = spotPrice >= zeroGammaLevel ? 'positive' as const : 'negative' as const;

  // Gamma intensity (percentile vs history)
  let gammaIntensity = 50;
  if (history && history.netGEX.length > 2) {
    const sorted2 = [...history.netGEX].sort((a, b) => a - b);
    const idx = sorted2.findIndex(v => v >= Math.abs(netGEX));
    gammaIntensity = (idx >= 0 ? idx : sorted2.length) / sorted2.length * 100;
  }

  return {
    netGEX, netVEX, netCEX, netDEX,
    zeroGammaLevel,
    callWall: callWallStrike,
    putWall: putWallStrike,
    maxPain,
    impliedMove,
    regime,
    gammaIntensity,
    netFlow: 0,
    flowRatio: 1,
    gexRatio: 0,
    callIV: 0,
    putIV: 0,
    ivSkew: 0,
  };
}

/**
 * Aggregate multi-Greek data across multiple expirations
 */
export function aggregateAcrossExpirations(
  allOptions: OptionInput[],
  spotPrice: number,
  riskFreeRate: number = 0.05
): { byStrike: MultiGreekData[]; byExpiration: Map<number, MultiGreekData[]> } {
  // Group by expiration
  const byExp = new Map<number, OptionInput[]>();
  for (const opt of allOptions) {
    if (!byExp.has(opt.expiration)) byExp.set(opt.expiration, []);
    byExp.get(opt.expiration)!.push(opt);
  }

  // Calculate per-expiration
  const byExpiration = new Map<number, MultiGreekData[]>();
  for (const [exp, opts] of byExp) {
    const expData = calculateMultiGreekExposure(opts, spotPrice, riskFreeRate);
    byExpiration.set(exp, Array.from(expData.values()).sort((a, b) => a.strike - b.strike));
  }

  // Aggregate all into single strike map
  const totalByStrike = calculateMultiGreekExposure(allOptions, spotPrice, riskFreeRate);
  const byStrike = Array.from(totalByStrike.values()).sort((a, b) => a.strike - b.strike);

  return { byStrike, byExpiration };
}
