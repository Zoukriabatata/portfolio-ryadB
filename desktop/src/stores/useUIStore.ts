import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Global UI state shared across routes — sidebar collapse, modal stack,
 * which broker-settings modal is open, etc. Anything that the navbar or
 * a route needs to read from "elsewhere" lives here so we don't
 * prop-drill or reach for context.
 *
 * Phase B / M1 ships only the strict minimum (sidebar collapsed,
 * settings modal). M3+ will add per-chart UI state in dedicated
 * stores (useFootprintSettingsStore, useHeatmapSettingsStore, …)
 * mirroring the web's `stores/` layout.
 */

type UIState = {
  sidebarCollapsed: boolean;
  brokerSettingsOpen: boolean;

  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  openBrokerSettings: () => void;
  closeBrokerSettings: () => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      brokerSettingsOpen: false,

      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      openBrokerSettings: () => set({ brokerSettingsOpen: true }),
      closeBrokerSettings: () => set({ brokerSettingsOpen: false }),
    }),
    {
      name: "senzoukria-ui-v1",
      partialize: (s) => ({
        // Persist UI prefs that survive restart; ephemeral modal
        // state stays in memory only.
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    },
  ),
);
