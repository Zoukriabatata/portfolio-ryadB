import { create } from 'zustand';
import { MicrostructureEngine } from '@/lib/calculations/microstructure/MicrostructureEngine';
import type { MicrostructureState, MicrostructureConfig } from '@/lib/calculations/microstructure/types';
import { DEFAULT_MICROSTRUCTURE_CONFIG, INITIAL_MICROSTRUCTURE_STATE } from '@/lib/calculations/microstructure/types';

interface MicrostructureStoreState extends MicrostructureState {
  config: MicrostructureConfig;
  enabled: boolean;

  processTick: (tick: { quantity: number; isBuyerMaker: boolean; timestamp: number }) => void;
  onCandleClose: (candleDelta: number) => void;
  getLevelZScore: (levelDelta: number) => number;
  setConfig: (config: Partial<MicrostructureConfig>) => void;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
}

// Engine singleton lives outside the store (same pattern as absorptionTracker in useFootprintStore)
let engine: MicrostructureEngine | null = null;

// Throttle store updates to avoid React re-render storms on high-frequency ticks
const TICK_THROTTLE = 50;
let tickCounter = 0;

function getEngine(config: MicrostructureConfig): MicrostructureEngine {
  if (!engine) {
    engine = new MicrostructureEngine(config);
  }
  return engine;
}

export const useMicrostructureStore = create<MicrostructureStoreState>((set, get) => ({
  ...INITIAL_MICROSTRUCTURE_STATE,
  config: DEFAULT_MICROSTRUCTURE_CONFIG,
  enabled: true,

  processTick: (tick) => {
    if (!get().enabled) return;
    const e = getEngine(get().config);
    e.processTick(tick);
    tickCounter++;

    // Throttled: only update Zustand state every N ticks
    // VPIN updates internally every tick, but React doesn't need to know per-tick
    if (tickCounter >= TICK_THROTTLE) {
      tickCounter = 0;
      set(e.getState());
    }
  },

  onCandleClose: (candleDelta) => {
    if (!get().enabled) return;
    const e = getEngine(get().config);
    e.onCandleClose(candleDelta);
    // Always update on candle close — this is where z-score and Kalman change
    set(e.getState());
  },

  getLevelZScore: (levelDelta) => {
    if (!engine) return 0;
    return engine.getLevelZScore(levelDelta);
  },

  setConfig: (newConfig) => {
    const merged = {
      normalizedDelta: { ...get().config.normalizedDelta, ...newConfig.normalizedDelta },
      vpin: { ...get().config.vpin, ...newConfig.vpin },
      kalman: { ...get().config.kalman, ...newConfig.kalman },
    };
    set({ config: merged });
    // Recreate engine with new config
    engine = new MicrostructureEngine(merged);
  },

  setEnabled: (enabled) => set({ enabled }),

  reset: () => {
    engine?.reset();
    engine = null;
    tickCounter = 0;
    set(INITIAL_MICROSTRUCTURE_STATE);
  },
}));
