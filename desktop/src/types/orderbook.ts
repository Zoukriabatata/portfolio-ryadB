// Phase B / M3.5 — TS mirror of the Rust OrderbookUpdate /
// OrderbookLevel types emitted on the `orderbook-update` Tauri
// event. The Rust side serialises with `rename_all = "camelCase"`
// so what arrives on the JS side already matches these field
// names.

export type OrderbookLevel = {
  price: number;
  quantity: number;
};

export type OrderbookUpdate = {
  /** Exchange-suffixed ticker, e.g. "BTCUSDT.BYBIT". */
  symbol: string;
  /** Engine emit time in nanoseconds since epoch. */
  timestampNs: number;
  /** Best-bid first (descending price). */
  bids: OrderbookLevel[];
  /** Best-ask first (ascending price). */
  asks: OrderbookLevel[];
  /** Bybit `seq` / `u` field — monotonically increasing per
   *  symbol. A rewind triggers an automatic Rust-side resync. */
  sequence: number;
  /** Per-side cap, currently 500 for Bybit linear. */
  depth: number;
};
