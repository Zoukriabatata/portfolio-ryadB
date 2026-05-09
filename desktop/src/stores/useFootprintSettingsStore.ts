// Phase B / M4.7b — persisted footprint canvas settings.
//
// Single source of truth for the visibility / format / magnet
// toggles surfaced in the AdvancedSettingsModal + the MagnetToggle
// button. Reads cross-component (CryptoFootprint, the modal, the
// magnet toggle) so a shared store keeps everything in sync without
// prop-drilling.
//
// Persisted to localStorage — Tauri's WebView2 (Windows) and WebKit
// (macOS) both back localStorage natively, so this just works.
// Reset to defaults via `resetToDefaults()`. Forward-compatible
// merge so adding a field later doesn't wipe the user's previously
// saved choices.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MagnetMode = "none" | "ohlc" | "poc";
export type PriceDecimalsMode = "auto" | "2" | "4" | "8";
export type VolumeFormat = "raw" | "K" | "M";

export type FootprintSettings = {
  // Visibility flags consumed by the renderer.
  showGrid: boolean;
  showPocSession: boolean;
  showPocBar: boolean;
  showVolumeTooltip: boolean;
  showOhlcHeader: boolean;

  // Numeric formatting.
  priceDecimalsMode: PriceDecimalsMode;
  volumeFormat: VolumeFormat;

  // Crosshair Y snap target.
  magnetMode: MagnetMode;
};

const DEFAULTS: FootprintSettings = {
  showGrid: true,
  showPocSession: true,
  showPocBar: true,
  showVolumeTooltip: true,
  showOhlcHeader: true,
  priceDecimalsMode: "auto",
  volumeFormat: "raw",
  magnetMode: "none",
};

type Actions = {
  setMagnetMode: (m: MagnetMode) => void;
  cycleMagnetMode: () => void;
  toggle: (key: BooleanFootprintKey) => void;
  set: <K extends keyof FootprintSettings>(
    key: K,
    value: FootprintSettings[K],
  ) => void;
  resetToDefaults: () => void;
};

// Limit `toggle()` to the boolean keys so accidental
// `toggle("magnetMode")` calls fail at compile time.
type BooleanFootprintKey = {
  [K in keyof FootprintSettings]: FootprintSettings[K] extends boolean
    ? K
    : never;
}[keyof FootprintSettings];

export const useFootprintSettingsStore = create<
  FootprintSettings & Actions
>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,
      setMagnetMode: (m) => set({ magnetMode: m }),
      cycleMagnetMode: () => {
        const order: MagnetMode[] = ["none", "ohlc", "poc"];
        const cur = get().magnetMode;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        set({ magnetMode: next });
      },
      toggle: (key) => set({ [key]: !get()[key] } as Partial<FootprintSettings>),
      set: (key, value) =>
        set({ [key]: value } as unknown as Partial<FootprintSettings>),
      // Reset preserves the magnet mode — the magnet button is the
      // canonical way to change that one. Resetting the modal
      // toggles shouldn't surprise the user by also flipping their
      // crosshair behaviour.
      resetToDefaults: () => {
        const cur = get();
        set({ ...DEFAULTS, magnetMode: cur.magnetMode });
      },
    }),
    {
      name: "senzoukria.footprint.settings.v1",
      // Forward-compatible merge: persisted state wins for known
      // keys but new fields fall back to current (i.e. the new
      // defaults), so adding a field in V2 doesn't wipe V1 prefs.
      merge: (persisted, current) => ({
        ...current,
        ...((persisted as Partial<FootprintSettings>) ?? {}),
      }),
    },
  ),
);
