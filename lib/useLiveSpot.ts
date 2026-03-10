'use client';

import { useState, useEffect, useRef } from 'react';

interface LiveSpot {
  price: number;
  ts: number;      // last successful update timestamp
  loading: boolean;
}

/**
 * useLiveSpot — polls /api/spot-price every `intervalMs` (default 10s).
 * Returns the most recent price and the timestamp of the last update.
 * Falls back to 0 if the fetch fails (caller should use their own fallback).
 */
export function useLiveSpot(ticker: string, intervalMs = 10_000): LiveSpot {
  const [state, setState] = useState<LiveSpot>({ price: 0, ts: 0, loading: true });
  const tickerRef = useRef(ticker);
  tickerRef.current = ticker;

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/spot-price?ticker=${encodeURIComponent(tickerRef.current)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.price > 0) {
          setState({ price: data.price, ts: Date.now(), loading: false });
        }
      } catch {
        // silently ignore — keep last known price
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ticker, intervalMs]);

  return state;
}
