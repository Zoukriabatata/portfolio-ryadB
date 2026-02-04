/**
 * FOOTPRINT SETTINGS STORE
 *
 * Gère tous les paramètres de personnalisation du footprint chart
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============ TYPES ============

export interface FootprintColors {
  // Background
  background: string;
  surface: string;

  // Grid
  gridColor: string;
  gridOpacity: number;

  // Candle OHLC
  candleUpBody: string;
  candleDownBody: string;
  candleUpBorder: string;
  candleDownBorder: string;
  candleUpWick: string;
  candleDownWick: string;

  // Footprint
  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  footprintContainerOpacity: number; // 0-1, opacity of candle container background

  // Delta
  deltaPositive: string;
  deltaNegative: string;

  // Cluster Static Delta (bottom panel)
  clusterDeltaPositive: string;
  clusterDeltaNegative: string;
  clusterDeltaOpacity: number;

  // Imbalance
  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  imbalanceOpacity: number;

  // POC
  pocColor: string;
  pocOpacity: number;

  // Price line (customizable)
  currentPriceColor: string;
  currentPriceLineWidth: number;
  currentPriceLineStyle: 'solid' | 'dashed' | 'dotted';
  currentPriceShowLabel: boolean;
  currentPriceLabelBg: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export interface FootprintFonts {
  volumeFont: string;
  volumeFontSize: number;
  volumeFontBold: boolean;
  deltaFont: string;
  deltaFontSize: number;
  priceFont: string;
  priceFontSize: number;
}

export interface FootprintFeatures {
  showGrid: boolean;
  showOHLC: boolean;
  showDeltaProfile: boolean;
  showPOC: boolean;
  showImbalances: boolean;
  showCurrentPrice: boolean;
  showVolumeProfile: boolean;
  showDeltaPerLevel: boolean;
  showTotalDelta: boolean;
  showClusterStatic: boolean;   // Bottom panel with Ask/Bid/Delta/Volume per candle
  showVWAPTWAP: boolean;        // VWAP/TWAP combined line
  showHourMarkers: boolean;     // Hour labels at bottom (13h, 14h, etc.)
  showPassiveLiquidity: boolean; // Passive orders from heatmap (simulation)
}

// Passive Liquidity Settings (Simulation mode)
export interface PassiveLiquiditySettings {
  enabled: boolean;
  intensity: number;          // 0-1, visual intensity
  opacity: number;            // 0-1, bar opacity (20-35% recommended)
  focusTicks: number;         // Show only ±N ticks from current price (0 = show all)
  bidColor: string;           // Bid passive color (cyan/green)
  askColor: string;           // Ask passive color (red)
  maxBarWidth: number;        // Maximum bar width in pixels
  // Stability settings
  stabilityLevel: 'low' | 'medium' | 'high'; // Preset stability levels
  showOnlyPersistent: boolean;  // Show only persistent liquidity
  showStats: boolean;           // Show absorption stats panel
  // Data source
  useRealOrderbook: boolean;    // Use real Binance orderbook instead of simulation
}

export interface ImbalanceSettings {
  ratio: number;           // 2.0 = 200%, 3.0 = 300%
  minVolume: number;       // Volume minimum pour considérer
  highlightStrength: number; // 0-1 opacité
}

export interface FootprintSettings {
  colors: FootprintColors;
  fonts: FootprintFonts;
  features: FootprintFeatures;
  imbalance: ImbalanceSettings;
  passiveLiquidity: PassiveLiquiditySettings;

  // Layout
  footprintWidth: number;
  rowHeight: number;
  maxVisibleFootprints: number;
  deltaProfilePosition: 'left' | 'right';
  candleGap: number; // Gap between candles for readability

  // Actions
  setColors: (colors: Partial<FootprintColors>) => void;
  setFonts: (fonts: Partial<FootprintFonts>) => void;
  setFeatures: (features: Partial<FootprintFeatures>) => void;
  setImbalance: (imbalance: Partial<ImbalanceSettings>) => void;
  setPassiveLiquidity: (settings: Partial<PassiveLiquiditySettings>) => void;
  setLayout: (layout: { footprintWidth?: number; rowHeight?: number; maxVisibleFootprints?: number; deltaProfilePosition?: 'left' | 'right'; candleGap?: number }) => void;
  resetToDefaults: () => void;
}

// ============ DEFAULTS ============

const DEFAULT_COLORS: FootprintColors = {
  // ATAS Professional Dark Theme
  background: '#0c0c0c',
  surface: '#141414',
  gridColor: '#1e1e1e',
  gridOpacity: 0.4,

  // Candle colors - professional muted tones
  candleUpBody: '#26a69a',
  candleDownBody: '#ef5350',
  candleUpBorder: '#26a69a',
  candleDownBorder: '#ef5350',
  candleUpWick: '#26a69a',
  candleDownWick: '#ef5350',

  // Footprint bid/ask - slightly muted for readability
  bidColor: '#ef5350',
  askColor: '#26a69a',
  bidTextColor: '#f48fb1',  // Softer pink for bid text
  askTextColor: '#80cbc4',  // Softer teal for ask text
  footprintContainerOpacity: 0.03, // Very subtle container background

  // Delta colors
  deltaPositive: '#26a69a',
  deltaNegative: '#ef5350',

  // Cluster Static Delta (bottom panel)
  clusterDeltaPositive: '#26a69a',
  clusterDeltaNegative: '#ef5350',
  clusterDeltaOpacity: 0.35,

  // Imbalance (now used for bright number colors, not backgrounds)
  imbalanceBuyBg: '#26a69a',
  imbalanceSellBg: '#ef5350',
  imbalanceOpacity: 0.35,

  // POC - gold/amber tone
  pocColor: '#ffc107',
  pocOpacity: 0.15,

  // Current price line - customizable
  currentPriceColor: '#2196f3',
  currentPriceLineWidth: 1,
  currentPriceLineStyle: 'dashed' as const,
  currentPriceShowLabel: true,
  currentPriceLabelBg: '#2196f3',

  // Text hierarchy
  textPrimary: '#e0e0e0',
  textSecondary: '#9e9e9e',
  textMuted: '#616161',
};

const DEFAULT_FONTS: FootprintFonts = {
  // Professional monospace stack for pixel-perfect alignment
  volumeFont: '"Consolas", "Monaco", "Courier New", monospace',
  volumeFontSize: 10,
  volumeFontBold: false,
  deltaFont: '"Consolas", "Monaco", "Courier New", monospace',
  deltaFontSize: 11,
  priceFont: '"Consolas", "Monaco", "Courier New", monospace',
  priceFontSize: 10,
};

const DEFAULT_FEATURES: FootprintFeatures = {
  showGrid: true,
  showOHLC: true,
  showDeltaProfile: true,
  showPOC: true,
  showImbalances: true,
  showCurrentPrice: true,
  showVolumeProfile: true,    // Session volume profile (VAH/VAL/POC)
  showDeltaPerLevel: false,
  showTotalDelta: true,
  showClusterStatic: true,    // Bottom panel with Ask/Bid/Delta/Volume
  showVWAPTWAP: true,         // VWAP/TWAP combined line
  showHourMarkers: true,      // Hour labels (13h, 14h, etc.)
  showPassiveLiquidity: true, // Passive liquidity from heatmap (simulation)
};

const DEFAULT_PASSIVE_LIQUIDITY: PassiveLiquiditySettings = {
  enabled: true,
  intensity: 0.6,           // 60% intensity
  opacity: 0.25,            // 25% opacity (subtle background)
  focusTicks: 0,            // Show all (0 = no focus filter)
  bidColor: '#00bcd4',      // Cyan for bid passive
  askColor: '#ef5350',      // Red for ask passive
  maxBarWidth: 80,          // Max bar width in pixels
  // Stability settings
  stabilityLevel: 'medium', // Preset stability levels
  showOnlyPersistent: true, // Show only persistent liquidity (filtered)
  showStats: true,          // Show absorption stats panel
  // Data source
  useRealOrderbook: false,  // Default to simulation (set true for real Binance orderbook)
};

const DEFAULT_IMBALANCE: ImbalanceSettings = {
  ratio: 3.0,
  minVolume: 0.1,
  highlightStrength: 0.35,
};

// ============ STORE ============

export const useFootprintSettingsStore = create<FootprintSettings>()(
  persist(
    (set) => ({
      colors: DEFAULT_COLORS,
      fonts: DEFAULT_FONTS,
      features: DEFAULT_FEATURES,
      imbalance: DEFAULT_IMBALANCE,
      passiveLiquidity: DEFAULT_PASSIVE_LIQUIDITY,

      footprintWidth: 70,
      rowHeight: 16,
      maxVisibleFootprints: 100,
      deltaProfilePosition: 'right',
      candleGap: 3,

      setColors: (colors) =>
        set((state) => ({
          colors: { ...state.colors, ...colors },
        })),

      setFonts: (fonts) =>
        set((state) => ({
          fonts: { ...state.fonts, ...fonts },
        })),

      setFeatures: (features) =>
        set((state) => ({
          features: { ...state.features, ...features },
        })),

      setImbalance: (imbalance) =>
        set((state) => ({
          imbalance: { ...state.imbalance, ...imbalance },
        })),

      setPassiveLiquidity: (settings) =>
        set((state) => ({
          passiveLiquidity: { ...state.passiveLiquidity, ...settings },
        })),

      setLayout: (layout) =>
        set((state) => ({
          ...state,
          ...layout,
        })),

      resetToDefaults: () =>
        set({
          colors: DEFAULT_COLORS,
          fonts: DEFAULT_FONTS,
          features: DEFAULT_FEATURES,
          imbalance: DEFAULT_IMBALANCE,
          passiveLiquidity: DEFAULT_PASSIVE_LIQUIDITY,
          footprintWidth: 70,
          rowHeight: 16,
          maxVisibleFootprints: 100,
          deltaProfilePosition: 'right',
          candleGap: 3,
        }),
    }),
    {
      name: 'footprint-settings',
      version: 4, // Increment when adding new features (added passiveLiquidity)
      partialize: (state) => ({
        colors: state.colors,
        fonts: state.fonts,
        features: state.features,
        imbalance: state.imbalance,
        passiveLiquidity: state.passiveLiquidity,
        footprintWidth: state.footprintWidth,
        rowHeight: state.rowHeight,
        maxVisibleFootprints: state.maxVisibleFootprints,
        deltaProfilePosition: state.deltaProfilePosition,
      }),
      // Merge stored state with defaults to handle new features
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FootprintSettings>;
        return {
          ...currentState,
          ...persisted,
          // Deep merge features to ensure new defaults are applied
          features: {
            ...DEFAULT_FEATURES,
            ...(persisted?.features || {}),
          },
          // Deep merge colors
          colors: {
            ...DEFAULT_COLORS,
            ...(persisted?.colors || {}),
          },
          // Deep merge fonts
          fonts: {
            ...DEFAULT_FONTS,
            ...(persisted?.fonts || {}),
          },
          // Deep merge imbalance
          imbalance: {
            ...DEFAULT_IMBALANCE,
            ...(persisted?.imbalance || {}),
          },
          // Deep merge passiveLiquidity
          passiveLiquidity: {
            ...DEFAULT_PASSIVE_LIQUIDITY,
            ...(persisted?.passiveLiquidity || {}),
          },
        };
      },
    }
  )
);

// ============ PRESETS ============

export const COLOR_PRESETS = {
  // SENZOUKRIA - Green/Black Scientific Theme (Default)
  senzoukria: {
    ...DEFAULT_COLORS,
    background: '#050505',
    surface: '#0a0f0a',
    gridColor: '#0d1a0d',
    gridOpacity: 0.25,
    candleUpBody: '#22c55e',
    candleDownBody: '#dc2626',
    candleUpBorder: '#22c55e',
    candleDownBorder: '#dc2626',
    candleUpWick: '#10b981',
    candleDownWick: '#b91c1c',
    bidColor: '#dc2626',
    askColor: '#22c55e',
    bidTextColor: '#f87171',
    askTextColor: '#4ade80',
    footprintContainerOpacity: 0.02,
    deltaPositive: '#22c55e',
    deltaNegative: '#dc2626',
    imbalanceBuyBg: '#22c55e',
    imbalanceSellBg: '#dc2626',
    pocColor: '#eab308',
    currentPriceColor: '#22c55e',
    currentPriceLineWidth: 1,
    currentPriceLineStyle: 'dashed' as const,
    currentPriceShowLabel: true,
    currentPriceLabelBg: '#22c55e',
    textPrimary: '#e0ffe0',
    textSecondary: '#8aab8a',
    textMuted: '#4a5f4a',
  },

  dark: DEFAULT_COLORS,

  // Orderflow Pro - Deep Blue Theme
  orderflow: {
    ...DEFAULT_COLORS,
    background: '#0a0e14',
    surface: '#0f1419',
    gridColor: '#1a2332',
    gridOpacity: 0.3,
    candleUpBody: '#00bfa5',
    candleDownBody: '#ff5252',
    candleUpBorder: '#00bfa5',
    candleDownBorder: '#ff5252',
    candleUpWick: '#00bfa5',
    candleDownWick: '#ff5252',
    bidColor: '#ff5252',
    askColor: '#00bfa5',
    bidTextColor: '#ff8a80',
    askTextColor: '#64ffda',
    deltaPositive: '#00bfa5',
    deltaNegative: '#ff5252',
    pocColor: '#ffab00',
    currentPriceColor: '#448aff',
    textPrimary: '#eceff4',
    textSecondary: '#8892a8',
    textMuted: '#4e5668',
  },

  // Shadow - Pure Black Theme
  shadow: {
    ...DEFAULT_COLORS,
    background: '#000000',
    surface: '#0a0a0a',
    gridColor: '#1a1a1a',
    gridOpacity: 0.3,
    candleUpBody: '#00c853',
    candleDownBody: '#ff1744',
    candleUpBorder: '#00c853',
    candleDownBorder: '#ff1744',
    bidColor: '#ff1744',
    askColor: '#00c853',
    bidTextColor: '#ff8a80',
    askTextColor: '#69f0ae',
    pocColor: '#ffd600',
    textPrimary: '#ffffff',
    textSecondary: '#b0b0b0',
    textMuted: '#606060',
  },

  // Matrix - Developer Dark Theme
  matrix: {
    ...DEFAULT_COLORS,
    background: '#0d1117',
    surface: '#161b22',
    gridColor: '#21262d',
    gridOpacity: 0.4,
    candleUpBody: '#3fb950',
    candleDownBody: '#f85149',
    candleUpBorder: '#3fb950',
    candleDownBorder: '#f85149',
    bidColor: '#f85149',
    askColor: '#3fb950',
    bidTextColor: '#ffa198',
    askTextColor: '#7ee787',
    pocColor: '#d29922',
    currentPriceColor: '#58a6ff',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    textMuted: '#484f58',
  },

  // Light - Clean Light Theme
  light: {
    ...DEFAULT_COLORS,
    background: '#ffffff',
    surface: '#f8f9fa',
    gridColor: '#e9ecef',
    gridOpacity: 0.8,
    candleUpBody: '#198754',
    candleDownBody: '#dc3545',
    candleUpBorder: '#198754',
    candleDownBorder: '#dc3545',
    candleUpWick: '#198754',
    candleDownWick: '#dc3545',
    bidColor: '#dc3545',
    askColor: '#198754',
    bidTextColor: '#dc3545',
    askTextColor: '#198754',
    deltaPositive: '#198754',
    deltaNegative: '#dc3545',
    textPrimary: '#212529',
    textSecondary: '#6c757d',
    textMuted: '#adb5bd',
    pocColor: '#fd7e14',
    currentPriceColor: '#0d6efd',
  },
};

// Theme labels for UI
export const THEME_LABELS: Record<string, string> = {
  senzoukria: 'Senzoukria',
  dark: 'Dark Classic',
  orderflow: 'Orderflow Pro',
  shadow: 'Shadow',
  matrix: 'Matrix',
  light: 'Light',
};
