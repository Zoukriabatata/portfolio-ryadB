'use client';

import { useEffect, useRef } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';

// Use Bybit API (not blocked in EU/France)
const BYBIT_API_BASE = '/api/bybit';

export function useOrderbook() {
  const { symbol } = useMarketStore();
  const {
    updateOrderbook,
    setInitialOrderbook,
    bids,
    asks,
    midPrice,
    spread,
    bidAskImbalance,
    heatmapHistory,
    bidWalls,
    askWalls,
    calculateWalls,
    reset,
  } = useOrderbookStore();

  const isInitialized = useRef(false);
  const lastUpdateId = useRef(0);

  // Fetch initial orderbook snapshot from Bybit
  useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const response = await fetch(
          `${BYBIT_API_BASE}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=200`
        );

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Bybit orderbook returned non-JSON response');
          return;
        }

        const data = await response.json();

        if (data.retCode !== 0) {
          console.error('Bybit orderbook error:', data.retMsg);
          return;
        }

        if (!data.result) {
          console.error('Bybit orderbook: no result data');
          return;
        }

        const { b: bids, a: asks, u: updateId } = data.result;
        setInitialOrderbook(bids || [], asks || [], updateId || 0);
        lastUpdateId.current = updateId || 0;
        isInitialized.current = true;

        // Calculate initial walls
        calculateWalls(3);
      } catch (error) {
        console.error('Failed to fetch orderbook snapshot:', error);
      }
    };

    reset();
    isInitialized.current = false;
    fetchSnapshot();
  }, [symbol, setInitialOrderbook, calculateWalls, reset]);

  // Subscribe to Bybit orderbook updates
  useEffect(() => {
    // Connect to Bybit first
    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeDepth(
      symbol,
      (update) => {
        // Handle both snapshot and delta updates
        if (update.eventType === 'snapshot') {
          setInitialOrderbook(update.bids, update.asks, update.finalUpdateId);
          lastUpdateId.current = update.finalUpdateId;
          isInitialized.current = true;
          calculateWalls(3);
          return;
        }

        // Only process delta updates after initialization
        if (!isInitialized.current) return;

        updateOrderbook(update.bids, update.asks, update.finalUpdateId);
        lastUpdateId.current = update.finalUpdateId;

        // Recalculate walls periodically (every 10 updates)
        if (update.finalUpdateId % 10 === 0) {
          calculateWalls(3);
        }
      },
      'linear',
      50 // Bybit depth level
    );

    return () => {
      unsubscribe();
    };
  }, [symbol, updateOrderbook, calculateWalls, setInitialOrderbook]);

  return {
    bids,
    asks,
    midPrice,
    spread,
    bidAskImbalance,
    heatmapHistory,
    bidWalls,
    askWalls,
  };
}
