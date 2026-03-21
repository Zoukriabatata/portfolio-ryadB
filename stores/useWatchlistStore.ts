/**
 * WATCHLIST STORE
 * Tracks favorite symbols with live price data
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WatchlistCategory = 'crypto' | 'stocks' | 'futures' | 'forex';
export type CryptoSubCategory = 'top10' | 'defi' | 'layer1' | 'layer2' | 'meme';

export interface WatchlistItem {
  symbol: string;
  label: string;  // Display name (e.g., "BTC/USDT")
  category: WatchlistCategory;
  subCategory?: CryptoSubCategory;
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
  // Top 10
  { symbol: 'btcusdt', label: 'BTC/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'ethusdt', label: 'ETH/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'solusdt', label: 'SOL/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'xrpusdt', label: 'XRP/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'bnbusdt', label: 'BNB/USDT', category: 'crypto', subCategory: 'top10' },
  // Layer 1
  { symbol: 'avaxusdt', label: 'AVAX/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'suiusdt', label: 'SUI/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'aptusdt', label: 'APT/USDT', category: 'crypto', subCategory: 'layer1' },
  // Layer 2
  { symbol: 'arbusdt', label: 'ARB/USDT', category: 'crypto', subCategory: 'layer2' },
  { symbol: 'opusdt', label: 'OP/USDT', category: 'crypto', subCategory: 'layer2' },
  // DeFi
  { symbol: 'linkusdt', label: 'LINK/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'aaveusdt', label: 'AAVE/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'uniusdt', label: 'UNI/USDT', category: 'crypto', subCategory: 'defi' },
  // Meme
  { symbol: 'dogeusdt', label: 'DOGE/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'shibusdt', label: 'SHIB/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'pepeusdt', label: 'PEPE/USDT', category: 'crypto', subCategory: 'meme' },
];

/** All available symbols grouped by sub-category */
export const CRYPTO_CATEGORIES: Record<CryptoSubCategory, string> = {
  top10: 'Top 10',
  defi: 'DeFi',
  layer1: 'Layer 1',
  layer2: 'Layer 2',
  meme: 'Meme',
};

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
      skipHydration: true,
      partialize: (s) => ({ items: s.items }),
    }
  )
);
