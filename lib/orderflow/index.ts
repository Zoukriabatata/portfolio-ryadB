/**
 * ORDERFLOW MODULE
 *
 * Agrégation et rendu de données orderflow institutional
 *
 * Architecture:
 * 1. CMEContractSpecs - Spécifications exactes des contrats CME
 * 2. FootprintAggregator - Agrégation tick-by-tick professionnelle
 * 3. ATASRenderer - Rendu Canvas professionnel
 * 4. OrderflowEngine - Engine legacy (compatibilité)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CME CONTRACT SPECIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  CME_CONTRACTS,
  getContractSpec,
  alignToTick,
  normalizeVolume,
  getPriceLevels,
  NQ_SPEC,
  MNQ_SPEC,
  ES_SPEC,
  MES_SPEC,
  GC_SPEC,
  MGC_SPEC,
  type CMEContractSpec,
} from './CMEContractSpecs';

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT AGGREGATOR (PROFESSIONAL)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  FootprintAggregator,
  getFootprintAggregator,
  resetFootprintAggregator,
  resetAllAggregators,
  classifyTrade,
  type CMETrade,
  type FootprintLevel,
  type FootprintCandle as ATASFootprintCandle,
  type ClassificationMethod,
} from './FootprintAggregator';

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ATASRenderer,
  DEFAULT_ATAS_CONFIG,
  type ATASRenderConfig,
} from './ATASRenderer';

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (BACKWARD COMPATIBILITY)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// PASSIVE LIQUIDITY SIMULATOR (Coherent Trade-Reactive System)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  PassiveLiquiditySimulator,
  getPassiveLiquiditySimulator,
  resetPassiveLiquiditySimulator,
  type PassiveLevel,
  type StablePassiveLevel,
  type PassiveLiquiditySnapshot,
  type PassiveLiquidityConfig,
  type StabilityConfig,
} from './PassiveLiquiditySimulator';

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE ABSORPTION ENGINE (Bridge between trades and passive liquidity)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  TradeAbsorptionEngine,
  getTradeAbsorptionEngine,
  resetTradeAbsorptionEngine,
  type AbsorptionCallback,
  type TradeAbsorptionEngineConfig,
} from './TradeAbsorptionEngine';

// Re-export types from passive-liquidity
export type {
  PassiveOrderLevel,
  PassiveOrderStatus,
  PassiveOrderSide,
  AbsorptionTradeEvent,
  AbsorptionResult,
  SpoofingEvent,
  CoherentPassiveLiquiditySnapshot,
  CoherentSimulatorConfig,
  AbsorptionStatistics,
} from '@/types/passive-liquidity';

export {
  getLevelKey,
  parseLevelKey,
  createPassiveOrderLevel,
  formatPassiveVolume,
  DEFAULT_COHERENT_CONFIG,
} from '@/types/passive-liquidity';
