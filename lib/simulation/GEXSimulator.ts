/**
 * GEX SIMULATOR
 *
 * Generates realistic simulated GEX data for testing and visualization
 * when Yahoo Finance API is unavailable or for demo purposes.
 */

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

// Base prices for different symbols
const SYMBOL_BASE_PRICES: Record<string, number> = {
  SPY: 585,
  QQQ: 505,
  IWM: 225,
  DIA: 425,
  AAPL: 185,
  TSLA: 245,
  NVDA: 875,
  MSFT: 415,
  AMZN: 185,
  META: 505,
};

/**
 * Generate simulated GEX data for a symbol
 */
export function generateSimulatedGEX(
  symbol: string,
  expirationDays: number = 7
): { gexData: SimulatedGEXLevel[]; summary: SimulatedGEXSummary; spotPrice: number } {
  const basePrice = SYMBOL_BASE_PRICES[symbol] || 100;

  // Add some random variation to spot price
  const spotPrice = basePrice * (0.98 + Math.random() * 0.04);

  // Generate strikes around the spot price
  const strikeSpacing = basePrice < 100 ? 1 : basePrice < 200 ? 2.5 : basePrice < 500 ? 5 : 10;
  const numStrikes = 40;
  const startStrike = Math.floor((spotPrice - (numStrikes / 2) * strikeSpacing) / strikeSpacing) * strikeSpacing;

  const gexData: SimulatedGEXLevel[] = [];

  let totalCallGEX = 0;
  let totalPutGEX = 0;
  let maxCallGEX = 0;
  let maxCallGEXStrike = spotPrice;
  let maxPutGEX = 0;
  let maxPutGEXStrike = spotPrice;

  // Time decay factor based on days to expiration
  const timeFactor = Math.sqrt(expirationDays / 30);

  for (let i = 0; i < numStrikes; i++) {
    const strike = startStrike + i * strikeSpacing;
    const moneyness = (strike - spotPrice) / spotPrice;

    // OI distribution - peaks at ATM, decreases with distance
    const atmDistance = Math.abs(moneyness);
    const oiMultiplier = Math.exp(-atmDistance * 10) * (0.5 + Math.random() * 0.5);

    // Base OI (higher for popular strikes like round numbers)
    const isRoundNumber = strike % (strikeSpacing * 5) === 0;
    const baseOI = (5000 + Math.random() * 15000) * (isRoundNumber ? 2 : 1);

    // Call OI - more OTM calls have lower OI
    const callOI = Math.floor(baseOI * oiMultiplier * (moneyness > 0 ? 0.8 : 1.2));

    // Put OI - more OTM puts have lower OI
    const putOI = Math.floor(baseOI * oiMultiplier * (moneyness < 0 ? 0.8 : 1.2));

    // Gamma calculation (simplified Black-Scholes gamma approximation)
    const gamma = Math.exp(-atmDistance * atmDistance * 50) * timeFactor * 0.01;

    // GEX = Gamma × OI × 100 × Spot²
    const callGEX = gamma * callOI * 100 * spotPrice * spotPrice / 1e9;
    const putGEX = -gamma * putOI * 100 * spotPrice * spotPrice / 1e9;

    const netGEX = callGEX + putGEX;

    totalCallGEX += callGEX;
    totalPutGEX += putGEX;

    if (callGEX > maxCallGEX) {
      maxCallGEX = callGEX;
      maxCallGEXStrike = strike;
    }
    if (Math.abs(putGEX) > Math.abs(maxPutGEX)) {
      maxPutGEX = putGEX;
      maxPutGEXStrike = strike;
    }

    // Volume (random but correlated with OI)
    const callVolume = Math.floor(callOI * (0.05 + Math.random() * 0.15));
    const putVolume = Math.floor(putOI * (0.05 + Math.random() * 0.15));

    gexData.push({
      strike,
      callGEX,
      putGEX,
      netGEX,
      callOI,
      putOI,
      callVolume,
      putVolume,
    });
  }

  // Find zero gamma level
  let cumulativeGEX = 0;
  let zeroGammaLevel = spotPrice;

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

  const summary: SimulatedGEXSummary = {
    netGEX,
    totalCallGEX,
    totalPutGEX,
    callWall: maxCallGEXStrike,
    putWall: maxPutGEXStrike,
    zeroGamma: zeroGammaLevel,
    maxGamma: maxCallGEXStrike,
    gammaFlip: zeroGammaLevel,
    hvl: zeroGammaLevel,
    regime,
  };

  return { gexData, summary, spotPrice };
}

/**
 * Generate fake expiration dates (next 10 Fridays)
 */
export function generateSimulatedExpirations(): number[] {
  const expirations: number[] = [];
  const today = new Date();

  // Find next Friday
  let current = new Date(today);
  current.setDate(current.getDate() + ((5 - current.getDay() + 7) % 7 || 7));

  for (let i = 0; i < 10; i++) {
    expirations.push(Math.floor(current.getTime() / 1000));
    current.setDate(current.getDate() + 7);
  }

  return expirations;
}
