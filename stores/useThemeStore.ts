/**
 * THEME STORE - Gestion des thèmes avec Zustand
 *
 * - Persistance localStorage
 * - Couleurs personnalisées
 * - Switch thème instantané
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type ChartTheme,
  type ChartColors,
  THEME_MAP,
  THEME_DARK,
  mergeTheme,
} from '@/lib/themes/ThemeSystem';

interface ThemeState {
  // État
  themeId: string;
  customColors: Partial<ChartColors>;

  // Computed
  getTheme: () => ChartTheme;

  // Actions
  setTheme: (themeId: string) => void;
  setCustomColor: (key: keyof ChartColors, value: string) => void;
  setCustomColors: (colors: Partial<ChartColors>) => void;
  resetCustomColors: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId: 'dark',
      customColors: {},

      getTheme: () => {
        const { themeId, customColors } = get();
        const baseTheme = THEME_MAP[themeId] || THEME_DARK;
        return mergeTheme(baseTheme, customColors);
      },

      setTheme: (themeId) => {
        if (THEME_MAP[themeId]) {
          set({ themeId });
        }
      },

      setCustomColor: (key, value) => {
        set((state) => ({
          customColors: { ...state.customColors, [key]: value },
        }));
      },

      setCustomColors: (colors) => {
        set((state) => ({
          customColors: { ...state.customColors, ...colors },
        }));
      },

      resetCustomColors: () => {
        set({ customColors: {} });
      },
    }),
    {
      name: 'chart-theme-storage',
      partialize: (state) => ({
        themeId: state.themeId,
        customColors: state.customColors,
      }),
    }
  )
);
