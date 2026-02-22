'use client';

import { useEffect } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS } from '@/types/market';

const MAX_TRADES = 100;

export function useTrades() {
  const symbol = useMarketStore((s) => s.symbol);
  const trades = useMarketStore((s) => s.trades);
  const addTrade = useMarketStore((s) => s.addTrade);
  const symbolInfo = SYMBOLS[symbol];
  const isBybit = symbolInfo?.exchange === 'bybit';

  useEffect(() => {
    // Only subscribe for Bybit symbols (real-time data)
    if (!isBybit) return;

    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeTrades(
      symbol,
      (trade) => {
        addTrade(trade);
      },
      'linear'
    );

    return () => {
      unsubscribe();
    };
  }, [symbol, isBybit, addTrade]);

  return {
    trades: trades.slice(-MAX_TRADES),
    isLive: isBybit,
  };
}
