'use client';

import { useEffect, useRef } from 'react';
import { useTradingStore } from '@/stores/useTradingStore';
import { useJournalStore } from '@/stores/useJournalStore';

/**
 * useAutoTrackTrades
 *
 * Watches for closed trades in useTradingStore and automatically
 * POSTs them to /api/journal for auto-journaling.
 *
 * Mount this hook once in a layout-level component (e.g. DashboardClientLayout).
 * It only fires when new unsynced closedTrades appear.
 */
export function useAutoTrackTrades() {
  const syncingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Subscribe to store changes
    const unsubscribe = useTradingStore.subscribe((state) => {
      const unsynced = state.closedTrades.filter(
        (t) => !t.synced && !syncingRef.current.has(t.id)
      );

      if (unsynced.length === 0) return;

      // Mark as being synced to prevent duplicate POSTs
      for (const t of unsynced) {
        syncingRef.current.add(t.id);
      }

      // Post each trade to journal API
      Promise.allSettled(
        unsynced.map(async (trade) => {
          try {
            const res = await fetch('/api/journal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: trade.symbol,
                side: trade.side === 'buy' ? 'LONG' : 'SHORT',
                entryPrice: trade.entryPrice,
                exitPrice: trade.exitPrice,
                quantity: trade.quantity,
                entryTime: new Date(trade.entryTime).toISOString(),
                exitTime: new Date(trade.exitTime).toISOString(),
                tags: ['auto-tracked'],
                notes: `Auto-tracked from ${trade.broker} via QuickTrade`,
              }),
            });

            if (res.ok) {
              return trade.id;
            }
            // If 401 (not logged in), silently skip — user may be in demo without auth
            if (res.status === 401) {
              return trade.id; // Still mark as synced to avoid retry spam
            }
            console.warn(`[AutoTrack] Failed to sync trade ${trade.id}: ${res.status}`);
            return null;
          } catch {
            console.warn(`[AutoTrack] Network error syncing trade ${trade.id}`);
            return null;
          }
        })
      ).then((results) => {
        const syncedIds: string[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            syncedIds.push(result.value);
            syncingRef.current.delete(result.value);
          }
        }
        // Remove failed ones from syncing set so they can retry
        for (const t of unsynced) {
          if (!syncedIds.includes(t.id)) {
            syncingRef.current.delete(t.id);
          }
        }
        if (syncedIds.length > 0) {
          useTradingStore.getState().markTradesSynced(syncedIds);
          // Signal journal hooks to refetch data (updates Track Score, analytics, trade list)
          useJournalStore.getState().notifyAutoTrackSync();
        }
      });
    });

    return () => unsubscribe();
  }, []);
}
