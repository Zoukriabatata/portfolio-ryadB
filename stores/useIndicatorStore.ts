import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IndicatorConfig } from '@/types/charts';
import { DEFAULT_INDICATORS } from '@/types/charts';

interface IndicatorState {
  indicators: IndicatorConfig[];

  addIndicator: (config: IndicatorConfig) => void;
  updateIndicator: (id: string, updates: Partial<IndicatorConfig>) => void;
  removeIndicator: (id: string) => void;
  toggleIndicator: (id: string) => void;
  resetIndicators: () => void;
}

export const useIndicatorStore = create<IndicatorState>()(
  persist(
    (set) => ({
      indicators: [...DEFAULT_INDICATORS],

      addIndicator: (config) => set((state) => ({
        indicators: [...state.indicators, config],
      })),

      updateIndicator: (id, updates) => set((state) => ({
        indicators: state.indicators.map(ind =>
          ind.id === id ? { ...ind, ...updates } : ind
        ),
      })),

      removeIndicator: (id) => set((state) => ({
        indicators: state.indicators.filter(ind => ind.id !== id),
      })),

      toggleIndicator: (id) => set((state) => ({
        indicators: state.indicators.map(ind =>
          ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
        ),
      })),

      resetIndicators: () => set({
        indicators: [...DEFAULT_INDICATORS],
      }),
    }),
    {
      name: 'indicator-storage',
      skipHydration: true,
    }
  )
);
