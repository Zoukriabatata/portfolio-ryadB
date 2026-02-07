// Simulation exports
export { MarketSimulationEngine } from './MarketSimulationEngine';
export type {
  SimulationConfig,
  SimulatedOrder,
  SimulatedTrade,
  SimulationState
} from './MarketSimulationEngine';

// Institutional simulation (advanced)
export { InstitutionalSimulationEngine } from './InstitutionalSimulationEngine';
export type {
  InstitutionalConfig,
  LiquidityLevel,
  InstitutionalTrade,
  TradeCluster,
  InteractionEvent,
  InstitutionalState
} from './InstitutionalSimulationEngine';

// Smoothed simulation (time-dilated, human-readable)
export { SmoothedSimulationEngine, SPEED_PRESETS } from './SmoothedSimulationEngine';
export type {
  SpeedMode,
  SpeedConfig,
  SmoothedConfig,
  SmoothedState,
  SmoothedLiquidityLevel,
  SmoothedTrade
} from './SmoothedSimulationEngine';
