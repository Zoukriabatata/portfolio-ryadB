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

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

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
  // CME Futures (Tradovate) - Generic symbols (auto-resolve to front month)
  | 'NQ' | 'MNQ'   // E-mini / Micro Nasdaq
  | 'ES' | 'MES'   // E-mini / Micro S&P
  | 'GC' | 'MGC';  // Gold / Micro Gold

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
  BTCUSDT: { symbol: 'BTCUSDT', name: 'BTC Perpetual', exchange: 'binance', tickSize: 0.1, type: 'futures' },
  ETHUSDT: { symbol: 'ETHUSDT', name: 'ETH Perpetual', exchange: 'binance', tickSize: 0.01, type: 'futures' },
  SOLUSDT: { symbol: 'SOLUSDT', name: 'SOL Perpetual', exchange: 'binance', tickSize: 0.001, type: 'futures' },
  BNBUSDT: { symbol: 'BNBUSDT', name: 'BNB Perpetual', exchange: 'binance', tickSize: 0.01, type: 'futures' },
  XRPUSDT: { symbol: 'XRPUSDT', name: 'XRP Perpetual', exchange: 'binance', tickSize: 0.0001, type: 'futures' },
  DOGEUSDT: { symbol: 'DOGEUSDT', name: 'DOGE Perpetual', exchange: 'binance', tickSize: 0.00001, type: 'futures' },
  ARBUSDT: { symbol: 'ARBUSDT', name: 'ARB Perpetual', exchange: 'binance', tickSize: 0.0001, type: 'futures' },
  SUIUSDT: { symbol: 'SUIUSDT', name: 'SUI Perpetual', exchange: 'binance', tickSize: 0.0001, type: 'futures' },
  AVAXUSDT: { symbol: 'AVAXUSDT', name: 'AVAX Perpetual', exchange: 'binance', tickSize: 0.001, type: 'futures' },
  LINKUSDT: { symbol: 'LINKUSDT', name: 'LINK Perpetual', exchange: 'binance', tickSize: 0.001, type: 'futures' },
  btcusdt: { symbol: 'btcusdt', name: 'BTC Perpetual', exchange: 'binance', tickSize: 0.1, type: 'futures' },

  // ═══════════════════════════════════════════════════════════════════════════
  // CME FUTURES - Generic symbols (maps to front month)
  // ═══════════════════════════════════════════════════════════════════════════
  NQ: { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MNQ: { symbol: 'MNQ', name: 'Micro Nasdaq', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  ES: { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MES: { symbol: 'MES', name: 'Micro S&P 500', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  GC: { symbol: 'GC', name: 'Gold Futures', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },
  MGC: { symbol: 'MGC', name: 'Micro Gold', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },

};
