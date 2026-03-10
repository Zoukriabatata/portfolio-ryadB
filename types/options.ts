export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionData {
  instrumentName: string;
  strike: number;
  expiration: string;
  expirationTimestamp: number;
  optionType: 'call' | 'put';
  markPrice: number;
  markIV: number;
  bidIV: number;
  askIV: number;
  underlyingPrice: number;
  openInterest: number;
  volume: number;
  greeks: Greeks;
}

export interface OptionsChain {
  expiration: string;
  expirationTimestamp: number;
  calls: OptionData[];
  puts: OptionData[];
}

export interface GEXData {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callGamma: number;
  putGamma: number;
}

export interface GEXSummary {
  totalCallGEX: number;
  totalPutGEX: number;
  netGEX: number;
  gexRatio: number; // totalCallGEX / totalPutGEX
  zeroGammaLevel: number | null;
  maxGammaStrike: number | null;
  posGEXStrike: number | null;
  negGEXStrike: number | null;
}

export interface VolatilitySkewPoint {
  strike: number;
  callIV: number | null;
  putIV: number | null;
  moneyness: number; // strike / spotPrice
}

// Crypto options (Deribit)
export type Currency = 'BTC' | 'ETH';

// Equity/Index symbol labels (simulation)
export type EquitySymbol = 'SPY' | 'QQQ' | 'TSLA' | 'NVDA' | 'AAPL';

// Equity option data (simulation)
export interface EquityOptionData {
  strike: number;
  expiration: number; // Unix timestamp
  optionType: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  contractSymbol: string;
}

// ─── Multi-Greek Exposure Types ──────────────────────────────

/** Per-strike multi-Greek exposure data */
export interface MultiGreekData {
  strike: number;
  gex: number;      // Gamma Exposure ($)
  vex: number;      // Vanna Exposure
  cex: number;      // Charm Exposure
  dex: number;      // Delta Exposure
  callOI: number;
  putOI: number;
  callIV: number;   // Call implied volatility
  putIV: number;    // Put implied volatility
}

/** Summary metrics for the full options chain */
export interface MultiGreekSummary {
  netGEX: number;
  netVEX: number;
  netCEX: number;
  netDEX: number;
  zeroGammaLevel: number;
  callWall: number;    // Strike with highest call GEX
  putWall: number;     // Strike with most negative put GEX
  maxPain: number;     // Strike where options expire max worthless
  impliedMove: number; // Expected move from ATM straddle
  regime: 'positive' | 'negative';
  gammaIntensity: number; // 0-100 percentile vs history
  // GEXStream metrics
  netFlow: number;     // Net premium flow: (call$ - put$) × multiplier
  flowRatio: number;   // Call volume / put volume
  gexRatio: number;    // |callGEX / putGEX|
  callIV: number;      // ATM call IV (decimal, e.g. 0.25 = 25%)
  putIV: number;       // ATM put IV (decimal)
  ivSkew: number;      // Put IV - Call IV (percentage points)
}

/** A point-in-time snapshot for history tracking */
export interface GEXSnapshot {
  timestamp: number;
  summary: MultiGreekSummary;
  data: MultiGreekData[];
  spotPrice: number;
}

/** Greek type selector for UI */
export type GreekType = 'gex' | 'vex' | 'cex' | 'dex';

/** Labels and metadata for each Greek type */
export const GREEK_META: Record<GreekType, {
  label: string;
  symbol: string;
  fullName: string;
  description: string;
  color: string;
}> = {
  gex: { label: 'GEX', symbol: 'Γ', fullName: 'Gamma Exposure', description: 'Dealer gamma hedging pressure', color: '#22c55e' },
  vex: { label: 'VEX', symbol: 'ν', fullName: 'Vanna Exposure', description: 'Sensitivity of delta to volatility', color: '#8b5cf6' },
  cex: { label: 'CEX', symbol: 'θ', fullName: 'Charm Exposure', description: 'Delta decay over time', color: '#f59e0b' },
  dex: { label: 'DEX', symbol: 'Δ', fullName: 'Delta Exposure', description: 'Directional dealer exposure', color: '#3b82f6' },
};
