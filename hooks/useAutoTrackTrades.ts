'use client';

import { useEffect, useRef } from 'react';
import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';
import { useJournalStore } from '@/stores/useJournalStore';

const PENDING_KEY = 'autotrack-pending-trades';

/**
 * Load trades that failed to sync from localStorage.
 */
function loadPending(): ClosedTrade[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePending(trades: ClosedTrade[]): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(trades)); } catch {}
}

function removePendingById(id: string): void {
  savePending(loadPending().filter(t => t.id !== id));
}

function addPending(trade: ClosedTrade): void {
  const pending = loadPending();
  if (!pending.some(t => t.id === trade.id)) {
    pending.push(trade);
    savePending(pending);
  }
}

/**
 * Post a closed trade to the journal API.
 * Returns 'ok' | 'auth_error' | 'network_error'
 */
async function postTrade(trade: ClosedTrade): Promise<'ok' | 'auth_error' | 'network_error'> {
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

    if (res.ok) return 'ok';
    if (res.status === 401) return 'auth_error';
    return 'network_error';
  } catch {
    return 'network_error';
  }
}

/**
 * useAutoTrackTrades
 *
 * Watches for closed trades in useTradingStore and automatically
 * POSTs them to /api/journal for auto-journaling.
 *
 * When the API is unavailable (no DB / not authenticated), trades
 * are buffered in localStorage and retried on next page load.
 *
 * Mount this hook once in a layout-level component (e.g. DashboardClientLayout).
 */
export function useAutoTrackTrades() {
  const syncingRef = useRef<Set<string>>(new Set());
  const retriedRef = useRef(false);

  useEffect(() => {
    // Retry any pending trades from previous sessions (once)
    if (!retriedRef.current) {
      retriedRef.current = true;
      const pending = loadPending();
      if (pending.length > 0) {
        syncBatch(pending);
      }
    }

    // Subscribe to store changes
    const unsubscribe = useTradingStore.subscribe((state) => {
      const unsynced = state.closedTrades.filter(
        (t) => !t.synced && !syncingRef.current.has(t.id)
      );

      if (unsynced.length === 0) return;

      syncBatch(unsynced);
    });

    return () => unsubscribe();
  }, []);

  function syncBatch(trades: ClosedTrade[]) {
    // Mark as being synced to prevent duplicate POSTs
    for (const t of trades) {
      syncingRef.current.add(t.id);
    }

    Promise.allSettled(
      trades.map(async (trade) => {
        const result = await postTrade(trade);

        if (result === 'ok') {
          removePendingById(trade.id);
          return trade.id;
        }

        if (result === 'auth_error') {
          // User not logged in / no DB — buffer for later
          addPending(trade);
          return trade.id; // Mark synced in store to avoid infinite retries
        }

        // Network error — buffer for retry
        addPending(trade);
        return null;
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
      for (const t of trades) {
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
  }
}
