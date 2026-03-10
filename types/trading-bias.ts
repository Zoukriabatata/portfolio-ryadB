// ─── Trading Bias Types ──────────────────────────────────

export type BiasDirection = 'BUY' | 'SELL' | 'NEUTRAL';
export type TradeStyle    = 'CONTINUATION' | 'COUNTER_TREND' | 'RANGE_BOUND';
export type MarketRegime  = 'NEGATIVE_GEX' | 'POSITIVE_GEX' | 'NEUTRAL_GEX';

export interface GEXStreamData {
  netGex: number;
  zeroGamma: number;
  flowRatio: number;
  gexRatio: number;
  callIV: number;
  putIV: number;
  callWall: number;
  putWall: number;
  spotPrice: number;
  ticker: string;
  date: string;
  source: 'api' | 'manual' | 'cboe';
}

export interface OptionsFlowData {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;
  topCallWalls: StrikeWall[];
  topPutWalls: StrikeWall[];
  skewIndex: number;
}

export interface StrikeWall {
  strike: number;
  oi: number;
  gex: number;
}

export interface BiasSignal {
  name: string;
  value: string;
  direction: BiasDirection;
  weight: number;      // 0–100, used for bar width
  description: string; // short explanation
}

export interface TradingBias {
  direction: BiasDirection;
  tradeStyle: TradeStyle;
  regime: MarketRegime;
  confidence: number;      // 0–100
  signals: BiasSignal[];
  reasoning: string;       // AI-generated narrative
  entry: number | null;
  targets: number[];
  invalidation: number | null;
  score: number;           // raw weighted score -100 to +100
}
