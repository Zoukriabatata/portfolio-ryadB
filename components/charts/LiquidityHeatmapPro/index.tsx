/**
 * LIQUIDITY HEATMAP PRO
 *
 * Professional-grade liquidity heatmap component inspired by ATAS/Bookmap.
 *
 * Features:
 * - Real-time orderbook visualization with ATAS-style gradients
 * - Trade flow bubbles with pie charts for buy/sell visualization
 * - Draggable settings panel with multiple configuration tabs
 * - Context menu (right-click) for quick actions
 * - Smart zoom: drag UP on price axis = zoom IN, drag DOWN = zoom OUT
 * - Auto-center to keep current price in view
 * - Keyboard shortcuts: R (reset), C (auto-center), +/- (zoom)
 *
 * @example
 * ```tsx
 * import { LiquidityHeatmapPro } from '@/components/charts';
 *
 * <LiquidityHeatmapPro height={600} priceRangeTicks={100} />
 * ```
 */

// Main component
export { LiquidityHeatmapPro } from './LiquidityHeatmapPro';

// Sub-components
export { HeatmapSettingsPanel } from './HeatmapSettingsPanel';
export { TradeFlowRenderer } from './TradeFlowRenderer';

// Types
export type {
  Point,
  Dimensions,
  MouseState,
  ContextMenuState,
  HeatmapLayout,
  RenderConfig,
  OrderbookLevel,
  OrderbookSnapshot,
} from './types';

export { DEFAULT_RENDER_CONFIG } from './types';
