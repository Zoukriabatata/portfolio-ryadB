/**
 * Symbol catalogues consumed by the dashboard data hooks. Kept in one
 * place so widgets querying the same Binance endpoints stay aligned
 * on what to display.
 */

export const ALL_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT",
  "AVAXUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT", "NEARUSDT", "ATOMUSDT",
  "UNIUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "INJUSDT",
  "PEPEUSDT", "WIFUSDT", "FETUSDT", "LTCUSDT", "TRXUSDT", "MATICUSDT",
] as const;

/** Short display labels for the canonical 24-symbol universe. */
export const DISPLAY_NAMES: Record<string, string> = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", BNBUSDT: "BNB",
  XRPUSDT: "XRP", DOGEUSDT: "DOGE", AVAXUSDT: "AVAX", ADAUSDT: "ADA",
  DOTUSDT: "DOT", LINKUSDT: "LINK", NEARUSDT: "NEAR", ATOMUSDT: "ATOM",
  UNIUSDT: "UNI", APTUSDT: "APT", ARBUSDT: "ARB", OPUSDT: "OP",
  SUIUSDT: "SUI", INJUSDT: "INJ", PEPEUSDT: "PEPE", WIFUSDT: "WIF",
  FETUSDT: "FET", LTCUSDT: "LTC", TRXUSDT: "TRX", MATICUSDT: "MATIC",
};

/** Subset surfaced by the Open Interest widget — kept small so the
 *  parallel fetch fan-out stays cheap. */
export const OI_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"] as const;

/** Funding rate widget surface. Ordered = display order in the strip. */
export const FUNDING_SYMBOLS_LIST = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
  "XRPUSDT", "AVAXUSDT", "LINKUSDT", "ARBUSDT", "APTUSDT", "OPUSDT",
] as const;
