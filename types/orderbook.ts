export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface Orderbook {
  bids: Map<number, number>; // price -> quantity
  asks: Map<number, number>; // price -> quantity
  lastUpdateId: number;
  timestamp: number;
}

export interface OrderbookSnapshot {
  timestamp: number;
  bids: [number, number][]; // [price, quantity][]
  asks: [number, number][]; // [price, quantity][]
}

export interface LiquidityWall {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
}

export interface HeatmapCell {
  time: number;
  price: number;
  intensity: number; // 0-1 normalized liquidity
}

export interface OrderbookUpdate {
  eventType: 'depthUpdate' | 'snapshot';
  eventTime: number;
  symbol: string;
  firstUpdateId: number;
  finalUpdateId: number;
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
}
