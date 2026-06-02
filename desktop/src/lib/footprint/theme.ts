// Phase B / M4 — Senzoukria color tokens for the footprint canvas.
//
// Mirror of the CSS variables exposed by globals.css (M1) but
// resolved into concrete RGB strings the Canvas2D context can
// consume directly. Reading getComputedStyle() at draw time would
// work too but resolving once at theme construction keeps the hot
// path branch-free.
//
// Reference colors come from the M1 design tokens (lime green
// `#7ed321` primary, navy `#07080f` background).

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
  // Senzoukria palette: NOIR / BLANC / VERT only.
  background: "#0a0a0a",
  surface: "#0a0a0a",
  border: "rgba(255, 255, 255, 0.10)",
  textPrimary: "#ffffff",
  textSecondary: "rgba(255, 255, 255, 0.70)",
  textMuted: "rgba(255, 255, 255, 0.40)",

  // Chart green = #7ed321 — the active "SENZOUKRIA" theme primary
  // ("Senku green - kingdom of science") from the website's
  // useUIThemeStore. Bullish / ask / buy = green. Bearish / bid /
  // sell = white.
  buy: "#7ed321",
  buyDim: "rgba(126, 211, 33, 0.18)",
  sell: "#ffffff",
  sellDim: "rgba(255, 255, 255, 0.18)",

  // Heat ramps: dim → bright.
  buyHeat: [
    "rgba(126, 211, 33, 0.10)",
    "rgba(126, 211, 33, 0.45)",
    "rgba(126, 211, 33, 0.90)",
  ],
  sellHeat: [
    "rgba(255, 255, 255, 0.10)",
    "rgba(255, 255, 255, 0.45)",
    "rgba(255, 255, 255, 0.90)",
  ],

  profileBuy: "rgba(126, 211, 33, 0.55)",
  profileSell: "rgba(255, 255, 255, 0.55)",
  // POC marker is violet per user spec (volume profile section); the
  // theme exposes a single `poc` field used by both the heatmap and
  // footprint surfaces, so we set it consistently to violet here.
  profileDelta: "#7ed321",
  poc: "#a855f7",
  vah: "rgba(255, 255, 255, 0.55)",
  val: "rgba(126, 211, 33, 0.55)",

  grid: "rgba(255, 255, 255, 0.04)",
  axis: "rgba(255, 255, 255, 0.10)",

  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  priceFontSize: 10,
  // Per-level volume number font. Bumped from 10 → 11 so the
  // "138 x 115" numbers stay legible in the default row height
  // without forcing the user to wheel-zoom in. The renderer caps
  // visible text at rowH >= 9 anyway, so 11px stays inside the
  // safe envelope.
  cellFontSize: 11,
  headerFontSize: 11,
};
