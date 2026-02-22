/**
 * GEX SIMULATOR - Pro Edition
 *
 * Generates realistic simulated multi-Greek data for testing and visualization.
 * Features:
 * - Multi-Greek: GEX, VEX, CEX, DEX with Black-Scholes estimation
 * - Multi-expiration: 5 expirations with distinct profiles
 * - Historical snapshots: 30 point history for sparklines
 * - Regime changes: Realistic positive/negative gamma transitions
 */

import {
  calculateMultiGreekExposure,
  calculateMultiGreekSummary,
  type OptionInput,
} from '@/lib/calculations/greeks';
import { GEXHistoryBuffer } from '@/lib/calculations/gexHistory';
import type { MultiGreekData, MultiGreekSummary } from '@/types/options';
import { BASE_PRICES, BASE_IV, createSeededRNG, getTimeSeed } from '@/lib/simulation/constants';

// ─── Legacy types (kept for backward compatibility with existing charts) ───

export interface SimulatedGEXLevel {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

export interface SimulatedGEXSummary {
  netGEX: number;
  totalCallGEX: number;
  totalPutGEX: number;
  callWall: number;
  putWall: number;
  zeroGamma: number;
  maxGamma: number;
  gammaFlip: number;
  hvl: number;
  regime: 'positive' | 'negative';
}

// ─── New Pro types ───

export interface SimulatedMultiGreekResult {
  data: MultiGreekData[];
  summary: MultiGreekSummary;
  spotPrice: number;
  options: OptionInput[];
  byExpiration: Map<number, MultiGreekData[]>;
  history: GEXHistoryBuffer;
  totalCallOI: number;
  totalPutOI: number;
}

// Re-export from shared constants for backward compat
const SYMBOL_BASE_PRICES = BASE_PRICES;
const SYMBOL_BASE_IV = BASE_IV;

/**
 * Generate simulated options chain with full Greeks
 */
function generateOptionsChain(
  symbol: string,
  spotPrice: number,
  expirationDays: number,
  expirationTimestamp: number,
  seed: number = 0,
): OptionInput[] {
  const basePrice = SYMBOL_BASE_PRICES[symbol] || 100;
  const baseIV = SYMBOL_BASE_IV[symbol] || 0.25;

  const strikeSpacing = basePrice < 100 ? 1 : basePrice < 200 ? 2.5 : basePrice < 500 ? 5 : 10;
  const numStrikes = 40;
  const startStrike = Math.floor((spotPrice - (numStrikes / 2) * strikeSpacing) / strikeSpacing) * strikeSpacing;

  const options: OptionInput[] = [];

  // Seeded pseudo-random for consistency
  const rng = (i: number) => {
    const x = Math.sin(seed * 9999 + i * 12345) * 43758.5453;
    return x - Math.floor(x);
  };

  // Term structure: shorter expirations have higher IV
  const termIVMultiplier = 1 + 0.3 * Math.exp(-expirationDays / 30);

  for (let i = 0; i < numStrikes; i++) {
    const strike = startStrike + i * strikeSpacing;
    const moneyness = (strike - spotPrice) / spotPrice;
    const atmDistance = Math.abs(moneyness);

    // IV smile: higher IV for OTM options
    const smile = 1 + atmDistance * 2.5 + atmDistance * atmDistance * 5;
    const iv = baseIV * smile * termIVMultiplier;

    // OI distribution - peaks at ATM, with random spikes at round numbers
    const isRoundNumber = strike % (strikeSpacing * 5) === 0;
    const oiMultiplier = Math.exp(-atmDistance * 8) * (0.5 + rng(i) * 0.5);
    const baseOI = (3000 + rng(i + 100) * 20000) * (isRoundNumber ? 2.5 : 1);

    // Call OI
    const callOI = Math.floor(baseOI * oiMultiplier * (moneyness > 0.02 ? 0.7 : 1.3));
    if (callOI > 0) {
      options.push({
        strike,
        expiration: expirationTimestamp,
        optionType: 'call',
        openInterest: callOI,
        impliedVolatility: iv,
        volume: Math.floor(callOI * (0.05 + rng(i + 200) * 0.15)),
      });
    }

    // Put OI
    const putOI = Math.floor(baseOI * oiMultiplier * (moneyness < -0.02 ? 0.7 : 1.3));
    if (putOI > 0) {
      options.push({
        strike,
        expiration: expirationTimestamp,
        optionType: 'put',
        openInterest: putOI,
        impliedVolatility: iv * (1 + 0.05), // Slight put skew
        volume: Math.floor(putOI * (0.05 + rng(i + 300) * 0.15)),
      });
    }
  }

  return options;
}

/**
 * Generate multi-expiration simulated GEX data with full Greeks
 *
 * @param symbol - ETF symbol (SPY, QQQ, etc.)
 * @param numExpirations - Number of expirations to generate
 * @param realSpotPrice - Real spot price from API (optional, uses seeded simulation if not provided)
 */
export function generateSimulatedMultiGreek(
  symbol: string,
  numExpirations: number = 5,
  realSpotPrice?: number,
): SimulatedMultiGreekResult {
  const basePrice = SYMBOL_BASE_PRICES[symbol] || 100;
  const rng = createSeededRNG(getTimeSeed(symbol));
  const spotPrice = realSpotPrice || basePrice * (0.98 + rng() * 0.04);

  // Generate 5 expirations (weekly, 2w, monthly, 2m, quarterly)
  const today = Date.now() / 1000;
  const expDays = [7, 14, 30, 60, 90];
  const allOptions: OptionInput[] = [];

  for (let i = 0; i < Math.min(numExpirations, expDays.length); i++) {
    const expTimestamp = today + expDays[i] * 86400;
    const opts = generateOptionsChain(symbol, spotPrice, expDays[i], expTimestamp, i);
    allOptions.push(...opts);
  }

  // Calculate multi-Greek exposures
  const totalByStrike = calculateMultiGreekExposure(allOptions, spotPrice);
  const data = Array.from(totalByStrike.values()).sort((a, b) => a.strike - b.strike);

  // Per-expiration breakdown
  const byExpiration = new Map<number, MultiGreekData[]>();
  const byExp = new Map<number, OptionInput[]>();
  for (const opt of allOptions) {
    if (!byExp.has(opt.expiration)) byExp.set(opt.expiration, []);
    byExp.get(opt.expiration)!.push(opt);
  }
  for (const [exp, opts] of byExp) {
    const expData = calculateMultiGreekExposure(opts, spotPrice);
    byExpiration.set(exp, Array.from(expData.values()).sort((a, b) => a.strike - b.strike));
  }

  // Totals
  let totalCallOI = 0, totalPutOI = 0;
  for (const d of data) {
    totalCallOI += d.callOI;
    totalPutOI += d.putOI;
  }

  const summary = calculateMultiGreekSummary(data, spotPrice);

  // Generate history (30 snapshots simulating evolution)
  const history = generateSimulatedHistory(symbol, spotPrice, summary, data, 30);

  return {
    data,
    summary,
    spotPrice,
    options: allOptions,
    byExpiration,
    history,
    totalCallOI,
    totalPutOI,
  };
}

/**
 * Generate simulated history with realistic drift and regime changes
 */
function generateSimulatedHistory(
  symbol: string,
  currentSpot: number,
  currentSummary: MultiGreekSummary,
  currentData: MultiGreekData[],
  numSnapshots: number,
): GEXHistoryBuffer {
  const history = new GEXHistoryBuffer();
  const now = Date.now();
  const rng = createSeededRNG(getTimeSeed(symbol) + 9999);

  // Walk backwards from current state with seeded drift
  let spot = currentSpot * (0.97 + rng() * 0.03);

  for (let i = 0; i < numSnapshots; i++) {
    const t = now - (numSnapshots - i) * 5 * 60 * 1000; // 5 min intervals

    // Evolve spot price with mean reversion
    const drift = (currentSpot - spot) * 0.1 + (rng() - 0.5) * currentSpot * 0.002;
    spot += drift;

    // Scale greeks proportionally to spot distance from current
    const spotRatio = spot / currentSpot;
    const noise = () => 0.85 + rng() * 0.3;

    const snapshotData: MultiGreekData[] = currentData.map(d => ({
      ...d,
      gex: d.gex * spotRatio * noise(),
      vex: d.vex * spotRatio * noise(),
      cex: d.cex * noise(),
      dex: d.dex * spotRatio * noise(),
    }));

    const snapshotSummary: MultiGreekSummary = {
      netGEX: currentSummary.netGEX * spotRatio * noise(),
      netVEX: currentSummary.netVEX * spotRatio * noise(),
      netCEX: currentSummary.netCEX * noise(),
      netDEX: currentSummary.netDEX * spotRatio * noise(),
      zeroGammaLevel: currentSummary.zeroGammaLevel * (0.998 + rng() * 0.004),
      callWall: currentSummary.callWall,
      putWall: currentSummary.putWall,
      maxPain: currentSummary.maxPain,
      impliedMove: currentSummary.impliedMove * noise(),
      regime: spot >= currentSummary.zeroGammaLevel ? 'positive' : 'negative',
      gammaIntensity: Math.max(0, Math.min(100, currentSummary.gammaIntensity + (rng() - 0.5) * 20)),
    };

    history.push({
      timestamp: t,
      summary: snapshotSummary,
      data: snapshotData,
      spotPrice: spot,
    });
  }

  // Push current state as latest
  history.push({
    timestamp: now,
    summary: currentSummary,
    data: currentData,
    spotPrice: currentSpot,
  });

  return history;
}

// ─── Legacy API (backward compatible) ───

/**
 * Generate simulated GEX data for a symbol (legacy format)
 */
export function generateSimulatedGEX(
  symbol: string,
  expirationDays: number = 7
): { gexData: SimulatedGEXLevel[]; summary: SimulatedGEXSummary; spotPrice: number } {
  const basePrice = SYMBOL_BASE_PRICES[symbol] || 100;
  const rng = createSeededRNG(getTimeSeed(symbol) + 7777);
  const spotPrice = basePrice * (0.98 + rng() * 0.04);

  const strikeSpacing = basePrice < 100 ? 1 : basePrice < 200 ? 2.5 : basePrice < 500 ? 5 : 10;
  const numStrikes = 40;
  const startStrike = Math.floor((spotPrice - (numStrikes / 2) * strikeSpacing) / strikeSpacing) * strikeSpacing;

  const gexData: SimulatedGEXLevel[] = [];
  let totalCallGEX = 0, totalPutGEX = 0;
  let maxCallGEX = 0, maxCallGEXStrike = spotPrice;
  let maxPutGEX = 0, maxPutGEXStrike = spotPrice;

  const timeFactor = Math.sqrt(expirationDays / 30);

  for (let i = 0; i < numStrikes; i++) {
    const strike = startStrike + i * strikeSpacing;
    const moneyness = (strike - spotPrice) / spotPrice;
    const atmDistance = Math.abs(moneyness);
    const oiMultiplier = Math.exp(-atmDistance * 10) * (0.5 + rng() * 0.5);
    const isRoundNumber = strike % (strikeSpacing * 5) === 0;
    const baseOI = (5000 + rng() * 15000) * (isRoundNumber ? 2 : 1);

    const callOI = Math.floor(baseOI * oiMultiplier * (moneyness > 0 ? 0.8 : 1.2));
    const putOI = Math.floor(baseOI * oiMultiplier * (moneyness < 0 ? 0.8 : 1.2));

    const gamma = Math.exp(-atmDistance * atmDistance * 50) * timeFactor * 0.01;
    const callGEX = gamma * callOI * 100 * spotPrice * spotPrice / 1e9;
    const putGEX = -gamma * putOI * 100 * spotPrice * spotPrice / 1e9;
    const netGEX = callGEX + putGEX;

    totalCallGEX += callGEX;
    totalPutGEX += putGEX;

    if (callGEX > maxCallGEX) { maxCallGEX = callGEX; maxCallGEXStrike = strike; }
    if (Math.abs(putGEX) > Math.abs(maxPutGEX)) { maxPutGEX = putGEX; maxPutGEXStrike = strike; }

    gexData.push({
      strike, callGEX, putGEX, netGEX, callOI, putOI,
      callVolume: Math.floor(callOI * (0.05 + rng() * 0.15)),
      putVolume: Math.floor(putOI * (0.05 + rng() * 0.15)),
    });
  }

  let cumulativeGEX = 0, zeroGammaLevel = spotPrice;
  for (let i = 0; i < gexData.length; i++) {
    const prevCum = cumulativeGEX;
    cumulativeGEX += gexData[i].netGEX;
    if ((prevCum < 0 && cumulativeGEX >= 0) || (prevCum >= 0 && cumulativeGEX < 0)) {
      zeroGammaLevel = gexData[i].strike;
      break;
    }
  }

  const netGEX = totalCallGEX + totalPutGEX;
  const regime = spotPrice >= zeroGammaLevel ? 'positive' : 'negative';

  return {
    gexData,
    summary: {
      netGEX, totalCallGEX, totalPutGEX,
      callWall: maxCallGEXStrike, putWall: maxPutGEXStrike,
      zeroGamma: zeroGammaLevel, maxGamma: maxCallGEXStrike,
      gammaFlip: zeroGammaLevel, hvl: zeroGammaLevel, regime,
    },
    spotPrice,
  };
}

/**
 * Generate fake expiration dates (next 10 Fridays)
 */
export function generateSimulatedExpirations(): number[] {
  const expirations: number[] = [];
  const today = new Date();
  let current = new Date(today);
  current.setDate(current.getDate() + ((5 - current.getDay() + 7) % 7 || 7));

  for (let i = 0; i < 10; i++) {
    expirations.push(Math.floor(current.getTime() / 1000));
    current.setDate(current.getDate() + 7);
  }
  return expirations;
}
