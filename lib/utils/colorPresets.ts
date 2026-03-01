/**
 * CENTRALIZED COLOR PRESETS — Single source of truth for all color palettes.
 *
 * All components should import from here instead of defining local arrays.
 */

// ============ GENERAL PURPOSE ============

/** Full palette: 16 colors covering the spectrum + neutrals */
export const TOOL_PRESETS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#ffffff', '#71717a',
] as const;

/** Compact palette: 8 colors for tight spaces */
export const TOOL_PRESETS_COMPACT = [
  '#22c55e', '#ef4444', '#3b82f6', '#fbbf24',
  '#a855f7', '#06b6d4', '#ffffff', '#525252',
] as const;

/** Picker presets: 12 colors for the HSV color picker swatch grid */
export const PICKER_PRESETS = [
  '#22c55e', '#ef4444', '#3b82f6', '#fbbf24',
  '#06b6d4', '#a855f7', '#ec4899', '#f97316',
  '#ffffff', '#a1a1aa', '#525252', '#171717',
] as const;

// ============ INDICATOR COLORS ============

/** Indicator palette: 18 colors for overlays / indicators */
export const INDICATOR_PRESETS = [
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#a78bfa', '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22d3ee', '#ffffff',
  '#a3a3a3', '#737373', '#525252',
] as const;

// ============ CHART SPECIFIC ============

/** Chart color presets organized by category */
export const CHART_COLOR_PRESETS = {
  candles: {
    bullish: ['#26a69a', '#22c55e', '#10b981', '#00e676', '#4ade80', '#16a34a'] as const,
    bearish: ['#ef5350', '#f44336', '#e11d48', '#dc2626', '#f87171', '#be123c'] as const,
  },
  background: ['#0a0a0a', '#0d1117', '#1a1a2e', '#16213e', '#0f0f23', '#121212', '#1e1e2f', '#0d0d0d'] as const,
  indicators: ['#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#FFEB3B', '#4CAF50', '#FF5722'] as const,
  priceLine: ['#7ed321', '#3b82f6', '#f59e0b', '#22d3ee', '#a855f7', '#ef4444'] as const,
} as const;
