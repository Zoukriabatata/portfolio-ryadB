'use client';

import { useEffect, useRef } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS } from '@/types/market';
import { createOrderbookSimulator, type OrderbookSimulator } from '@/lib/simulation/OrderbookSimulator';
import { throttledFetch } from '@/lib/api/throttledFetch';

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
    reset,
  } = useOrderbookStore();

  const isInitialized = useRef(false);
  const lastUpdateId = useRef(0);
  const simulatorRef = useRef<OrderbookSimulator | null>(null);

  // Check if symbol is supported by Bybit
  const isBybitSymbol = SYMBOLS[symbol]?.exchange === 'bybit';

  // Fetch initial orderbook snapshot from Bybit OR start simulation
  useEffect(() => {
    const fetchSnapshot = async () => {
      reset();
      isInitialized.current = false;

      // If not a Bybit symbol, use simulation
      if (!isBybitSymbol) {
        console.log(`[Orderbook] Symbol ${symbol} - Starting simulation mode`);

        // Crée et démarre le simulateur
        const simulator = createOrderbookSimulator(symbol);
        simulatorRef.current = simulator;

        // Initialise avec le premier snapshot
        const initialSnapshot = simulator.getSnapshot();
        setInitialOrderbook(
          initialSnapshot.bids,
          initialSnapshot.asks,
          Date.now()
        );
        isInitialized.current = true;


        // Démarre la simulation
        simulator.start();

        return;
      }

      // Mode live Bybit
      try {
        const response = await throttledFetch(
          `${BYBIT_API_BASE}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=200`
        );

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

      } catch (error) {
        console.error('Failed to fetch orderbook snapshot:', error);
      }
    };

    fetchSnapshot();

    // Cleanup
    return () => {
      if (simulatorRef.current) {
        simulatorRef.current.stop();
        simulatorRef.current = null;
      }
    };
  }, [symbol, isBybitSymbol, setInitialOrderbook, reset]);

  // Subscribe to orderbook updates (Bybit WebSocket OR Simulation)
  useEffect(() => {
    // Simulation mode
    if (!isBybitSymbol && simulatorRef.current) {
      const unsubscribe = simulatorRef.current.onUpdate((snapshot) => {
        if (!isInitialized.current) return;

        updateOrderbook(snapshot.bids, snapshot.asks, snapshot.timestamp);
      });

      return () => {
        unsubscribe();
      };
    }

    // Live Bybit mode
    if (isBybitSymbol) {
      bybitWS.connect('linear');

      const unsubscribe = bybitWS.subscribeDepth(
        symbol,
        (update) => {
          if (update.eventType === 'snapshot') {
            setInitialOrderbook(update.bids, update.asks, update.finalUpdateId);
            lastUpdateId.current = update.finalUpdateId;
            isInitialized.current = true;
    
            return;
          }

          if (!isInitialized.current) return;

          updateOrderbook(update.bids, update.asks, update.finalUpdateId);
          lastUpdateId.current = update.finalUpdateId;

        },
        'linear',
        50
      );

      return () => {
        unsubscribe();
      };
    }
  }, [symbol, isBybitSymbol, updateOrderbook, setInitialOrderbook]);

  return {
    bids,
    asks,
    midPrice,
    spread,
    bidAskImbalance,
    heatmapHistory,
  };
}
