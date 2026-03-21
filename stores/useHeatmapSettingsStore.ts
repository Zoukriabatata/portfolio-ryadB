import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  HeatmapSettings,
  AlertZone,
  HeatmapProSettings,
  TradeFlowSettings,
  DOMColorSettings,
  LiquidityDisplayFeatures,
  ColorScheme,
  SmoothingMode,
  BubbleShape,
  FootprintStyle,
  PassiveThickness,
  StaircaseLineSettings,
  GridSettings,
  GridStyle,
  TickStyle,
  PassiveOrderSettings,
  TimeSalesSettings,
  KeyLevelsSettings,
  DeltaProfileSettings,
  DeltaProfileMode,
} from '@/types/heatmap';
import {
  DEFAULT_HEATMAP_SETTINGS,
  DEFAULT_HEATMAP_PRO_SETTINGS,
  DEFAULT_LIQUIDITY_DISPLAY_FEATURES,
  DEFAULT_STAIRCASE_LINE_SETTINGS,
  DEFAULT_GRID_SETTINGS,
  DEFAULT_PASSIVE_ORDER_SETTINGS,
  DEFAULT_TIME_SALES_SETTINGS,
  DEFAULT_KEY_LEVELS_SETTINGS,
  DEFAULT_DELTA_PROFILE_SETTINGS,
} from '@/types/heatmap';

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

  // Display Features Actions
  setDisplayFeatures: (features: Partial<LiquidityDisplayFeatures>) => void;
  setShowDeltaProfile: (show: boolean) => void;
  setShowVolumeProfile: (show: boolean) => void;
  setShowVWAP: (show: boolean) => void;
  setShowImbalances: (show: boolean) => void;
  setShowAbsorptionFeature: (show: boolean) => void;
  setShowIcebergs: (show: boolean) => void;
  setShowFootprintNumbers: (show: boolean) => void;
  setFootprintStyle: (style: FootprintStyle) => void;
  setShowTimeSales: (show: boolean) => void;
  setShowCumulativeDelta: (show: boolean) => void;
  setShowDOMLadder: (show: boolean) => void;
  setShowTapeVelocity: (show: boolean) => void;
  setShowLargeTradeAlerts: (show: boolean) => void;
  setShowPressureMeter: (show: boolean) => void;
  setShowSessionStats: (show: boolean) => void;
  setShowDrawings: (show: boolean) => void;
  setPassiveThickness: (thickness: PassiveThickness) => void;

  // Staircase Line (Best Bid/Ask)
  setStaircaseLineSettings: (settings: Partial<StaircaseLineSettings>) => void;
  setStaircaseLineWidth: (width: number) => void;
  setStaircaseShowGlow: (show: boolean) => void;
  setStaircaseGlowIntensity: (intensity: number) => void;
  setStaircaseShowSpreadFill: (show: boolean) => void;
  setStaircaseSpreadFillOpacity: (opacity: number) => void;
  setStaircaseShowTrail: (show: boolean) => void;
  setStaircaseTrailLength: (length: number) => void;
  setStaircaseTrailFadeSpeed: (speed: number) => void;

  // Grid & Ticks
  setGridSettings: (settings: Partial<GridSettings>) => void;
  setShowMajorGrid: (show: boolean) => void;
  setShowMinorGrid: (show: boolean) => void;
  setMajorGridInterval: (interval: number) => void;
  setGridStyle: (style: GridStyle) => void;
  setShowTickMarks: (show: boolean) => void;
  setTickStyle: (style: TickStyle) => void;
  setTickSize: (size: number) => void;
  setHighlightRoundNumbers: (highlight: boolean) => void;
  setRoundNumberInterval: (interval: number) => void;
  setLabelPrecision: (precision: 'auto' | number) => void;
  setShowTimeAxis: (show: boolean) => void;
  setShowSessionMarkers: (show: boolean) => void;
  setTimeFormat: (format: '12h' | '24h') => void;

  // Passive Orders (Enhanced)
  setPassiveOrderSettings: (settings: Partial<PassiveOrderSettings>) => void;
  setPassiveGlowEnabled: (enabled: boolean) => void;
  setPassiveGlowIntensity: (intensity: number) => void;
  setPassivePulseEnabled: (enabled: boolean) => void;
  setPassivePulseSpeed: (speed: number) => void;
  setPassiveShowStates: (show: boolean) => void;
  setPassiveIcebergDetection: (enabled: boolean) => void;
  setPassiveIcebergThreshold: (threshold: number) => void;

  // Time & Sales Panel
  setTimeSalesSettings: (settings: Partial<TimeSalesSettings>) => void;
  setTimeSalesMaxRows: (rows: number) => void;
  setTimeSalesShowCumulative: (show: boolean) => void;
  setTimeSalesAggregateByPrice: (aggregate: boolean) => void;
  setTimeSalesMinSizeFilter: (size: number) => void;
  setTimeSalesLargeThreshold: (threshold: number) => void;
  setTimeSalesPosition: (position: 'left' | 'right') => void;
  setTimeSalesWidth: (width: number) => void;

  // Key Levels (POC, VAH/VAL, VWAP)
  setKeyLevelsSettings: (settings: Partial<KeyLevelsSettings>) => void;
  setShowPOC: (show: boolean) => void;
  setShowVAH: (show: boolean) => void;
  setShowVAL: (show: boolean) => void;
  setShowKeyLevelVWAP: (show: boolean) => void;
  setShowSessionHighLow: (show: boolean) => void;
  setShowKeyRoundNumbers: (show: boolean) => void;
  setKeyRoundNumberInterval: (interval: number) => void;

  // Delta Profile Settings
  setDeltaProfileSettings: (settings: Partial<DeltaProfileSettings>) => void;
  setDeltaProfileMode: (mode: DeltaProfileMode) => void;
  setDeltaProfileOpacity: (opacity: number) => void;
  setDeltaProfileHighlightPOC: (highlight: boolean) => void;
  setDeltaProfileShowCenterLine: (show: boolean) => void;
  setDeltaProfileShowLabels: (show: boolean) => void;

  // WebGL Rendering
  useWebGL: boolean;
  setUseWebGL: (enabled: boolean) => void;

  // Presets
  applyPreset: (preset: 'bookmap' | 'atas' | 'minimal') => void;

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
      useWebGL: true, // Enable WebGL by default for better performance

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
      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.1, Math.min(10, level)) }),
      setPriceOffset: (offset) => set({ priceOffset: offset }),
      resetZoom: () => set({ zoomLevel: 1, priceOffset: 0 }),

      // Settings Panel
      openSettingsPanel: (position) => set((state) => ({
        isSettingsPanelOpen: true,
        settingsPanelPosition: position || state.settingsPanelPosition,
      })),
      closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),
      setSettingsPanelPosition: (position) => set({ settingsPanelPosition: position }),

      // Display Features Actions
      setDisplayFeatures: (features) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, ...features },
      })),
      setShowDeltaProfile: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showDeltaProfile: show },
      })),
      setShowVolumeProfile: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showVolumeProfile: show },
      })),
      setShowVWAP: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showVWAP: show },
      })),
      setShowImbalances: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showImbalances: show },
      })),
      setShowAbsorptionFeature: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showAbsorption: show },
      })),
      setShowIcebergs: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showIcebergs: show },
      })),
      setShowFootprintNumbers: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showFootprintNumbers: show },
      })),
      setFootprintStyle: (style) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, footprintStyle: style },
      })),
      setShowTimeSales: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showTimeSales: show },
      })),
      setShowCumulativeDelta: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showCumulativeDelta: show },
      })),
      setShowDOMLadder: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showDOMLadder: show },
      })),
      setShowTapeVelocity: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showTapeVelocity: show },
      })),
      setShowLargeTradeAlerts: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showLargeTradeAlerts: show },
      })),
      setShowPressureMeter: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showPressureMeter: show },
      })),
      setShowSessionStats: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showSessionStats: show },
      })),
      setShowDrawings: (show) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, showDrawings: show },
      })),
      setPassiveThickness: (thickness) => set((state) => ({
        displayFeatures: { ...state.displayFeatures, passiveThickness: thickness },
      })),

      // Staircase Line Actions
      setStaircaseLineSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, ...settings },
        },
      })),
      setStaircaseLineWidth: (width) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, lineWidth: Math.max(1, Math.min(10, width)) },
        },
      })),
      setStaircaseShowGlow: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, showGlow: show },
        },
      })),
      setStaircaseGlowIntensity: (intensity) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, glowIntensity: Math.max(0.1, Math.min(1.5, intensity)) },
        },
      })),
      setStaircaseShowSpreadFill: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, showSpreadFill: show },
        },
      })),
      setStaircaseSpreadFillOpacity: (opacity) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, spreadFillOpacity: Math.max(0.05, Math.min(0.5, opacity)) },
        },
      })),
      setStaircaseShowTrail: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, showTrail: show },
        },
      })),
      setStaircaseTrailLength: (length) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, trailLength: Math.max(1, Math.min(5, length)) },
        },
      })),
      setStaircaseTrailFadeSpeed: (speed) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          staircaseLine: { ...state.displayFeatures.staircaseLine, trailFadeSpeed: Math.max(0.5, Math.min(2, speed)) },
        },
      })),

      // Grid & Ticks Actions
      setGridSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, ...settings },
        },
      })),
      setShowMajorGrid: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, showMajorGrid: show },
        },
      })),
      setShowMinorGrid: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, showMinorGrid: show },
        },
      })),
      setMajorGridInterval: (interval) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, majorGridInterval: Math.max(2, Math.min(50, interval)) },
        },
      })),
      setGridStyle: (style) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, gridStyle: style },
        },
      })),
      setShowTickMarks: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, showTickMarks: show },
        },
      })),
      setTickStyle: (style) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, tickStyle: style },
        },
      })),
      setTickSize: (size) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, tickSize: Math.max(3, Math.min(10, size)) },
        },
      })),
      setHighlightRoundNumbers: (highlight) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, highlightRoundNumbers: highlight },
        },
      })),
      setRoundNumberInterval: (interval) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, roundNumberInterval: Math.max(10, interval) },
        },
      })),
      setLabelPrecision: (precision) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, labelPrecision: precision },
        },
      })),
      setShowTimeAxis: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, showTimeAxis: show },
        },
      })),
      setShowSessionMarkers: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, showSessionMarkers: show },
        },
      })),
      setTimeFormat: (format) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          grid: { ...state.displayFeatures.grid, timeFormat: format },
        },
      })),

      // Passive Orders Actions
      setPassiveOrderSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, ...settings },
        },
      })),
      setPassiveGlowEnabled: (enabled) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, glowEnabled: enabled },
        },
      })),
      setPassiveGlowIntensity: (intensity) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, glowIntensity: Math.max(0.1, Math.min(1.5, intensity)) },
        },
      })),
      setPassivePulseEnabled: (enabled) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, pulseEnabled: enabled },
        },
      })),
      setPassivePulseSpeed: (speed) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, pulseSpeed: Math.max(0.5, Math.min(3.0, speed)) },
        },
      })),
      setPassiveShowStates: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, showStates: show },
        },
      })),
      setPassiveIcebergDetection: (enabled) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, icebergDetection: enabled },
        },
      })),
      setPassiveIcebergThreshold: (threshold) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          passiveOrders: { ...state.displayFeatures.passiveOrders, icebergThreshold: Math.max(1, Math.min(10, threshold)) },
        },
      })),

      // Time & Sales Panel Actions
      setTimeSalesSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, ...settings },
        },
      })),
      setTimeSalesMaxRows: (rows) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, maxRows: Math.max(10, Math.min(500, rows)) },
        },
      })),
      setTimeSalesShowCumulative: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, showCumulativeVolume: show },
        },
      })),
      setTimeSalesAggregateByPrice: (aggregate) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, aggregateByPrice: aggregate },
        },
      })),
      setTimeSalesMinSizeFilter: (size) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, minSizeFilter: Math.max(0, size) },
        },
      })),
      setTimeSalesLargeThreshold: (threshold) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, largeTradeThreshold: Math.max(1, Math.min(50, threshold)) },
        },
      })),
      setTimeSalesPosition: (position) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, position },
        },
      })),
      setTimeSalesWidth: (width) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          timeSales: { ...state.displayFeatures.timeSales, width: Math.max(200, Math.min(400, width)) },
        },
      })),

      // Key Levels Actions (POC, VAH/VAL, VWAP)
      setKeyLevelsSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, ...settings },
        },
      })),
      setShowPOC: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showPOC: show },
        },
      })),
      setShowVAH: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showVAH: show },
        },
      })),
      setShowVAL: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showVAL: show },
        },
      })),
      setShowKeyLevelVWAP: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showVWAP: show },
        },
      })),
      setShowSessionHighLow: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showSessionHighLow: show },
        },
      })),
      setShowKeyRoundNumbers: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, showRoundNumbers: show },
        },
      })),
      setKeyRoundNumberInterval: (interval) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          keyLevels: { ...state.displayFeatures.keyLevels, roundNumberInterval: Math.max(10, interval) },
        },
      })),

      // Delta Profile Settings
      setDeltaProfileSettings: (settings) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, ...settings },
        },
      })),
      setDeltaProfileMode: (mode) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, mode },
        },
      })),
      setDeltaProfileOpacity: (opacity) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, opacity: Math.max(0.1, Math.min(1, opacity)) },
        },
      })),
      setDeltaProfileHighlightPOC: (highlight) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, highlightPOC: highlight },
        },
      })),
      setDeltaProfileShowCenterLine: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, showCenterLine: show },
        },
      })),
      setDeltaProfileShowLabels: (show) => set((state) => ({
        displayFeatures: {
          ...state.displayFeatures,
          deltaProfile: { ...state.displayFeatures.deltaProfile, showLabels: show },
        },
      })),

      // WebGL Rendering
      setUseWebGL: (enabled) => set({ useWebGL: enabled }),

      // Reset
      applyPreset: (preset) => set((state) => {
        switch (preset) {
          case 'bookmap':
            return {
              colorScheme: 'bookmap' as ColorScheme,
              contrast: 2.0,
              upperCutoffPercent: 80,
              displayFeatures: {
                ...state.displayFeatures,
                showDeltaProfile: true,
                showVolumeProfile: false,
                showVWAP: true,
                showImbalances: false,
                staircaseLine: {
                  ...state.displayFeatures.staircaseLine,
                  showSpreadFill: true,
                  showGlow: true,
                  glowIntensity: 0.8,
                  lineWidth: 3,
                },
                keyLevels: {
                  ...state.displayFeatures.keyLevels,
                  showPOC: true,
                  showVAH: true,
                  showVAL: true,
                  showRoundNumbers: true,
                },
              },
            };
          case 'atas':
            return {
              colorScheme: 'atas' as ColorScheme,
              contrast: 1.5,
              upperCutoffPercent: 80,
              displayFeatures: {
                ...state.displayFeatures,
                showDeltaProfile: true,
                showVolumeProfile: true,
                showVWAP: true,
                showImbalances: true,
                showAbsorption: true,
                staircaseLine: {
                  ...state.displayFeatures.staircaseLine,
                  showSpreadFill: false,
                  showGlow: false,
                  lineWidth: 2,
                },
                keyLevels: {
                  ...state.displayFeatures.keyLevels,
                  showPOC: true,
                  showVAH: true,
                  showVAL: true,
                  showRoundNumbers: true,
                },
              },
            };
          case 'minimal':
            return {
              colorScheme: 'atas' as ColorScheme,
              contrast: 1.5,
              upperCutoffPercent: 85,
              displayFeatures: {
                ...state.displayFeatures,
                showDeltaProfile: false,
                showVolumeProfile: false,
                showVWAP: false,
                showImbalances: false,
                showAbsorption: false,
                staircaseLine: {
                  ...state.displayFeatures.staircaseLine,
                  showSpreadFill: false,
                  showGlow: false,
                  lineWidth: 2,
                },
                keyLevels: {
                  ...state.displayFeatures.keyLevels,
                  showPOC: false,
                  showVAH: false,
                  showVAL: false,
                  showSessionHighLow: false,
                  showRoundNumbers: false,
                },
              },
            };
          default:
            return {};
        }
      }),
      resetToDefaults: () => set({
        ...DEFAULT_HEATMAP_SETTINGS,
        ...DEFAULT_HEATMAP_PRO_SETTINGS,
      }),
    }),
    {
      name: 'heatmap-settings-storage',
      skipHydration: true,
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        // Simply return the persisted state - the merge function handles defaults
        // This avoids type conflicts while ensuring old data is preserved
        return persistedState;
      },
      partialize: (state) => ({
        // Persist only settings, not UI state
        useWebGL: state.useWebGL,
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
        displayFeatures: state.displayFeatures,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<HeatmapSettingsState>;
        return {
          ...currentState,
          ...persisted,
          // Ensure useWebGL has a default
          useWebGL: persisted?.useWebGL ?? true,
          // Deep merge displayFeatures to handle new defaults
          displayFeatures: {
            ...DEFAULT_LIQUIDITY_DISPLAY_FEATURES,
            ...(persisted?.displayFeatures || {}),
            // Deep merge staircaseLine settings
            staircaseLine: {
              ...DEFAULT_STAIRCASE_LINE_SETTINGS,
              ...(persisted?.displayFeatures?.staircaseLine || {}),
            },
            // Deep merge grid settings
            grid: {
              ...DEFAULT_GRID_SETTINGS,
              ...(persisted?.displayFeatures?.grid || {}),
            },
            // Deep merge passiveOrders settings
            passiveOrders: {
              ...DEFAULT_PASSIVE_ORDER_SETTINGS,
              ...(persisted?.displayFeatures?.passiveOrders || {}),
            },
            // Deep merge timeSales settings
            timeSales: {
              ...DEFAULT_TIME_SALES_SETTINGS,
              ...(persisted?.displayFeatures?.timeSales || {}),
            },
            // Deep merge keyLevels settings
            keyLevels: {
              ...DEFAULT_KEY_LEVELS_SETTINGS,
              ...(persisted?.displayFeatures?.keyLevels || {}),
            },
            // Deep merge deltaProfile settings
            deltaProfile: {
              ...DEFAULT_DELTA_PROFILE_SETTINGS,
              ...(persisted?.displayFeatures?.deltaProfile || {}),
            },
          },
          // Deep merge domColors
          domColors: {
            ...DEFAULT_HEATMAP_PRO_SETTINGS.domColors,
            ...(persisted?.domColors || {}),
          },
          // Deep merge tradeFlow
          tradeFlow: {
            ...DEFAULT_HEATMAP_PRO_SETTINGS.tradeFlow,
            ...(persisted?.tradeFlow || {}),
          },
        };
      },
    }
  )
);

// ============ GRANULAR SELECTORS ============
// Use these instead of useHeatmapSettingsStore() to avoid unnecessary re-renders

export const useColorScheme = () => useHeatmapSettingsStore((s) => s.colorScheme);
export const useZoomLevel = () => useHeatmapSettingsStore((s) => s.zoomLevel);
export const usePriceOffset = () => useHeatmapSettingsStore((s) => s.priceOffset);
export const useDisplayFeatures = () => useHeatmapSettingsStore((s) => s.displayFeatures);
export const useDeltaProfileSettings = () => useHeatmapSettingsStore((s) => s.displayFeatures.deltaProfile);
export const useTradeFlow = () => useHeatmapSettingsStore((s) => s.tradeFlow);
export const useAutoCenter = () => useHeatmapSettingsStore((s) => s.autoCenter);
export const useUseWebGL = () => useHeatmapSettingsStore((s) => s.useWebGL);
export const useContrast = () => useHeatmapSettingsStore((s) => s.contrast);
export const useSmoothing = () => useHeatmapSettingsStore((s) => s.smoothing);
export const useIsSettingsPanelOpen = () => useHeatmapSettingsStore((s) => s.isSettingsPanelOpen);
