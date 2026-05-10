// Phase B / M4 — Senzoukria color tokens for the footprint canvas.
//
// Mirror of the CSS variables exposed by globals.css (M1) but
// resolved into concrete RGB strings the Canvas2D context can
// consume directly. Reading getComputedStyle() at draw time would
// work too but resolving once at theme construction keeps the hot
// path branch-free.
//
// Reference colors come from the M1 design tokens (lime green
// `#4ade80` primary, navy `#07080f` background).

export interface FootprintTheme {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Aggressor colors — buy = lime green, sell = warm red.
  buy: string;
  buyDim: string;
  sell: string;
  sellDim: string;

  // Heat ramps for cell intensity (lighter = more volume).
  buyHeat: [string, string, string];
  sellHeat: [string, string, string];

  // Profile (volume / delta) accent + separator strokes.
  profileBuy: string;
  profileSell: string;
  profileDelta: string;
  poc: string;
  vah: string;
  val: string;

  // Grid and axes.
  grid: string;
  axis: string;

  // Typography.
  fontFamily: string;
  priceFontSize: number;
  cellFontSize: number;
  headerFontSize: number;
}

export const SENZOUKRIA_DARK: FootprintTheme = {
  background: "#07080f",
  surface: "#0d0f1b",
  border: "#1f2333",
  textPrimary: "#f0f6fc",
  textSecondary: "#a3a7b3",
  textMuted: "#5f6473",

  buy: "#4ade80",
  buyDim: "rgba(74, 222, 128, 0.18)",
  sell: "#ef4444",
  sellDim: "rgba(239, 68, 68, 0.18)",

  // Heat ramps go from dim (low volume) to bright (high volume).
  buyHeat: [
    "rgba(74, 222, 128, 0.10)",
    "rgba(74, 222, 128, 0.45)",
    "rgba(74, 222, 128, 0.90)",
  ],
  sellHeat: [
    "rgba(239, 68, 68, 0.10)",
    "rgba(239, 68, 68, 0.45)",
    "rgba(239, 68, 68, 0.90)",
  ],

  profileBuy: "rgba(74, 222, 128, 0.55)",
  profileSell: "rgba(239, 68, 68, 0.55)",
  profileDelta: "#fbbf24",
  poc: "#fbbf24",
  vah: "rgba(251, 191, 36, 0.45)",
  val: "rgba(251, 191, 36, 0.45)",

  grid: "rgba(255, 255, 255, 0.04)",
  axis: "rgba(255, 255, 255, 0.10)",

  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  priceFontSize: 10,
  cellFontSize: 10,
  headerFontSize: 11,
};
