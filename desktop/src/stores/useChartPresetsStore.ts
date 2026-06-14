// Named chart-style presets. A "preset" is a snapshot of every
// user-tunable field from useFootprintSettingsStore that affects
// the chart's visual style (colors, crosshair, grid, etc.). The
// user picks a name, hits Save → the snapshot lands here. Click
// Apply on a preset → the snapshot is splatted back onto the
// settings store, repainting the chart in one step.
//
// Persisted to localStorage so presets survive app restart.
// Settings flags themselves stay in useFootprintSettingsStore —
// this store ONLY owns the named templates.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  useFootprintSettingsStore,
  type FootprintSettings,
} from "./useFootprintSettingsStore";

/** Whitelist of fields captured by a preset. We intentionally
 *  exclude things that should stay user-session-level rather
 *  than template-level — magnet mode (toolbar toggle), timezone
 *  (TZ button), price-decimals override, volume format. The
 *  preset only owns the visual style. */
export type ChartPresetSnapshot = Pick<
  FootprintSettings,
  // Visibility
  | "showGrid"
  | "showPocSession"
  | "showPocBar"
  | "showVolumeTooltip"
  | "showOhlcHeader"
  // Indicators
  | "showStackedImbalances"
  | "showNakedPOCs"
  | "showUnfinishedAuctions"
  | "showVwapIndicator"
  | "showClusterStat"
  | "showBarDelta"
  // Chart colours
  | "chartBgColor"
  | "chartGridColor"
  | "candleBodyUp"
  | "candleBodyDown"
  | "candleBorderUp"
  | "candleBorderDown"
  | "candleWickUp"
  | "candleWickDown"
  | "bidColor"
  | "askColor"
  // Crosshair
  | "crosshairColor"
  | "crosshairOpacity"
  | "crosshairStyle"
  | "crosshairWidth"
  // Candle outline
  | "showCandleOutline"
  | "candleOutlineColor"
  | "candleOutlineWidth"
  | "candleOutlineOpacity"
>;

const SNAPSHOT_KEYS: (keyof ChartPresetSnapshot)[] = [
  "showGrid",
  "showPocSession",
  "showPocBar",
  "showVolumeTooltip",
  "showOhlcHeader",
  "showStackedImbalances",
  "showNakedPOCs",
  "showUnfinishedAuctions",
  "showVwapIndicator",
  "showClusterStat",
  "showBarDelta",
  "chartBgColor",
  "chartGridColor",
  "candleBodyUp",
  "candleBodyDown",
  "candleBorderUp",
  "candleBorderDown",
  "candleWickUp",
  "candleWickDown",
  "bidColor",
  "askColor",
  "crosshairColor",
  "crosshairOpacity",
  "crosshairStyle",
  "crosshairWidth",
  "showCandleOutline",
  "candleOutlineColor",
  "candleOutlineWidth",
  "candleOutlineOpacity",
];

export type ChartPreset = {
  id: string;
  name: string;
  createdAt: number;
  snapshot: ChartPresetSnapshot;
};

type State = {
  presets: ChartPreset[];
};

type Actions = {
  /** Capture the current useFootprintSettingsStore state under the
   *  given name. Trims the name + falls back to "Untitled". */
  saveCurrent: (name: string) => ChartPreset;
  /** Splat a preset's snapshot back onto the settings store. */
  apply: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

function captureSnapshot(): ChartPresetSnapshot {
  const s = useFootprintSettingsStore.getState();
  const out = {} as ChartPresetSnapshot;
  for (const k of SNAPSHOT_KEYS) {
    // The narrowing on the assignment side is messy because of
    // TS's invariance on Pick<...>; cast through unknown is the
    // pragmatic option here, the value comes straight off the
    // matching key.
    (out as unknown as Record<string, unknown>)[k] = s[k];
  }
  return out;
}

function applySnapshot(snap: ChartPresetSnapshot): void {
  const set = useFootprintSettingsStore.getState().set;
  for (const k of SNAPSHOT_KEYS) {
    const v = (snap as unknown as Record<string, unknown>)[k];
    if (v !== undefined) {
      // Same narrowing escape hatch as captureSnapshot.
      set(k as keyof FootprintSettings, v as never);
    }
  }
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useChartPresetsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      presets: [],
      saveCurrent: (rawName) => {
        const name = rawName.trim() || "Untitled";
        const preset: ChartPreset = {
          id: makeId(),
          name,
          createdAt: Date.now(),
          snapshot: captureSnapshot(),
        };
        set({ presets: [preset, ...get().presets] });
        return preset;
      },
      apply: (id) => {
        const p = get().presets.find((it) => it.id === id);
        if (p) applySnapshot(p.snapshot);
      },
      rename: (id, rawName) => {
        const name = rawName.trim() || "Untitled";
        set({
          presets: get().presets.map((p) =>
            p.id === id ? { ...p, name } : p,
          ),
        });
      },
      remove: (id) => {
        set({ presets: get().presets.filter((p) => p.id !== id) });
      },
    }),
    {
      name: "senzoukria.chartpresets.v1",
      // Backwards-compatible merge — `presets` falls back to []
      // when the storage entry is empty / unparseable.
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
