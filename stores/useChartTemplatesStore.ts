'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * CHART TEMPLATES STORE
 * Manages saved chart configurations that can be loaded/applied
 */

export interface ChartTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  type: 'live' | 'footprint' | 'all';
  settings: {
    // LiveChart settings
    showGrid?: boolean;
    chartType?: 'candlestick' | 'line' | 'area';
    timeframe?: string;

    // Crosshair settings
    crosshair?: {
      color?: string;
      width?: number;
      style?: 'solid' | 'dashed' | 'dotted';
    };

    // Background settings
    background?: {
      color?: string;
      gridColor?: string;
    };

    // Candle settings
    candles?: {
      upColor?: string;
      downColor?: string;
      wickUp?: string;
      wickDown?: string;
      borderUp?: string;
      borderDown?: string;
    };

    // Display preferences
    showVolume?: boolean;
    showCrosshairTooltip?: boolean;

    // Footprint settings (matches FootprintSettings from store)
    footprintSettings?: {
      features?: {
        showGrid?: boolean;
        showOHLC?: boolean;
        showDeltaProfile?: boolean;
        showPOC?: boolean;
        showImbalances?: boolean;
        showCurrentPrice?: boolean;
        showVolumeProfile?: boolean;
        showDeltaPerLevel?: boolean;
        showTotalDelta?: boolean;
      };
      imbalance?: {
        ratio?: number;
        minVolume?: number;
        highlightStrength?: number;
      };
      layout?: {
        footprintWidth?: number;
        rowHeight?: number;
        maxVisibleFootprints?: number;
        deltaProfilePosition?: 'left' | 'right';
      };
    };

    // Colors/Theme overrides
    colors?: Record<string, string | number>;

    // Drawing tools
    drawings?: unknown[];

    // Indicator configs
    indicators?: Array<{
      id: string;
      type: string;
      enabled: boolean;
      params: Record<string, unknown>;
      style: Record<string, unknown>;
    }>;

    // Volume profile settings
    vpSettings?: {
      showVolumeProfile?: boolean;
      vpProfileMode?: string;
      vpHistoryDepth?: number;
      vpPanelSide?: 'left' | 'right';
    };
  };
}

interface ChartTemplatesState {
  templates: ChartTemplate[];

  // Actions
  saveTemplate: (template: Omit<ChartTemplate, 'id' | 'createdAt' | 'updatedAt'>) => ChartTemplate;
  updateTemplate: (id: string, updates: Partial<Omit<ChartTemplate, 'id' | 'createdAt'>>) => void;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, newName: string) => void;
  getTemplate: (id: string) => ChartTemplate | undefined;
  getTemplatesByType: (type: ChartTemplate['type']) => ChartTemplate[];
  duplicateTemplate: (id: string, newName: string) => ChartTemplate | undefined;
}

function generateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useChartTemplatesStore = create<ChartTemplatesState>()(
  persist(
    (set, get) => ({
      templates: [],

      saveTemplate: (templateData) => {
        const now = Date.now();
        const newTemplate: ChartTemplate = {
          ...templateData,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          templates: [...state.templates, newTemplate],
        }));

        return newTemplate;
      },

      updateTemplate: (id, updates) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: Date.now() }
              : t
          ),
        }));
      },

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }));
      },

      renameTemplate: (id, newName) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? { ...t, name: newName, updatedAt: Date.now() }
              : t
          ),
        }));
      },

      getTemplate: (id) => {
        return get().templates.find((t) => t.id === id);
      },

      getTemplatesByType: (type) => {
        const templates = get().templates;
        if (type === 'all') {
          return templates;
        }
        return templates.filter((t) => t.type === type || t.type === 'all');
      },

      duplicateTemplate: (id, newName) => {
        const original = get().getTemplate(id);
        if (!original) return undefined;

        const now = Date.now();
        const duplicate: ChartTemplate = {
          ...original,
          id: generateId(),
          name: newName,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          templates: [...state.templates, duplicate],
        }));

        return duplicate;
      },
    }),
    {
      name: 'chart-templates-storage',
      skipHydration: true,
      version: 1,
    }
  )
);
