import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NewsTimezone = 'local' | 'ET' | 'UTC';

interface NewsSettingsState {
  timezone: NewsTimezone;
  watchlistMode: boolean;
  watchlist: string[]; // starred event titles
  notificationsEnabled: boolean;
  notificationLeadMinutes: number;
  setTimezone: (tz: NewsTimezone) => void;
  toggleWatchlistMode: () => void;
  toggleStar: (title: string) => void;
  toggleNotifications: () => void;
  setNotificationLead: (m: number) => void;
}

export const useNewsSettingsStore = create<NewsSettingsState>()(
  persist(
    (set) => ({
      timezone: 'local',
      watchlistMode: false,
      watchlist: [],
      notificationsEnabled: false,
      notificationLeadMinutes: 15,
      setTimezone: (timezone) => set({ timezone }),
      toggleWatchlistMode: () => set(s => ({ watchlistMode: !s.watchlistMode })),
      toggleStar: (title) => set(s => {
        const idx = s.watchlist.indexOf(title);
        return {
          watchlist: idx >= 0 ? s.watchlist.filter(t => t !== title) : [...s.watchlist, title],
        };
      }),
      toggleNotifications: () => set(s => ({ notificationsEnabled: !s.notificationsEnabled })),
      setNotificationLead: (m) => set({ notificationLeadMinutes: m }),
    }),
    { name: 'senzoukria-news-settings' }
  )
);
