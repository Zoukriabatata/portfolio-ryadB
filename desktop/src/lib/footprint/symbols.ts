// Phase B / M4.7a + M5 — symbol catalog for the picker.
//
// Static hand-curated list of the most-traded markets per exchange.
// Crypto: spot/perp pairs the M4.7a picker exposes. Futures: the
// CME Group / NYMEX / COMEX contracts the M5 Rithmic port wires.
//
// `tickSizeHint` is informational only — the renderer infers tick
// size from incoming trades. The picker shows the hint so the
// operator knows what they're stepping into.
//
// FIXME (futures): contract codes are quarterly. Roll the index
// futures (Mar/Jun/Sep/Dec) and monthly futures (CL/NG every month,
// SI every 2 months) ~5 days before each expiry. Reminder to bump
// these symbol codes. The CME convention used here:
//   F=Jan G=Feb H=Mar J=Apr K=May M=Jun
//   N=Jul Q=Aug U=Sep V=Oct X=Nov Z=Dec
// Suffix digit = single-digit year (6 = 2026).

export type Exchange = "bybit" | "binance" | "rithmic";

export type CryptoExchange = "bybit" | "binance";

export type SymbolCategory =
  // Crypto
  | "majors"
  | "alts"
  | "memes"
  // Futures
  | "indices"
  | "energy"
  | "metals"
  | "currencies";

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

export const SYMBOL_CATALOG: SymbolDef[] = [
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

  // --- Rithmic CME Group — Index futures (M6 = June 2026) ---
  { symbol: "MNQM6", label: "Micro E-mini Nasdaq", exchange: "rithmic", category: "indices", tickSizeHint: 0.25, cmeExchange: "CME", contractMonth: "Jun 2026" },
  { symbol: "NQM6",  label: "E-mini Nasdaq",       exchange: "rithmic", category: "indices", tickSizeHint: 0.25, cmeExchange: "CME", contractMonth: "Jun 2026" },
  { symbol: "MESM6", label: "Micro E-mini S&P",    exchange: "rithmic", category: "indices", tickSizeHint: 0.25, cmeExchange: "CME", contractMonth: "Jun 2026" },
  { symbol: "ESM6",  label: "E-mini S&P",          exchange: "rithmic", category: "indices", tickSizeHint: 0.25, cmeExchange: "CME", contractMonth: "Jun 2026" },
  { symbol: "RTYM6", label: "E-mini Russell 2000", exchange: "rithmic", category: "indices", tickSizeHint: 0.1,  cmeExchange: "CME", contractMonth: "Jun 2026" },
  { symbol: "YMM6",  label: "E-mini Dow",          exchange: "rithmic", category: "indices", tickSizeHint: 1,    cmeExchange: "CBOT", contractMonth: "Jun 2026" },

  // --- NYMEX / COMEX — Energy + Metals ---
  { symbol: "CLM6",  label: "Crude Oil (WTI)",     exchange: "rithmic", category: "energy",  tickSizeHint: 0.01,  cmeExchange: "NYMEX", contractMonth: "Jun 2026" },
  { symbol: "NGM6",  label: "Natural Gas",         exchange: "rithmic", category: "energy",  tickSizeHint: 0.001, cmeExchange: "NYMEX", contractMonth: "Jun 2026" },
  { symbol: "GCM6",  label: "Gold",                exchange: "rithmic", category: "metals",  tickSizeHint: 0.1,   cmeExchange: "COMEX", contractMonth: "Jun 2026" },
  { symbol: "SIN6",  label: "Silver",              exchange: "rithmic", category: "metals",  tickSizeHint: 0.005, cmeExchange: "COMEX", contractMonth: "Jul 2026" },
];

/** Which categories the picker should iterate, per exchange. */
export const CATEGORIES_BY_EXCHANGE: Record<Exchange, SymbolCategory[]> = {
  bybit: ["majors", "alts", "memes"],
  binance: ["majors", "alts", "memes"],
  rithmic: ["indices", "energy", "metals", "currencies"],
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
