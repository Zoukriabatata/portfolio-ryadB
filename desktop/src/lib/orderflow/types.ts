/**
 * Orderflow types — ported from web `lib/orderflow/OrderflowEngine.ts`.
 *
 * Pure type extraction so the desktop renderer can consume the same shape as
 * the web FootprintCanvasRenderer without dragging the full engine across.
 */

/** Niveau de prix avec volumes Bid/Ask */
export interface PriceLevel {
  price: number;
  bidVolume: number;      // Sell market orders (hit the bid)
  askVolume: number;      // Buy market orders (hit the ask)
  bidTrades: number;      // Nombre de trades bid
  askTrades: number;      // Nombre de trades ask
  delta: number;          // askVolume - bidVolume
  totalVolume: number;    // bidVolume + askVolume
  imbalanceBuy: boolean;  // Ask >> Bid (buyers aggressive)
  imbalanceSell: boolean; // Bid >> Ask (sellers aggressive)
}

/** Bougie Footprint complète */
export interface FootprintCandle {
  time: number;           // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;

  // Footprint data
  levels: Map<number, PriceLevel>;  // price -> PriceLevel

  // Aggregates
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;

  // Key levels
  poc: number;            // Point of Control (highest volume price)
  vah: number;            // Value Area High
  val: number;            // Value Area Low

  // Status
  isClosed: boolean;
}
