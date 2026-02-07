import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ToolType } from '@/lib/tools/ToolsEngine';

/**
 * FAVORITES TOOLBAR STORE
 *
 * Manages custom tool favorites for different chart contexts.
 * Persisted to localStorage for cross-session retention.
 */

export type ToolbarPreset = 'default' | 'footprint' | 'heatmap' | 'custom';
export type ToolbarPosition = 'top' | 'left' | 'right' | 'floating';

interface ToolbarConfig {
  tools: ToolType[];
  position: ToolbarPosition;
  floatingPosition?: { x: number; y: number };
  collapsed: boolean;
}

interface FavoritesToolbarState {
  // Preset-based toolbars
  presets: Record<ToolbarPreset, ToolbarConfig>;
  activePreset: ToolbarPreset;

  // Actions
  setActivePreset: (preset: ToolbarPreset) => void;
  addToolToPreset: (preset: ToolbarPreset, tool: ToolType) => void;
  removeToolFromPreset: (preset: ToolbarPreset, tool: ToolType) => void;
  reorderTools: (preset: ToolbarPreset, tools: ToolType[]) => void;
  setPosition: (preset: ToolbarPreset, position: ToolbarPosition) => void;
  setFloatingPosition: (preset: ToolbarPreset, x: number, y: number) => void;
  toggleCollapsed: (preset: ToolbarPreset) => void;
  resetPreset: (preset: ToolbarPreset) => void;
  resetAll: () => void;
}

// Default configurations for each preset
const DEFAULT_PRESETS: Record<ToolbarPreset, ToolbarConfig> = {
  default: {
    tools: ['cursor', 'crosshair', 'trendline', 'horizontalLine', 'rectangle'],
    position: 'floating',
    floatingPosition: { x: 60, y: 120 },
    collapsed: false,
  },
  footprint: {
    tools: ['cursor', 'crosshair', 'horizontalLine', 'rectangle', 'longPosition', 'shortPosition'],
    position: 'floating',
    floatingPosition: { x: 60, y: 120 },
    collapsed: false,
  },
  heatmap: {
    tools: ['cursor', 'crosshair', 'horizontalLine', 'verticalLine', 'rectangle'],
    position: 'floating',
    floatingPosition: { x: 60, y: 120 },
    collapsed: false,
  },
  custom: {
    tools: [],
    position: 'floating',
    floatingPosition: { x: 100, y: 200 },
    collapsed: false,
  },
};

export const useFavoritesToolbarStore = create<FavoritesToolbarState>()(
  persist(
    (set) => ({
      presets: { ...DEFAULT_PRESETS },
      activePreset: 'default',

      setActivePreset: (preset) => set({ activePreset: preset }),

      addToolToPreset: (preset, tool) =>
        set((state) => {
          const currentTools = state.presets[preset].tools;
          if (currentTools.includes(tool)) return state;
          return {
            presets: {
              ...state.presets,
              [preset]: {
                ...state.presets[preset],
                tools: [...currentTools, tool],
              },
            },
          };
        }),

      removeToolFromPreset: (preset, tool) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: {
              ...state.presets[preset],
              tools: state.presets[preset].tools.filter((t) => t !== tool),
            },
          },
        })),

      reorderTools: (preset, tools) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: {
              ...state.presets[preset],
              tools,
            },
          },
        })),

      setPosition: (preset, position) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: {
              ...state.presets[preset],
              position,
            },
          },
        })),

      setFloatingPosition: (preset, x, y) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: {
              ...state.presets[preset],
              floatingPosition: { x, y },
            },
          },
        })),

      toggleCollapsed: (preset) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: {
              ...state.presets[preset],
              collapsed: !state.presets[preset].collapsed,
            },
          },
        })),

      resetPreset: (preset) =>
        set((state) => ({
          presets: {
            ...state.presets,
            [preset]: { ...DEFAULT_PRESETS[preset] },
          },
        })),

      resetAll: () => set({ presets: { ...DEFAULT_PRESETS }, activePreset: 'default' }),
    }),
    {
      name: 'senzoukria-favorites-toolbar',
      version: 3,
      merge: (persistedState: unknown, currentState: FavoritesToolbarState) => {
        const persisted = persistedState as Partial<FavoritesToolbarState> | undefined;
        if (!persisted?.presets) return currentState;

        // Merge each preset: use persisted tools but force floating + uncollapsed
        const mergedPresets = { ...DEFAULT_PRESETS };
        for (const key of Object.keys(DEFAULT_PRESETS) as ToolbarPreset[]) {
          if (persisted.presets[key]) {
            const persistedTools = persisted.presets[key].tools;
            mergedPresets[key] = {
              ...DEFAULT_PRESETS[key],
              // Use persisted tools only if non-empty, otherwise reset to defaults
              tools: (persistedTools && persistedTools.length > 0) ? persistedTools : DEFAULT_PRESETS[key].tools,
              position: 'floating',
              floatingPosition: persisted.presets[key].floatingPosition || DEFAULT_PRESETS[key].floatingPosition,
              collapsed: false, // Always start expanded
            };
          }
        }

        return {
          ...currentState,
          presets: mergedPresets,
          activePreset: persisted.activePreset || currentState.activePreset,
        };
      },
    }
  )
);
