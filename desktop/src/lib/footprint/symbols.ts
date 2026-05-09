// Phase B / M4.7a — symbol catalog for the crypto picker.
//
// Static list. We don't fetch from the exchanges' /symbols endpoints
// because that would (a) require a network round-trip on first
// open, and (b) leak hundreds of irrelevant low-volume markets into
// the picker. The hand-curated list mirrors what an active retail
// trader actually wants on screen.
//
// `tickSizeHint` is informational only — the Rust FootprintEngine
// infers tick size from incoming trades, the picker just shows the
// hint so the operator picks something reasonable.

export type CryptoExchange = "bybit" | "binance";

export type SymbolDef = {
  /** Exchange-side ticker, upper-case. */
  symbol: string;
  /** Display label, e.g. "BTC / USDT". */
  label: string;
  exchange: CryptoExchange;
  category: "majors" | "alts" | "memes";
  tickSizeHint?: number;
};

export const SYMBOL_CATALOG: SymbolDef[] = [
  // Bybit Linear (USDT perps).
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

  // Binance Spot.
  { symbol: "BTCUSDT", label: "BTC / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "ETHUSDT", label: "ETH / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "SOLUSDT", label: "SOL / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "BNBUSDT", label: "BNB / USDT", exchange: "binance", category: "majors", tickSizeHint: 0.01 },
  { symbol: "XRPUSDT", label: "XRP / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "ADAUSDT", label: "ADA / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.0001 },
  { symbol: "AVAXUSDT", label: "AVAX / USDT", exchange: "binance", category: "alts", tickSizeHint: 0.001 },
  { symbol: "DOGEUSDT", label: "DOGE / USDT", exchange: "binance", category: "memes", tickSizeHint: 0.00001 },
];

export function filterSymbols(
  exchange: CryptoExchange,
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
