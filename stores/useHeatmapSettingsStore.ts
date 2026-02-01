import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HeatmapSettings, AlertZone } from '@/types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS } from '@/types/heatmap';

interface HeatmapSettingsState extends HeatmapSettings {
  // Alert zones
  alertZones: AlertZone[];

  // Actions
  setShowLiquidityDelta: (show: boolean) => void;
  setShowWhaleHighlights: (show: boolean) => void;
  setShowVelocityBars: (show: boolean) => void;
  setShowStackedDepth: (show: boolean) => void;
  setShowTimeWeighted: (show: boolean) => void;
  setShowAlertZones: (show: boolean) => void;
  setShowAbsorption: (show: boolean) => void;
  setWhaleThreshold: (threshold: number) => void;
  setVelocityWindow: (seconds: number) => void;
  setAbsorptionThreshold: (threshold: number) => void;
  setSettings: (settings: Partial<HeatmapSettings>) => void;

  // Alert zone actions
  addAlertZone: (zone: AlertZone) => void;
  removeAlertZone: (id: string) => void;
  updateAlertZone: (id: string, updates: Partial<AlertZone>) => void;
  triggerAlertZone: (id: string) => void;
  resetAlertZone: (id: string) => void;
}

export const useHeatmapSettingsStore = create<HeatmapSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_HEATMAP_SETTINGS,
      alertZones: [],

      setShowLiquidityDelta: (show) => set({ showLiquidityDelta: show }),
      setShowWhaleHighlights: (show) => set({ showWhaleHighlights: show }),
      setShowVelocityBars: (show) => set({ showVelocityBars: show }),
      setShowStackedDepth: (show) => set({ showStackedDepth: show }),
      setShowTimeWeighted: (show) => set({ showTimeWeighted: show }),
      setShowAlertZones: (show) => set({ showAlertZones: show }),
      setShowAbsorption: (show) => set({ showAbsorption: show }),
      setWhaleThreshold: (threshold) => set({ whaleThresholdStdDev: threshold }),
      setVelocityWindow: (seconds) => set({ velocityWindowSeconds: seconds }),
      setAbsorptionThreshold: (threshold) => set({ absorptionVolumeThreshold: threshold }),

      setSettings: (settings) => set((state) => ({ ...state, ...settings })),

      addAlertZone: (zone) => set((state) => ({
        alertZones: [...state.alertZones, zone],
      })),

      removeAlertZone: (id) => set((state) => ({
        alertZones: state.alertZones.filter(z => z.id !== id),
      })),

      updateAlertZone: (id, updates) => set((state) => ({
        alertZones: state.alertZones.map(z =>
          z.id === id ? { ...z, ...updates } : z
        ),
      })),

      triggerAlertZone: (id) => set((state) => ({
        alertZones: state.alertZones.map(z =>
          z.id === id ? { ...z, triggered: true } : z
        ),
      })),

      resetAlertZone: (id) => set((state) => ({
        alertZones: state.alertZones.map(z =>
          z.id === id ? { ...z, triggered: false } : z
        ),
      })),
    }),
    {
      name: 'heatmap-settings-storage',
    }
  )
);
