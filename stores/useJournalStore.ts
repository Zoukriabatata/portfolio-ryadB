import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JournalTab, TradeFilters } from '@/types/journal';
import { DEFAULT_TRADE_FILTERS } from '@/types/journal';

interface JournalUIState {
  // Active tab
  activeTab: JournalTab;

  // Dashboard date range
  dashboardDateRange: { from: string | null; to: string | null };

  // Trade filters
  tradeFilters: TradeFilters;

  // Trade table preferences
  tradeTableSort: { column: string; direction: 'asc' | 'desc' };
  tradeTablePageSize: number;

  // Calendar
  calendarMonth: string; // "2026-02" format

  // Playbook
  playbookViewMode: 'grid' | 'list';

  // Auto-track sync signal — bumped when new trades are auto-synced to journal
  lastAutoTrackSync: number;

  // Actions
  setActiveTab: (tab: JournalTab) => void;
  setDashboardDateRange: (range: { from: string | null; to: string | null }) => void;
  setTradeFilters: (filters: Partial<TradeFilters>) => void;
  resetTradeFilters: () => void;
  setTradeTableSort: (sort: { column: string; direction: 'asc' | 'desc' }) => void;
  setTradeTablePageSize: (size: number) => void;
  setCalendarMonth: (month: string) => void;
  setPlaybookViewMode: (mode: 'grid' | 'list') => void;
  notifyAutoTrackSync: () => void;
}

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export const useJournalStore = create<JournalUIState>()(
  persist(
    (set) => ({
      activeTab: 'dashboard',
      dashboardDateRange: { from: null, to: null },
      tradeFilters: { ...DEFAULT_TRADE_FILTERS },
      tradeTableSort: { column: 'entryTime', direction: 'desc' },
      tradeTablePageSize: 25,
      calendarMonth: currentMonth,
      playbookViewMode: 'grid',
      lastAutoTrackSync: 0,

      setActiveTab: (tab) => set({ activeTab: tab }),
      setDashboardDateRange: (range) => set({ dashboardDateRange: range }),
      setTradeFilters: (filters) =>
        set((state) => ({
          tradeFilters: { ...state.tradeFilters, ...filters },
        })),
      resetTradeFilters: () => set({ tradeFilters: { ...DEFAULT_TRADE_FILTERS } }),
      setTradeTableSort: (sort) => set({ tradeTableSort: sort }),
      setTradeTablePageSize: (size) => set({ tradeTablePageSize: size }),
      setCalendarMonth: (month) => set({ calendarMonth: month }),
      setPlaybookViewMode: (mode) => set({ playbookViewMode: mode }),
      notifyAutoTrackSync: () => set({ lastAutoTrackSync: Date.now() }),
    }),
    {
      name: 'journal-ui-storage',
      skipHydration: true,
      partialize: (state) => ({
        activeTab: state.activeTab,
        tradeFilters: state.tradeFilters,
        tradeTableSort: state.tradeTableSort,
        tradeTablePageSize: state.tradeTablePageSize,
        calendarMonth: state.calendarMonth,
        playbookViewMode: state.playbookViewMode,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<JournalUIState> | undefined;
        const validTabs: JournalTab[] = ['dashboard', 'trades', 'calendar', 'playbook', 'notes'];
        return {
          ...current,
          activeTab: p?.activeTab && validTabs.includes(p.activeTab) ? p.activeTab : current.activeTab,
          tradeFilters: {
            ...DEFAULT_TRADE_FILTERS,
            ...(p?.tradeFilters || {}),
          },
          tradeTableSort: p?.tradeTableSort || current.tradeTableSort,
          tradeTablePageSize: p?.tradeTablePageSize || current.tradeTablePageSize,
          calendarMonth: p?.calendarMonth || current.calendarMonth,
          playbookViewMode: p?.playbookViewMode === 'list' ? 'list' : 'grid',
        };
      },
    }
  )
);
