/**
 * Volatility Smile/Skew Simulator
 *
 * Generates realistic simulated IV data for options
 * Used when API data is unavailable
 */

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

// Typical IV levels for different assets
const BASE_IV: Record<string, number> = {
  SPY: 0.18,
  QQQ: 0.22,
  IWM: 0.24,
  AAPL: 0.28,
  TSLA: 0.55,
  NVDA: 0.45,
  MSFT: 0.25,
  AMZN: 0.32,
  META: 0.38,
  DEFAULT: 0.25,
};

// Typical spot prices
const SPOT_PRICES: Record<string, number> = {
  SPY: 580,
  QQQ: 495,
  IWM: 225,
  AAPL: 195,
  TSLA: 285,
  NVDA: 875,
  MSFT: 425,
  AMZN: 185,
  META: 525,
};

/**
 * Generate a realistic volatility smile/skew
 */
export function generateVolatilitySkew(
  symbol: string,
  numStrikes: number = 25,
  daysToExpiration: number = 30
): SimulatedVolatilityData {
  const spotPrice = SPOT_PRICES[symbol] || 100 + Math.random() * 400;
  const baseIV = BASE_IV[symbol] || BASE_IV.DEFAULT;

  // Add some randomness to base IV
  const atmIV = baseIV * (0.9 + Math.random() * 0.2);

  // Calculate strike range (typically ±20% from spot)
  const strikeMin = spotPrice * 0.8;
  const strikeMax = spotPrice * 1.2;
  const strikeStep = (strikeMax - strikeMin) / numStrikes;

  const skewData: SimulatedIVPoint[] = [];

  // Skew parameters (puts typically have higher IV - "volatility smirk")
  const skewSteepness = 0.1 + Math.random() * 0.1; // How steep the put side is
  const smileConvexity = 0.02 + Math.random() * 0.03; // Smile curvature
  const termFactor = Math.sqrt(daysToExpiration / 30); // IV term adjustment

  for (let i = 0; i <= numStrikes; i++) {
    const strike = strikeMin + i * strikeStep;
    const moneyness = strike / spotPrice;
    const logMoneyness = Math.log(moneyness);

    // Volatility smile formula:
    // IV = ATM_IV * (1 + skew * ln(K/S) + convexity * ln(K/S)²)
    const skewTerm = -skewSteepness * logMoneyness; // Negative for put skew
    const convexityTerm = smileConvexity * logMoneyness * logMoneyness;

    const baseStrikeIV = atmIV * (1 + skewTerm + convexityTerm) * termFactor;

    // Calls and puts have slightly different IVs (put-call parity isn't perfect)
    const callIV = baseStrikeIV * (moneyness > 1 ? 1 : 0.98 + Math.random() * 0.04);
    const putIV = baseStrikeIV * (moneyness < 1 ? 1 : 0.98 + Math.random() * 0.04);

    skewData.push({
      strike: Math.round(strike * 2) / 2, // Round to nearest 0.5
      callIV: Math.max(0.05, callIV), // IV floor at 5%
      putIV: Math.max(0.05, putIV),
      moneyness: Math.round(moneyness * 1000) / 1000,
    });
  }

  // Generate term structure (IV for different expirations)
  const termStructure = [7, 14, 21, 30, 45, 60, 90, 120, 180, 365].map(expDays => ({
    expDays,
    atmIV: atmIV * Math.sqrt(30 / expDays) * (0.85 + Math.random() * 0.3),
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
