export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface VolumeAtPrice {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
}

export interface FootprintCandle extends Candle {
  levels: FootprintLevel[];
  totalDelta: number;
  poc: number; // Point of Control (price with most volume)
}

export type Timeframe = '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// Futures symbols
export type Symbol =
  // Crypto Futures (Binance/Bybit) - Real-time data available FREE
  | 'BTCUSDT'   // Bitcoin
  | 'ETHUSDT'   // Ethereum
  | 'SOLUSDT'   // Solana
  | 'BNBUSDT'   // BNB
  | 'XRPUSDT'   // XRP
  | 'DOGEUSDT'  // Doge
  | 'ARBUSDT'   // Arbitrum
  | 'SUIUSDT'   // Sui
  | 'AVAXUSDT'  // Avalanche
  | 'LINKUSDT'  // Chainlink
  | 'btcusdt'   // lowercase variant
  // CME Index Futures
  | 'NQ' | 'MNQ'   // E-mini / Micro Nasdaq
  | 'ES' | 'MES'   // E-mini / Micro S&P 500
  | 'YM' | 'MYM'   // E-mini / Micro Dow Jones
  | 'RTY' | 'M2K'  // E-mini / Micro Russell 2000
  // CME Energy Futures (NYMEX)
  | 'CL' | 'QM' | 'MCL'  // Crude Oil WTI
  | 'NG'                  // Natural Gas
  | 'RB'                  // RBOB Gasoline
  | 'HO'                  // Heating Oil
  // CME Metals (COMEX/NYMEX)
  | 'GC' | 'MGC'   // Gold / Micro Gold
  | 'SI' | 'SIL'   // Silver / Micro Silver
  | 'HG'           // Copper
  | 'PL'           // Platinum
  // CME Rates / Bonds (CBOT)
  | 'ZB' | 'ZN' | 'ZF' | 'ZT'
  // CME FX Futures
  | '6E' | '6J' | '6B' | '6A' | '6C' | '6S' | '6N'
  // CME Crypto Futures
  | 'BTC_CME' | 'MBT' | 'ETH_CME' | 'MET';

export type Exchange = 'binance' | 'bybit' | 'tradovate';

export interface SymbolInfo {
  symbol: Symbol;
  name: string;
  exchange: Exchange;
  tickSize: number;
  type: 'futures';
}

export const SYMBOLS: Record<Symbol, SymbolInfo> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRYPTO FUTURES (Binance) - Real-time data available FREE
  // ═══════════════════════════════════════════════════════════════════════════
  BTCUSDT:  { symbol: 'BTCUSDT',  name: 'BTC Perpetual',  exchange: 'binance', tickSize: 0.1,     type: 'futures' },
  ETHUSDT:  { symbol: 'ETHUSDT',  name: 'ETH Perpetual',  exchange: 'binance', tickSize: 0.01,    type: 'futures' },
  SOLUSDT:  { symbol: 'SOLUSDT',  name: 'SOL Perpetual',  exchange: 'binance', tickSize: 0.001,   type: 'futures' },
  BNBUSDT:  { symbol: 'BNBUSDT',  name: 'BNB Perpetual',  exchange: 'binance', tickSize: 0.01,    type: 'futures' },
  XRPUSDT:  { symbol: 'XRPUSDT',  name: 'XRP Perpetual',  exchange: 'binance', tickSize: 0.0001,  type: 'futures' },
  DOGEUSDT: { symbol: 'DOGEUSDT', name: 'DOGE Perpetual', exchange: 'binance', tickSize: 0.00001, type: 'futures' },
  ARBUSDT:  { symbol: 'ARBUSDT',  name: 'ARB Perpetual',  exchange: 'binance', tickSize: 0.0001,  type: 'futures' },
  SUIUSDT:  { symbol: 'SUIUSDT',  name: 'SUI Perpetual',  exchange: 'binance', tickSize: 0.0001,  type: 'futures' },
  AVAXUSDT: { symbol: 'AVAXUSDT', name: 'AVAX Perpetual', exchange: 'binance', tickSize: 0.001,   type: 'futures' },
  LINKUSDT: { symbol: 'LINKUSDT', name: 'LINK Perpetual', exchange: 'binance', tickSize: 0.001,   type: 'futures' },
  btcusdt:  { symbol: 'btcusdt',  name: 'BTC Perpetual',  exchange: 'binance', tickSize: 0.1,     type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME INDEX FUTURES
  // ═══════════════════════════════════════════════════════════════════════════
  NQ:  { symbol: 'NQ',  name: 'E-mini Nasdaq 100', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MNQ: { symbol: 'MNQ', name: 'Micro Nasdaq 100',  exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  ES:  { symbol: 'ES',  name: 'E-mini S&P 500',    exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MES: { symbol: 'MES', name: 'Micro S&P 500',     exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  YM:  { symbol: 'YM',  name: 'E-mini Dow Jones',  exchange: 'tradovate', tickSize: 1,    type: 'futures' },
  MYM: { symbol: 'MYM', name: 'Micro Dow Jones',   exchange: 'tradovate', tickSize: 1,    type: 'futures' },
  RTY: { symbol: 'RTY', name: 'E-mini Russell 2000', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },
  M2K: { symbol: 'M2K', name: 'Micro Russell 2000', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME ENERGY FUTURES (NYMEX)
  // ═══════════════════════════════════════════════════════════════════════════
  CL:  { symbol: 'CL',  name: 'Crude Oil WTI',  exchange: 'tradovate', tickSize: 0.01,    type: 'futures' },
  QM:  { symbol: 'QM',  name: 'Mini Crude Oil',  exchange: 'tradovate', tickSize: 0.025,   type: 'futures' },
  MCL: { symbol: 'MCL', name: 'Micro Crude Oil', exchange: 'tradovate', tickSize: 0.01,    type: 'futures' },
  NG:  { symbol: 'NG',  name: 'Natural Gas',     exchange: 'tradovate', tickSize: 0.001,   type: 'futures' },
  RB:  { symbol: 'RB',  name: 'RBOB Gasoline',   exchange: 'tradovate', tickSize: 0.0001,  type: 'futures' },
  HO:  { symbol: 'HO',  name: 'Heating Oil',     exchange: 'tradovate', tickSize: 0.0001,  type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME METALS (COMEX / NYMEX)
  // ═══════════════════════════════════════════════════════════════════════════
  GC:  { symbol: 'GC',  name: 'Gold',         exchange: 'tradovate', tickSize: 0.1,   type: 'futures' },
  MGC: { symbol: 'MGC', name: 'Micro Gold',   exchange: 'tradovate', tickSize: 0.1,   type: 'futures' },
  SI:  { symbol: 'SI',  name: 'Silver',       exchange: 'tradovate', tickSize: 0.005, type: 'futures' },
  SIL: { symbol: 'SIL', name: 'Micro Silver', exchange: 'tradovate', tickSize: 0.005, type: 'futures' },
  HG:  { symbol: 'HG',  name: 'Copper',       exchange: 'tradovate', tickSize: 0.0005, type: 'futures' },
  PL:  { symbol: 'PL',  name: 'Platinum',     exchange: 'tradovate', tickSize: 0.1,   type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME RATES / BONDS (CBOT)
  // ═══════════════════════════════════════════════════════════════════════════
  ZB: { symbol: 'ZB', name: '30Y T-Bond',  exchange: 'tradovate', tickSize: 0.03125,   type: 'futures' },
  ZN: { symbol: 'ZN', name: '10Y T-Note',  exchange: 'tradovate', tickSize: 0.015625,  type: 'futures' },
  ZF: { symbol: 'ZF', name: '5Y T-Note',   exchange: 'tradovate', tickSize: 0.0078125, type: 'futures' },
  ZT: { symbol: 'ZT', name: '2Y T-Note',   exchange: 'tradovate', tickSize: 0.0078125, type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME FX FUTURES
  // ═══════════════════════════════════════════════════════════════════════════
  '6E': { symbol: '6E', name: 'EUR/USD Futures', exchange: 'tradovate', tickSize: 0.00005,   type: 'futures' },
  '6J': { symbol: '6J', name: 'JPY Futures',     exchange: 'tradovate', tickSize: 0.0000005, type: 'futures' },
  '6B': { symbol: '6B', name: 'GBP Futures',     exchange: 'tradovate', tickSize: 0.0001,    type: 'futures' },
  '6A': { symbol: '6A', name: 'AUD Futures',     exchange: 'tradovate', tickSize: 0.0001,    type: 'futures' },
  '6C': { symbol: '6C', name: 'CAD Futures',     exchange: 'tradovate', tickSize: 0.00005,   type: 'futures' },
  '6S': { symbol: '6S', name: 'CHF Futures',     exchange: 'tradovate', tickSize: 0.0001,    type: 'futures' },
  '6N': { symbol: '6N', name: 'NZD Futures',     exchange: 'tradovate', tickSize: 0.0001,    type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME CRYPTO FUTURES (use _CME suffix to avoid clash with crypto spot symbols)
  // ═══════════════════════════════════════════════════════════════════════════
  BTC_CME: { symbol: 'BTC_CME', name: 'Bitcoin CME',       exchange: 'tradovate', tickSize: 5,    type: 'futures' },
  MBT:     { symbol: 'MBT',     name: 'Micro Bitcoin CME', exchange: 'tradovate', tickSize: 5,    type: 'futures' },
  ETH_CME: { symbol: 'ETH_CME', name: 'Ether CME',         exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MET:     { symbol: 'MET',     name: 'Micro Ether CME',   exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
};
