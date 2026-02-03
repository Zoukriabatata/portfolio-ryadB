/**
 * TRADE STORE
 *
 * Gère les trades en temps réel pour la heatmap.
 * - Collecte les trades depuis le WebSocket
 * - Convertit en format TradeEvent pour le TradeFlowRenderer
 * - Nettoie automatiquement les trades anciens
 */

import { create } from 'zustand';
import type { Trade } from '@/types/market';
import type { TradeEvent } from '@/types/heatmap';

interface TradeState {
  // Trades bruts du WebSocket (format Binance)
  rawTrades: Trade[];

  // Trades convertis pour la heatmap
  tradeEvents: TradeEvent[];

  // Configuration
  maxTradeAgeMs: number;  // Durée de rétention (défaut: 60 secondes)
  maxTradesCount: number; // Nombre max de trades stockés

  // Stats
  recentBuyVolume: number;
  recentSellVolume: number;
  tradeCount: number;

  // Actions
  addTrade: (trade: Trade) => void;
  addTradeEvent: (event: TradeEvent) => void;
  cleanup: () => void;
  reset: () => void;
  setMaxTradeAge: (ms: number) => void;
}

const DEFAULT_MAX_TRADE_AGE = 60000;  // 60 secondes
const DEFAULT_MAX_TRADES = 1000;

export const useTradeStore = create<TradeState>((set, get) => ({
  rawTrades: [],
  tradeEvents: [],
  maxTradeAgeMs: DEFAULT_MAX_TRADE_AGE,
  maxTradesCount: DEFAULT_MAX_TRADES,
  recentBuyVolume: 0,
  recentSellVolume: 0,
  tradeCount: 0,

  addTrade: (trade: Trade) => {
    const state = get();

    // Convertit Trade en TradeEvent
    const tradeEvent: TradeEvent = {
      timestamp: trade.time,
      price: trade.price,
      volume: trade.quantity,
      side: trade.isBuyerMaker ? 'sell' : 'buy', // isBuyerMaker=true signifie que le taker est seller
      buyVolume: trade.isBuyerMaker ? 0 : trade.quantity,
      sellVolume: trade.isBuyerMaker ? trade.quantity : 0,
    };

    // Met à jour les volumes récents
    const newBuyVolume = state.recentBuyVolume + (tradeEvent.side === 'buy' ? trade.quantity : 0);
    const newSellVolume = state.recentSellVolume + (tradeEvent.side === 'sell' ? trade.quantity : 0);

    // Ajoute le trade
    const newRawTrades = [...state.rawTrades, trade];
    const newTradeEvents = [...state.tradeEvents, tradeEvent];

    // Limite le nombre de trades
    if (newRawTrades.length > state.maxTradesCount) {
      newRawTrades.shift();
    }
    if (newTradeEvents.length > state.maxTradesCount) {
      newTradeEvents.shift();
    }

    set({
      rawTrades: newRawTrades,
      tradeEvents: newTradeEvents,
      recentBuyVolume: newBuyVolume,
      recentSellVolume: newSellVolume,
      tradeCount: newTradeEvents.length,
    });
  },

  addTradeEvent: (event: TradeEvent) => {
    const state = get();

    const newTradeEvents = [...state.tradeEvents, event];
    if (newTradeEvents.length > state.maxTradesCount) {
      newTradeEvents.shift();
    }

    const newBuyVolume = state.recentBuyVolume + (event.side === 'buy' ? event.volume : 0);
    const newSellVolume = state.recentSellVolume + (event.side === 'sell' ? event.volume : 0);

    set({
      tradeEvents: newTradeEvents,
      recentBuyVolume: newBuyVolume,
      recentSellVolume: newSellVolume,
      tradeCount: newTradeEvents.length,
    });
  },

  cleanup: () => {
    const state = get();
    const now = Date.now();
    const cutoff = now - state.maxTradeAgeMs;

    // Filtre les trades trop anciens
    const filteredRaw = state.rawTrades.filter(t => t.time >= cutoff);
    const filteredEvents = state.tradeEvents.filter(t => t.timestamp >= cutoff);

    // Recalcule les volumes si on a supprimé des trades
    if (filteredEvents.length !== state.tradeEvents.length) {
      let buyVolume = 0;
      let sellVolume = 0;

      for (const trade of filteredEvents) {
        if (trade.side === 'buy') {
          buyVolume += trade.volume;
        } else {
          sellVolume += trade.volume;
        }
      }

      set({
        rawTrades: filteredRaw,
        tradeEvents: filteredEvents,
        recentBuyVolume: buyVolume,
        recentSellVolume: sellVolume,
        tradeCount: filteredEvents.length,
      });
    }
  },

  reset: () => {
    set({
      rawTrades: [],
      tradeEvents: [],
      recentBuyVolume: 0,
      recentSellVolume: 0,
      tradeCount: 0,
    });
  },

  setMaxTradeAge: (ms: number) => {
    set({ maxTradeAgeMs: ms });
  },
}));

// Hook pour le cleanup automatique
let cleanupInterval: NodeJS.Timeout | null = null;

export function startTradeCleanup(intervalMs: number = 5000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    useTradeStore.getState().cleanup();
  }, intervalMs);
}

export function stopTradeCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
