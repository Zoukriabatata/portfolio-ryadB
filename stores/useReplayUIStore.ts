'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReplayBookmark {
  id: string;
  timestamp: number;
  progress: number;
  label: string;
  color: string;
}

interface ReplayUIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Session search/filter
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Shortcuts overlay
  shortcutsVisible: boolean;
  toggleShortcuts: () => void;
  setShortcutsVisible: (visible: boolean) => void;

  // Session info modal
  sessionInfoId: string | null;
  openSessionInfo: (id: string) => void;
  closeSessionInfo: () => void;

  // Session rename modal
  sessionRenameId: string | null;
  openSessionRename: (id: string) => void;
  closeSessionRename: () => void;

  // Delete confirm modal
  sessionDeleteId: string | null;
  openSessionDelete: (id: string) => void;
  closeSessionDelete: () => void;

  // Stats overlay minimized
  statsMinimized: boolean;
  toggleStatsMinimized: () => void;

  // Bookmarks (per session)
  bookmarks: Record<string, ReplayBookmark[]>;
  addBookmark: (sessionId: string, bookmark: ReplayBookmark) => void;
  removeBookmark: (sessionId: string, bookmarkId: string) => void;
}

export const useReplayUIStore = create<ReplayUIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Search
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Shortcuts
      shortcutsVisible: false,
      toggleShortcuts: () => set((s) => ({ shortcutsVisible: !s.shortcutsVisible })),
      setShortcutsVisible: (visible) => set({ shortcutsVisible: visible }),

      // Session info
      sessionInfoId: null,
      openSessionInfo: (id) => set({ sessionInfoId: id }),
      closeSessionInfo: () => set({ sessionInfoId: null }),

      // Session rename
      sessionRenameId: null,
      openSessionRename: (id) => set({ sessionRenameId: id }),
      closeSessionRename: () => set({ sessionRenameId: null }),

      // Delete confirm
      sessionDeleteId: null,
      openSessionDelete: (id) => set({ sessionDeleteId: id }),
      closeSessionDelete: () => set({ sessionDeleteId: null }),

      // Stats overlay
      statsMinimized: false,
      toggleStatsMinimized: () => set((s) => ({ statsMinimized: !s.statsMinimized })),

      // Bookmarks
      bookmarks: {},
      addBookmark: (sessionId, bookmark) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            [sessionId]: [...(s.bookmarks[sessionId] || []), bookmark],
          },
        })),
      removeBookmark: (sessionId, bookmarkId) =>
        set((s) => ({
          bookmarks: {
            ...s.bookmarks,
            [sessionId]: (s.bookmarks[sessionId] || []).filter((b) => b.id !== bookmarkId),
          },
        })),
    }),
    {
      name: 'replay-ui-storage',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        statsMinimized: state.statsMinimized,
        bookmarks: state.bookmarks,
      }),
    }
  )
);
