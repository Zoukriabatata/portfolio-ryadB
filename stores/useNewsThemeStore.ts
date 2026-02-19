import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NewsThemeId } from '@/types/news';

interface NewsThemeState {
  theme: NewsThemeId;
  setTheme: (theme: NewsThemeId) => void;
}

export const useNewsThemeStore = create<NewsThemeState>()(
  persist(
    (set) => ({
      theme: 'senzoukria',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'senzoukria-news-theme',
      merge: (persisted, current) => {
        const p = persisted as Partial<NewsThemeState> | undefined;
        const valid: NewsThemeId[] = ['senzoukria', 'atas', 'bookmap', 'sierra', 'highcontrast'];
        return {
          ...current,
          theme: p?.theme && valid.includes(p.theme) ? p.theme : current.theme,
        };
      },
    }
  )
);
