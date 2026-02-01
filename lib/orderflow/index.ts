/**
 * ORDERFLOW MODULE
 *
 * Agrégation et rendu de données orderflow style ATAS/NinjaTrader
 */

export {
  OrderflowEngine,
  getOrderflowEngine,
  resetOrderflowEngine,
  configureOrderflow,
  type FootprintCandle,
  type PriceLevel,
  type OrderflowConfig,
} from './OrderflowEngine';

export {
  FootprintRenderer,
  FootprintRendererPro,
  DEFAULT_RENDER_CONFIG,
  DEFAULT_FOOTPRINT_RENDER_CONFIG,
  type FootprintRenderConfig,
} from './FootprintRenderer';

export {
  FootprintLayoutEngine,
  getFootprintLayoutEngine,
  resetFootprintLayoutEngine,
  type LayoutMetrics,
  type LayoutConfig,
  type ViewportState,
  type CellPosition,
  DEFAULT_LAYOUT_CONFIG,
} from './FootprintLayoutEngine';

export {
  FootprintEngine,
  getFootprintEngine,
  resetFootprintEngine,
  configureFootprintEngine,
  type TradeData,
  type FootprintConfig,
  type DeltaProfileLevel,
} from './FootprintEngine';
