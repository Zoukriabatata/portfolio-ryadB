/**
 * TOOL SETTINGS STORE
 *
 * UI-only state: selected tool, advanced panel toggle, presets.
 * Default styles are managed exclusively by ToolsEngine (single source of truth).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ToolType, LineStyle } from '@/lib/tools/ToolsEngine';
import { getToolsEngine } from '@/lib/tools/ToolsEngine';

// Version for migration — bump to 4 to drop old toolDefaults on next load
const SETTINGS_VERSION = 4;

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

export interface ToolPreset {
  id: string;
  name: string;
  toolType: string;
  style: Partial<ToolSettings>;
  createdAt: number;
}

interface ToolSettingsState {
  // Version for migration
  version: number;

  // Currently selected tool IDs (multi-selection)
  selectedToolIds: string[];

  // Show advanced settings modal
  showAdvancedSettings: boolean;
  advancedSettingsPosition: { x: number; y: number };

  // Style presets
  presets: ToolPreset[];

  // Actions
  setSelectedToolIds: (ids: string[]) => void;
  toggleAdvancedSettings: () => void;
  setAdvancedSettingsPosition: (position: { x: number; y: number }) => void;
  closeAdvancedSettings: () => void;
  resetToDefaults: () => void;

  // Preset actions
  savePreset: (name: string, toolType: string, style: Partial<ToolSettings>) => void;
  deletePreset: (presetId: string) => void;
  renamePreset: (presetId: string, name: string) => void;
  setAsDefault: (presetId: string) => void;
}

export const useToolSettingsStore = create<ToolSettingsState>()(
  persist(
    (set, get) => ({
      version: SETTINGS_VERSION,
      selectedToolIds: [],
      showAdvancedSettings: false,
      advancedSettingsPosition: { x: 100, y: 100 },
      presets: [],

      setSelectedToolIds: (ids) => set({ selectedToolIds: ids }),

      toggleAdvancedSettings: () =>
        set((state) => ({ showAdvancedSettings: !state.showAdvancedSettings })),

      setAdvancedSettingsPosition: (position) =>
        set({ advancedSettingsPosition: position }),

      closeAdvancedSettings: () => set({ showAdvancedSettings: false }),

      resetToDefaults: () => {
        // Delegate to engine — clears all custom defaults
        try {
          const engine = getToolsEngine();
          // Reset each tool type that has custom defaults
          const toolTypes: ToolType[] = [
            'trendline', 'ray', 'horizontalLine', 'horizontalRay',
            'verticalLine', 'rectangle', 'parallelChannel',
            'fibRetracement', 'fibExtension', 'arrow', 'brush',
            'highlighter', 'measure', 'longPosition', 'shortPosition', 'text',
          ];
          for (const t of toolTypes) engine.resetDefaultStyle(t);
        } catch { /* engine not ready yet */ }
      },

      // Preset actions
      savePreset: (name, toolType, style) =>
        set((state) => ({
          presets: [
            ...state.presets,
            {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              name,
              toolType,
              style,
              createdAt: Date.now(),
            },
          ],
        })),

      deletePreset: (presetId) =>
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== presetId),
        })),

      renamePreset: (presetId, name) =>
        set((state) => ({
          presets: state.presets.map((p) =>
            p.id === presetId ? { ...p, name } : p
          ),
        })),

      setAsDefault: (presetId) => {
        const state = get();
        const preset = state.presets.find((p) => p.id === presetId);
        if (preset) {
          try {
            getToolsEngine().setDefaultStyle(preset.toolType as ToolType, preset.style as any);
          } catch { /* engine not ready yet */ }
        }
      },
    }),
    {
      name: 'tool-settings-storage',
      version: SETTINGS_VERSION,
      partialize: (state) => ({
        version: state.version,
        presets: state.presets,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        // v3 → v4: toolDefaults removed from store, migrated to engine on init
        // (see ToolsEngine.loadDefaultStyles for one-time migration)
        if (!state.version || (state.version as number) < SETTINGS_VERSION) {
          console.log('[ToolSettings] Migrating to v4 — toolDefaults now in ToolsEngine');
          return {
            version: SETTINGS_VERSION,
            presets: (state.presets as ToolPreset[]) || [],
            selectedToolIds: [],
            showAdvancedSettings: false,
            advancedSettingsPosition: { x: 100, y: 100 },
          };
        }
        return state as unknown as ToolSettingsState;
      },
    }
  )
);
