/**
 * CENTRALIZED SYMBOL & PRICE MANAGEMENT STORE
 *
 * Single source of truth for:
 * - Current active symbol
 * - Real-time price data
 * - Price history
 * - Symbol metadata
 *
 * Replaces scattered price management across components.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  change24h?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
}

export interface SymbolMetadata {
  symbol: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  minNotional: number;
  category: 'crypto' | 'futures' | 'options' | 'forex' | 'stocks';
}

interface SymbolPriceState {
  // Current active symbol
  activeSymbol: string;

  // Real-time prices by symbol
  prices: Record<string, PriceData>;

  // Symbol metadata cache
  symbolsMetadata: Record<string, SymbolMetadata>;

  // Price update subscribers
  subscribers: Set<(symbol: string, price: number) => void>;

  // Actions
  setActiveSymbol: (symbol: string) => void;
  updatePrice: (data: PriceData) => void;
  updatePrices: (dataArray: PriceData[]) => void;
  getPrice: (symbol: string) => number | null;
  getPriceData: (symbol: string) => PriceData | null;
  setSymbolMetadata: (metadata: SymbolMetadata) => void;
  subscribe: (callback: (symbol: string, price: number) => void) => () => void;
  clearPrices: () => void;
}

const DEFAULT_SYMBOL = 'btcusdt';

export const useSymbolPriceStore = create<SymbolPriceState>()(
  persist(
    (set, get) => ({
      activeSymbol: DEFAULT_SYMBOL,
      prices: {},
      symbolsMetadata: {},
      subscribers: new Set(),

      setActiveSymbol: (symbol: string) => {
        set({ activeSymbol: symbol.toLowerCase() });
      },

      updatePrice: (data: PriceData) => {
        const normalizedSymbol = data.symbol.toLowerCase();

        set((state) => ({
          prices: {
            ...state.prices,
            [normalizedSymbol]: {
              ...data,
              symbol: normalizedSymbol,
            },
          },
        }));

        // Notify subscribers
        const { subscribers } = get();
        subscribers.forEach((callback) => {
          try {
            callback(normalizedSymbol, data.price);
          } catch (error) {
            console.error('[SymbolPriceStore] Subscriber error:', error);
          }
        });
      },

      updatePrices: (dataArray: PriceData[]) => {
        set((state) => {
          const newPrices = { ...state.prices };

          dataArray.forEach((data) => {
            const normalizedSymbol = data.symbol.toLowerCase();
            newPrices[normalizedSymbol] = {
              ...data,
              symbol: normalizedSymbol,
            };
          });

          return { prices: newPrices };
        });
      },

      getPrice: (symbol: string): number | null => {
        const normalizedSymbol = symbol.toLowerCase();
        const priceData = get().prices[normalizedSymbol];
        return priceData?.price ?? null;
      },

      getPriceData: (symbol: string): PriceData | null => {
        const normalizedSymbol = symbol.toLowerCase();
        return get().prices[normalizedSymbol] ?? null;
      },

      setSymbolMetadata: (metadata: SymbolMetadata) => {
        const normalizedSymbol = metadata.symbol.toLowerCase();

        set((state) => ({
          symbolsMetadata: {
            ...state.symbolsMetadata,
            [normalizedSymbol]: {
              ...metadata,
              symbol: normalizedSymbol,
            },
          },
        }));
      },

      subscribe: (callback: (symbol: string, price: number) => void) => {
        const { subscribers } = get();
        subscribers.add(callback);

        // Return unsubscribe function
        return () => {
          subscribers.delete(callback);
        };
      },

      clearPrices: () => {
        set({ prices: {} });
      },
    }),
    {
      name: 'senzoukria-symbol-price',
      // Only persist active symbol and metadata, not transient price data
      partialize: (state) => ({
        activeSymbol: state.activeSymbol,
        symbolsMetadata: state.symbolsMetadata,
      }),
    }
  )
);

// Selector hooks for better performance
export const useActiveSymbol = () => useSymbolPriceStore((state) => state.activeSymbol);
export const useSymbolPrice = (symbol: string) => useSymbolPriceStore((state) => state.getPrice(symbol));
export const useSymbolPriceData = (symbol: string) => useSymbolPriceStore((state) => state.getPriceData(symbol));
