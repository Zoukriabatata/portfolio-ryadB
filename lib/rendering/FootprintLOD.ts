/**
 * Footprint LOD System - ATAS Professional Style
 *
 * Adapts footprint rendering based on:
 * - Timeframe
 * - Pixels per price level
 * - Number of price levels in candle
 * - Volume distribution
 *
 * 4 LOD Levels:
 * - LOD 0: Full detail (all text, all levels)
 * - LOD 1: Reduced detail (text for significant levels only)
 * - LOD 2: Structural only (bars, no text)
 * - LOD 3: Heatmap only (color intensity, no structure)
 */

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export const FOOTPRINT_LOD_CONFIG = {
  // Minimum pixels per level for each LOD
  MIN_PPL_FULL: 14,        // LOD 0: Full detail
  MIN_PPL_REDUCED: 10,     // LOD 1: Reduced detail
  MIN_PPL_STRUCTURAL: 6,   // LOD 2: Structural only
  // Below 6px → LOD 3: Heatmap

  // Maximum levels for each LOD
  MAX_LEVELS_FULL: 20,
  MAX_LEVELS_REDUCED: 40,
  MAX_LEVELS_STRUCTURAL: 80,

  // Text visibility thresholds
  MIN_ROW_HEIGHT_FOR_TEXT: 12,
  MIN_CELL_WIDTH_FOR_TEXT: 40,
  MIN_CELL_WIDTH_FOR_SEPARATOR: 70,

  // Volume filtering
  VOLUME_FILTER_RATIO_REDUCED: 0.1,    // Show levels with >= 10% of max volume
  VOLUME_FILTER_RATIO_STRUCTURAL: 0.2, // Show levels with >= 20% of max volume

  // Font sizes
  FONT_SIZE_FULL: 10,
  FONT_SIZE_REDUCED: 9,
  FONT_SIZE_COMPACT: 8,

  // Timeframe multipliers (higher TF = more aggressive filtering)
  TIMEFRAME_THRESHOLDS: {
    60: 1.0,      // 1m: baseline
    180: 1.2,     // 3m: slightly more filtering
    300: 1.5,     // 5m: moderate filtering
    900: 2.0,     // 15m: aggressive filtering
    1800: 2.5,    // 30m: very aggressive
    3600: 3.0,    // 1h: maximum filtering
  } as Record<number, number>,
} as const;

// ═══════════════════════════════════════════════════════════════
// LOD LEVEL ENUM
// ═══════════════════════════════════════════════════════════════

export type FootprintLODLevel = 0 | 1 | 2 | 3;

export const LOD_NAMES: Record<FootprintLODLevel, string> = {
  0: 'FULL',
  1: 'REDUCED',
  2: 'STRUCTURAL',
  3: 'HEATMAP',
};

// ═══════════════════════════════════════════════════════════════
// LOD STATE INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface FootprintLODState {
  // Current LOD level
  level: FootprintLODLevel;
  levelName: string;

  // Computed metrics
  pixelsPerLevel: number;
  levelCount: number;
  timeframeMultiplier: number;

  // Rendering flags
  showText: boolean;
  showSeparator: boolean;
  showCellBorders: boolean;
  showVolumeBars: boolean;
  showPOC: boolean;
  showDeltaProfile: boolean;

  // Filtering
  volumeFilterRatio: number;  // Only render levels above this ratio of max
  minVolumeToShow: number;    // Computed min volume for text

  // Sizing
  fontSize: number;
  effectiveRowHeight: number;

  // Debug
  skippedLevels: number;
}

// ═══════════════════════════════════════════════════════════════
// LOD COMPUTATION
// ═══════════════════════════════════════════════════════════════

export function computeFootprintLOD(
  availableHeight: number,
  levelCount: number,
  maxLevelVolume: number,
  timeframeSeconds: number,
  cellWidth: number
): FootprintLODState {
  const C = FOOTPRINT_LOD_CONFIG;

  // Calculate pixels per level
  const pixelsPerLevel = levelCount > 0 ? availableHeight / levelCount : availableHeight;

  // Get timeframe multiplier (higher TF = more aggressive filtering)
  const tfMultiplier = C.TIMEFRAME_THRESHOLDS[timeframeSeconds] ||
    (timeframeSeconds >= 3600 ? 3.0 : timeframeSeconds >= 300 ? 1.5 : 1.0);

  // Determine LOD level
  let level: FootprintLODLevel;

  if (pixelsPerLevel >= C.MIN_PPL_FULL && levelCount <= C.MAX_LEVELS_FULL * tfMultiplier) {
    level = 0; // Full detail
  } else if (pixelsPerLevel >= C.MIN_PPL_REDUCED && levelCount <= C.MAX_LEVELS_REDUCED * tfMultiplier) {
    level = 1; // Reduced detail
  } else if (pixelsPerLevel >= C.MIN_PPL_STRUCTURAL && levelCount <= C.MAX_LEVELS_STRUCTURAL * tfMultiplier) {
    level = 2; // Structural only
  } else {
    level = 3; // Heatmap
  }

  // Compute rendering flags based on LOD level
  const showText = level <= 1 && pixelsPerLevel >= C.MIN_ROW_HEIGHT_FOR_TEXT && cellWidth >= C.MIN_CELL_WIDTH_FOR_TEXT;
  const showSeparator = level === 0 && cellWidth >= C.MIN_CELL_WIDTH_FOR_SEPARATOR;
  const showCellBorders = level <= 1 && pixelsPerLevel >= 10;
  const showVolumeBars = level <= 2;
  const showPOC = level <= 2;
  const showDeltaProfile = level <= 2;

  // Compute volume filter ratio
  let volumeFilterRatio = 0;
  if (level === 1) {
    volumeFilterRatio = C.VOLUME_FILTER_RATIO_REDUCED * tfMultiplier;
  } else if (level === 2) {
    volumeFilterRatio = C.VOLUME_FILTER_RATIO_STRUCTURAL * tfMultiplier;
  } else if (level === 3) {
    volumeFilterRatio = 0.3 * tfMultiplier; // Very aggressive for heatmap
  }

  // Compute minimum volume to show text
  const minVolumeToShow = maxLevelVolume * volumeFilterRatio;

  // Compute font size
  let fontSize: number = C.FONT_SIZE_FULL;
  if (level === 1 || pixelsPerLevel < 14) {
    fontSize = C.FONT_SIZE_REDUCED;
  }
  if (pixelsPerLevel < 12) {
    fontSize = C.FONT_SIZE_COMPACT;
  }

  // Effective row height (never below minimum)
  const effectiveRowHeight = Math.max(pixelsPerLevel, 4);

  return {
    level,
    levelName: LOD_NAMES[level],
    pixelsPerLevel,
    levelCount,
    timeframeMultiplier: tfMultiplier,
    showText,
    showSeparator,
    showCellBorders,
    showVolumeBars,
    showPOC,
    showDeltaProfile,
    volumeFilterRatio,
    minVolumeToShow,
    fontSize,
    effectiveRowHeight,
    skippedLevels: 0, // Will be computed during render
  };
}

// ═══════════════════════════════════════════════════════════════
// LEVEL FILTERING HELPER
// ═══════════════════════════════════════════════════════════════

export interface PriceLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  totalVolume: number;
  imbalanceBuy?: boolean;
  imbalanceSell?: boolean;
}

/**
 * Filter price levels based on LOD state
 * Returns only levels that should be rendered with full detail
 */
export function filterLevelsForRendering(
  levels: Map<number, PriceLevel>,
  lodState: FootprintLODState,
  pocPrice: number
): {
  fullDetailLevels: Map<number, PriceLevel>;
  barOnlyLevels: Map<number, PriceLevel>;
  skippedCount: number;
} {
  const fullDetailLevels = new Map<number, PriceLevel>();
  const barOnlyLevels = new Map<number, PriceLevel>();
  let skippedCount = 0;

  // If LOD 3 (heatmap), skip individual level filtering
  if (lodState.level === 3) {
    return { fullDetailLevels, barOnlyLevels: levels, skippedCount: 0 };
  }

  // Find max volume for threshold calculation
  let maxVol = 1;
  levels.forEach(level => {
    maxVol = Math.max(maxVol, level.totalVolume);
  });

  const threshold = maxVol * lodState.volumeFilterRatio;

  levels.forEach((level, price) => {
    const isPOC = price === pocPrice;
    const hasImbalance = level.imbalanceBuy || level.imbalanceSell;
    const isSignificant = level.totalVolume >= threshold;

    if (lodState.level === 0) {
      // LOD 0: Show everything
      fullDetailLevels.set(price, level);
    } else if (lodState.level === 1) {
      // LOD 1: Full detail for significant levels, bars for others
      if (isSignificant || isPOC || hasImbalance) {
        fullDetailLevels.set(price, level);
      } else {
        barOnlyLevels.set(price, level);
        skippedCount++;
      }
    } else if (lodState.level === 2) {
      // LOD 2: Bars only for significant levels
      if (isSignificant || isPOC) {
        barOnlyLevels.set(price, level);
      } else {
        skippedCount++;
      }
    }
  });

  return { fullDetailLevels, barOnlyLevels, skippedCount };
}

// ═══════════════════════════════════════════════════════════════
// DELTA PROFILE SCALING
// ═══════════════════════════════════════════════════════════════

/**
 * Compute scaled delta profile width based on timeframe
 * Higher TF = narrower profile to prevent "fat diamond" effect
 */
export function computeDeltaProfileWidth(
  baseWidth: number,
  timeframeSeconds: number,
  lodLevel: FootprintLODLevel
): number {
  // Base scaling by timeframe
  let scale = 1.0;

  if (timeframeSeconds >= 3600) {
    scale = 0.5; // 1h+: half width
  } else if (timeframeSeconds >= 900) {
    scale = 0.6; // 15m+: 60%
  } else if (timeframeSeconds >= 300) {
    scale = 0.75; // 5m+: 75%
  } else if (timeframeSeconds >= 180) {
    scale = 0.85; // 3m+: 85%
  }

  // Additional scaling by LOD
  if (lodLevel >= 2) {
    scale *= 0.8; // Further compress for structural/heatmap
  }

  return Math.max(30, baseWidth * scale); // Minimum 30px
}

// ═══════════════════════════════════════════════════════════════
// CELL WIDTH SCALING
// ═══════════════════════════════════════════════════════════════

/**
 * Compute optimal footprint cell width based on timeframe
 * Higher TF = narrower cells
 */
export function computeFootprintCellWidth(
  baseWidth: number,
  timeframeSeconds: number,
  availableWidth: number,
  visibleBars: number
): number {
  // Calculate max width that fits
  const maxWidthPerBar = availableWidth / Math.max(1, visibleBars);

  // Timeframe-based scaling
  let tfScale = 1.0;

  if (timeframeSeconds >= 3600) {
    tfScale = 0.6;
  } else if (timeframeSeconds >= 900) {
    tfScale = 0.7;
  } else if (timeframeSeconds >= 300) {
    tfScale = 0.8;
  } else if (timeframeSeconds >= 180) {
    tfScale = 0.9;
  }

  const scaledWidth = baseWidth * tfScale;

  // Use the smaller of scaled width or available width
  return Math.min(scaledWidth, maxWidthPerBar * 0.9);
}

// ═══════════════════════════════════════════════════════════════
// ROW HEIGHT COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute effective row height with minimum enforcement
 * Prevents rows from becoming too small to be useful
 */
export function computeEffectiveRowHeight(
  baseRowHeight: number,
  priceRange: number,
  tickSize: number,
  availableHeight: number,
  lodLevel: FootprintLODLevel
): number {
  const levelCount = priceRange / tickSize;
  const naturalHeight = availableHeight / Math.max(1, levelCount);

  // Minimum row heights by LOD
  const minHeights: Record<FootprintLODLevel, number> = {
    0: 14, // Full: need space for text
    1: 10, // Reduced: smaller text
    2: 6,  // Structural: just bars
    3: 2,  // Heatmap: pixel-level
  };

  const minHeight = minHeights[lodLevel];

  // If natural height is too small, we'll need to filter levels
  if (naturalHeight < minHeight) {
    return minHeight;
  }

  return Math.min(naturalHeight, baseRowHeight);
}
