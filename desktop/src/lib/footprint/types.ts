// Phase B / M4 — internal renderer types.
//
// Decoupled from the Tauri-side `FootprintBar` so the renderer stays
// framework-agnostic. The adapter (`adapter.ts`) translates from the
// Tauri shape (array of price levels, ns timestamps) to this one.

export interface RendererPriceLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  buyTrades: number;
  sellTrades: number;
}

export interface RendererBar {
  // Bucket start, in ms (caller converts ns → ms).
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalDelta: number;
  tradeCount: number;
  levels: RendererPriceLevel[];

  // Cached aggregates (computed once when the bar enters the
  // renderer cache; null until then).
  poc?: number;
  pocVolume?: number;
  maxLevelVolume?: number;
}

export interface LayoutConfig {
  // Pixel widths for the four columns: bid · ohlc · ask · profile.
  bidWidth: number;
  ohlcWidth: number;
  askWidth: number;
  profileWidth: number;
  // Per-price-level row height in pixels.
  rowHeight: number;
  // Horizontal gap between two consecutive bars.
  barGap: number;
  // Reserved space at the bottom for the time axis.
  timeAxisHeight: number;
  // Reserved space at the right for the price axis.
  priceAxisWidth: number;
  // Padding around the chart.
  paddingTop: number;
  paddingLeft: number;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  bidWidth: 56,
  ohlcWidth: 8,
  askWidth: 56,
  profileWidth: 36,
  rowHeight: 13,
  barGap: 4,
  timeAxisHeight: 22,
  priceAxisWidth: 64,
  paddingTop: 8,
  paddingLeft: 8,
};

export function barTotalWidth(layout: LayoutConfig): number {
  return layout.bidWidth + layout.ohlcWidth + layout.askWidth + layout.profileWidth;
}
