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
  // Crypto Futures (Binance) - Real-time data available FREE
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
  // CME Futures - Generic (current front month)
  | 'NQ' | 'MNQ'   // E-mini / Micro Nasdaq
  | 'ES' | 'MES'   // E-mini / Micro S&P
  | 'GC' | 'MGC'   // Gold / Micro Gold
  // CME Futures (Tradovate) - Specific contracts
  | 'MNQH5' | 'MNQZ4'   // Micro E-mini Nasdaq
  | 'MESH5' | 'MESZ4'   // Micro E-mini S&P
  | 'NQH5' | 'NQZ4'     // E-mini Nasdaq
  | 'ESH5' | 'ESZ4'     // E-mini S&P
  | 'GCJ5' | 'GCG5'     // Gold
  | 'MGCJ5' | 'MGCG5';  // Micro Gold

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

  // ═══════════════════════════════════════════════════════════════════════════
  // CME FUTURES - Specific contracts (Mar 2025)
  // ═══════════════════════════════════════════════════════════════════════════
  MNQH5: { symbol: 'MNQH5', name: 'Micro Nasdaq Mar25', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MESH5: { symbol: 'MESH5', name: 'Micro S&P Mar25', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  NQH5: { symbol: 'NQH5', name: 'E-mini Nasdaq Mar25', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  ESH5: { symbol: 'ESH5', name: 'E-mini S&P Mar25', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  GCJ5: { symbol: 'GCJ5', name: 'Gold Apr25', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },
  MGCJ5: { symbol: 'MGCJ5', name: 'Micro Gold Apr25', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },

  // Previous contracts (Dec 2024 / Feb 2025)
  MNQZ4: { symbol: 'MNQZ4', name: 'Micro Nasdaq Dec24', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  MESZ4: { symbol: 'MESZ4', name: 'Micro S&P Dec24', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  NQZ4: { symbol: 'NQZ4', name: 'E-mini Nasdaq Dec24', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  ESZ4: { symbol: 'ESZ4', name: 'E-mini S&P Dec24', exchange: 'tradovate', tickSize: 0.25, type: 'futures' },
  GCG5: { symbol: 'GCG5', name: 'Gold Feb25', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },
  MGCG5: { symbol: 'MGCG5', name: 'Micro Gold Feb25', exchange: 'tradovate', tickSize: 0.1, type: 'futures' },
};
