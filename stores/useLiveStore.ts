/**
 * useLiveStore
 *
 * Zustand store for real-time Tradovate market data.
 * Populated by useTradovatePanel hook which connects to TradovateWS.
 * Consumed by DOMladder, LiveTape, and the live trading panel.
 */

import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Quote {
  bid: number;
  ask: number;
  last: number;
  bidSize: number;
  askSize: number;
}

export interface DOMLevel {
  price: number;
  size: number;
}

export interface DOMSnapshot {
  bids: DOMLevel[];   // Sorted descending (best bid first)
  offers: DOMLevel[]; // Sorted ascending (best ask first)
  timestamp: string;
}

export interface Trade {
  id: string;
  price: number;
  size: number;
  time: number; // Unix ms
  side: 'buy' | 'sell';
}

export interface FootprintLevel {
  buyVol: number;
  sellVol: number;
}

export interface LiveCandle {
  time: number;    // Unix seconds (bar start)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;   // buyVolume - sellVolume
  footprint: Record<string, FootprintLevel>; // price → volumes
}

// Max tape entries to keep in memory (prevents unbounded growth)
const MAX_TRADES = 200;
// Max history candles to keep
const MAX_CANDLES = 500;

interface LiveStore {
  symbol: string;
  status: ConnectionStatus;
  quote: Quote | null;
  dom: DOMSnapshot | null;
  trades: Trade[];        // Most recent first
  candles: LiveCandle[];  // Oldest first (historical + live)

  setSymbol: (symbol: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  updateQuote: (quote: Quote) => void;
  updateDOM: (dom: DOMSnapshot) => void;
  addTrade: (trade: Trade) => void;
  upsertCandle: (candle: LiveCandle) => void;
  setHistory: (candles: LiveCandle[]) => void;
  reset: () => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  symbol: 'NQ',
  status: 'disconnected',
  quote: null,
  dom: null,
  trades: [],
  candles: [],

  setSymbol: (symbol) =>
    set({ symbol, quote: null, dom: null, trades: [], candles: [] }),

  setStatus: (status) => set({ status }),

  updateQuote: (quote) => set({ quote }),

  updateDOM: (dom) => set({ dom }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades].slice(0, MAX_TRADES),
    })),

  upsertCandle: (candle) =>
    set((state) => {
      const candles = [...state.candles];
      const idx = candles.findIndex((c) => c.time === candle.time);
      if (idx >= 0) {
        candles[idx] = candle;
      } else {
        candles.push(candle);
        if (candles.length > MAX_CANDLES) candles.shift();
      }
      return { candles };
    }),

  setHistory: (candles) =>
    set({ candles: candles.slice(-MAX_CANDLES) }),

  reset: () =>
    set({ quote: null, dom: null, trades: [], candles: [], status: 'disconnected' }),
}));
