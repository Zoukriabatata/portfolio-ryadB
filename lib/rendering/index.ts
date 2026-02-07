/**
 * Rendering Module
 *
 * Two LOD systems:
 * 1. Mode LOD: FOOTPRINT vs CANDLES (based on visible bar count)
 * 2. Footprint LOD: Detail level within footprint mode (based on timeframe/density)
 */

// Mode LOD (FOOTPRINT vs CANDLES)
export {
  LOD_CONFIG,
  computeLODState,
  getCachedLODState,
  invalidateLODCache,
  formatVolume,
  formatVolumeCompact,
  isFootprintMode,
  isCandleMode,
  type LODState,
  type RenderMode,
} from './LODSystem';

// Footprint Detail LOD (for higher timeframes)
export {
  FOOTPRINT_LOD_CONFIG,
  LOD_NAMES,
  computeFootprintLOD,
  filterLevelsForRendering,
  computeDeltaProfileWidth,
  computeFootprintCellWidth,
  computeEffectiveRowHeight,
  type FootprintLODLevel,
  type FootprintLODState,
  type PriceLevel,
} from './FootprintLOD';
