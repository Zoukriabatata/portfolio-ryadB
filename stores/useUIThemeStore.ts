/**
 * UI THEME STORE
 *
 * Manages global UI theme selection with CSS variable overrides.
 * Themes change colors across the entire app by setting CSS variables on :root.
 * Separate from chart-level theming (useThemeStore).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============ THEME DEFINITIONS ============

export type UIThemeId = 'senzoukria' | 'midnight' | 'obsidian' | 'arctic' | 'blood' | 'ocean' | 'amber';

export interface UIThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryGlow: string;
  accent: string;
  accentLight: string;
}

export interface UIThemeDefinition {
  id: UIThemeId;
  name: string;
  description: string;
  preview: { bg: string; primary: string; accent: string };
  colors: UIThemeColors;
}

export const UI_THEMES: UIThemeDefinition[] = [
  {
    id: 'senzoukria',
    name: 'SENZOUKRIA',
    description: 'Senku green - kingdom of science',
    preview: { bg: '#060a08', primary: '#7ed321', accent: '#22d3ee' },
    colors: {
      background: '#060a08',
      surface: '#0c1410',
      surfaceElevated: '#142018',
      surfaceHover: '#1a2a20',
      textPrimary: '#e8f5e8',
      textSecondary: '#8aab8a',
      textMuted: '#5a7a5a',
      border: '#1a2a1e',
      borderLight: '#243830',
      primary: '#7ed321',
      primaryLight: '#a3e635',
      primaryDark: '#5fa31a',
      primaryGlow: 'rgba(126, 211, 33, 0.15)',
      accent: '#22d3ee',
      accentLight: '#67e8f9',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Emerald',
    description: 'Default dark with emerald accents',
    preview: { bg: '#0a0a0f', primary: '#10b981', accent: '#06b6d4' },
    colors: {
      background: '#0a0a0f',
      surface: '#12121a',
      surfaceElevated: '#1a1a24',
      surfaceHover: '#1e1e2e',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      border: '#1e1e2e',
      borderLight: '#2a2a3a',
      primary: '#10b981',
      primaryLight: '#34d399',
      primaryDark: '#059669',
      primaryGlow: 'rgba(16, 185, 129, 0.15)',
      accent: '#06b6d4',
      accentLight: '#22d3ee',
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Pure dark with neutral tones',
    preview: { bg: '#09090b', primary: '#a1a1aa', accent: '#e4e4e7' },
    colors: {
      background: '#09090b',
      surface: '#18181b',
      surfaceElevated: '#27272a',
      surfaceHover: '#3f3f46',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      border: '#27272a',
      borderLight: '#3f3f46',
      primary: '#a1a1aa',
      primaryLight: '#d4d4d8',
      primaryDark: '#71717a',
      primaryGlow: 'rgba(161, 161, 170, 0.12)',
      accent: '#e4e4e7',
      accentLight: '#fafafa',
    },
  },
  {
    id: 'arctic',
    name: 'Arctic Blue',
    description: 'Cool blue-tinted dark theme',
    preview: { bg: '#0a0e1a', primary: '#3b82f6', accent: '#06b6d4' },
    colors: {
      background: '#0a0e1a',
      surface: '#111827',
      surfaceElevated: '#1e293b',
      surfaceHover: '#334155',
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      border: '#1e293b',
      borderLight: '#334155',
      primary: '#3b82f6',
      primaryLight: '#60a5fa',
      primaryDark: '#2563eb',
      primaryGlow: 'rgba(59, 130, 246, 0.15)',
      accent: '#06b6d4',
      accentLight: '#22d3ee',
    },
  },
  {
    id: 'blood',
    name: 'Blood Moon',
    description: 'Dark with crimson accents',
    preview: { bg: '#0f0a0a', primary: '#ef4444', accent: '#f59e0b' },
    colors: {
      background: '#0f0a0a',
      surface: '#1a1212',
      surfaceElevated: '#241a1a',
      surfaceHover: '#2e1e1e',
      textPrimary: '#f9f1f1',
      textSecondary: '#b89494',
      textMuted: '#8b6464',
      border: '#2e1e1e',
      borderLight: '#3a2a2a',
      primary: '#ef4444',
      primaryLight: '#f87171',
      primaryDark: '#dc2626',
      primaryGlow: 'rgba(239, 68, 68, 0.15)',
      accent: '#f59e0b',
      accentLight: '#fbbf24',
    },
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    description: 'Navy blue with teal highlights',
    preview: { bg: '#0a0f14', primary: '#14b8a6', accent: '#0ea5e9' },
    colors: {
      background: '#0a0f14',
      surface: '#0f1923',
      surfaceElevated: '#162332',
      surfaceHover: '#1e2d3d',
      textPrimary: '#e2f0f9',
      textSecondary: '#7fb3d4',
      textMuted: '#4a7a9b',
      border: '#162332',
      borderLight: '#1e2d3d',
      primary: '#14b8a6',
      primaryLight: '#2dd4bf',
      primaryDark: '#0d9488',
      primaryGlow: 'rgba(20, 184, 166, 0.15)',
      accent: '#0ea5e9',
      accentLight: '#38bdf8',
    },
  },
  {
    id: 'amber',
    name: 'Amber Terminal',
    description: 'Classic terminal amber on dark',
    preview: { bg: '#0a0a08', primary: '#f59e0b', accent: '#eab308' },
    colors: {
      background: '#0a0a08',
      surface: '#14140f',
      surfaceElevated: '#1e1e16',
      surfaceHover: '#28281e',
      textPrimary: '#fef3c7',
      textSecondary: '#d4a843',
      textMuted: '#92742e',
      border: '#1e1e16',
      borderLight: '#28281e',
      primary: '#f59e0b',
      primaryLight: '#fbbf24',
      primaryDark: '#d97706',
      primaryGlow: 'rgba(245, 158, 11, 0.15)',
      accent: '#eab308',
      accentLight: '#facc15',
    },
  },
];

// ============ STORE ============

interface UIThemeState {
  activeTheme: UIThemeId;
  setTheme: (theme: UIThemeId) => void;
}

export const useUIThemeStore = create<UIThemeState>()(
  persist(
    (set) => ({
      activeTheme: 'senzoukria',
      setTheme: (theme) => set({ activeTheme: theme }),
    }),
    { name: 'senzoukria-ui-theme' }
  )
);

// ============ APPLY THEME TO DOM ============

export function applyUITheme(themeId: UIThemeId): void {
  const theme = UI_THEMES.find(t => t.id === themeId);
  if (!theme) return;

  const root = document.documentElement;
  const c = theme.colors;

  root.style.setProperty('--background', c.background);
  root.style.setProperty('--surface', c.surface);
  root.style.setProperty('--surface-elevated', c.surfaceElevated);
  root.style.setProperty('--surface-hover', c.surfaceHover);
  root.style.setProperty('--text-primary', c.textPrimary);
  root.style.setProperty('--text-secondary', c.textSecondary);
  root.style.setProperty('--text-muted', c.textMuted);
  root.style.setProperty('--foreground', c.textPrimary);
  root.style.setProperty('--border', c.border);
  root.style.setProperty('--border-light', c.borderLight);
  root.style.setProperty('--primary', c.primary);
  root.style.setProperty('--primary-light', c.primaryLight);
  root.style.setProperty('--primary-dark', c.primaryDark);
  root.style.setProperty('--primary-glow', c.primaryGlow);
  root.style.setProperty('--accent', c.accent);
  root.style.setProperty('--accent-light', c.accentLight);
}
