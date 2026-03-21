/**
 * CHART SYNC STORE
 *
 * Zustand store for controlling cross-chart synchronization.
 * Manages sync toggles and coordinates between charts via BroadcastChannel.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChartSyncState {
  syncEnabled: boolean;
  syncCrosshair: boolean;
  syncSymbol: boolean;
  syncTimeframe: boolean;
}

interface ChartSyncActions {
  setSyncEnabled: (enabled: boolean) => void;
  setSyncCrosshair: (enabled: boolean) => void;
  setSyncSymbol: (enabled: boolean) => void;
  setSyncTimeframe: (enabled: boolean) => void;
  toggleSync: () => void;
}

type ChartSyncStore = ChartSyncState & ChartSyncActions;

export const useChartSyncStore = create<ChartSyncStore>()(
  persist(
    (set) => ({
      // State
      syncEnabled: false,
      syncCrosshair: true,
      syncSymbol: true,
      syncTimeframe: false,

      // Actions
      setSyncEnabled: (enabled) => set({ syncEnabled: enabled }),
      setSyncCrosshair: (enabled) => set({ syncCrosshair: enabled }),
      setSyncSymbol: (enabled) => set({ syncSymbol: enabled }),
      setSyncTimeframe: (enabled) => set({ syncTimeframe: enabled }),
      toggleSync: () => set((s) => ({ syncEnabled: !s.syncEnabled })),
    }),
    {
      name: 'chart-sync-settings',
      skipHydration: true,
    },
  ),
);
