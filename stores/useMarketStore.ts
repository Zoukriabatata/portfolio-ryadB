import { create } from 'zustand';
import type { Candle, Trade, Timeframe, Symbol } from '@/types/market';

interface MarketState {
  // Current symbol and timeframe
  symbol: Symbol;
  timeframe: Timeframe;

  // Price data
  currentPrice: number;
  candles: Candle[];
  trades: Trade[];

  // Connection status
  isConnected: boolean;

  // Historical data loading
  isLoadingHistory: boolean;
  historyError: string | null;
  oldestLoadedTime: number | null;
  hasMoreHistory: boolean;

  // Actions
  setSymbol: (symbol: Symbol) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setCurrentPrice: (price: number) => void;
  setCandles: (candles: Candle[]) => void;
  addCandle: (candle: Candle) => void;
  updateCurrentCandle: (candle: Candle) => void;
  addTrade: (trade: Trade) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;

  // Historical data actions
  setLoadingHistory: (loading: boolean) => void;
  setHistoryError: (error: string | null) => void;
  prependCandles: (candles: Candle[]) => void;
  setHasMoreHistory: (hasMore: boolean) => void;
}

const MAX_CANDLES = 1000;
const MAX_TRADES = 500;

export const useMarketStore = create<MarketState>((set) => ({
  symbol: 'BTCUSDT',
  timeframe: '1m',
  currentPrice: 0,
  candles: [],
  trades: [],
  isConnected: false,
  isLoadingHistory: false,
  historyError: null,
  oldestLoadedTime: null,
  hasMoreHistory: true,

  setSymbol: (symbol) => set({
    symbol,
    candles: [],
    trades: [],
    oldestLoadedTime: null,
    hasMoreHistory: true,
    historyError: null,
  }),

  setTimeframe: (timeframe) => set({
    timeframe,
    candles: [],
    trades: [],
    oldestLoadedTime: null,
    hasMoreHistory: true,
    historyError: null,
  }),

  setCurrentPrice: (price) => set({ currentPrice: price }),

  setCandles: (candles) => {
    const sortedCandles = candles.slice(-MAX_CANDLES).sort((a, b) => a.time - b.time);
    return set({
      candles: sortedCandles,
      oldestLoadedTime: sortedCandles.length > 0 ? sortedCandles[0].time : null,
    });
  },

  addCandle: (candle) =>
    set((state) => ({
      candles: [...state.candles.slice(-(MAX_CANDLES - 1)), candle],
    })),

  updateCurrentCandle: (candle) =>
    set((state) => {
      const candles = [...state.candles];
      if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        if (lastCandle.time === candle.time) {
          candles[candles.length - 1] = candle;
        } else {
          candles.push(candle);
          if (candles.length > MAX_CANDLES) {
            candles.shift();
          }
        }
      } else {
        candles.push(candle);
      }
      return {
        candles,
        currentPrice: candle.close,
      };
    }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [...state.trades.slice(-(MAX_TRADES - 1)), trade],
      currentPrice: trade.price,
    })),

  setConnected: (connected) => set({ isConnected: connected }),

  reset: () =>
    set({
      currentPrice: 0,
      candles: [],
      trades: [],
      isConnected: false,
      isLoadingHistory: false,
      historyError: null,
      oldestLoadedTime: null,
      hasMoreHistory: true,
    }),

  // Historical data actions
  setLoadingHistory: (loading) => set({ isLoadingHistory: loading }),

  setHistoryError: (error) => set({ historyError: error }),

  setHasMoreHistory: (hasMore) => set({ hasMoreHistory: hasMore }),

  prependCandles: (newCandles) =>
    set((state) => {
      if (newCandles.length === 0) {
        return { hasMoreHistory: false };
      }

      // Merge and deduplicate candles
      const allCandles = [...newCandles, ...state.candles];
      const uniqueMap = new Map<number, Candle>();
      allCandles.forEach((c) => uniqueMap.set(c.time, c));

      // Sort by time and limit
      const mergedCandles = Array.from(uniqueMap.values())
        .sort((a, b) => a.time - b.time)
        .slice(-MAX_CANDLES);

      return {
        candles: mergedCandles,
        oldestLoadedTime: mergedCandles.length > 0 ? mergedCandles[0].time : null,
        hasMoreHistory: newCandles.length > 0,
      };
    }),
}));
