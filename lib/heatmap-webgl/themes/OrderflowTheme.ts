/**
 * ORDERFLOW THEME SYSTEM
 *
 * Professional color schemes and visual settings for orderflow analysis.
 */

// ═══════════════════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function interpolateColor(
  color1: [number, number, number],
  color2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    color1[0] + (color2[0] - color1[0]) * t,
    color1[1] + (color2[1] - color1[1]) * t,
    color1[2] + (color2[2] - color1[2]) * t,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GradientStop {
  position: number;  // 0-1
  color: string;     // hex color
}

export interface HeatmapGradient {
  stops: GradientStop[];
  name: string;
}

export interface OrderflowColors {
  // Background
  background: string;
  backgroundSecondary: string;

  // Bid/Ask heatmap
  bidGradient: HeatmapGradient;
  askGradient: HeatmapGradient;

  // Best bid/ask line
  bestBidLine: string;
  bestAskLine: string;
  spreadFill: string;

  // Trade bubbles
  buyTrade: string;
  sellTrade: string;
  mixedTrade: string;

  // Key levels
  poc: string;           // Point of Control
  vah: string;           // Value Area High
  val: string;           // Value Area Low
  vwap: string;
  sessionHigh: string;
  sessionLow: string;
  roundNumber: string;

  // Grid
  majorGrid: string;
  minorGrid: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textHighlight: string;

  // Alerts
  alertPositive: string;
  alertNegative: string;
  alertWarning: string;
}

export interface OrderflowTheme {
  name: string;
  colors: OrderflowColors;
  // Visual settings
  bidOpacity: number;
  askOpacity: number;
  gridOpacity: number;
  // Font
  fontFamily: string;
  fontSize: {
    price: number;
    label: number;
    stat: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFESSIONAL THEME
// ═══════════════════════════════════════════════════════════════════════════

export const ATAS_GRADIENT_BID: HeatmapGradient = {
  name: 'Professional Bid',
  stops: [
    { position: 0.0, color: '#0a0c10' },    // Background (0% intensity)
    { position: 0.03, color: '#0c1a14' },   // Barely visible tint at 3%
    { position: 0.08, color: '#0d2a1a' },   // Subtle green at 8%
    { position: 0.2, color: '#0d3320' },    // Dark teal
    { position: 0.35, color: '#115e38' },   // Medium dark teal
    { position: 0.5, color: '#16a34a' },    // Medium green
    { position: 0.7, color: '#22c55e' },    // Bright green
    { position: 0.85, color: '#4ade80' },   // Light green
    { position: 1.0, color: '#86efac' },    // Very light green (max intensity)
  ],
};

export const ATAS_GRADIENT_ASK: HeatmapGradient = {
  name: 'Professional Ask',
  stops: [
    { position: 0.0, color: '#0a0c10' },    // Background (0% intensity)
    { position: 0.03, color: '#140c0c' },   // Barely visible tint at 3%
    { position: 0.08, color: '#1f0e0e' },   // Subtle red at 8%
    { position: 0.2, color: '#450a0a' },    // Dark red
    { position: 0.35, color: '#7f1d1d' },   // Medium dark red
    { position: 0.5, color: '#dc2626' },    // Medium red
    { position: 0.7, color: '#ef4444' },    // Bright red
    { position: 0.85, color: '#f87171' },   // Light red
    { position: 1.0, color: '#fca5a5' },    // Very light red (max intensity)
  ],
};

export const THEME_ATAS: OrderflowTheme = {
  name: 'Professional',
  colors: {
    // Background - very dark with slight blue tint
    background: '#0a0c10',
    backgroundSecondary: '#0f1218',

    // Bid/Ask gradients
    bidGradient: ATAS_GRADIENT_BID,
    askGradient: ATAS_GRADIENT_ASK,

    // Best bid/ask lines - vibrant
    bestBidLine: '#10b981',    // Emerald
    bestAskLine: '#f43f5e',    // Rose
    spreadFill: '#1e293b',     // Slate (subtle)

    // Trade bubbles
    buyTrade: '#22c55e',
    sellTrade: '#ef4444',
    mixedTrade: '#f59e0b',

    // Key levels
    poc: '#f59e0b',            // Amber - Point of Control
    vah: '#8b5cf6',            // Purple - Value Area High
    val: '#8b5cf6',            // Purple - Value Area Low
    vwap: '#06b6d4',           // Cyan - VWAP
    sessionHigh: '#22d3ee',    // Light cyan
    sessionLow: '#fb7185',     // Light rose
    roundNumber: '#fbbf24',    // Yellow

    // Grid
    majorGrid: '#334155',      // Slate-700
    minorGrid: '#1e293b',      // Slate-800

    // Text
    textPrimary: '#f8fafc',    // Almost white
    textSecondary: '#94a3b8',  // Slate-400
    textMuted: '#64748b',      // Slate-500
    textHighlight: '#fbbf24',  // Yellow highlight

    // Alerts
    alertPositive: '#22c55e',
    alertNegative: '#ef4444',
    alertWarning: '#f59e0b',
  },
  bidOpacity: 0.85,
  askOpacity: 0.85,
  gridOpacity: 0.6,
  fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
  fontSize: {
    price: 11,
    label: 10,
    stat: 9,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OCEANIC THEME
// ═══════════════════════════════════════════════════════════════════════════

export const BOOKMAP_GRADIENT_BID: HeatmapGradient = {
  name: 'Oceanic Bid',
  stops: [
    { position: 0.0, color: '#000814' },
    { position: 0.05, color: '#001233' },  // Visible blue tint early
    { position: 0.15, color: '#002855' },
    { position: 0.3, color: '#003566' },
    { position: 0.5, color: '#0077b6' },
    { position: 0.7, color: '#00b4d8' },
    { position: 0.85, color: '#48cae4' },
    { position: 1.0, color: '#90e0ef' },
  ],
};

export const BOOKMAP_GRADIENT_ASK: HeatmapGradient = {
  name: 'Oceanic Ask',
  stops: [
    { position: 0.0, color: '#000814' },
    { position: 0.05, color: '#1a0a14' },  // Visible pink tint early
    { position: 0.15, color: '#3d1525' },
    { position: 0.3, color: '#6b2737' },
    { position: 0.5, color: '#a4133c' },
    { position: 0.7, color: '#c9184a' },
    { position: 0.85, color: '#ff4d6d' },
    { position: 1.0, color: '#ff758f' },
  ],
};

export const THEME_BOOKMAP: OrderflowTheme = {
  name: 'Oceanic',
  colors: {
    background: '#000814',
    backgroundSecondary: '#001d3d',

    bidGradient: BOOKMAP_GRADIENT_BID,
    askGradient: BOOKMAP_GRADIENT_ASK,

    bestBidLine: '#00b4d8',
    bestAskLine: '#ff4d6d',
    spreadFill: '#001d3d',

    buyTrade: '#48cae4',
    sellTrade: '#ff758f',
    mixedTrade: '#ffd60a',

    poc: '#ffd60a',
    vah: '#9d4edd',
    val: '#9d4edd',
    vwap: '#00f5d4',
    sessionHigh: '#80ffdb',
    sessionLow: '#ff85a1',
    roundNumber: '#ffc300',

    majorGrid: '#003566',
    minorGrid: '#001d3d',

    textPrimary: '#caf0f8',
    textSecondary: '#90e0ef',
    textMuted: '#48cae4',
    textHighlight: '#ffd60a',

    alertPositive: '#00f5d4',
    alertNegative: '#ff4d6d',
    alertWarning: '#ffd60a',
  },
  bidOpacity: 0.9,
  askOpacity: 0.9,
  gridOpacity: 0.5,
  fontFamily: 'Consolas, Monaco, monospace',
  fontSize: {
    price: 11,
    label: 10,
    stat: 9,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIC THEME
// ═══════════════════════════════════════════════════════════════════════════

export const SIERRA_GRADIENT_BID: HeatmapGradient = {
  name: 'Classic Bid',
  stops: [
    { position: 0.0, color: '#1a1a2e' },
    { position: 0.25, color: '#1f4037' },
    { position: 0.5, color: '#2d6a4f' },
    { position: 0.75, color: '#40916c' },
    { position: 1.0, color: '#52b788' },
  ],
};

export const SIERRA_GRADIENT_ASK: HeatmapGradient = {
  name: 'Classic Ask',
  stops: [
    { position: 0.0, color: '#1a1a2e' },
    { position: 0.25, color: '#5c1a1b' },
    { position: 0.5, color: '#9b2226' },
    { position: 0.75, color: '#bb3e03' },
    { position: 1.0, color: '#e85d04' },
  ],
};

export const THEME_SIERRA: OrderflowTheme = {
  name: 'Classic',
  colors: {
    background: '#1a1a2e',
    backgroundSecondary: '#16213e',

    bidGradient: SIERRA_GRADIENT_BID,
    askGradient: SIERRA_GRADIENT_ASK,

    bestBidLine: '#52b788',
    bestAskLine: '#e85d04',
    spreadFill: '#16213e',

    buyTrade: '#40916c',
    sellTrade: '#bb3e03',
    mixedTrade: '#f4a261',

    poc: '#e9c46a',
    vah: '#7b2cbf',
    val: '#7b2cbf',
    vwap: '#2a9d8f',
    sessionHigh: '#a8dadc',
    sessionLow: '#e63946',
    roundNumber: '#f4a261',

    majorGrid: '#2d3a4f',
    minorGrid: '#1f2937',

    textPrimary: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    textHighlight: '#e9c46a',

    alertPositive: '#2a9d8f',
    alertNegative: '#e63946',
    alertWarning: '#f4a261',
  },
  bidOpacity: 0.85,
  askOpacity: 0.85,
  gridOpacity: 0.55,
  fontFamily: 'Consolas, monospace',
  fontSize: {
    price: 11,
    label: 10,
    stat: 9,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HIGH CONTRAST THEME (for accessibility)
// ═══════════════════════════════════════════════════════════════════════════

export const HIGHCONTRAST_GRADIENT_BID: HeatmapGradient = {
  name: 'High Contrast Bid',
  stops: [
    { position: 0.0, color: '#000000' },
    { position: 0.3, color: '#006400' },
    { position: 0.6, color: '#00ff00' },
    { position: 1.0, color: '#7fff00' },
  ],
};

export const HIGHCONTRAST_GRADIENT_ASK: HeatmapGradient = {
  name: 'High Contrast Ask',
  stops: [
    { position: 0.0, color: '#000000' },
    { position: 0.3, color: '#8b0000' },
    { position: 0.6, color: '#ff0000' },
    { position: 1.0, color: '#ff6347' },
  ],
};

export const THEME_HIGHCONTRAST: OrderflowTheme = {
  name: 'High Contrast',
  colors: {
    background: '#000000',
    backgroundSecondary: '#0a0a0a',

    bidGradient: HIGHCONTRAST_GRADIENT_BID,
    askGradient: HIGHCONTRAST_GRADIENT_ASK,

    bestBidLine: '#00ff00',
    bestAskLine: '#ff0000',
    spreadFill: '#1a1a1a',

    buyTrade: '#00ff00',
    sellTrade: '#ff0000',
    mixedTrade: '#ffff00',

    poc: '#ffff00',
    vah: '#ff00ff',
    val: '#ff00ff',
    vwap: '#00ffff',
    sessionHigh: '#00ffff',
    sessionLow: '#ff69b4',
    roundNumber: '#ffa500',

    majorGrid: '#444444',
    minorGrid: '#222222',

    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    textMuted: '#888888',
    textHighlight: '#ffff00',

    alertPositive: '#00ff00',
    alertNegative: '#ff0000',
    alertWarning: '#ffff00',
  },
  bidOpacity: 1.0,
  askOpacity: 1.0,
  gridOpacity: 0.8,
  fontFamily: 'Consolas, monospace',
  fontSize: {
    price: 12,
    label: 11,
    stat: 10,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SENZOUKRIA THEME (Senku Green - Kingdom of Science)
// ═══════════════════════════════════════════════════════════════════════════

export const SENZOUKRIA_GRADIENT_BID: HeatmapGradient = {
  name: 'Senzoukria Bid',
  stops: [
    { position: 0.0, color: '#060a08' },    // Dark forest (0%)
    { position: 0.03, color: '#081208' },   // Barely visible at 3%
    { position: 0.08, color: '#0a1e0a' },   // Subtle lime at 8%
    { position: 0.2, color: '#0d2a10' },    // Very dark green
    { position: 0.35, color: '#1a5a18' },   // Dark green
    { position: 0.5, color: '#4a9a1a' },    // Medium lime
    { position: 0.7, color: '#7ed321' },    // Senku lime
    { position: 0.85, color: '#a3e635' },   // Bright lime
    { position: 1.0, color: '#d4fc79' },    // Very light lime
  ],
};

export const SENZOUKRIA_GRADIENT_ASK: HeatmapGradient = {
  name: 'Senzoukria Ask',
  stops: [
    { position: 0.0, color: '#060a08' },    // Dark forest (0%)
    { position: 0.03, color: '#100808' },   // Barely visible at 3%
    { position: 0.08, color: '#1e0a0a' },   // Subtle red at 8%
    { position: 0.2, color: '#3a0a0a' },    // Very dark red
    { position: 0.35, color: '#6e1818' },   // Dark red
    { position: 0.5, color: '#c03030' },    // Medium red
    { position: 0.7, color: '#e04040' },    // Warm red
    { position: 0.85, color: '#f06060' },   // Light red
    { position: 1.0, color: '#ff9090' },    // Very light red
  ],
};

export const THEME_SENZOUKRIA: OrderflowTheme = {
  name: 'Senzoukria',
  colors: {
    background: '#060a08',
    backgroundSecondary: '#0c1410',

    bidGradient: SENZOUKRIA_GRADIENT_BID,
    askGradient: SENZOUKRIA_GRADIENT_ASK,

    bestBidLine: '#7ed321',
    bestAskLine: '#e04040',
    spreadFill: '#142018',

    buyTrade: '#7ed321',
    sellTrade: '#e04040',
    mixedTrade: '#e2b93b',

    poc: '#e2b93b',            // Gold
    vah: '#22d3ee',            // Cyan
    val: '#22d3ee',            // Cyan
    vwap: '#22d3ee',           // Cyan
    sessionHigh: '#a3e635',    // Bright lime
    sessionLow: '#f06060',     // Light red
    roundNumber: '#e2b93b',    // Gold

    majorGrid: '#243830',
    minorGrid: '#1a2a1e',

    textPrimary: '#e8f5e8',
    textSecondary: '#8aab8a',
    textMuted: '#5a7a5a',
    textHighlight: '#a3e635',

    alertPositive: '#7ed321',
    alertNegative: '#e04040',
    alertWarning: '#e2b93b',
  },
  bidOpacity: 0.85,
  askOpacity: 0.85,
  gridOpacity: 0.6,
  fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
  fontSize: {
    price: 11,
    label: 10,
    stat: 9,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// THEME REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export type ThemeName = 'senzoukria' | 'atas' | 'bookmap' | 'sierra' | 'highcontrast';

export const THEMES: Record<ThemeName, OrderflowTheme> = {
  senzoukria: THEME_SENZOUKRIA,
  atas: THEME_ATAS,
  bookmap: THEME_BOOKMAP,
  sierra: THEME_SIERRA,
  highcontrast: THEME_HIGHCONTRAST,
};

export function getTheme(name: ThemeName): OrderflowTheme {
  return THEMES[name] || THEME_SENZOUKRIA;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRADIENT TEXTURE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate gradient data for WebGL texture (256 RGBA values)
 */
export function generateGradientData(gradient: HeatmapGradient): Uint8Array {
  const data = new Uint8Array(256 * 4);
  const stops = gradient.stops.sort((a, b) => a.position - b.position);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;

    // Find the two stops we're between
    let startStop = stops[0];
    let endStop = stops[stops.length - 1];

    for (let j = 0; j < stops.length - 1; j++) {
      if (t >= stops[j].position && t <= stops[j + 1].position) {
        startStop = stops[j];
        endStop = stops[j + 1];
        break;
      }
    }

    // Interpolate
    const range = endStop.position - startStop.position;
    const localT = range > 0 ? (t - startStop.position) / range : 0;

    const startRgb = hexToRgb(startStop.color);
    const endRgb = hexToRgb(endStop.color);
    const rgb = interpolateColor(startRgb, endRgb, localT);

    data[i * 4 + 0] = Math.round(rgb[0] * 255);
    data[i * 4 + 1] = Math.round(rgb[1] * 255);
    data[i * 4 + 2] = Math.round(rgb[2] * 255);
    data[i * 4 + 3] = 255; // Full alpha
  }

  return data;
}

const OrderflowTheme = {
  THEMES,
  getTheme,
  generateGradientData,
  THEME_SENZOUKRIA,
  THEME_ATAS,
  THEME_BOOKMAP,
  THEME_SIERRA,
  THEME_HIGHCONTRAST,
};

export default OrderflowTheme;
