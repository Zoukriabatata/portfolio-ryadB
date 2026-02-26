/**
 * Trade Auto-Tracker — Utility module
 *
 * The actual auto-tracking logic lives in hooks/useAutoTrackTrades.ts
 * which is mounted in DashboardClientLayout.
 *
 * This module provides imperative enable/disable if needed outside React.
 */

import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';
import { useJournalStore } from '@/stores/useJournalStore';

let _enabled = false;
let _unsubscribe: (() => void) | null = null;

const syncedIds = new Set<string>();

async function postTrade(trade: ClosedTrade): Promise<boolean> {
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
    return res.ok || res.status === 401; // 401 = no auth, still mark synced
  } catch {
    return false;
  }
}

export function enableAutoTracking(): void {
  if (_enabled) return;
  _enabled = true;

  // Mark existing synced trades
  useTradingStore.getState().closedTrades.forEach(t => {
    if (t.synced) syncedIds.add(t.id);
  });

  _unsubscribe = useTradingStore.subscribe((state, prevState) => {
    if (!_enabled) return;
    if (state.closedTrades.length <= prevState.closedTrades.length) return;

    const prevIds = new Set(prevState.closedTrades.map(t => t.id));
    const newTrades = state.closedTrades.filter(t => !prevIds.has(t.id) && !t.synced);

    if (newTrades.length === 0) return;

    Promise.allSettled(newTrades.map(async (trade) => {
      if (syncedIds.has(trade.id)) return null;
      syncedIds.add(trade.id);
      const ok = await postTrade(trade);
      return ok ? trade.id : null;
    })).then(results => {
      const ids = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
      if (ids.length > 0) {
        useTradingStore.getState().markTradesSynced(ids);
        useJournalStore.getState().notifyAutoTrackSync();
      }
    });
  });
}

export function disableAutoTracking(): void {
  _enabled = false;
  _unsubscribe?.();
  _unsubscribe = null;
}

export function isAutoTrackingEnabled(): boolean {
  return _enabled;
}
