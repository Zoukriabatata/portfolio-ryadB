/**
 * INSTITUTIONAL-GRADE LIQUIDITY HEATMAP - Type Definitions
 *
 * Core type definitions for the liquidity heatmap system.
 * Designed for market microstructure accuracy.
 */

// ============================================================================
// CORE DATA TYPES
// ============================================================================

/**
 * Single liquidity cell at a specific price-time point
 */
export interface LiquidityCell {
  price: number;
  timestamp: number;
  bidSize: number;
  askSize: number;
  bidDecay: number;          // EMA-smoothed bid value
  askDecay: number;          // EMA-smoothed ask value
  persistence: number;       // How long liquidity present (ms)
  absorptionBid: number;     // Cumulative absorbed bid volume
  absorptionAsk: number;     // Cumulative absorbed ask volume
  flags: CellFlags;
}

export interface CellFlags {
  isWall: boolean;
  isSpoofSuspect: boolean;
  isAbsorption: boolean;
  wallStrength: number;      // 0-1, how significant the wall is
  absorptionStrength: number; // 0-1
  spoofConfidence: number;   // 0-1
}

/**
 * Single column in the history buffer (one time slice)
 */
export interface LiquidityColumn {
  timestamp: number;
  cells: Map<number, LiquidityCell>;
  maxBidSize: number;
  maxAskSize: number;
  totalBidSize: number;
  totalAskSize: number;
  volatility: number;
  bestBid: number;
  bestAsk: number;
}

/**
 * Order level in the live order book
 */
export interface OrderLevel {
  price: number;
  size: number;
  orderCount: number;
  firstSeen: number;
  lastModified: number;
  previousSize: number;
  cumulativeAbsorption: number;
  sizeHistory: Array<{ timestamp: number; size: number }>;
}

/**
 * Live order book state
 */
export interface OrderBookState {
  bids: Map<number, OrderLevel>;
  asks: Map<number, OrderLevel>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
  imbalance: number;
  lastUpdateTime: number;
  updateCount: number;
}

/**
 * Executed trade
 */
export interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
  isBuyerMaker: boolean;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Detected liquidity wall
 */
export interface WallInfo {
  price: number;
  side: 'bid' | 'ask';
  size: number;
  strength: number;          // Sigma above mean
  persistence: number;       // How long it's been there (ms)
  absorptionRatio: number;   // Volume absorbed / total size
  isDefending: boolean;      // True if actively absorbing
  firstSeen: number;
  lastSeen: number;
}

/**
 * Absorption event
 */
export interface AbsorptionEvent {
  id: string;
  price: number;
  side: 'bid' | 'ask';
  totalAbsorbed: number;
  remainingSize: number;
  startTime: number;
  endTime: number | null;
  priceAction: 'bounce' | 'break' | 'ongoing';
  strength: number;
  trades: Trade[];
}

/**
 * Spoofing pattern detection
 */
export interface SpoofPattern {
  id: string;
  price: number;
  side: 'bid' | 'ask';
  confidence: number;
  reason: SpoofReason;
  size: number;
  lifetime: number;          // How long it existed (ms)
  detectedAt: number;
  executedVolume: number;
}

export type SpoofReason =
  | 'large_order_pulled'
  | 'layering_detected'
  | 'quote_stuffing'
  | 'momentum_ignition'
  | 'repeated_pattern';

// ============================================================================
// RENDERING TYPES
// ============================================================================

export interface Viewport {
  startTime: number;
  endTime: number;
  minPrice: number;
  maxPrice: number;
  width: number;
  height: number;
  pixelsPerMs: number;
  pixelsPerPrice: number;
}

export interface ColorStop {
  position: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ColorConfig {
  scheme: 'bookmap' | 'atas' | 'thermal' | 'custom';
  bidGradient: ColorStop[];
  askGradient: ColorStop[];
  upperCutoffPercentile: number;
  lowerCutoffPercentile: number;
  useLogScale: boolean;
  gamma: number;
}

export interface RenderStats {
  frameTime: number;
  cellsRendered: number;
  tradesRendered: number;
  overlaysRendered: number;
  fps: number;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

export interface HeatmapSettings {
  // Liquidity Display
  liquidityThreshold: number;
  upperCutoffPercent: number;
  lowerCutoffPercent: number;

  // Time Decay
  decayEnabled: boolean;
  decayHalfLifeMs: number;

  // Color
  colorScheme: 'bookmap' | 'atas' | 'thermal';
  bidBaseColor: string;
  askBaseColor: string;
  useLogScale: boolean;
  gamma: number;

  // Analytics
  showWalls: boolean;
  wallThresholdSigma: number;
  showAbsorption: boolean;
  absorptionMinPercent: number;
  showSpoofing: boolean;
  spoofingConfidenceThreshold: number;

  // Display
  showBids: boolean;
  showAsks: boolean;
  showTrades: boolean;
  tradeMinSize: number;
  tradeBubbleScale: number;

  // Zoom
  priceZoom: number;
  timeZoom: number;
  autoCenter: boolean;

  // Performance
  updateIntervalMs: number;
  maxHistoryColumns: number;
  columnWidthMs: number;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  liquidityThreshold: 0,
  upperCutoffPercent: 97,
  lowerCutoffPercent: 5,

  decayEnabled: true,
  decayHalfLifeMs: 5000,

  colorScheme: 'bookmap',
  bidBaseColor: '#22d3ee',
  askBaseColor: '#ef4444',
  useLogScale: true,
  gamma: 1.2,

  showWalls: true,
  wallThresholdSigma: 2.5,
  showAbsorption: true,
  absorptionMinPercent: 20,
  showSpoofing: true,
  spoofingConfidenceThreshold: 0.7,

  showBids: true,
  showAsks: true,
  showTrades: true,
  tradeMinSize: 0.1,
  tradeBubbleScale: 1.0,

  priceZoom: 1.0,
  timeZoom: 1.0,
  autoCenter: true,

  updateIntervalMs: 100,
  maxHistoryColumns: 2000,
  columnWidthMs: 250,
};

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

// Statistics for normalization
export interface LiquidityStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p97: number;
}
