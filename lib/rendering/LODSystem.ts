/**
 * LOD (Level of Detail) System - ATAS Professional Style
 *
 * SIMPLE 2-STATE SYSTEM:
 * - FOOTPRINT: When visible bars <= threshold (full orderflow detail)
 * - CANDLES: When visible bars > threshold (clean candlestick chart)
 *
 * NO intermediate states. NO hybrid rendering. NO transitions.
 * Hard switch only.
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const LOD_CONFIG = {
  // Maximum visible bars for footprint mode
  // Above this → switch to candles
  FOOTPRINT_MAX_BARS: 100, // Increased to allow more bars in footprint mode

  // Maximum timeframe (in seconds) for footprint mode
  // Only timeframes removed from UI would trigger this
  FOOTPRINT_MAX_TIMEFRAME: 900,

  // Minimum row height for readable footprint
  MIN_ROW_HEIGHT: 10,

  // Font sizes for footprint mode
  FONT_SIZE_NORMAL: 10,
  FONT_SIZE_COMPACT: 8,
} as const;

// ═══════════════════════════════════════════════════════════════
// RENDER MODE - Only 2 states, nothing else
// ═══════════════════════════════════════════════════════════════

export type RenderMode = 'footprint' | 'candles';

export interface LODState {
  // The ONE decision that matters
  mode: RenderMode;

  // Metrics for debugging/display
  visibleBars: number;
  threshold: number;

  // Footprint-specific settings (only used in footprint mode)
  fontSize: number;
  showSeparator: boolean;
  showImbalances: boolean;
  showPOC: boolean;
  showDeltaProfile: boolean;
  showCellBorders: boolean;

  // Candle-specific settings (only used in candle mode)
  candleBodyWidth: number; // percentage of bar width
}

// ═══════════════════════════════════════════════════════════════
// STATE COMPUTATION - Simple binary decision
// ═══════════════════════════════════════════════════════════════

export function computeLODState(
  visibleBars: number,
  pixelsPerBar: number,
  rowHeight: number,
  threshold: number = LOD_CONFIG.FOOTPRINT_MAX_BARS,
  timeframeSeconds: number = 60
): LODState {
  // ═══════════════════════════════════════════════════════════
  // THE ONLY DECISION: Is it footprint or candles?
  // - If timeframe >= 15m (900s) → ALWAYS candles
  // - Otherwise, based on visible bar count
  // ═══════════════════════════════════════════════════════════
  const isHighTimeframe = timeframeSeconds >= LOD_CONFIG.FOOTPRINT_MAX_TIMEFRAME;
  const mode: RenderMode = isHighTimeframe ? 'candles' : (visibleBars <= threshold ? 'footprint' : 'candles');

  // ═══════════════════════════════════════════════════════════
  // FOOTPRINT MODE SETTINGS
  // ═══════════════════════════════════════════════════════════
  const fontSize = rowHeight >= 14 ? LOD_CONFIG.FONT_SIZE_NORMAL : LOD_CONFIG.FONT_SIZE_COMPACT;
  const showSeparator = pixelsPerBar >= 80 && rowHeight >= 14;
  const showImbalances = true; // Always show in footprint mode
  const showPOC = true;
  const showDeltaProfile = true;
  const showCellBorders = rowHeight >= 12;

  // ═══════════════════════════════════════════════════════════
  // CANDLE MODE SETTINGS
  // ═══════════════════════════════════════════════════════════
  const candleBodyWidth = Math.min(0.8, Math.max(0.3, 8 / pixelsPerBar));

  return {
    mode,
    visibleBars,
    threshold,
    fontSize,
    showSeparator,
    showImbalances,
    showPOC,
    showDeltaProfile,
    showCellBorders,
    candleBodyWidth,
  };
}

// ═══════════════════════════════════════════════════════════════
// CACHE - Prevent unnecessary recomputation
// ═══════════════════════════════════════════════════════════════

let cachedState: LODState | null = null;
let cachedVisibleBars: number = -1;
let cachedThreshold: number = -1;

let cachedTimeframe: number = -1;

export function getCachedLODState(
  visibleBars: number,
  pixelsPerBar: number,
  rowHeight: number,
  threshold: number = LOD_CONFIG.FOOTPRINT_MAX_BARS,
  timeframeSeconds: number = 60
): LODState {
  // Only recompute if the mode-determining values changed
  if (
    cachedState &&
    cachedVisibleBars === visibleBars &&
    cachedThreshold === threshold &&
    cachedTimeframe === timeframeSeconds
  ) {
    return cachedState;
  }

  cachedState = computeLODState(visibleBars, pixelsPerBar, rowHeight, threshold, timeframeSeconds);
  cachedVisibleBars = visibleBars;
  cachedThreshold = threshold;
  cachedTimeframe = timeframeSeconds;

  return cachedState;
}

export function invalidateLODCache(): void {
  cachedState = null;
  cachedVisibleBars = -1;
  cachedThreshold = -1;
  cachedTimeframe = -1;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

export function formatVolume(vol: number): string {
  const abs = Math.abs(vol);
  if (abs < 1) return '';
  if (abs >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${Math.round(vol / 1000)}K`;
  return Math.round(vol).toString();
}

export function formatVolumeCompact(vol: number): string {
  const abs = Math.abs(vol);
  if (abs < 1) return '';
  if (abs >= 10000) return `${Math.round(vol / 1000)}K`;
  return Math.round(vol).toString();
}

// ═══════════════════════════════════════════════════════════════
// MODE CHECK HELPERS - For clean conditional rendering
// ═══════════════════════════════════════════════════════════════

export function isFootprintMode(state: LODState): boolean {
  return state.mode === 'footprint';
}

export function isCandleMode(state: LODState): boolean {
  return state.mode === 'candles';
}
