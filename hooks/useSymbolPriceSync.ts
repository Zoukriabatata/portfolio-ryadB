/**
 * SYMBOL PRICE SYNC HOOK
 *
 * Automatically synchronizes price data from WebSocket to centralized store.
 * Handles connection lifecycle and cleanup.
 */

import { useEffect, useRef } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import { useSymbolPriceStore } from '@/stores/useSymbolPriceStore';

interface UseSymbolPriceSyncOptions {
  /** Symbol to sync (defaults to store's activeSymbol) */
  symbol?: string;
  /** Auto-connect to WebSocket (default: true) */
  autoConnect?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Syncs symbol price data from WebSocket to centralized store
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useSymbolPriceSync({ symbol: 'btcusdt' });
 *   const price = useSymbolPrice('btcusdt');
 *   return <div>${price}</div>;
 * }
 * ```
 */
export function useSymbolPriceSync(options: UseSymbolPriceSyncOptions = {}) {
  const { autoConnect = true, debug = false } = options;

  const activeSymbol = useSymbolPriceStore((state) => state.activeSymbol);
  const updatePrice = useSymbolPriceStore((state) => state.updatePrice);

  const symbol = options.symbol || activeSymbol;
  const ws = useRef(getBinanceLiveWS());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    const normalizedSymbol = symbol.toLowerCase();

    if (debug) {
      console.log(`[SymbolPriceSync] Syncing ${normalizedSymbol}`);
    }

    // Connect to WebSocket
    ws.current.connect(normalizedSymbol);

    // Subscribe to tick updates
    const unsubscribe = ws.current.onTick((tick) => {
      updatePrice({
        symbol: normalizedSymbol,
        price: tick.price,
        timestamp: tick.timestamp,
        volume24h: tick.quantity,
      });

      if (debug) {
        console.log(`[SymbolPriceSync] ${normalizedSymbol} @ ${tick.price}`);
      }
    });

    unsubscribeRef.current = unsubscribe;

    // Cleanup on unmount or symbol change
    return () => {
      if (debug) {
        console.log(`[SymbolPriceSync] Cleanup ${normalizedSymbol}`);
      }

      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [symbol, autoConnect, debug, updatePrice]);

  return {
    symbol,
    isConnected: ws.current ? true : false,
  };
}

/**
 * Syncs multiple symbols in parallel
 *
 * @example
 * ```tsx
 * function Watchlist() {
 *   useMultiSymbolPriceSync(['btcusdt', 'ethusdt', 'bnbusdt']);
 *   // Prices automatically update in store
 * }
 * ```
 */
export function useMultiSymbolPriceSync(symbols: string[], options: Omit<UseSymbolPriceSyncOptions, 'symbol'> = {}) {
  const { autoConnect = true, debug = false } = options;
  const updatePrices = useSymbolPriceStore((state) => state.updatePrices);

  const wsRefs = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    if (!autoConnect || symbols.length === 0) return;

    const ws = getBinanceLiveWS();

    // Subscribe to each symbol
    symbols.forEach((symbol) => {
      const normalizedSymbol = symbol.toLowerCase();

      if (wsRefs.current.has(normalizedSymbol)) {
        return; // Already subscribed
      }

      if (debug) {
        console.log(`[MultiSymbolSync] Subscribing to ${normalizedSymbol}`);
      }

      // Note: In production, you'd want a multi-symbol WebSocket connection
      // For now, this is a simplified implementation
      const unsubscribe = ws.onTick((tick) => {
        updatePrices([{
          symbol: normalizedSymbol,
          price: tick.price,
          timestamp: tick.timestamp,
        }]);
      });

      wsRefs.current.set(normalizedSymbol, unsubscribe);
    });

    // Cleanup
    return () => {
      if (debug) {
        console.log(`[MultiSymbolSync] Cleanup ${symbols.length} symbols`);
      }

      wsRefs.current.forEach((unsubscribe) => {
        unsubscribe();
      });

      wsRefs.current.clear();
    };
  }, [symbols.join(','), autoConnect, debug, updatePrices]);

  return {
    symbols,
    count: symbols.length,
  };
}
