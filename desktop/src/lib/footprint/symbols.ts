// Phase B / M4.7a + M5 — symbol catalog for the picker.
//
// Two sources combined:
//   * Crypto (Bybit / Binance) — static hand-curated list, since these
//     markets don't have contract specs and the pair set is small
//     enough to enumerate.
//   * Rithmic futures — DERIVED from lib/sim/contractSpecs.ts at module
//     load time. Adding a contract to that file makes it show up here
//     automatically with the right front-month code (no more drift
//     between specs, picker, and journal filter).
//
// `tickSizeHint` is informational only — the renderer infers the real
// tick size from incoming trades (or, for the bridge, from the M header
// NinjaTrader sends). The picker shows the hint so the operator knows
// what they're stepping into.

import { SPECS as FUTURES_SPECS } from "../sim/contractSpecs";
import { frontMonthLabel, getCurrentContract } from "../sim/frontMonth";

export type Exchange = "bybit" | "binance" | "rithmic";

export type CryptoExchange = "bybit" | "binance";

export type SymbolCategory =
  // Crypto (legacy Bybit/Binance categories — kept for backward compat
  // even though the live UI now exposes Rithmic only).
  | "majors"
  | "alts"
  | "memes"
  // Futures — must stay aligned with lib/sim/contractSpecs.ts
  // ContractCategory, since the Rithmic part of the catalog is derived
  // from SPECS.
  | "indices"
  | "treasuries"
  | "currencies"
  | "metals"
  | "energy"
  | "grains"
  | "livestock"
  | "crypto"; // CME Bitcoin / Ether futures (BTC, MBT, ETH, MET)

export type CMEExchangeCode = "CME" | "NYMEX" | "COMEX" | "CBOT";

export type SymbolDef = {
  /** Exchange-side ticker, upper-case. */
  symbol: string;
  /** Display label, e.g. "BTC / USDT" or "Micro E-mini Nasdaq". */
  label: string;
  exchange: Exchange;
  category: SymbolCategory;
  tickSizeHint?: number;
  /** Futures only — Rithmic-side exchange code used in the
   *  RequestMarketDataUpdate payload. CME Group umbrella covers
   *  CME / NYMEX / COMEX / CBOT venues with distinct codes. */
  cmeExchange?: CMEExchangeCode;
  /** Futures only — human-readable contract month for the picker. */
  contractMonth?: string;
};

// --- Crypto exchanges (hardcoded, not in contractSpecs.ts) ---
const CRYPTO_SYMBOLS: SymbolDef[] = [
  // --- Bybit Linear (USDT perps) ---
  { symbol: "BTCUSDT", label: "BTC / USDT", exchange: "bybit", category: "majors", tickSizeHint: 0.1 },
  { symbol: "ETHUSDT", label: "ETH / USDT", exchange: "bybit", category: "majors", tickSizeHint: 0.05 },
  { symbol: "SOLUSDT", label: "SOL / USDT", exchange: "bybit", category: "majors", tickSizeHint: 0.01 },
  { symbol: "BNBUSDT", label: "BNB / USDT", exchange: "bybit", category: "majors", tickSizeHint: 0.01 },
  { symbol: "XRPUSDT", label: "XRP / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "ADAUSDT", label: "ADA / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "AVAXUSDT", label: "AVAX / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.001 },
  { symbol: "LINKUSDT", label: "LINK / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.001 },
  { symbol: "ARBUSDT", label: "ARB / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "OPUSDT", label: "OP / USDT", exchange: "bybit", category: "alts", tickSizeHint: 0.001 },
  { symbol: "DOGEUSDT", label: "DOGE / USDT", exchange: "bybit", category: "memes", tickSizeHint: 0.00001 },
  { symbol: "PEPEUSDT", label: "PEPE / USDT", exchange: "bybit", category: "memes", tickSizeHint: 0.00000001 },

  // --- Binance Spot ---
  { symbol: "BTCUSDT", label: "BTC / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "ETHUSDT", label: "ETH / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "SOLUSDT", label: "SOL / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "BNBUSDT", label: "BNB / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "XRPUSDT", label: "XRP / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "ADAUSDT", label: "ADA / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "AVAXUSDT", label: "AVAX / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.001 },
  { symbol: "DOGEUSDT", label: "DOGE / USDT", exchange: "binance", category: "memes", tickSizeHint: 0.00001 },
];

// --- Rithmic CME / CBOT / NYMEX / COMEX — DERIVED from FUTURES_SPECS ---
// Each spec produces one picker entry with its current front-month
// contract code. The category is shared between contractSpecs.ts and
// the picker — same type union, kept manually in sync.
const NOW = new Date();
const RITHMIC_SYMBOLS: SymbolDef[] = FUTURES_SPECS.map((spec) => ({
  symbol: getCurrentContract(spec.root, spec.validMonths, NOW),
  label: spec.name,
  exchange: "rithmic" as const,
  category: spec.category as SymbolCategory,
  tickSizeHint: spec.tickSize,
  cmeExchange: spec.exchange as CMEExchangeCode,
  contractMonth: frontMonthLabel(spec.validMonths, NOW),
}));

export const SYMBOL_CATALOG: SymbolDef[] = [
  ...CRYPTO_SYMBOLS,
  ...RITHMIC_SYMBOLS,
];

/** Which categories the picker should iterate, per exchange. */
export const CATEGORIES_BY_EXCHANGE: Record<Exchange, SymbolCategory[]> = {
  bybit: ["majors", "alts", "memes"],
  binance: ["majors", "alts", "memes"],
  rithmic: [
    "indices",
    "treasuries",
    "currencies",
    "metals",
    "energy",
    "grains",
    "livestock",
    "crypto",
  ],
};

export function filterSymbols(
  exchange: Exchange,
  query: string,
): SymbolDef[] {
  const q = query.trim().toUpperCase();
  return SYMBOL_CATALOG.filter(
    (s) =>
      s.exchange === exchange &&
      (q === "" ||
        s.symbol.includes(q) ||
        s.label.toUpperCase().includes(q)),
  );
}

/** Look up a single catalog entry by exchange + symbol. Returns
 *  null when the symbol isn't catalogued (custom user input). */
export function findSymbol(
  exchange: Exchange,
  symbol: string,
): SymbolDef | null {
  return (
    SYMBOL_CATALOG.find(
      (s) => s.exchange === exchange && s.symbol === symbol,
    ) ?? null
  );
}
