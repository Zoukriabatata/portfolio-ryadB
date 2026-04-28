/**
 * Central instrument registry — single source of truth for all tradeable instruments.
 * Price ranges, tick sizes, Yahoo Finance tickers, dxFeed symbols, point values.
 *
 * Used by:
 *  - lib/utils/symbolUtils.ts   (CME symbol detection)
 *  - lib/websocket/DxFeedWS.ts  (symbol mapping)
 *  - app/api/futures-history    (Yahoo Finance ticker lookup)
 *  - useSymbolData              (price + OHLC validation)
 *  - SymbolSelector / chart constants (UI symbol lists)
 */

export type InstrumentCategory =
  | 'indices'
  | 'energy'
  | 'metals'
  | 'rates'
  | 'fx'
  | 'crypto_cme'
  | 'crypto';

export interface InstrumentDef {
  symbol: string;
  name: string;
  exchange: 'CME' | 'CBOT' | 'NYMEX' | 'COMEX' | 'binance' | 'bybit';
  category: InstrumentCategory;
  tickSize: number;
  pointValue: number;
  yahooTicker?: string;
  dxFeedSymbol?: string;
  /** Acceptable price range — prices outside are rejected as invalid data */
  priceRange: { min: number; max: number };
}

// ═══════════════════════════════════════════════════════════════════════════
// CME / CBOT / NYMEX / COMEX  —  Futures instruments
// ═══════════════════════════════════════════════════════════════════════════
export const CME_INSTRUMENTS: Record<string, InstrumentDef> = {

  // ── INDICES ──────────────────────────────────────────────────────────────
  NQ:  { symbol: 'NQ',  name: 'E-mini Nasdaq 100', exchange: 'CME',   category: 'indices',    tickSize: 0.25,      pointValue: 20,       yahooTicker: 'NQ=F',  dxFeedSymbol: '/NQ',  priceRange: { min: 10000, max: 30000  } },
  MNQ: { symbol: 'MNQ', name: 'Micro Nasdaq 100',  exchange: 'CME',   category: 'indices',    tickSize: 0.25,      pointValue: 2,        yahooTicker: 'NQ=F',  dxFeedSymbol: '/MNQ', priceRange: { min: 10000, max: 30000  } },
  ES:  { symbol: 'ES',  name: 'E-mini S&P 500',    exchange: 'CME',   category: 'indices',    tickSize: 0.25,      pointValue: 50,       yahooTicker: 'ES=F',  dxFeedSymbol: '/ES',  priceRange: { min: 3000,  max: 7000   } },
  MES: { symbol: 'MES', name: 'Micro S&P 500',     exchange: 'CME',   category: 'indices',    tickSize: 0.25,      pointValue: 5,        yahooTicker: 'ES=F',  dxFeedSymbol: '/MES', priceRange: { min: 3000,  max: 7000   } },
  YM:  { symbol: 'YM',  name: 'E-mini Dow Jones',  exchange: 'CBOT',  category: 'indices',    tickSize: 1,         pointValue: 5,        yahooTicker: 'YM=F',  dxFeedSymbol: '/YM',  priceRange: { min: 20000, max: 50000  } },
  MYM: { symbol: 'MYM', name: 'Micro Dow Jones',   exchange: 'CBOT',  category: 'indices',    tickSize: 1,         pointValue: 0.5,      yahooTicker: 'YM=F',  dxFeedSymbol: '/MYM', priceRange: { min: 20000, max: 50000  } },
  RTY: { symbol: 'RTY', name: 'E-mini Russell 2000',exchange: 'CME',  category: 'indices',    tickSize: 0.1,       pointValue: 50,       yahooTicker: 'RTY=F', dxFeedSymbol: '/RTY', priceRange: { min: 1000,  max: 4000   } },
  M2K: { symbol: 'M2K', name: 'Micro Russell 2000',exchange: 'CME',  category: 'indices',    tickSize: 0.1,       pointValue: 5,        yahooTicker: 'RTY=F', dxFeedSymbol: '/M2K', priceRange: { min: 1000,  max: 4000   } },

  // ── ENERGY ───────────────────────────────────────────────────────────────
  CL:  { symbol: 'CL',  name: 'Crude Oil WTI',     exchange: 'NYMEX', category: 'energy',     tickSize: 0.01,      pointValue: 1000,     yahooTicker: 'CL=F',  dxFeedSymbol: '/CL',  priceRange: { min: 20,    max: 200    } },
  QM:  { symbol: 'QM',  name: 'Mini Crude Oil',    exchange: 'NYMEX', category: 'energy',     tickSize: 0.025,     pointValue: 500,      yahooTicker: 'CL=F',  dxFeedSymbol: '/QM',  priceRange: { min: 20,    max: 200    } },
  MCL: { symbol: 'MCL', name: 'Micro Crude Oil',   exchange: 'NYMEX', category: 'energy',     tickSize: 0.01,      pointValue: 100,      yahooTicker: 'CL=F',  dxFeedSymbol: '/MCL', priceRange: { min: 20,    max: 200    } },
  NG:  { symbol: 'NG',  name: 'Natural Gas',       exchange: 'NYMEX', category: 'energy',     tickSize: 0.001,     pointValue: 10000,    yahooTicker: 'NG=F',  dxFeedSymbol: '/NG',  priceRange: { min: 1,     max: 20     } },
  RB:  { symbol: 'RB',  name: 'RBOB Gasoline',     exchange: 'NYMEX', category: 'energy',     tickSize: 0.0001,    pointValue: 42000,    yahooTicker: 'RB=F',  dxFeedSymbol: '/RB',  priceRange: { min: 0.5,   max: 5      } },
  HO:  { symbol: 'HO',  name: 'Heating Oil',       exchange: 'NYMEX', category: 'energy',     tickSize: 0.0001,    pointValue: 42000,    yahooTicker: 'HO=F',  dxFeedSymbol: '/HO',  priceRange: { min: 0.5,   max: 5      } },

  // ── METALS ───────────────────────────────────────────────────────────────
  GC:  { symbol: 'GC',  name: 'Gold',              exchange: 'COMEX', category: 'metals',     tickSize: 0.1,       pointValue: 100,      yahooTicker: 'GC=F',  dxFeedSymbol: '/GC',  priceRange: { min: 1200,  max: 5000   } },
  MGC: { symbol: 'MGC', name: 'Micro Gold',        exchange: 'COMEX', category: 'metals',     tickSize: 0.1,       pointValue: 10,       yahooTicker: 'GC=F',  dxFeedSymbol: '/MGC', priceRange: { min: 1200,  max: 5000   } },
  SI:  { symbol: 'SI',  name: 'Silver',            exchange: 'COMEX', category: 'metals',     tickSize: 0.005,     pointValue: 5000,     yahooTicker: 'SI=F',  dxFeedSymbol: '/SI',  priceRange: { min: 10,    max: 80     } },
  SIL: { symbol: 'SIL', name: 'Micro Silver',      exchange: 'COMEX', category: 'metals',     tickSize: 0.005,     pointValue: 1000,     yahooTicker: 'SI=F',  dxFeedSymbol: '/SIL', priceRange: { min: 10,    max: 80     } },
  HG:  { symbol: 'HG',  name: 'Copper',            exchange: 'COMEX', category: 'metals',     tickSize: 0.0005,    pointValue: 25000,    yahooTicker: 'HG=F',  dxFeedSymbol: '/HG',  priceRange: { min: 1.5,   max: 7      } },
  PL:  { symbol: 'PL',  name: 'Platinum',          exchange: 'NYMEX', category: 'metals',     tickSize: 0.1,       pointValue: 50,       yahooTicker: 'PL=F',  dxFeedSymbol: '/PL',  priceRange: { min: 500,   max: 2000   } },

  // ── RATES / BONDS ─────────────────────────────────────────────────────────
  ZB:  { symbol: 'ZB',  name: '30Y T-Bond',        exchange: 'CBOT',  category: 'rates',      tickSize: 0.03125,   pointValue: 1000,     yahooTicker: 'ZB=F',  dxFeedSymbol: '/ZB',  priceRange: { min: 80,    max: 180    } },
  ZN:  { symbol: 'ZN',  name: '10Y T-Note',        exchange: 'CBOT',  category: 'rates',      tickSize: 0.015625,  pointValue: 1000,     yahooTicker: 'ZN=F',  dxFeedSymbol: '/ZN',  priceRange: { min: 90,    max: 130    } },
  ZF:  { symbol: 'ZF',  name: '5Y T-Note',         exchange: 'CBOT',  category: 'rates',      tickSize: 0.0078125, pointValue: 1000,     yahooTicker: 'ZF=F',  dxFeedSymbol: '/ZF',  priceRange: { min: 95,    max: 120    } },
  ZT:  { symbol: 'ZT',  name: '2Y T-Note',         exchange: 'CBOT',  category: 'rates',      tickSize: 0.0078125, pointValue: 2000,     yahooTicker: 'ZT=F',  dxFeedSymbol: '/ZT',  priceRange: { min: 95,    max: 110    } },

  // ── FX FUTURES ────────────────────────────────────────────────────────────
  '6E': { symbol: '6E', name: 'EUR/USD Futures',   exchange: 'CME',   category: 'fx',         tickSize: 0.00005,   pointValue: 125000,   yahooTicker: '6E=F',  dxFeedSymbol: '/6E',  priceRange: { min: 0.85,  max: 1.35   } },
  '6J': { symbol: '6J', name: 'JPY Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.0000005, pointValue: 12500000, yahooTicker: '6J=F',  dxFeedSymbol: '/6J',  priceRange: { min: 0.005, max: 0.01   } },
  '6B': { symbol: '6B', name: 'GBP Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.0001,    pointValue: 62500,    yahooTicker: '6B=F',  dxFeedSymbol: '/6B',  priceRange: { min: 1.0,   max: 1.6    } },
  '6A': { symbol: '6A', name: 'AUD Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.0001,    pointValue: 100000,   yahooTicker: '6A=F',  dxFeedSymbol: '/6A',  priceRange: { min: 0.5,   max: 0.95   } },
  '6C': { symbol: '6C', name: 'CAD Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.00005,   pointValue: 100000,   yahooTicker: '6C=F',  dxFeedSymbol: '/6C',  priceRange: { min: 0.65,  max: 0.9    } },
  '6S': { symbol: '6S', name: 'CHF Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.0001,    pointValue: 125000,   yahooTicker: '6S=F',  dxFeedSymbol: '/6S',  priceRange: { min: 0.9,   max: 1.3    } },
  '6N': { symbol: '6N', name: 'NZD Futures',       exchange: 'CME',   category: 'fx',         tickSize: 0.0001,    pointValue: 100000,   yahooTicker: '6N=F',  dxFeedSymbol: '/6N',  priceRange: { min: 0.5,   max: 0.8    } },

  // ── CRYPTO CME ───────────────────────────────────────────────────────────
  BTC: { symbol: 'BTC', name: 'Bitcoin CME',       exchange: 'CME',   category: 'crypto_cme', tickSize: 5,         pointValue: 5,        yahooTicker: 'BTC=F', dxFeedSymbol: '/BTC', priceRange: { min: 15000, max: 200000 } },
  MBT: { symbol: 'MBT', name: 'Micro Bitcoin CME', exchange: 'CME',   category: 'crypto_cme', tickSize: 5,         pointValue: 0.1,      yahooTicker: 'BTC=F', dxFeedSymbol: '/MBT', priceRange: { min: 15000, max: 200000 } },
  ETH: { symbol: 'ETH', name: 'Ether CME',         exchange: 'CME',   category: 'crypto_cme', tickSize: 0.25,      pointValue: 50,       yahooTicker: 'ETH=F', dxFeedSymbol: '/ETH', priceRange: { min: 500,   max: 10000  } },
  MET: { symbol: 'MET', name: 'Micro Ether CME',   exchange: 'CME',   category: 'crypto_cme', tickSize: 0.25,      pointValue: 2.5,      yahooTicker: 'ETH=F', dxFeedSymbol: '/MET', priceRange: { min: 500,   max: 10000  } },
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_CME_SYMBOLS = new Set(Object.keys(CME_INSTRUMENTS));

/** Lookup an instrument by symbol (case-insensitive). */
export function getInstrument(symbol: string): InstrumentDef | undefined {
  return CME_INSTRUMENTS[symbol.toUpperCase()];
}

/**
 * Validate a price against the instrument's known range.
 * Returns true if valid (or if the instrument is unknown — don't reject).
 * Logs a warning if rejected.
 */
export function validateInstrumentPrice(symbol: string, price: number): boolean {
  const instr = getInstrument(symbol);
  if (!instr) return true;
  const ok = price >= instr.priceRange.min && price <= instr.priceRange.max;
  if (!ok) {
    console.warn(
      `[INVALID_PRICE] symbol=${symbol} value=${price} expected=[${instr.priceRange.min}-${instr.priceRange.max}]`
    );
  }
  return ok;
}

/**
 * Validate a candle's OHLC integrity.
 * Returns true if valid. Logs + returns false if any rule is broken.
 */
export function validateCandle(candle: {
  open: number; high: number; low: number; close: number;
  volume: number; time: number;
}, symbol?: string): boolean {
  const s = symbol || '?';

  if (candle.high < candle.low) {
    console.warn(`[INVALID_CANDLE] symbol=${s} reason=high_lt_low high=${candle.high} low=${candle.low}`);
    return false;
  }
  if (candle.close < candle.low || candle.close > candle.high) {
    console.warn(`[INVALID_CANDLE] symbol=${s} reason=close_out_of_range close=${candle.close} range=[${candle.low}-${candle.high}]`);
    return false;
  }
  if (candle.open < candle.low || candle.open > candle.high) {
    console.warn(`[INVALID_CANDLE] symbol=${s} reason=open_out_of_range open=${candle.open} range=[${candle.low}-${candle.high}]`);
    return false;
  }
  if (candle.volume < 0) {
    console.warn(`[INVALID_CANDLE] symbol=${s} reason=negative_volume volume=${candle.volume}`);
    return false;
  }
  // Reject candles from the far future (> 60s ahead) — likely a data feed bug
  if (candle.time > Math.floor(Date.now() / 1000) + 60) {
    console.warn(`[INVALID_CANDLE] symbol=${s} reason=future_timestamp time=${candle.time}`);
    return false;
  }
  return true;
}

/** Get Yahoo Finance ticker for a CME symbol. Returns undefined if not in registry. */
export function getYahooTicker(symbol: string): string | undefined {
  return getInstrument(symbol)?.yahooTicker;
}

/** Get dxFeed symbol notation (/NQ, /ES, etc.) for a CME symbol. */
export function getDxFeedSymbol(symbol: string): string {
  return getInstrument(symbol)?.dxFeedSymbol ?? `/${symbol.toUpperCase()}`;
}
