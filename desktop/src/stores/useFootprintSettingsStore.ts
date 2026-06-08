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
/** Time-axis display timezone. "LCL" = browser default (the user's
 *  computer), "UTC" = Zulu, the rest are IANA-backed trading hubs.
 *  Stored as an opaque key; the IANA mapping lives next to the
 *  renderer's formatter. */
export type TimezoneKey = "LCL" | "UTC" | "NY" | "CHI" | "LON" | "PAR" | "TYO";

export type FootprintSettings = {
  // Visibility flags consumed by the renderer.
  showGrid: boolean;
  /** Crosshair on hover — toggled from the left toolbar. */
  showCrosshair: boolean;
  showPocSession: boolean;
  showPocBar: boolean;
  showVolumeTooltip: boolean;
  showOhlcHeader: boolean;

  // Numeric formatting.
  priceDecimalsMode: PriceDecimalsMode;
  volumeFormat: VolumeFormat;

  // Crosshair Y snap target.
  magnetMode: MagnetMode;

  // Time-axis display timezone. Toggled via the TZ button in the
  // chart controls bar.
  timezone: TimezoneKey;

  // M4.7c — order-flow indicators (computed async, drawn as overlays).
  showStackedImbalances: boolean;
  showNakedPOCs: boolean;
  showUnfinishedAuctions: boolean;
  /** Absorption: heavy aggressive volume at a level that price failed to
   *  push beyond (volume-at-extreme rule, see orderflow-calc). */
  showAbsorption: boolean;
  /** ATAS-style ratio threshold for a level to count as imbalanced. */
  imbalanceRatio: number;
  /** Minimum consecutive imbalanced levels to mark a stacked streak. */
  imbalanceMinConsecutive: number;

  // M6b-1 — heatmap overlay toggles. POC reuses `showPocSession`
  // (cross-surface). VAH/VAL/VWAP are heatmap-only; the footprint
  // surface ignores them.
  showTradeBubbles: boolean;
  showVAH: boolean;
  showVAL: boolean;
  showVWAP: boolean;

  // Footprint chart indicators — toggled from the IndicatorsButton
  // dropdown next to the timeframe pills. Each flag controls one
  // overlay on the footprint surface.
  showVwapIndicator: boolean;
  showClusterStat: boolean;
  /** Bar-delta label drawn above each candle's high price. Works
   *  independently of the cluster stat panel — user can enable
   *  either, both, or neither. Same totalDelta value either way;
   *  the inline label just makes "bullish vs bearish flow per bar"
   *  visible without scanning the panel rows. */
  showBarDelta: boolean;

  // Delta profile panel (vertical histogram of net delta per price level).
  showDeltaProfile: boolean;
  // CVD oscillator panel.
  showCvd: boolean;
  cvdMode: "line" | "candles";
  cvdPanelHeight: number;
  // Per-cell imbalance coloring (bid/ask text color + bold when imbalanced).
  // Rate in % (200 = 2×), volume filter, min absolute difference, ignore zero.
  imbalanceCellRate: number;
  imbalanceCellVolumeFilter: number;
  imbalanceCellMinDiff: number;
  imbalanceCellIgnoreZero: boolean;
  // DOM panel (bid/ask volume bars, left side of chart).
  showDom: boolean;
  domProportion: number;

  // Chart colours — every visible primitive (background, grid,
  // candle parts, bid/ask) is user-pickable via the settings modal.
  // Hex strings (#rrggbb) so the <input type="color"> native picker
  // round-trips cleanly. The footprint state bar (vertical strip
  // marking bullish/bearish per cell) derives from candleBodyUp /
  // candleBodyDown so that the cell colour never conflicts with
  // the candle's own colour in candle-mode — single source of truth.
  chartBgColor: string;
  chartGridColor: string;
  candleBodyUp: string;
  candleBodyDown: string;
  candleBorderUp: string;
  candleBorderDown: string;
  candleWickUp: string;
  candleWickDown: string;
  bidColor: string;
  askColor: string;

  // Crosshair styling — exposed in the AdvancedSettingsModal.
  crosshairColor: string;
  crosshairOpacity: number;
  crosshairStyle: "solid" | "dashed" | "dotted";
  crosshairWidth: number;

};

export type CrosshairLineStyle = "solid" | "dashed" | "dotted";

const DEFAULTS: FootprintSettings = {
  showGrid: true,
  showCrosshair: true,
  showPocSession: true,
  showPocBar: true,
  showVolumeTooltip: true,
  showOhlcHeader: true,
  priceDecimalsMode: "auto",
  volumeFormat: "raw",
  magnetMode: "none",
  timezone: "LCL",
  // Indicator overlays — OFF by default (opt-in via the AdvancedSettingsModal).
  // Were too noisy on quiet 5s feeds (green SI rectangles cluttered the chart).
  showStackedImbalances: false,
  showNakedPOCs: false,
  showUnfinishedAuctions: false,
  showAbsorption: false,
  imbalanceRatio: 3.0,
  imbalanceMinConsecutive: 3,
  showDeltaProfile: false,
  showCvd: false,
  cvdMode: "candles" as const,
  cvdPanelHeight: 80,
  imbalanceCellRate: 200,
  imbalanceCellVolumeFilter: 20,
  imbalanceCellMinDiff: 10,
  imbalanceCellIgnoreZero: false,
  showDom: false,
  domProportion: 100,
  showTradeBubbles: true,
  showVAH: true,
  showVAL: true,
  showVWAP: true,
  // Footprint indicator overlays — OFF by default. User opt-in via
  // the IndicatorsButton dropdown.
  showVwapIndicator: false,
  showClusterStat: false,
  showBarDelta: false,
  // Default palette (Senzoukria green + white on black). The user
  // can override every entry from the AdvancedSettingsModal.
  chartBgColor: "#0a0a0a",
  chartGridColor: "#1c1c1c",
  candleBodyUp: "#7ed321",
  candleBodyDown: "#ffffff",
  candleBorderUp: "#7ed321",
  candleBorderDown: "#ffffff",
  candleWickUp: "#7ed321",
  candleWickDown: "#ffffff",
  bidColor: "#ffffff",
  askColor: "#7ed321",
  crosshairColor: "#ffffff",
  crosshairOpacity: 0.45,
  crosshairStyle: "dashed",
  crosshairWidth: 1,
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
      // Bumped v1 → v2 so existing users get the new defaults (indicators
       // OFF). Old v1 key remains in localStorage harmlessly.
      name: "senzoukria.footprint.settings.v2",
      // Forward-compatible merge: persisted state wins for known
      // keys but new fields fall back to current (i.e. the new
      // defaults), so adding a field in V2 doesn't wipe V1 prefs.
      // Timezone is sanitized — an unknown / stale string would
      // otherwise leak into the renderer's `Intl.DateTimeFormat`
      // call and silently fall back to UTC on some WebView builds.
      merge: (persisted, current) => {
        const p = (persisted as Partial<FootprintSettings>) ?? {};
        const validTz: TimezoneKey[] = [
          "LCL",
          "UTC",
          "NY",
          "CHI",
          "LON",
          "PAR",
          "TYO",
        ];
        const tz = validTz.includes(p.timezone as TimezoneKey)
          ? (p.timezone as TimezoneKey)
          : "LCL";
        return {
          ...current,
          ...p,
          timezone: tz,
        };
      },
    },
  ),
);
