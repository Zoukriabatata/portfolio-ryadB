// Trade drawings store — LONG / SHORT position overlays the user
// dropped on the chart, plus which tool (if any) is currently armed
// in the left toolbar. Persisted to localStorage so drawings survive
// app restarts (same pattern as useFootprintSettingsStore).

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  TradeDrawing,
  TradeDrawingType,
  LineDrawing,
  LineDrawingKind,
} from "../lib/footprint/tradeDrawings";
import { normalizeRectangle } from "../lib/footprint/tradeDrawings";

export type ActiveTool = TradeDrawingType | LineDrawingKind;

type ToolDrawingsState = {
  /** Trade-position drawings (LONG / SHORT). Renderer filters by
   *  current symbol — keeping them in one list simplifies
   *  persistence. */
  drawings: TradeDrawing[];
  /** Line drawings (horizontal lines, rays, trend segments). Same
   *  per-symbol filter as `drawings`. */
  lineDrawings: LineDrawing[];
  /** When set, the next single click on the chart (not on an axis,
   *  not on an existing handle) places a new drawing of this type
   *  and the field flips back to null. */
  activeTool: ActiveTool | null;
  setActiveTool: (t: ActiveTool | null) => void;
  addDrawing: (d: TradeDrawing) => void;
  updateDrawing: (id: string, patch: Partial<TradeDrawing>) => void;
  removeDrawing: (id: string) => void;
  addLineDrawing: (d: LineDrawing) => void;
  updateLineDrawing: (id: string, patch: Partial<LineDrawing>) => void;
  removeLineDrawing: (id: string) => void;
  /** Wipe every drawing (trade + line) for the given symbol. Used by
   *  the toolbar trash button so the bulk delete doesn't touch
   *  drawings on other symbols. */
  clearForSymbol: (symbol: string) => void;
};

export const useToolDrawingsStore = create<ToolDrawingsState>()(
  persist(
    (set) => ({
      drawings: [],
      lineDrawings: [],
      activeTool: null,
      setActiveTool: (t) => set({ activeTool: t }),
      addDrawing: (d) => set((s) => ({ drawings: [...s.drawings, d] })),
      updateDrawing: (id, patch) =>
        set((s) => ({
          drawings: s.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      removeDrawing: (id) =>
        set((s) => ({ drawings: s.drawings.filter((d) => d.id !== id) })),
      addLineDrawing: (d) =>
        set((s) => ({ lineDrawings: [...s.lineDrawings, d] })),
      updateLineDrawing: (id, patch) =>
        set((s) => ({
          lineDrawings: s.lineDrawings.map((d) => {
            if (d.id !== id) return d;
            const merged = { ...d, ...patch } as LineDrawing;
            // Rectangles re-normalise after every patch so an
            // axis-crossing drag (e.g. dragging TL past BR) leaves
            // the data in canonical {start≤end, top≥bottom} form.
            return merged.kind === "rect"
              ? normalizeRectangle(merged)
              : merged;
          }),
        })),
      removeLineDrawing: (id) =>
        set((s) => ({
          lineDrawings: s.lineDrawings.filter((d) => d.id !== id),
        })),
      clearForSymbol: (symbol) =>
        set((s) => ({
          drawings: s.drawings.filter((d) => d.symbol !== symbol),
          lineDrawings: s.lineDrawings.filter((d) => d.symbol !== symbol),
        })),
    }),
    {
      name: "senzoukria.tooldrawings.v1",
      // Forward-compatible merge: persisted state wins for known keys
      // but new fields fall back to current defaults. activeTool is
      // always reset to null on hydration — a half-finished placement
      // gesture shouldn't carry across app restarts.
      merge: (persisted, current) => {
        const p = (persisted as Partial<ToolDrawingsState> | undefined) ?? {};
        return {
          ...current,
          drawings: p.drawings ?? current.drawings,
          lineDrawings: p.lineDrawings ?? current.lineDrawings,
          activeTool: null,
        };
      },
    },
  ),
);
