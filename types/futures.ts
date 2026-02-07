/**
 * FUTURES DATA TYPES
 *
 * Types pour les données spécifiques aux contrats futures crypto :
 * - Mark Price / Index Price (WebSocket)
 * - Funding Rate (WebSocket)
 * - Liquidations (WebSocket)
 * - Open Interest (REST polling)
 * - Long/Short Ratio (REST polling)
 */

/** Mark price update from Binance WS stream {symbol}@markPrice@1s */
export interface MarkPriceUpdate {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  estimatedSettlePrice: number;
}

/** Liquidation order from Binance WS stream {symbol}@forceOrder */
export interface LiquidationEvent {
  symbol: string;
  side: 'BUY' | 'SELL'; // BUY = short liquidated, SELL = long liquidated
  quantity: number;
  price: number;
  averagePrice: number;
  status: string;
  lastFilledQty: number;
  cumulativeFilledQty: number;
  time: number;
}

/** Open interest from REST /fapi/v1/openInterest */
export interface OpenInterest {
  symbol: string;
  openInterest: number;
  time: number;
}

/** Long/Short ratio from REST /futures/data/globalLongShortAccountRatio */
export interface LongShortRatio {
  symbol: string;
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
  timestamp: number;
}

/** Top trader long/short from REST /futures/data/topLongShortAccountRatio */
export interface TopTraderLongShortRatio {
  symbol: string;
  longShortRatio: number;
  longAccount: number;
  shortAccount: number;
  timestamp: number;
}
