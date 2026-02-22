/**
 * FUTURES METRICS STORE
 *
 * Zustand store pour les données spécifiques aux futures crypto :
 * - Mark Price / Index Price (WebSocket temps réel)
 * - Funding Rate (WebSocket temps réel)
 * - Liquidations (WebSocket temps réel)
 * - Open Interest (REST polling 30s)
 * - Long/Short Ratio (REST polling 30s)
 */

import { create } from 'zustand';
import type {
  MarkPriceUpdate,
  LiquidationEvent,
  LongShortRatio,
  TopTraderLongShortRatio,
} from '@/types/futures';

const MAX_LIQUIDATIONS = 100;
const MAX_OI_HISTORY = 60;
const MAX_LS_HISTORY = 60;

interface FuturesState {
  // Real-time (WebSocket)
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  estimatedSettlePrice: number;

  // Liquidations (circular buffer)
  liquidations: LiquidationEvent[];
  recentLiqBuyVolume: number;
  recentLiqSellVolume: number;

  // REST-polled data
  openInterest: number;
  openInterestValue: number;
  openInterestHistory: Array<{ time: number; value: number }>;

  // Long/Short ratios
  globalLongShortRatio: number;
  globalLongAccount: number;
  globalShortAccount: number;
  topTraderLongShortRatio: number;
  topTraderLongAccount: number;
  topTraderShortAccount: number;
  longShortHistory: Array<{ time: number; ratio: number }>;

  // Polling status
  isPolling: boolean;
  lastPollTime: number;
  metricsError: boolean;

  // Actions
  updateMarkPrice: (update: MarkPriceUpdate) => void;
  addLiquidation: (event: LiquidationEvent) => void;
  setOpenInterest: (oi: number, oiValue?: number) => void;
  setOpenInterestHistory: (history: Array<{ time: number; value: number }>) => void;
  setGlobalLongShort: (ratio: LongShortRatio) => void;
  setTopTraderLongShort: (ratio: TopTraderLongShortRatio) => void;
  addLongShortHistoryPoint: (point: { time: number; ratio: number }) => void;
  setPolling: (polling: boolean) => void;
  setMetricsError: (error: boolean) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  markPrice: 0,
  indexPrice: 0,
  fundingRate: 0,
  nextFundingTime: 0,
  estimatedSettlePrice: 0,
  liquidations: [] as LiquidationEvent[],
  recentLiqBuyVolume: 0,
  recentLiqSellVolume: 0,
  openInterest: 0,
  openInterestValue: 0,
  openInterestHistory: [] as Array<{ time: number; value: number }>,
  globalLongShortRatio: 0,
  globalLongAccount: 0,
  globalShortAccount: 0,
  topTraderLongShortRatio: 0,
  topTraderLongAccount: 0,
  topTraderShortAccount: 0,
  longShortHistory: [] as Array<{ time: number; ratio: number }>,
  isPolling: false,
  lastPollTime: 0,
  metricsError: false,
};

export const useFuturesStore = create<FuturesState>((set) => ({
  ...INITIAL_STATE,

  updateMarkPrice: (update) => set({
    markPrice: update.markPrice,
    indexPrice: update.indexPrice,
    fundingRate: update.fundingRate,
    nextFundingTime: update.nextFundingTime,
    estimatedSettlePrice: update.estimatedSettlePrice,
  }),

  addLiquidation: (event) => set((state) => {
    const newLiqs = [...state.liquidations, event].slice(-MAX_LIQUIDATIONS);
    return {
      liquidations: newLiqs,
      recentLiqBuyVolume: state.recentLiqBuyVolume +
        (event.side === 'BUY' ? event.quantity * event.averagePrice : 0),
      recentLiqSellVolume: state.recentLiqSellVolume +
        (event.side === 'SELL' ? event.quantity * event.averagePrice : 0),
    };
  }),

  setOpenInterest: (oi, oiValue) => set({
    openInterest: oi,
    ...(oiValue !== undefined ? { openInterestValue: oiValue } : {}),
    lastPollTime: Date.now(),
  }),

  setOpenInterestHistory: (history) => set({
    openInterestHistory: history.slice(-MAX_OI_HISTORY),
  }),

  setGlobalLongShort: (ratio) => set({
    globalLongShortRatio: ratio.longShortRatio,
    globalLongAccount: ratio.longAccount,
    globalShortAccount: ratio.shortAccount,
  }),

  setTopTraderLongShort: (ratio) => set({
    topTraderLongShortRatio: ratio.longShortRatio,
    topTraderLongAccount: ratio.longAccount,
    topTraderShortAccount: ratio.shortAccount,
  }),

  addLongShortHistoryPoint: (point) => set((state) => ({
    longShortHistory: [...state.longShortHistory, point].slice(-MAX_LS_HISTORY),
  })),

  setPolling: (polling) => set({ isPolling: polling }),

  setMetricsError: (error) => set({ metricsError: error }),

  reset: () => set(INITIAL_STATE),
}));
