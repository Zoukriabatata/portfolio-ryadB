/**
 * SYSTÈME DE THÈMES - Trading Chart
 *
 * Système complet de personnalisation visuelle :
 * - Thèmes prédéfinis (Dark, Light, TradingView, Midnight)
 * - Personnalisation complète des couleurs
 * - Persistance localStorage
 */

// ========== TYPES ==========

export interface ChartColors {
  // Background
  background: string;
  surface: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Borders & Grid
  border: string;
  gridLines: string;

  // Candles
  candleUp: string;
  candleDown: string;
  wickUp: string;
  wickDown: string;

  // Volume
  volumeUp: string;
  volumeDown: string;

  // Crosshair
  crosshair: string;
  crosshairLabel: string;

  // Tools
  toolDefault: string;
  toolActive: string;
  toolHover: string;

  // Status
  success: string;
  warning: string;
  error: string;
}

export interface ChartTypography {
  fontFamily: string;
  fontSizeXs: number;
  fontSizeSm: number;
  fontSizeBase: number;
  fontSizeLg: number;
  fontSizeXl: number;
}

export interface ChartSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ChartTheme {
  id: string;
  name: string;
  colors: ChartColors;
  typography: ChartTypography;
  spacing: ChartSpacing;
  candle: {
    bodyWidth: number;      // 0.6 - 0.9
    wickWidth: number;      // 1 - 3px
    borderRadius: number;   // 0 - 2px
  };
  grid: {
    visible: boolean;
    style: 'solid' | 'dashed' | 'dotted';
    opacity: number;        // 0.1 - 0.5
  };
}

// ========== THÈMES PRÉDÉFINIS ==========

const DEFAULT_TYPOGRAPHY: ChartTypography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSizeXs: 10,
  fontSizeSm: 12,
  fontSizeBase: 14,
  fontSizeLg: 16,
  fontSizeXl: 20,
};

const DEFAULT_SPACING: ChartSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const THEME_DARK: ChartTheme = {
  id: 'dark',
  name: 'Dark',
  colors: {
    background: '#0a0a0a',
    surface: '#141414',
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textMuted: '#666666',
    border: '#2a2a2a',
    gridLines: '#1a1a1a',
    candleUp: '#22c55e',
    candleDown: '#ef4444',
    wickUp: '#22c55e',
    wickDown: '#ef4444',
    volumeUp: 'rgba(34, 197, 94, 0.4)',
    volumeDown: 'rgba(239, 68, 68, 0.4)',
    crosshair: '#6b7280',
    crosshairLabel: '#374151',
    toolDefault: '#6b7280',
    toolActive: '#3b82f6',
    toolHover: '#60a5fa',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.3 },
};

export const THEME_LIGHT: ChartTheme = {
  id: 'light',
  name: 'Light',
  colors: {
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#1a1a1a',
    textSecondary: '#666666',
    textMuted: '#999999',
    border: '#e0e0e0',
    gridLines: '#f0f0f0',
    candleUp: '#16a34a',
    candleDown: '#dc2626',
    wickUp: '#16a34a',
    wickDown: '#dc2626',
    volumeUp: 'rgba(22, 163, 74, 0.3)',
    volumeDown: 'rgba(220, 38, 38, 0.3)',
    crosshair: '#9ca3af',
    crosshairLabel: '#e5e7eb',
    toolDefault: '#9ca3af',
    toolActive: '#2563eb',
    toolHover: '#3b82f6',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.5 },
};

export const THEME_TRADINGVIEW: ChartTheme = {
  id: 'tradingview',
  name: 'Orderflow Pro',
  colors: {
    background: '#131722',
    surface: '#1e222d',
    text: '#d1d4dc',
    textSecondary: '#787b86',
    textMuted: '#4c525e',
    border: '#2a2e39',
    gridLines: '#1e222d',
    candleUp: '#26a69a',
    candleDown: '#ef5350',
    wickUp: '#26a69a',
    wickDown: '#ef5350',
    volumeUp: 'rgba(38, 166, 154, 0.5)',
    volumeDown: 'rgba(239, 83, 80, 0.5)',
    crosshair: '#758696',
    crosshairLabel: '#131722',
    toolDefault: '#787b86',
    toolActive: '#2962ff',
    toolHover: '#5b9cf6',
    success: '#26a69a',
    warning: '#ff9800',
    error: '#ef5350',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.85, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

export const THEME_MIDNIGHT: ChartTheme = {
  id: 'midnight',
  name: 'Shadow',
  colors: {
    background: '#0d0d1a',
    surface: '#12121f',
    text: '#e0e0ff',
    textSecondary: '#8080b0',
    textMuted: '#505080',
    border: '#252540',
    gridLines: '#151528',
    candleUp: '#00d4aa',
    candleDown: '#ff4466',
    wickUp: '#00d4aa',
    wickDown: '#ff4466',
    volumeUp: 'rgba(0, 212, 170, 0.4)',
    volumeDown: 'rgba(255, 68, 102, 0.4)',
    crosshair: '#6060a0',
    crosshairLabel: '#1a1a2e',
    toolDefault: '#6060a0',
    toolActive: '#7c3aed',
    toolHover: '#a78bfa',
    success: '#00d4aa',
    warning: '#fbbf24',
    error: '#ff4466',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 1 },
  grid: { visible: true, style: 'solid', opacity: 0.25 },
};

export const THEME_FOREST: ChartTheme = {
  id: 'forest',
  name: 'Matrix',
  colors: {
    background: '#0d1117',
    surface: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    textMuted: '#484f58',
    border: '#30363d',
    gridLines: '#21262d',
    candleUp: '#3fb950',
    candleDown: '#f85149',
    wickUp: '#3fb950',
    wickDown: '#f85149',
    volumeUp: 'rgba(63, 185, 80, 0.4)',
    volumeDown: 'rgba(248, 81, 73, 0.4)',
    crosshair: '#6e7681',
    crosshairLabel: '#161b22',
    toolDefault: '#6e7681',
    toolActive: '#58a6ff',
    toolHover: '#79c0ff',
    success: '#3fb950',
    warning: '#d29922',
    error: '#f85149',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.3 },
};

// SENZOUKRIA Theme - Senku Green / Kingdom of Science
export const THEME_SENZOUKRIA: ChartTheme = {
  id: 'senzoukria',
  name: 'Senzoukria',
  colors: {
    background: '#060a08',
    surface: '#0c1410',
    text: '#e8f5e8',
    textSecondary: '#8aab8a',
    textMuted: '#5a7a5a',
    border: '#1a2a1e',
    gridLines: '#0f1e12',
    candleUp: '#7ed321',
    candleDown: '#e04040',
    wickUp: '#5fa31a',
    wickDown: '#b91c1c',
    volumeUp: 'rgba(126, 211, 33, 0.5)',
    volumeDown: 'rgba(224, 64, 64, 0.4)',
    crosshair: '#7ed321',
    crosshairLabel: '#0c1410',
    toolDefault: '#5a7a5a',
    toolActive: '#7ed321',
    toolHover: '#a3e635',
    success: '#7ed321',
    warning: '#e2b93b',
    error: '#e04040',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.85, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

// Bloomberg Terminal - Classic institutional
export const THEME_BLOOMBERG: ChartTheme = {
  id: 'bloomberg',
  name: 'Bloomberg',
  colors: {
    background: '#000000',
    surface: '#1a1a1a',
    text: '#ff8c00',
    textSecondary: '#b8860b',
    textMuted: '#6b4c00',
    border: '#333333',
    gridLines: '#1a1a1a',
    candleUp: '#00ff00',
    candleDown: '#ff3333',
    wickUp: '#00cc00',
    wickDown: '#cc2929',
    volumeUp: 'rgba(0, 255, 0, 0.35)',
    volumeDown: 'rgba(255, 51, 51, 0.35)',
    crosshair: '#ff8c00',
    crosshairLabel: '#1a1a00',
    toolDefault: '#b8860b',
    toolActive: '#ff8c00',
    toolHover: '#ffa500',
    success: '#00ff00',
    warning: '#ff8c00',
    error: '#ff3333',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.75, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.15 },
};

// Arctic - Cool blue professional
export const THEME_ARCTIC: ChartTheme = {
  id: 'arctic',
  name: 'Arctic',
  colors: {
    background: '#0b1120',
    surface: '#111827',
    text: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#475569',
    border: '#1e293b',
    gridLines: '#131d30',
    candleUp: '#38bdf8',
    candleDown: '#f472b6',
    wickUp: '#0ea5e9',
    wickDown: '#ec4899',
    volumeUp: 'rgba(56, 189, 248, 0.4)',
    volumeDown: 'rgba(244, 114, 182, 0.4)',
    crosshair: '#64748b',
    crosshairLabel: '#0f172a',
    toolDefault: '#64748b',
    toolActive: '#38bdf8',
    toolHover: '#7dd3fc',
    success: '#38bdf8',
    warning: '#fbbf24',
    error: '#f472b6',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

// Volcano - Warm aggressive
export const THEME_VOLCANO: ChartTheme = {
  id: 'volcano',
  name: 'Volcano',
  colors: {
    background: '#120808',
    surface: '#1c0e0e',
    text: '#fde8e8',
    textSecondary: '#b08080',
    textMuted: '#704040',
    border: '#2d1515',
    gridLines: '#1a0c0c',
    candleUp: '#fb923c',
    candleDown: '#dc2626',
    wickUp: '#f97316',
    wickDown: '#b91c1c',
    volumeUp: 'rgba(251, 146, 60, 0.45)',
    volumeDown: 'rgba(220, 38, 38, 0.4)',
    crosshair: '#a06050',
    crosshairLabel: '#1c0a0a',
    toolDefault: '#a06050',
    toolActive: '#fb923c',
    toolHover: '#fdba74',
    success: '#fb923c',
    warning: '#fbbf24',
    error: '#dc2626',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.85, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

// Cyberpunk - Neon pink/cyan
export const THEME_CYBERPUNK: ChartTheme = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  colors: {
    background: '#0a0012',
    surface: '#120020',
    text: '#f0e6ff',
    textSecondary: '#a78bfa',
    textMuted: '#6d4aaa',
    border: '#2d1060',
    gridLines: '#150025',
    candleUp: '#00ffcc',
    candleDown: '#ff0066',
    wickUp: '#00ddaa',
    wickDown: '#dd0055',
    volumeUp: 'rgba(0, 255, 204, 0.4)',
    volumeDown: 'rgba(255, 0, 102, 0.4)',
    crosshair: '#a855f7',
    crosshairLabel: '#1a0030',
    toolDefault: '#7c3aed',
    toolActive: '#e879f9',
    toolHover: '#f0abfc',
    success: '#00ffcc',
    warning: '#fde047',
    error: '#ff0066',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 1 },
  grid: { visible: true, style: 'solid', opacity: 0.15 },
};

// Monochrome - Clean minimal
export const THEME_MONOCHROME: ChartTheme = {
  id: 'monochrome',
  name: 'Monochrome',
  colors: {
    background: '#101010',
    surface: '#1a1a1a',
    text: '#e5e5e5',
    textSecondary: '#a3a3a3',
    textMuted: '#525252',
    border: '#303030',
    gridLines: '#1f1f1f',
    candleUp: '#e5e5e5',
    candleDown: '#525252',
    wickUp: '#d4d4d4',
    wickDown: '#404040',
    volumeUp: 'rgba(229, 229, 229, 0.3)',
    volumeDown: 'rgba(82, 82, 82, 0.3)',
    crosshair: '#737373',
    crosshairLabel: '#171717',
    toolDefault: '#737373',
    toolActive: '#e5e5e5',
    toolHover: '#f5f5f5',
    success: '#d4d4d4',
    warning: '#a3a3a3',
    error: '#737373',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.25 },
};

// Ocean - Deep blue/teal
export const THEME_OCEAN: ChartTheme = {
  id: 'ocean',
  name: 'Ocean',
  colors: {
    background: '#041418',
    surface: '#0a1e24',
    text: '#cceeff',
    textSecondary: '#6db3cc',
    textMuted: '#3d7a8f',
    border: '#143038',
    gridLines: '#0c2028',
    candleUp: '#2dd4bf',
    candleDown: '#f87171',
    wickUp: '#14b8a6',
    wickDown: '#ef4444',
    volumeUp: 'rgba(45, 212, 191, 0.4)',
    volumeDown: 'rgba(248, 113, 113, 0.4)',
    crosshair: '#5eaabb',
    crosshairLabel: '#082028',
    toolDefault: '#5eaabb',
    toolActive: '#22d3ee',
    toolHover: '#67e8f9',
    success: '#2dd4bf',
    warning: '#fbbf24',
    error: '#f87171',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.8, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

// Amber - Warm gold professional
export const THEME_AMBER: ChartTheme = {
  id: 'amber',
  name: 'Amber',
  colors: {
    background: '#0f0d08',
    surface: '#18150e',
    text: '#fef3c7',
    textSecondary: '#b8a060',
    textMuted: '#6b5c30',
    border: '#2a2410',
    gridLines: '#1a1608',
    candleUp: '#fbbf24',
    candleDown: '#a855f7',
    wickUp: '#f59e0b',
    wickDown: '#9333ea',
    volumeUp: 'rgba(251, 191, 36, 0.4)',
    volumeDown: 'rgba(168, 85, 247, 0.4)',
    crosshair: '#a08040',
    crosshairLabel: '#151008',
    toolDefault: '#a08040',
    toolActive: '#fbbf24',
    toolHover: '#fcd34d',
    success: '#fbbf24',
    warning: '#f97316',
    error: '#a855f7',
  },
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  candle: { bodyWidth: 0.85, wickWidth: 1, borderRadius: 0 },
  grid: { visible: true, style: 'solid', opacity: 0.2 },
};

// Liste des thèmes
export const THEMES: ChartTheme[] = [
  THEME_SENZOUKRIA,
  THEME_DARK,
  THEME_LIGHT,
  THEME_TRADINGVIEW,
  THEME_MIDNIGHT,
  THEME_FOREST,
  THEME_BLOOMBERG,
  THEME_ARCTIC,
  THEME_VOLCANO,
  THEME_CYBERPUNK,
  THEME_MONOCHROME,
  THEME_OCEAN,
  THEME_AMBER,
];

export const THEME_MAP: Record<string, ChartTheme> = Object.fromEntries(
  THEMES.map(t => [t.id, t])
);

// ========== STORAGE ==========

const THEME_STORAGE_KEY = 'chart-theme';
const CUSTOM_COLORS_KEY = 'chart-custom-colors';

export function loadThemeId(): string {
  if (typeof window === 'undefined') return 'senzoukria';
  return localStorage.getItem(THEME_STORAGE_KEY) || 'senzoukria';
}

export function saveThemeId(themeId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
}

export function loadCustomColors(): Partial<ChartColors> {
  if (typeof window === 'undefined') return {};
  try {
    const json = localStorage.getItem(CUSTOM_COLORS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

export function saveCustomColors(colors: Partial<ChartColors>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors));
}

export function clearCustomColors(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOM_COLORS_KEY);
}

// ========== HELPERS ==========

/**
 * Fusionne un thème avec des couleurs personnalisées
 */
export function mergeTheme(theme: ChartTheme, customColors: Partial<ChartColors>): ChartTheme {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      ...customColors,
    },
  };
}

/**
 * Génère les options Lightweight Charts depuis un thème
 */
export function getChartOptions(theme: ChartTheme) {
  return {
    layout: {
      background: { color: theme.colors.background },
      textColor: theme.colors.text,
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.fontSizeSm,
    },
    grid: {
      vertLines: {
        color: theme.colors.gridLines,
        visible: theme.grid.visible,
      },
      horzLines: {
        color: theme.colors.gridLines,
        visible: theme.grid.visible,
      },
    },
    crosshair: {
      mode: 1,
      vertLine: {
        color: theme.colors.crosshair,
        width: 1 as const,
        style: 2,
        labelBackgroundColor: theme.colors.crosshairLabel,
      },
      horzLine: {
        color: theme.colors.crosshair,
        width: 1 as const,
        style: 2,
        labelBackgroundColor: theme.colors.crosshairLabel,
      },
    },
    rightPriceScale: {
      borderColor: theme.colors.border,
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: theme.colors.border,
      timeVisible: true,
      secondsVisible: true,
    },
  };
}

/**
 * Génère les options de série candlestick
 */
export function getCandleSeriesOptions(theme: ChartTheme) {
  return {
    upColor: theme.colors.candleUp,
    downColor: theme.colors.candleDown,
    borderDownColor: theme.colors.candleDown,
    borderUpColor: theme.colors.candleUp,
    wickDownColor: theme.colors.wickDown,
    wickUpColor: theme.colors.wickUp,
  };
}

/**
 * Génère les options de série volume
 */
export function getVolumeSeriesOptions(theme: ChartTheme) {
  return {
    color: theme.colors.candleUp,
    priceFormat: { type: 'volume' as const },
    priceScaleId: 'volume',
  };
}
