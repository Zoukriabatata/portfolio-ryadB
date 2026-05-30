// Per-tool style presets — the user can save the style fields of
// a drawing (color, line style, width, fill, font etc.) under a
// name, then quickly re-apply that style to another drawing of
// the same kind. Decoupled from the drawing's geometry so applying
// a preset never moves the line / rect / text; it only repaints.
//
// Presets are bucketed by drawing kind so a "Wide red trend"
// preset only shows up when a trend line is selected, never on
// an h-line or rectangle.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LineDrawing,
  TextDrawing,
  RectangleDrawing,
} from "../lib/footprint/tradeDrawings";

/** Kinds of drawings that have style presets. Trade drawings
 *  (LONG / SHORT) are skipped for now — their style mostly comes
 *  from the global chart-color palette, not per-drawing. */
export type DrawingPresetKind =
  | "h-line"
  | "h-ray"
  | "trend"
  | "rect"
  | "ruler"
  | "text";

/** Subset of fields captured per kind. Geometry / id / symbol /
 *  createdAt are NEVER in here — they stay on the drawing. */
type LineStylePatch = Pick<
  Extract<LineDrawing, { kind: "h-line" }>,
  "color" | "lineWidth" | "lineStyle"
>;

type RectStylePatch = Pick<
  RectangleDrawing,
  "borderColor" | "borderWidth" | "lineStyle" | "fillColor"
>;

type TextStylePatch = Pick<
  TextDrawing,
  "color" | "bgColor" | "fontSize" | "bold" | "italic"
>;

/** A preset's payload — variant per kind so TS keeps each field
 *  optional in the right shape. */
export type DrawingPresetPayload =
  | { kind: "h-line"; style: LineStylePatch }
  | { kind: "h-ray"; style: LineStylePatch }
  | { kind: "trend"; style: LineStylePatch }
  | { kind: "ruler"; style: LineStylePatch }
  | { kind: "rect"; style: RectStylePatch }
  | { kind: "text"; style: TextStylePatch };

export type DrawingPreset = {
  id: string;
  name: string;
  createdAt: number;
} & DrawingPresetPayload;

type State = {
  presets: DrawingPreset[];
};

type Actions = {
  /** Snapshot the style of the given drawing under the given name.
   *  Returns the new preset (for the caller to focus on / etc.). */
  saveFromDrawing: (
    name: string,
    drawing: LineDrawing,
  ) => DrawingPreset | null;
  /** List presets for a specific kind. Cheap O(n) scan — the list
   *  is bounded by what a single user creates by hand. */
  forKind: (kind: DrawingPresetKind) => DrawingPreset[];
  remove: (id: string) => void;
};

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Pull the style-shaped subset off a drawing. Returns null for
 *  drawings we don't bucket (e.g. trade LONG/SHORT, which use the
 *  global chart palette instead of per-drawing styles). */
function extractStyle(d: LineDrawing): DrawingPresetPayload | null {
  if (
    d.kind === "h-line" ||
    d.kind === "h-ray" ||
    d.kind === "trend" ||
    d.kind === "ruler"
  ) {
    return {
      kind: d.kind,
      style: {
        color: d.color,
        lineWidth: d.lineWidth,
        lineStyle: d.lineStyle,
      },
    };
  }
  if (d.kind === "rect") {
    return {
      kind: "rect",
      style: {
        borderColor: d.borderColor,
        borderWidth: d.borderWidth,
        lineStyle: d.lineStyle,
        fillColor: d.fillColor,
      },
    };
  }
  if (d.kind === "text") {
    return {
      kind: "text",
      style: {
        color: d.color,
        bgColor: d.bgColor,
        fontSize: d.fontSize,
        bold: d.bold,
        italic: d.italic,
      },
    };
  }
  return null;
}

/** Take a preset payload and shape it into a `Partial<LineDrawing>`
 *  patch suitable for `updateLineDrawing(id, patch)`. */
export function presetToPatch(p: DrawingPresetPayload): Partial<LineDrawing> {
  // The kind discriminator stays out of the patch — only the
  // style fields are applied.
  return { ...p.style } as Partial<LineDrawing>;
}

export const useDrawingPresetsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      presets: [],
      saveFromDrawing: (rawName, drawing) => {
        const payload = extractStyle(drawing);
        if (!payload) return null;
        const name = rawName.trim() || "Untitled";
        const preset: DrawingPreset = {
          id: makeId(),
          name,
          createdAt: Date.now(),
          ...payload,
        };
        set({ presets: [preset, ...get().presets] });
        return preset;
      },
      forKind: (kind) => get().presets.filter((p) => p.kind === kind),
      remove: (id) => {
        set({ presets: get().presets.filter((p) => p.id !== id) });
      },
    }),
    {
      name: "senzoukria.drawingpresets.v1",
      merge: (persisted, current) => {
        const p = (persisted as Partial<State> | undefined) ?? {};
        return {
          ...current,
          presets: Array.isArray(p.presets) ? p.presets : current.presets,
        };
      },
    },
  ),
);
