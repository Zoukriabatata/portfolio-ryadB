/**
 * Trade Auto-Tracker
 *
 * Listens to filled orders from useTradingStore and auto-creates
 * journal entries via the /api/journal endpoint.
 * Uses Zustand subscribe() to watch for order state changes.
 */

import { useTradingStore, type Order } from '@/stores/useTradingStore';

/** IDs of orders we've already tracked — avoids duplicates */
const trackedOrderIds = new Set<string>();

/** Global toggle for auto-tracking */
let _enabled = false;
let _unsubscribe: (() => void) | null = null;

/**
 * Convert a filled Order into a journal API payload and POST it.
 */
async function trackFilledOrder(order: Order): Promise<boolean> {
  if (trackedOrderIds.has(order.id)) return false;
  trackedOrderIds.add(order.id);

  const side: 'LONG' | 'SHORT' = order.side === 'buy' ? 'LONG' : 'SHORT';
  const entryPrice = order.avgFillPrice ?? order.price ?? order.marketPrice ?? 0;
  if (entryPrice === 0) return false;

  const body = {
    symbol: order.symbol,
    side,
    entryPrice: String(entryPrice),
    exitPrice: '',
    quantity: String(order.filledQuantity || order.quantity),
    entryTime: new Date(order.updatedAt || order.createdAt).toISOString(),
    exitTime: '',
    timeframe: '',
    setup: '',
    notes: `Auto-tracked from ${order.broker} (${order.type} order)`,
    rating: 0,
    emotions: '',
    tags: ['auto-imported'],
    screenshotUrls: [],
    playbookSetupId: '',
  };

  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    // Remove from tracked so it can retry next time
    trackedOrderIds.delete(order.id);
    return false;
  }
}

/**
 * Start auto-tracking. Subscribes to useTradingStore and watches for
 * newly filled orders.
 */
export function enableAutoTracking(): void {
  if (_enabled) return;
  _enabled = true;

  // Mark existing filled orders as already tracked
  const currentOrders = useTradingStore.getState().orders;
  currentOrders.forEach((o) => {
    if (o.status === 'filled') trackedOrderIds.add(o.id);
  });

  // Subscribe to changes
  _unsubscribe = useTradingStore.subscribe((state, prevState) => {
    if (!_enabled) return;

    // Find newly filled orders
    for (const order of state.orders) {
      if (
        order.status === 'filled' &&
        !trackedOrderIds.has(order.id)
      ) {
        // Check that it wasn't filled before (was pending in prev state)
        const prev = prevState.orders.find((o) => o.id === order.id);
        if (!prev || prev.status !== 'filled') {
          trackFilledOrder(order);
        }
      }
    }
  });
}

/**
 * Stop auto-tracking.
 */
export function disableAutoTracking(): void {
  _enabled = false;
  _unsubscribe?.();
  _unsubscribe = null;
}

/**
 * Check if auto-tracking is currently enabled.
 */
export function isAutoTrackingEnabled(): boolean {
  return _enabled;
}

/**
 * Get the set of tracked order IDs (for debugging/UI).
 */
export function getTrackedOrderIds(): ReadonlySet<string> {
  return trackedOrderIds;
}
