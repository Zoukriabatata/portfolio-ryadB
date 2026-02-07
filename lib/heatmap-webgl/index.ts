/**
 * WebGL Heatmap Renderer
 * High-performance GPU-accelerated rendering for liquidity heatmap
 */

// Main exports
export { HybridRenderer, type HybridRendererConfig, type RenderData } from './HybridRenderer';
export {
  Canvas2DOverlay,
  type OverlayConfig,
  type PriceLabel,
  type TimeLabel,
  type StatItem,
  type LabelFormatOptions,
} from './Canvas2DOverlay';

// Core
export { RenderContext } from './core/RenderContext';
export { TextureManager } from './core/TextureManager';

// Commands
export {
  HeatmapCommand,
  LinesCommand,
  TradeBubblesCommand,
  type HeatmapRenderProps,
  type GridLine,
  type GridRenderProps,
  type TickMarkRenderProps,
  type StaircaseRenderProps,
  type TradeBubbleRenderProps,
} from './commands';

// Shaders (for advanced usage)
export {
  heatmapVert,
  heatmapFrag,
  heatmapInstancedVert,
  heatmapInstancedFrag,
  gridVert,
  gridFrag,
  tickMarkVert,
  tickMarkFrag,
  staircaseVert,
  staircaseFrag,
  fillAreaVert,
  fillAreaFrag,
} from './shaders/heatmap';

// React hooks
export {
  useWebGLHeatmap,
  convertOrderbookToPassiveOrders,
  convertTradesToTradeData,
  type UseWebGLHeatmapOptions,
  type UseWebGLHeatmapReturn,
} from './hooks/useWebGLHeatmap';

// Adapters
export { adaptMarketState, createEmptyRenderData } from './adapters';

// Themes
export {
  type OrderflowTheme,
  type OrderflowColors,
  type HeatmapGradient,
  type ThemeName,
  THEME_SENZOUKRIA,
  THEME_ATAS,
  THEME_BOOKMAP,
  THEME_SIERRA,
  THEME_HIGHCONTRAST,
  THEMES,
  getTheme,
  generateGradientData,
  hexToRgb,
  rgbToHex,
} from './themes';

// Key Levels
export {
  KeyLevelsCommand,
  type KeyLevel,
  type KeyLevelType,
  type KeyLevelsRenderProps,
} from './commands/KeyLevelsCommand';

// Types
export type {
  WebGLRenderConfig,
  HeatmapCell,
  PassiveOrderData,
  OrderState,
  TradeData,
  LineData,
  DirtyFlags,
  WebGLBuffers,
  HeatmapUniforms,
  TradeUniforms,
  LineUniforms,
} from './types';
