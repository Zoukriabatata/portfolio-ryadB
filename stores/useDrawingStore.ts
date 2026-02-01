/**
 * DRAWING STORE - Gestion des outils de dessin
 *
 * - Dessins persistés par symbole
 * - Undo/Redo
 * - Style par défaut
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Drawing,
  type DrawingToolType,
  type DrawingStyle,
  DEFAULT_DRAWING_STYLE,
  generateDrawingId,
} from '@/lib/drawing/DrawingTypes';

// Historique pour Undo/Redo
interface HistoryState {
  past: Record<string, Drawing[]>[];
  future: Record<string, Drawing[]>[];
}

interface DrawingState {
  // Dessins par symbole
  drawings: Record<string, Drawing[]>;

  // Outil actif
  activeTool: DrawingToolType;

  // Style par défaut
  defaultStyle: DrawingStyle;

  // Dessin sélectionné
  selectedDrawingId: string | null;

  // Historique (undo/redo)
  history: HistoryState;

  // Actions - Dessins
  addDrawing: (symbol: string, drawing: Omit<Drawing, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateDrawing: (symbol: string, id: string, updates: Partial<Drawing>) => void;
  deleteDrawing: (symbol: string, id: string) => void;
  clearDrawings: (symbol: string) => void;

  // Actions - Outil
  setActiveTool: (tool: DrawingToolType) => void;
  setDefaultStyle: (style: Partial<DrawingStyle>) => void;

  // Actions - Sélection
  selectDrawing: (id: string | null) => void;

  // Actions - Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Getters
  getDrawings: (symbol: string) => Drawing[];
  getDrawing: (symbol: string, id: string) => Drawing | undefined;
}

const MAX_HISTORY = 50;

export const useDrawingStore = create<DrawingState>()(
  persist(
    (set, get) => ({
      drawings: {},
      activeTool: 'cursor',
      defaultStyle: DEFAULT_DRAWING_STYLE,
      selectedDrawingId: null,
      history: { past: [], future: [] },

      // === DESSINS ===

      addDrawing: (symbol, drawing) => {
        const now = Date.now();
        const newDrawing: Drawing = {
          ...drawing,
          id: generateDrawingId(),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => {
          const symbolDrawings = state.drawings[symbol] || [];
          const newDrawings = {
            ...state.drawings,
            [symbol]: [...symbolDrawings, newDrawing],
          };

          // Ajoute à l'historique
          const newPast = [...state.history.past, state.drawings].slice(-MAX_HISTORY);

          return {
            drawings: newDrawings,
            history: { past: newPast, future: [] },
          };
        });
      },

      updateDrawing: (symbol, id, updates) => {
        set((state) => {
          const symbolDrawings = state.drawings[symbol] || [];
          const newDrawings = {
            ...state.drawings,
            [symbol]: symbolDrawings.map((d) =>
              d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d
            ),
          };

          // Ajoute à l'historique
          const newPast = [...state.history.past, state.drawings].slice(-MAX_HISTORY);

          return {
            drawings: newDrawings,
            history: { past: newPast, future: [] },
          };
        });
      },

      deleteDrawing: (symbol, id) => {
        set((state) => {
          const symbolDrawings = state.drawings[symbol] || [];
          const newDrawings = {
            ...state.drawings,
            [symbol]: symbolDrawings.filter((d) => d.id !== id),
          };

          // Ajoute à l'historique
          const newPast = [...state.history.past, state.drawings].slice(-MAX_HISTORY);

          return {
            drawings: newDrawings,
            selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
            history: { past: newPast, future: [] },
          };
        });
      },

      clearDrawings: (symbol) => {
        set((state) => {
          const newDrawings = { ...state.drawings };
          delete newDrawings[symbol];

          // Ajoute à l'historique
          const newPast = [...state.history.past, state.drawings].slice(-MAX_HISTORY);

          return {
            drawings: newDrawings,
            selectedDrawingId: null,
            history: { past: newPast, future: [] },
          };
        });
      },

      // === OUTIL ===

      setActiveTool: (tool) => {
        set({ activeTool: tool, selectedDrawingId: null });
      },

      setDefaultStyle: (style) => {
        set((state) => ({
          defaultStyle: { ...state.defaultStyle, ...style },
        }));
      },

      // === SÉLECTION ===

      selectDrawing: (id) => {
        set({ selectedDrawingId: id, activeTool: 'cursor' });
      },

      // === UNDO/REDO ===

      undo: () => {
        set((state) => {
          if (state.history.past.length === 0) return state;

          const newPast = [...state.history.past];
          const previous = newPast.pop()!;

          return {
            drawings: previous,
            history: {
              past: newPast,
              future: [state.drawings, ...state.history.future].slice(0, MAX_HISTORY),
            },
          };
        });
      },

      redo: () => {
        set((state) => {
          if (state.history.future.length === 0) return state;

          const newFuture = [...state.history.future];
          const next = newFuture.shift()!;

          return {
            drawings: next,
            history: {
              past: [...state.history.past, state.drawings].slice(-MAX_HISTORY),
              future: newFuture,
            },
          };
        });
      },

      canUndo: () => get().history.past.length > 0,
      canRedo: () => get().history.future.length > 0,

      // === GETTERS ===

      getDrawings: (symbol) => get().drawings[symbol] || [],
      getDrawing: (symbol, id) => get().drawings[symbol]?.find((d) => d.id === id),
    }),
    {
      name: 'drawing-storage',
      partialize: (state) => ({
        drawings: state.drawings,
        defaultStyle: state.defaultStyle,
      }),
    }
  )
);
