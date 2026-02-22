/**
 * Volatility Smile/Skew Simulator
 *
 * Generates realistic simulated IV data for options
 * Used when API data is unavailable
 */

import { BASE_PRICES, BASE_IV as SHARED_BASE_IV, createSeededRNG, getTimeSeed } from '@/lib/simulation/constants';

export interface SimulatedIVPoint {
  strike: number;
  callIV: number;
  putIV: number;
  moneyness: number;
}

export interface SimulatedVolatilityData {
  symbol: string;
  spotPrice: number;
  atmIV: number;
  skewData: SimulatedIVPoint[];
  termStructure: { expDays: number; atmIV: number }[];
}

// Use shared constants
const SYMBOL_BASE_IV = SHARED_BASE_IV;
const SPOT_PRICES = BASE_PRICES;

/**
 * Generate a realistic volatility smile/skew
 *
 * @param symbol - ETF symbol
 * @param numStrikes - Number of strikes to generate
 * @param daysToExpiration - Days to expiration for the smile
 * @param realSpotPrice - Real spot price from API (optional)
 */
export function generateVolatilitySkew(
  symbol: string,
  numStrikes: number = 25,
  daysToExpiration: number = 30,
  realSpotPrice?: number,
): SimulatedVolatilityData {
  const rng = createSeededRNG(getTimeSeed(symbol) + 5555);
  const spotPrice = realSpotPrice || SPOT_PRICES[symbol] || 100 + rng() * 400;
  const baseIV = SYMBOL_BASE_IV[symbol] || SYMBOL_BASE_IV.DEFAULT;

  // Seeded randomness for base IV
  const atmIV = baseIV * (0.9 + rng() * 0.2);

  // Calculate strike range (typically ±20% from spot)
  const strikeMin = spotPrice * 0.8;
  const strikeMax = spotPrice * 1.2;
  const strikeStep = (strikeMax - strikeMin) / numStrikes;

  const skewData: SimulatedIVPoint[] = [];

  // Skew parameters (puts typically have higher IV - "volatility smirk")
  const skewSteepness = 0.1 + rng() * 0.1;
  const smileConvexity = 0.02 + rng() * 0.03;
  const termFactor = Math.sqrt(daysToExpiration / 30);

  for (let i = 0; i <= numStrikes; i++) {
    const strike = strikeMin + i * strikeStep;
    const moneyness = strike / spotPrice;
    const logMoneyness = Math.log(moneyness);

    const skewTerm = -skewSteepness * logMoneyness;
    const convexityTerm = smileConvexity * logMoneyness * logMoneyness;

    const baseStrikeIV = atmIV * (1 + skewTerm + convexityTerm) * termFactor;

    const callIV = baseStrikeIV * (moneyness > 1 ? 1 : 0.98 + rng() * 0.04);
    const putIV = baseStrikeIV * (moneyness < 1 ? 1 : 0.98 + rng() * 0.04);

    skewData.push({
      strike: Math.round(strike * 2) / 2,
      callIV: Math.max(0.05, callIV),
      putIV: Math.max(0.05, putIV),
      moneyness: Math.round(moneyness * 1000) / 1000,
    });
  }

  // Generate term structure (IV for different expirations)
  const termStructure = [7, 14, 21, 30, 45, 60, 90, 120, 180, 365].map(expDays => ({
    expDays,
    atmIV: atmIV * Math.sqrt(30 / expDays) * (0.85 + rng() * 0.3),
  }));

  return {
    symbol,
    spotPrice,
    atmIV,
    skewData,
    termStructure,
  };
}

/**
 * Generate simulated expirations
 */
export function generateSimulatedExpirations(): number[] {
  const now = Date.now();
  const expirations: number[] = [];

  // Weekly expirations for next 4 weeks
  for (let i = 1; i <= 4; i++) {
    const friday = getNextFriday(now, i);
    expirations.push(Math.floor(friday / 1000));
  }

  // Monthly expirations for next 6 months
  for (let i = 1; i <= 6; i++) {
    const thirdFriday = getThirdFriday(now, i);
    if (!expirations.includes(Math.floor(thirdFriday / 1000))) {
      expirations.push(Math.floor(thirdFriday / 1000));
    }
  }

  return expirations.sort((a, b) => a - b);
}

function getNextFriday(from: number, weeksAhead: number): number {
  const date = new Date(from);
  const dayOfWeek = date.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilFriday + (weeksAhead - 1) * 7);
  date.setHours(16, 0, 0, 0); // 4 PM ET
  return date.getTime();
}

function getThirdFriday(from: number, monthsAhead: number): number {
  const date = new Date(from);
  date.setMonth(date.getMonth() + monthsAhead);
  date.setDate(1);

  // Find first Friday
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() + 1);
  }

  // Add 2 weeks for third Friday
  date.setDate(date.getDate() + 14);
  date.setHours(16, 0, 0, 0);
  return date.getTime();
}

/**
 * Generate IV surface data (for 3D visualization)
 */
export function generateIVSurface(
  symbol: string,
  numStrikes: number = 20,
  numExpirations: number = 8
): { strike: number; expDays: number; iv: number }[][] {
  const expirations = [7, 14, 21, 30, 45, 60, 90, 120];
  const surface: { strike: number; expDays: number; iv: number }[][] = [];

  expirations.slice(0, numExpirations).forEach(expDays => {
    const { skewData } = generateVolatilitySkew(symbol, numStrikes, expDays);
    surface.push(
      skewData.map(point => ({
        strike: point.strike,
        expDays,
        iv: (point.callIV + point.putIV) / 2,
      }))
    );
  });

  return surface;
}
