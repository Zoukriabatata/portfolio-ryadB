import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Drawing, DrawingTool, DrawingStyle, Marker } from '@/types/charts';
import { DEFAULT_DRAWING_STYLE } from '@/types/charts';

interface ChartToolsState {
  // Active tool
  activeTool: DrawingTool;

  // Drawings storage (per symbol)
  drawings: Record<string, Drawing[]>;

  // Markers/annotations
  markers: Record<string, Marker[]>;

  // Drawing in progress
  pendingDrawing: Partial<Drawing> | null;

  // Settings
  defaultStyle: DrawingStyle;
  snapToCandle: boolean;
  magnetMode: boolean;  // Snap to OHLC points

  // Actions
  setActiveTool: (tool: DrawingTool) => void;
  addDrawing: (symbol: string, drawing: Drawing) => void;
  updateDrawing: (symbol: string, id: string, updates: Partial<Drawing>) => void;
  removeDrawing: (symbol: string, id: string) => void;
  clearDrawings: (symbol: string) => void;
  addMarker: (symbol: string, marker: Marker) => void;
  removeMarker: (symbol: string, id: string) => void;
  setPendingDrawing: (drawing: Partial<Drawing> | null) => void;
  setDefaultStyle: (style: Partial<DrawingStyle>) => void;
  setSnapToCandle: (snap: boolean) => void;
  setMagnetMode: (magnet: boolean) => void;
}

export const useChartToolsStore = create<ChartToolsState>()(
  persist(
    (set, get) => ({
      activeTool: 'cursor',
      drawings: {},
      markers: {},
      pendingDrawing: null,
      defaultStyle: { ...DEFAULT_DRAWING_STYLE },
      snapToCandle: true,
      magnetMode: false,

      setActiveTool: (tool) => set({ activeTool: tool, pendingDrawing: null }),

      addDrawing: (symbol, drawing) => set((state) => {
        const symbolDrawings = state.drawings[symbol] || [];
        return {
          drawings: {
            ...state.drawings,
            [symbol]: [...symbolDrawings, drawing],
          },
        };
      }),

      updateDrawing: (symbol, id, updates) => set((state) => {
        const symbolDrawings = state.drawings[symbol] || [];
        return {
          drawings: {
            ...state.drawings,
            [symbol]: symbolDrawings.map(d =>
              d.id === id ? { ...d, ...updates } : d
            ),
          },
        };
      }),

      removeDrawing: (symbol, id) => set((state) => {
        const symbolDrawings = state.drawings[symbol] || [];
        return {
          drawings: {
            ...state.drawings,
            [symbol]: symbolDrawings.filter(d => d.id !== id),
          },
        };
      }),

      clearDrawings: (symbol) => set((state) => ({
        drawings: {
          ...state.drawings,
          [symbol]: [],
        },
      })),

      addMarker: (symbol, marker) => set((state) => {
        const symbolMarkers = state.markers[symbol] || [];
        return {
          markers: {
            ...state.markers,
            [symbol]: [...symbolMarkers, marker],
          },
        };
      }),

      removeMarker: (symbol, id) => set((state) => {
        const symbolMarkers = state.markers[symbol] || [];
        return {
          markers: {
            ...state.markers,
            [symbol]: symbolMarkers.filter(m => m.id !== id),
          },
        };
      }),

      setPendingDrawing: (drawing) => set({ pendingDrawing: drawing }),

      setDefaultStyle: (style) => set((state) => ({
        defaultStyle: { ...state.defaultStyle, ...style },
      })),

      setSnapToCandle: (snap) => set({ snapToCandle: snap }),

      setMagnetMode: (magnet) => set({ magnetMode: magnet }),
    }),
    {
      name: 'chart-tools-storage',
      partialize: (state) => ({
        drawings: state.drawings,
        markers: state.markers,
        defaultStyle: state.defaultStyle,
        snapToCandle: state.snapToCandle,
        magnetMode: state.magnetMode,
      }),
    }
  )
);
