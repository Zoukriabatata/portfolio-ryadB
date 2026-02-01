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

  // Delta
  deltaPositive: string;
  deltaNegative: string;

  // Imbalance
  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  imbalanceOpacity: number;

  // POC
  pocColor: string;
  pocOpacity: number;

  // Price line
  currentPriceColor: string;

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

  // Layout
  footprintWidth: number;
  rowHeight: number;
  maxVisibleFootprints: number;
  deltaProfilePosition: 'left' | 'right';

  // Actions
  setColors: (colors: Partial<FootprintColors>) => void;
  setFonts: (fonts: Partial<FootprintFonts>) => void;
  setFeatures: (features: Partial<FootprintFeatures>) => void;
  setImbalance: (imbalance: Partial<ImbalanceSettings>) => void;
  setLayout: (layout: { footprintWidth?: number; rowHeight?: number; maxVisibleFootprints?: number; deltaProfilePosition?: 'left' | 'right' }) => void;
  resetToDefaults: () => void;
}

// ============ DEFAULTS ============

const DEFAULT_COLORS: FootprintColors = {
  background: '#0a0a0a',
  surface: '#111111',
  gridColor: '#1a1a1a',
  gridOpacity: 0.5,

  candleUpBody: '#22c55e',
  candleDownBody: '#ef4444',
  candleUpBorder: '#16a34a',
  candleDownBorder: '#dc2626',
  candleUpWick: '#22c55e',
  candleDownWick: '#ef4444',

  bidColor: '#ef4444',
  askColor: '#22c55e',
  bidTextColor: '#fca5a5',
  askTextColor: '#86efac',

  deltaPositive: '#22c55e',
  deltaNegative: '#ef4444',

  imbalanceBuyBg: '#22c55e',
  imbalanceSellBg: '#ef4444',
  imbalanceOpacity: 0.35,

  pocColor: '#facc15',
  pocOpacity: 0.25,

  currentPriceColor: '#3b82f6',

  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#52525b',
};

const DEFAULT_FONTS: FootprintFonts = {
  volumeFont: 'JetBrains Mono, Consolas, monospace',
  volumeFontSize: 10,
  volumeFontBold: false,
  deltaFont: 'JetBrains Mono, Consolas, monospace',
  deltaFontSize: 11,
  priceFont: 'JetBrains Mono, Consolas, monospace',
  priceFontSize: 10,
};

const DEFAULT_FEATURES: FootprintFeatures = {
  showGrid: true,
  showOHLC: true,
  showDeltaProfile: true,
  showPOC: true,
  showImbalances: true,
  showCurrentPrice: true,
  showVolumeProfile: false,
  showDeltaPerLevel: false,
  showTotalDelta: true,
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

      footprintWidth: 90,
      rowHeight: 18,
      maxVisibleFootprints: 25,
      deltaProfilePosition: 'right',

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
          footprintWidth: 90,
          rowHeight: 18,
          maxVisibleFootprints: 25,
          deltaProfilePosition: 'right',
        }),
    }),
    {
      name: 'footprint-settings',
      partialize: (state) => ({
        colors: state.colors,
        fonts: state.fonts,
        features: state.features,
        imbalance: state.imbalance,
        footprintWidth: state.footprintWidth,
        rowHeight: state.rowHeight,
        maxVisibleFootprints: state.maxVisibleFootprints,
        deltaProfilePosition: state.deltaProfilePosition,
      }),
    }
  )
);

// ============ PRESETS ============

export const COLOR_PRESETS = {
  dark: DEFAULT_COLORS,

  atas: {
    ...DEFAULT_COLORS,
    background: '#1a1a2e',
    surface: '#16213e',
    gridColor: '#0f3460',
    candleUpBody: '#00ff88',
    candleDownBody: '#ff0055',
    bidColor: '#ff0055',
    askColor: '#00ff88',
    pocColor: '#ffcc00',
  },

  ninja: {
    ...DEFAULT_COLORS,
    background: '#000000',
    surface: '#0a0a0a',
    gridColor: '#1a1a1a',
    candleUpBody: '#00e676',
    candleDownBody: '#ff1744',
    bidColor: '#ff1744',
    askColor: '#00e676',
    pocColor: '#ffd600',
  },

  quantower: {
    ...DEFAULT_COLORS,
    background: '#0d1117',
    surface: '#161b22',
    gridColor: '#21262d',
    candleUpBody: '#3fb950',
    candleDownBody: '#f85149',
    bidColor: '#f85149',
    askColor: '#3fb950',
    pocColor: '#d29922',
  },

  light: {
    ...DEFAULT_COLORS,
    background: '#ffffff',
    surface: '#f5f5f5',
    gridColor: '#e0e0e0',
    gridOpacity: 0.8,
    candleUpBody: '#16a34a',
    candleDownBody: '#dc2626',
    bidColor: '#dc2626',
    askColor: '#16a34a',
    bidTextColor: '#dc2626',
    askTextColor: '#16a34a',
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
    textMuted: '#a3a3a3',
    pocColor: '#ca8a04',
  },
};
