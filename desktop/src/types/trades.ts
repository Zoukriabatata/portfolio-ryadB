// Phase B / M6b-1 — TS mirror of the Rust crypto-tick-update
// payload. The Rust side serialises with rename_all = camelCase
// + lowercase "buy" / "sell" so the heatmap layer can consume
// without any enum munging.

export type CryptoSide = "buy" | "sell";

export type TickUpdate = {
  /** Exchange-suffixed symbol, e.g. "BTCUSDT.BYBIT" — same
   *  convention as the orderbook event. */
  symbol: string;
  price: number;
  quantity: number;
  /** Aggressor side: who lifted/hit. */
  side: CryptoSide;
  timestampNs: number;
};
