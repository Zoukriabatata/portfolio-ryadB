/**
 * WebGL Heatmap Renderer
 * High-performance GPU-accelerated rendering for liquidity heatmap
 */

// Main exports
export { HybridRenderer, type HybridRendererConfig, type RenderData } from './HybridRenderer';
export { Canvas2DOverlay, type OverlayConfig } from './Canvas2DOverlay';

// Core
export { RenderContext } from './core/RenderContext';
export { TextureManager } from './core/TextureManager';

// Commands
export {
  HeatmapCommand,
  LinesCommand,
  TradeBubblesCommand,
  type HeatmapRenderProps,
  type GridRenderProps,
  type StaircaseRenderProps,
  type TradeBubbleRenderProps,
} from './commands';

// Shaders (for advanced usage)
export { heatmapVert, heatmapFrag, gridVert, gridFrag, staircaseVert, staircaseFrag } from './shaders/heatmap';

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

// Types
export type {
  WebGLRenderConfig,
  HeatmapCell,
  PassiveOrderData,
  TradeData,
  LineData,
  DirtyFlags,
  WebGLBuffers,
  HeatmapUniforms,
  TradeUniforms,
  LineUniforms,
} from './types';
