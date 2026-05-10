export type ExchangeMs = number;
export type Price = number;
export type BucketIndex = number;
export type PriceIndex = number;
export type Side = "bid" | "ask";

export interface OrderbookLevel {
  price: Price;
  size: number;
}

export interface OrderbookSnapshot {
  exchangeMs: ExchangeMs;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface Trade {
  exchangeMs: ExchangeMs;
  price: Price;
  size: number;
  side: Side;
}

export interface Viewport {
  priceMin: number;
  priceMax: number;
  // REFONTE-7/P3 : bornes temporelles visibles (optionnelles, rétrocompat).
  // Si omises, dérivées de [now - historyDurationMs, now] par l'engine.
  // Modifiées par le zoom horizontal (destructif, déclenche re-bin si dims
  // changent). Pas modifiées par le pan (qui passe par la matrice display).
  timeMin?: number;
  timeMax?: number;
}

export type BucketDurationMs = 50 | 100 | 250 | 500 | 1000;
