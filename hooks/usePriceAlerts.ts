'use client';

/**
 * usePriceAlerts
 *
 * Manages price alerts: fetches from API, monitors current price,
 * triggers alert + sends email when condition is met.
 *
 * Mount this hook once in a page that has live prices (e.g. /live via LiveChartPro).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'above' | 'below';
  targetPrice: number;
  label?: string | null;
  triggered: boolean;
  createdAt: string;
}

interface UseAlertsReturn {
  alerts: PriceAlert[];
  loading: boolean;
  createAlert: (data: { symbol: string; condition: 'above' | 'below'; targetPrice: number; label?: string }) => Promise<boolean>;
  deleteAlert: (id: string) => Promise<void>;
  recentlyTriggered: PriceAlert | null;
  dismissTriggered: () => void;
}

export function usePriceAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentlyTriggered, setRecentlyTriggered] = useState<PriceAlert | null>(null);

  const currentPrice = useMarketStore(s => s.currentPrice);
  const symbol = useMarketStore(s => s.symbol);

  // Ref to avoid stale closure in price monitor
  const alertsRef = useRef<PriceAlert[]>([]);
  alertsRef.current = alerts;

  // Track which alerts we've already triggered this session
  const triggeredIds = useRef<Set<string>>(new Set());

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/alerts')
      .then(r => r.json())
      .then(data => { if (!cancelled) setAlerts(data.alerts ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Monitor price changes
  useEffect(() => {
    if (!currentPrice || currentPrice <= 0) return;

    const active = alertsRef.current.filter(
      a => !a.triggered && a.symbol === symbol && !triggeredIds.current.has(a.id)
    );

    for (const alert of active) {
      const hit =
        (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.condition === 'below' && currentPrice <= alert.targetPrice);

      if (hit) {
        triggeredIds.current.add(alert.id);
        // Optimistic UI update
        setAlerts(prev => prev.filter(a => a.id !== alert.id));
        setRecentlyTriggered(alert);

        // Fire trigger API (non-blocking)
        fetch(`/api/alerts/${alert.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPrice }),
        }).catch(() => {});
      }
    }
  }, [currentPrice, symbol]);

  const createAlert = useCallback(async (data: {
    symbol: string;
    condition: 'above' | 'below';
    targetPrice: number;
    label?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create alert');
      }
      const { alert } = await res.json();
      setAlerts(prev => [alert, ...prev]);
      return true;
    } catch (e) {
      console.error('[Alerts]', e);
      return false;
    }
  }, []);

  const deleteAlert = useCallback(async (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    fetch(`/api/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const dismissTriggered = useCallback(() => setRecentlyTriggered(null), []);

  return { alerts, loading, createAlert, deleteAlert, recentlyTriggered, dismissTriggered };
}
