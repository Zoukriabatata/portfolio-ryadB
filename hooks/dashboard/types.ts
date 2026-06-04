/**
 * Shared types for dashboard data hooks. Mirrors what the legacy
 * monolith page.tsx defined inline so the extraction is a pure move
 * — phase 2 doesn't reshape any data.
 */

export interface TickerData {
  symbol: string;
  price: number;
  changePercent: number;
  quoteVolume24h: number;
}

export interface FundingData {
  symbol: string;
  fundingRate: number;
  nextFundingTime: number;
}

export interface LiquidationEvent {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  valueUSD: number;
  price: number;
  time: number;
}
