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

// Equity/Index options (Yahoo Finance via yahoo-finance2)
export type EquitySymbol = 'SPY' | 'QQQ';

// Equity option from Yahoo Finance
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

export interface YahooOption {
  strike: number;
  expiration: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  contractSymbol: string;
}
