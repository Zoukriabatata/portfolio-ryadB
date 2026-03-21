'use client';

/**
 * Lazy hydration for non-critical Zustand persisted stores.
 *
 * All stores below use `skipHydration: true` in their persist config,
 * so they won't read from localStorage until `.persist.rehydrate()` is
 * called. This avoids blocking the main thread with 23 synchronous
 * localStorage reads + deep merges during first paint.
 *
 * Called once after mount in DashboardClientLayout via useEffect.
 */
export function hydrateStores() {
  if (typeof window === 'undefined') return;

  const hydrate = () => {
    // Settings stores (heavy deep merges)
    import('@/stores/useHeatmapSettingsStore').then(m => m.useHeatmapSettingsStore.persist.rehydrate());
    import('@/stores/useFootprintSettingsStore').then(m => m.useFootprintSettingsStore.persist.rehydrate());
    import('@/stores/usePreferencesStore').then(m => m.usePreferencesStore.persist.rehydrate());
    import('@/stores/useToolSettingsStore').then(m => m.useToolSettingsStore.persist.rehydrate());
    import('@/stores/useCrosshairStore').then(m => m.useCrosshairStore.persist.rehydrate());
    import('@/stores/useNewsSettingsStore').then(m => m.useNewsSettingsStore.persist.rehydrate());
    import('@/stores/useNewsThemeStore').then(m => m.useNewsThemeStore.persist.rehydrate());
    import('@/stores/useDataFeedStore').then(m => m.useDataFeedStore.persist.rehydrate());
    import('@/stores/useAccountPrefsStore').then(m => m.useAccountPrefsStore.persist.rehydrate());
    import('@/stores/useChartSyncStore').then(m => m.useChartSyncStore.persist.rehydrate());
    import('@/stores/useTimezoneStore').then(m => m.useTimezoneStore.persist.rehydrate());

    // Chart / drawing stores
    import('@/stores/useChartToolsStore').then(m => m.useChartToolsStore.persist.rehydrate());
    import('@/stores/useDrawingStore').then(m => m.useDrawingStore.persist.rehydrate());
    import('@/stores/useIndicatorStore').then(m => m.useIndicatorStore.persist.rehydrate());
    import('@/stores/useChartTemplatesStore').then(m => m.useChartTemplatesStore.persist.rehydrate());
    import('@/stores/useFavoritesToolbarStore').then(m => m.useFavoritesToolbarStore.persist.rehydrate());

    // Feature / data stores
    import('@/stores/useAlertsStore').then(m => m.useAlertsStore.persist.rehydrate());
    import('@/stores/useBacktestStore').then(m => m.useBacktestStore.persist.rehydrate());
    import('@/stores/useJournalStore').then(m => m.useJournalStore.persist.rehydrate());
    import('@/stores/useReplayUIStore').then(m => m.useReplayUIStore.persist.rehydrate());
    import('@/stores/useSymbolPriceStore').then(m => m.useSymbolPriceStore.persist.rehydrate());
    import('@/stores/useWatchlistStore').then(m => m.useWatchlistStore.persist.rehydrate());
    import('@/stores/useTradingStore').then(m => m.useTradingStore.persist.rehydrate());
  };

  // Use requestIdleCallback so hydration happens after first paint,
  // when the browser is idle. Falls back to setTimeout for Safari.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(hydrate, { timeout: 2000 });
  } else {
    setTimeout(hydrate, 50);
  }
}
