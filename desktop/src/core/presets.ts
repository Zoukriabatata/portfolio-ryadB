import type { BucketDurationMs } from "./types";

export const BUCKET_DURATION_PRESETS: ReadonlyArray<BucketDurationMs> =
  [50, 100, 250, 500, 1000] as const;

export const DEFAULT_BUCKET_DURATION_MS: BucketDurationMs = 100;

// Fenêtre live affichée
export const DEFAULT_HISTORY_DURATION_MS = 5 * 60_000; // 5 min

// Cap mémoire raw (au-delà → downsample en REFONTE-5)
export const MAX_RAW_HISTORY_DURATION_MS = 30 * 60_000; // 30 min

// Bybit BTCUSDT linear perpetual (priceFilter.tickSize officiel)
export const DEFAULT_TICK_SIZE = 0.10;

// Viewport prix initial : current_price ± VIEWPORT_HALF_TICKS * tickSize
export const DEFAULT_VIEWPORT_HALF_TICKS = 200;

// Largeur Value Area (POC/VAH/VAL) — convention institutionnelle 70 %.
// Configurable runtime quand le settings panel arrive (REFONTE-5/6).
export const DEFAULT_VALUE_AREA_WIDTH = 0.70;

// Largeur du panel VolumeProfile (REFONTE-4c). 80 px fixe = standard
// ATAS/Bookmap, densité constante quel que soit l'écran (1080p / 4K).
// Configurable runtime quand le settings panel arrive (REFONTE-5/6).
export const VOLUME_PROFILE_WIDTH_PX = 80;

// Largeur du DOM panel à gauche (REFONTE-5). 140 px = lisible asks/bids
// avec color bar + price tabular + qty tabular. Asymétrie volontaire avec
// VOLUME_PROFILE_WIDTH_PX (80) — DOM = 3 colonnes (bar+price+qty), profile
// = 1 barre. Configurable runtime via settings REFONTE-6.
export const DOM_PANEL_WIDTH_PX = 140;

// Profondeur affichée du DOM (top N levels par côté).
export const DOM_PANEL_DEPTH = 20;
