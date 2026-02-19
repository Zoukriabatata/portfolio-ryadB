import type { NewsThemeConfig, NewsThemeId } from '@/types/news';

// ---------------------------------------------------------------------------
// News themes — derived from OrderflowTheme color schemes
// ---------------------------------------------------------------------------

export const NEWS_THEMES: Record<NewsThemeId, NewsThemeConfig> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SENZOUKRIA — Lime green / forest dark (default)
  // Matches THEME_SENZOUKRIA from OrderflowTheme.ts
  // ═══════════════════════════════════════════════════════════════════════════
  senzoukria: {
    id: 'senzoukria',
    name: 'Senzoukria',
    label: 'Lime green / forest',
    preview: ['#060a08', '#7ed321', '#e8f5e8'],
    colors: {
      background: '#060a08',
      surface: '#0c1410',
      surfaceElevated: '#142018',
      surfaceHover: '#1a2a1e',
      border: '#1a2a1e',
      borderLight: '#243830',
      textPrimary: '#e8f5e8',
      textSecondary: '#8aab8a',
      textMuted: '#5a7a5a',
      textDimmed: '#3d5a3d',
      primary: '#7ed321',
      primaryGlow: 'rgba(126, 211, 33, 0.15)',
      accent: '#22d3ee',
      high: '#e04040',
      medium: '#e2b93b',
      low: '#a3e635',
      bull: '#7ed321',
      bullBg: 'rgba(126, 211, 33, 0.12)',
      bear: '#e04040',
      bearBg: 'rgba(224, 64, 64, 0.12)',
      warning: '#e2b93b',
      warningBg: 'rgba(226, 185, 59, 0.1)',
      glassBg: 'rgba(12, 20, 16, 0.7)',
      glassBorder: 'rgba(126, 211, 33, 0.08)',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ATAS / Professional — Emerald & rose on blue-black
  // Matches THEME_ATAS from OrderflowTheme.ts
  // ═══════════════════════════════════════════════════════════════════════════
  atas: {
    id: 'atas',
    name: 'Professional',
    label: 'Emerald / rose',
    preview: ['#0a0c10', '#10b981', '#f8fafc'],
    colors: {
      background: '#0a0c10',
      surface: '#0f1218',
      surfaceElevated: '#161a22',
      surfaceHover: '#1e293b',
      border: '#1e293b',
      borderLight: '#334155',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      textDimmed: '#475569',
      primary: '#10b981',
      primaryGlow: 'rgba(16, 185, 129, 0.15)',
      accent: '#06b6d4',
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#fbbf24',
      bull: '#22c55e',
      bullBg: 'rgba(34, 197, 94, 0.12)',
      bear: '#ef4444',
      bearBg: 'rgba(239, 68, 68, 0.12)',
      warning: '#f59e0b',
      warningBg: 'rgba(245, 158, 11, 0.1)',
      glassBg: 'rgba(15, 18, 24, 0.7)',
      glassBorder: 'rgba(255, 255, 255, 0.08)',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BOOKMAP / Oceanic — Blue & cyan / pink on deep navy
  // Matches THEME_BOOKMAP from OrderflowTheme.ts
  // ═══════════════════════════════════════════════════════════════════════════
  bookmap: {
    id: 'bookmap',
    name: 'Oceanic',
    label: 'Blue / cyan / pink',
    preview: ['#000814', '#00b4d8', '#caf0f8'],
    colors: {
      background: '#000814',
      surface: '#001233',
      surfaceElevated: '#001d3d',
      surfaceHover: '#002855',
      border: '#002855',
      borderLight: '#003566',
      textPrimary: '#caf0f8',
      textSecondary: '#90e0ef',
      textMuted: '#48cae4',
      textDimmed: '#0077b6',
      primary: '#00b4d8',
      primaryGlow: 'rgba(0, 180, 216, 0.15)',
      accent: '#00f5d4',
      high: '#ff4d6d',
      medium: '#ffd60a',
      low: '#ffc300',
      bull: '#48cae4',
      bullBg: 'rgba(72, 202, 228, 0.12)',
      bear: '#ff4d6d',
      bearBg: 'rgba(255, 77, 109, 0.12)',
      warning: '#ffd60a',
      warningBg: 'rgba(255, 214, 10, 0.1)',
      glassBg: 'rgba(0, 18, 51, 0.75)',
      glassBorder: 'rgba(0, 180, 216, 0.1)',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SIERRA / Classic — Teal & orange on dark indigo
  // Matches THEME_SIERRA from OrderflowTheme.ts
  // ═══════════════════════════════════════════════════════════════════════════
  sierra: {
    id: 'sierra',
    name: 'Classic',
    label: 'Teal / orange',
    preview: ['#1a1a2e', '#2a9d8f', '#e5e7eb'],
    colors: {
      background: '#1a1a2e',
      surface: '#16213e',
      surfaceElevated: '#1f2937',
      surfaceHover: '#2d3a4f',
      border: '#2d3a4f',
      borderLight: '#3d4f6f',
      textPrimary: '#e5e7eb',
      textSecondary: '#9ca3af',
      textMuted: '#6b7280',
      textDimmed: '#4b5563',
      primary: '#2a9d8f',
      primaryGlow: 'rgba(42, 157, 143, 0.15)',
      accent: '#e9c46a',
      high: '#e63946',
      medium: '#f4a261',
      low: '#e9c46a',
      bull: '#52b788',
      bullBg: 'rgba(82, 183, 136, 0.12)',
      bear: '#e85d04',
      bearBg: 'rgba(232, 93, 4, 0.12)',
      warning: '#f4a261',
      warningBg: 'rgba(244, 162, 97, 0.1)',
      glassBg: 'rgba(22, 33, 62, 0.7)',
      glassBorder: 'rgba(42, 157, 143, 0.1)',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGH CONTRAST — Accessibility, pure green/red on black
  // Matches THEME_HIGHCONTRAST from OrderflowTheme.ts
  // ═══════════════════════════════════════════════════════════════════════════
  highcontrast: {
    id: 'highcontrast',
    name: 'High Contrast',
    label: 'Accessibility',
    preview: ['#000000', '#00ff00', '#ffffff'],
    colors: {
      background: '#000000',
      surface: '#0a0a0a',
      surfaceElevated: '#1a1a1a',
      surfaceHover: '#2a2a2a',
      border: '#333333',
      borderLight: '#444444',
      textPrimary: '#ffffff',
      textSecondary: '#cccccc',
      textMuted: '#888888',
      textDimmed: '#666666',
      primary: '#00ff00',
      primaryGlow: 'rgba(0, 255, 0, 0.2)',
      accent: '#00ffff',
      high: '#ff0000',
      medium: '#ffff00',
      low: '#ffa500',
      bull: '#00ff00',
      bullBg: 'rgba(0, 255, 0, 0.12)',
      bear: '#ff0000',
      bearBg: 'rgba(255, 0, 0, 0.12)',
      warning: '#ffff00',
      warningBg: 'rgba(255, 255, 0, 0.1)',
      glassBg: 'rgba(10, 10, 10, 0.85)',
      glassBorder: 'rgba(255, 255, 255, 0.15)',
    },
  },
};

/**
 * Convert a theme config's colors to CSS variable style overrides.
 */
export function themeToCSS(theme: NewsThemeConfig): React.CSSProperties {
  const c = theme.colors;
  return {
    '--background': c.background,
    '--surface': c.surface,
    '--surface-elevated': c.surfaceElevated,
    '--surface-hover': c.surfaceHover,
    '--border': c.border,
    '--border-light': c.borderLight,
    '--text-primary': c.textPrimary,
    '--text-secondary': c.textSecondary,
    '--text-muted': c.textMuted,
    '--text-dimmed': c.textDimmed,
    '--primary': c.primary,
    '--primary-glow': c.primaryGlow,
    '--accent': c.accent,
    '--bull': c.bull,
    '--bull-bg': c.bullBg,
    '--bear': c.bear,
    '--bear-bg': c.bearBg,
    '--warning': c.warning,
    '--warning-bg': c.warningBg,
    '--glass-bg': c.glassBg,
    '--glass-border': c.glassBorder,
  } as React.CSSProperties;
}
