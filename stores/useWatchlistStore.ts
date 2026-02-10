/**
 * WATCHLIST STORE
 * Tracks favorite symbols with live price data
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WatchlistItem {
  symbol: string;
  label: string;  // Display name (e.g., "BTC/USDT")
  category: 'crypto' | 'stocks' | 'futures' | 'forex';
}

export interface WatchlistPriceData {
  price: number;
  prevPrice: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[]; // Last ~20 price points for mini chart
}

interface WatchlistState {
  items: WatchlistItem[];
  prices: Record<string, WatchlistPriceData>;
  addItem: (item: WatchlistItem) => void;
  removeItem: (symbol: string) => void;
  reorderItems: (items: WatchlistItem[]) => void;
  updatePrice: (symbol: string, data: Partial<WatchlistPriceData>) => void;
  isInWatchlist: (symbol: string) => boolean;
}

const DEFAULT_ITEMS: WatchlistItem[] = [
  { symbol: 'btcusdt', label: 'BTC/USDT', category: 'crypto' },
  { symbol: 'ethusdt', label: 'ETH/USDT', category: 'crypto' },
  { symbol: 'solusdt', label: 'SOL/USDT', category: 'crypto' },
  { symbol: 'xrpusdt', label: 'XRP/USDT', category: 'crypto' },
  { symbol: 'dogeusdt', label: 'DOGE/USDT', category: 'crypto' },
];

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: DEFAULT_ITEMS,
      prices: {},

      addItem: (item) =>
        set((s) => {
          if (s.items.some((i) => i.symbol === item.symbol)) return s;
          return { items: [...s.items, item] };
        }),

      removeItem: (symbol) =>
        set((s) => {
          const { [symbol]: _, ...remainingPrices } = s.prices;
          return {
            items: s.items.filter((i) => i.symbol !== symbol),
            prices: remainingPrices,
          };
        }),

      reorderItems: (items) => set({ items }),

      updatePrice: (symbol, data) =>
        set((s) => ({
          prices: {
            ...s.prices,
            [symbol]: { ...(s.prices[symbol] || { price: 0, prevPrice: 0, change24h: 0, changePercent24h: 0, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] }), ...data },
          },
        })),

      isInWatchlist: (symbol) => get().items.some((i) => i.symbol === symbol),
    }),
    {
      name: 'senzoukria-watchlist',
      partialize: (s) => ({ items: s.items }),
    }
  )
);
