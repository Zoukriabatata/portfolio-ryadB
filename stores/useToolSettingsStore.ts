/**
 * TOOL SETTINGS STORE
 *
 * Gère les paramètres de personnalisation des outils de dessin
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ToolType, LineStyle } from '@/lib/tools/ToolsEngine';

// Version for migration - increment when defaults change
const SETTINGS_VERSION = 3;

export interface ToolSettings {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  fillColor: string;
  fillOpacity: number;
  fontSize: number;
  showLabels: boolean;
  extendLeft: boolean;
  extendRight: boolean;
  showPrice: boolean;
  showTime: boolean;
}

export interface FibonacciSettings extends ToolSettings {
  levels: number[];
  showPrices: boolean;
  levelColors: Record<number, string>;
}

export interface RectangleSettings extends ToolSettings {
  showMedianLine: boolean;
  showZones: boolean;
  zoneFillOpacity: number;
}

export interface PositionSettings extends ToolSettings {
  showRR: boolean;
  showPnL: boolean;
  showQuantity: boolean;
}

interface ToolSettingsState {
  // Version for migration
  version: number;

  // Default settings for each tool type
  toolDefaults: Record<string, Partial<ToolSettings>>;

  // Currently selected tool for settings panel
  selectedToolId: string | null;

  // Show advanced settings modal
  showAdvancedSettings: boolean;
  advancedSettingsPosition: { x: number; y: number };

  // Actions
  setToolDefault: (toolType: string, settings: Partial<ToolSettings>) => void;
  getToolDefault: (toolType: string) => Partial<ToolSettings>;
  setSelectedToolId: (id: string | null) => void;
  toggleAdvancedSettings: () => void;
  setAdvancedSettingsPosition: (position: { x: number; y: number }) => void;
  closeAdvancedSettings: () => void;
  resetToDefaults: () => void;
}

const DEFAULT_TOOL_SETTINGS: Record<string, Partial<ToolSettings>> = {
  trendline: {
    color: '#3b82f6',
    lineWidth: 2,
    lineStyle: 'solid',
    extendLeft: false,
    extendRight: false,
  },
  ray: {
    color: '#8b5cf6',
    lineWidth: 2,
    lineStyle: 'solid',
    extendRight: true,
  },
  horizontalLine: {
    color: '#f59e0b',
    lineWidth: 1,
    lineStyle: 'dashed',
    showPrice: true,
  },
  hline: {
    color: '#f59e0b',
    lineWidth: 1,
    lineStyle: 'dashed',
    showPrice: true,
  },
  horizontalRay: {
    color: '#8b5cf6',
    lineWidth: 1,
    lineStyle: 'solid',
  },
  verticalLine: {
    color: '#06b6d4',
    lineWidth: 1,
    lineStyle: 'dashed',
    showTime: true,
  },
  vline: {
    color: '#06b6d4',
    lineWidth: 1,
    lineStyle: 'dashed',
    showTime: true,
  },
  rectangle: {
    color: '#06b6d4',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#06b6d4',
    fillOpacity: 0.1,
  },
  parallelChannel: {
    color: '#22c55e',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#22c55e',
    fillOpacity: 0.05,
  },
  fibRetracement: {
    color: '#f59e0b',
    lineWidth: 1,
    lineStyle: 'solid',
    showLabels: true,
    showPrice: true,
    extendLeft: false,   // NO extension by default
    extendRight: false,  // NO extension by default
  },
  fibonacciRetracement: {
    color: '#f59e0b',
    lineWidth: 1,
    lineStyle: 'solid',
    showLabels: true,
    showPrice: true,
    extendLeft: false,   // NO extension by default
    extendRight: false,  // NO extension by default
  },
  fibonacciExtension: {
    color: '#ec4899',
    lineWidth: 1,
    lineStyle: 'solid',
    showLabels: true,
    showPrice: true,
  },
  arrow: {
    color: '#ef4444',
    lineWidth: 2,
    lineStyle: 'solid',
  },
  brush: {
    color: '#3b82f6',
    lineWidth: 3,
    lineStyle: 'solid',
  },
  highlighter: {
    color: '#eab308',
    lineWidth: 8,
    lineStyle: 'solid',
    fillOpacity: 0.3,
  },
  measure: {
    color: '#8b5cf6',
    lineWidth: 1,
    lineStyle: 'dashed',
    showLabels: true,
    showPrice: true,
  },
  longPosition: {
    color: '#22c55e',
    lineWidth: 2,
    lineStyle: 'solid',
    fillOpacity: 0.1,
    extendRight: false,  // NO extension by default
  },
  shortPosition: {
    color: '#ef4444',
    lineWidth: 2,
    lineStyle: 'solid',
    fillOpacity: 0.1,
    extendRight: false,  // NO extension by default
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
  },
};

export const useToolSettingsStore = create<ToolSettingsState>()(
  persist(
    (set, get) => ({
      version: SETTINGS_VERSION,
      toolDefaults: DEFAULT_TOOL_SETTINGS,
      selectedToolId: null,
      showAdvancedSettings: false,
      advancedSettingsPosition: { x: 100, y: 100 },

      setToolDefault: (toolType, settings) =>
        set((state) => ({
          toolDefaults: {
            ...state.toolDefaults,
            [toolType]: {
              ...state.toolDefaults[toolType],
              ...settings,
            },
          },
        })),

      getToolDefault: (toolType) => {
        const state = get();
        // ALWAYS merge with hardcoded defaults to ensure new properties are included
        const hardcodedDefaults = DEFAULT_TOOL_SETTINGS[toolType] || DEFAULT_TOOL_SETTINGS.trendline;
        const userDefaults = state.toolDefaults[toolType] || {};
        // Hardcoded defaults FIRST, then user overrides - ensures new properties exist
        return { ...hardcodedDefaults, ...userDefaults };
      },

      setSelectedToolId: (id) => set({ selectedToolId: id }),

      toggleAdvancedSettings: () =>
        set((state) => ({ showAdvancedSettings: !state.showAdvancedSettings })),

      setAdvancedSettingsPosition: (position) =>
        set({ advancedSettingsPosition: position }),

      closeAdvancedSettings: () => set({ showAdvancedSettings: false }),

      resetToDefaults: () =>
        set({
          version: SETTINGS_VERSION,
          toolDefaults: DEFAULT_TOOL_SETTINGS,
        }),
    }),
    {
      name: 'tool-settings-storage',
      version: SETTINGS_VERSION,
      partialize: (state) => ({
        version: state.version,
        toolDefaults: state.toolDefaults,
      }),
      // Migration: reset to defaults if version changed
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<ToolSettingsState>;
        if (!state.version || state.version < SETTINGS_VERSION) {
          // Version changed - reset extension defaults to fix the bug
          console.log('[ToolSettings] Migrating from version', state.version, 'to', SETTINGS_VERSION);
          return {
            ...state,
            version: SETTINGS_VERSION,
            toolDefaults: DEFAULT_TOOL_SETTINGS,
          };
        }
        return state as ToolSettingsState;
      },
    }
  )
);
