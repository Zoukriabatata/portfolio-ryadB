import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  HeatmapSettings,
  AlertZone,
  HeatmapProSettings,
  TradeFlowSettings,
  DOMColorSettings,
  ColorScheme,
  SmoothingMode,
  BubbleShape,
} from '@/types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS, DEFAULT_HEATMAP_PRO_SETTINGS } from '@/types/heatmap';

export interface HeatmapSettingsState extends HeatmapSettings, HeatmapProSettings {
  // Alert zones
  alertZones: AlertZone[];

  // Settings panel state
  isSettingsPanelOpen: boolean;
  settingsPanelPosition: { x: number; y: number };

  // Legacy actions
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

  // ============ HEATMAP PRO ACTIONS ============

  // General
  setAutoCenter: (enabled: boolean) => void;
  setColorScheme: (scheme: ColorScheme) => void;

  // Display
  setUpperCutoffPercent: (percent: number) => void;
  setContrast: (value: number) => void;
  setSmoothing: (mode: SmoothingMode) => void;
  setSmoothingValue: (value: number) => void;
  setUseTransparency: (enabled: boolean) => void;

  // Best Bid/Ask
  setBestBidAskPixelSize: (size: number) => void;
  setBestBidColor: (color: string) => void;
  setBestAskColor: (color: string) => void;

  // DOM
  setDOMColors: (colors: Partial<DOMColorSettings>) => void;
  setMaxVolumePixelSize: (size: number) => void;

  // Trade Flow
  setTradeFlowEnabled: (enabled: boolean) => void;
  setTradeFlowSettings: (settings: Partial<TradeFlowSettings>) => void;

  // Zoom/Pan
  setZoomLevel: (level: number) => void;
  setPriceOffset: (offset: number) => void;
  resetZoom: () => void;

  // Settings Panel
  openSettingsPanel: (position?: { x: number; y: number }) => void;
  closeSettingsPanel: () => void;
  setSettingsPanelPosition: (position: { x: number; y: number }) => void;

  // Reset
  resetToDefaults: () => void;
}

export const useHeatmapSettingsStore = create<HeatmapSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_HEATMAP_SETTINGS,
      ...DEFAULT_HEATMAP_PRO_SETTINGS,
      alertZones: [],
      isSettingsPanelOpen: false,
      settingsPanelPosition: { x: 100, y: 100 },

      // Legacy actions
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

      // ============ HEATMAP PRO ACTIONS ============

      // General
      setAutoCenter: (enabled) => set({ autoCenter: enabled }),
      setColorScheme: (scheme) => set({ colorScheme: scheme }),

      // Display
      setUpperCutoffPercent: (percent) => set({ upperCutoffPercent: Math.max(0, Math.min(100, percent)) }),
      setContrast: (value) => set({ contrast: Math.max(0.5, Math.min(3, value)) }),
      setSmoothing: (mode) => set({ smoothing: mode }),
      setSmoothingValue: (value) => set({ smoothingValue: Math.max(1, Math.min(10, value)) }),
      setUseTransparency: (enabled) => set({ useTransparency: enabled }),

      // Best Bid/Ask
      setBestBidAskPixelSize: (size) => set({ bestBidAskPixelSize: Math.max(20, Math.min(100, size)) }),
      setBestBidColor: (color) => set({ bestBidColor: color }),
      setBestAskColor: (color) => set({ bestAskColor: color }),

      // DOM
      setDOMColors: (colors) => set((state) => ({
        domColors: { ...state.domColors, ...colors },
      })),
      setMaxVolumePixelSize: (size) => set({ maxVolumePixelSize: Math.max(20, Math.min(200, size)) }),

      // Trade Flow
      setTradeFlowEnabled: (enabled) => set((state) => ({
        tradeFlow: { ...state.tradeFlow, enabled },
      })),
      setTradeFlowSettings: (settings) => set((state) => ({
        tradeFlow: { ...state.tradeFlow, ...settings },
      })),

      // Zoom/Pan
      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.5, Math.min(3, level)) }),
      setPriceOffset: (offset) => set({ priceOffset: offset }),
      resetZoom: () => set({ zoomLevel: 1, priceOffset: 0 }),

      // Settings Panel
      openSettingsPanel: (position) => set((state) => ({
        isSettingsPanelOpen: true,
        settingsPanelPosition: position || state.settingsPanelPosition,
      })),
      closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),
      setSettingsPanelPosition: (position) => set({ settingsPanelPosition: position }),

      // Reset
      resetToDefaults: () => set({
        ...DEFAULT_HEATMAP_SETTINGS,
        ...DEFAULT_HEATMAP_PRO_SETTINGS,
      }),
    }),
    {
      name: 'heatmap-settings-storage',
      partialize: (state) => ({
        // Persist only settings, not UI state
        ...DEFAULT_HEATMAP_SETTINGS,
        ...DEFAULT_HEATMAP_PRO_SETTINGS,
        autoCenter: state.autoCenter,
        colorScheme: state.colorScheme,
        upperCutoffPercent: state.upperCutoffPercent,
        contrast: state.contrast,
        smoothing: state.smoothing,
        smoothingValue: state.smoothingValue,
        useTransparency: state.useTransparency,
        bestBidAskPixelSize: state.bestBidAskPixelSize,
        bestBidColor: state.bestBidColor,
        bestAskColor: state.bestAskColor,
        domColors: state.domColors,
        maxVolumePixelSize: state.maxVolumePixelSize,
        tradeFlow: state.tradeFlow,
        alertZones: state.alertZones,
      }),
    }
  )
);
