/**
 * useTradovatePanel
 *
 * Connects to Tradovate via the existing TradovateWS singleton and feeds
 * quote / DOM / trade data into useLiveStore for the DOM Ladder and Live Tape.
 *
 * Uses the proven client-side TradovateWS that fetches tokens from the backend
 * (/api/tradovate/auth) — credentials are never exposed to the browser.
 *
 * Usage:
 *   const { changeSymbol } = useTradovatePanel('NQ');
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useLiveStore } from '@/stores/useLiveStore';

// Retry delay on connection failure (exponential, capped at 30s)
const RETRY_DELAYS = [3_000, 6_000, 12_000, 30_000];

export function useTradovatePanel(symbol: string) {
  const { setStatus, updateQuote, updateDOM, addTrade, setHistory } = useLiveStore();

  const unsubs = useRef<Array<() => void>>([]);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const subscribe = useCallback(async (sym: string) => {
    // Cleanup previous subscriptions
    unsubs.current.forEach((fn) => fn());
    unsubs.current = [];

    if (!mountedRef.current) return;
    setStatus('connecting');

    // Dynamic import to avoid SSR issues
    const { tradovateWS } = await import('@/lib/websocket/TradovateWS');

    // Ensure connected — with retry on failure
    const ok = await tradovateWS.connect();
    if (!ok) {
      if (!mountedRef.current) return;
      setStatus('error');

      // Auto-retry with backoff
      const delay = RETRY_DELAYS[Math.min(retryCount.current, RETRY_DELAYS.length - 1)];
      retryCount.current++;
      console.log(`[useTradovatePanel] Retrying in ${delay / 1000}s (attempt ${retryCount.current})`);
      retryTimer.current = setTimeout(() => {
        if (mountedRef.current) subscribe(sym);
      }, delay);
      return;
    }

    retryCount.current = 0; // Reset on success
    if (!mountedRef.current) return;
    setStatus('connected');

    // ── Quote subscription ────────────────────────────────────────────────
    const unsubQuote = await tradovateWS.subscribeQuotes(sym, (q) => {
      updateQuote({
        bid: q.bid,
        ask: q.ask,
        last: q.last,
        bidSize: 0, // TradovateWS quote doesn't include size — DOM has it
        askSize: 0,
      });
    });
    unsubs.current.push(unsubQuote);

    // ── Trade / time & sales subscription ────────────────────────────────
    const unsubTrades = await tradovateWS.subscribeTrades(sym, (t) => {
      addTrade({
        id: t.id,
        price: t.price,
        size: t.quantity,
        time: t.time,
        side: t.isBuyerMaker ? 'sell' : 'buy', // isBuyerMaker=true means seller hit the bid
      });
    });
    unsubs.current.push(unsubTrades);

    // ── DOM subscription ──────────────────────────────────────────────────
    const unsubDOM = await tradovateWS.subscribeDom(sym, (dom) => {
      updateDOM({
        bids: dom.bids,
        offers: dom.offers,
        timestamp: dom.timestamp,
      });
    });
    unsubs.current.push(unsubDOM);

    // ── Historical chart data (for candle store) ──────────────────────────
    await tradovateWS.subscribeChart(
      sym,
      1, // 1-minute bars
      () => {}, // live kline updates handled by LiveChartPro
      (candles) => {
        setHistory(
          candles.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            buyVolume: c.volume * 0.5,   // Historical OHLCV doesn't split — approximate
            sellVolume: c.volume * 0.5,
            delta: 0,
            footprint: {},
          }))
        );
      }
    );
  }, [setStatus, updateQuote, updateDOM, addTrade, setHistory]);

  useEffect(() => {
    mountedRef.current = true;
    retryCount.current = 0;

    // Reset state for the new symbol
    useLiveStore.getState().setSymbol(symbol);

    subscribe(symbol);

    return () => {
      mountedRef.current = false;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      unsubs.current.forEach((fn) => fn());
      unsubs.current = [];
    };
  }, [symbol, subscribe]);

  /** Imperatively change the subscribed symbol (optional — can also remount) */
  const changeSymbol = useCallback((newSymbol: string) => {
    useLiveStore.getState().setSymbol(newSymbol);
    subscribe(newSymbol);
  }, [subscribe]);

  return { changeSymbol };
}
