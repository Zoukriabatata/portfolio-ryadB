/**
 * PREFERENCES STORE
 * Global user preferences: UI density, font size, trade colors, etc.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UIDensity = 'compact' | 'normal' | 'comfortable';

export interface TradeColorPreset {
  buy: string;
  sell: string;
  buyBg: string;
  sellBg: string;
}

const TRADE_COLOR_PRESETS: Record<string, TradeColorPreset> = {
  classic: {
    buy: '#34d399',
    sell: '#f87171',
    buyBg: 'rgba(16,185,129,0.06)',
    sellBg: 'rgba(239,68,68,0.06)',
  },
  vivid: {
    buy: '#22c55e',
    sell: '#ef4444',
    buyBg: 'rgba(34,197,94,0.08)',
    sellBg: 'rgba(239,68,68,0.08)',
  },
  blue_orange: {
    buy: '#3b82f6',
    sell: '#f97316',
    buyBg: 'rgba(59,130,246,0.06)',
    sellBg: 'rgba(249,115,22,0.06)',
  },
  cyan_pink: {
    buy: '#06b6d4',
    sell: '#ec4899',
    buyBg: 'rgba(6,182,212,0.06)',
    sellBg: 'rgba(236,72,153,0.06)',
  },
};

export { TRADE_COLOR_PRESETS };

export interface PreferencesState {
  // UI density
  density: UIDensity;
  setDensity: (density: UIDensity) => void;

  // Font size
  fontSize: number; // 10-16
  setFontSize: (size: number) => void;

  // Trade colors
  tradeColorPreset: string;
  customTradeColors: TradeColorPreset;
  setTradeColorPreset: (preset: string) => void;
  setCustomTradeColors: (colors: TradeColorPreset) => void;

  // Chart preferences
  showVolume: boolean;
  showGrid: boolean;
  showCrosshairTooltip: boolean;
  setShowVolume: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setShowCrosshairTooltip: (show: boolean) => void;

  // Trading preferences
  confirmOrders: boolean;
  defaultOrderType: 'market' | 'limit';
  setConfirmOrders: (confirm: boolean) => void;
  setDefaultOrderType: (type: 'market' | 'limit') => void;

}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      density: 'normal',
      fontSize: 12,
      tradeColorPreset: 'classic',
      customTradeColors: TRADE_COLOR_PRESETS.classic,
      showVolume: true,
      showGrid: true,
      showCrosshairTooltip: true,
      confirmOrders: true,
      defaultOrderType: 'market',

      setDensity: (density) => set({ density }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(10, Math.min(16, fontSize)) }),
      setTradeColorPreset: (preset) => set({ tradeColorPreset: preset }),
      setCustomTradeColors: (colors) => set({ customTradeColors: colors }),
      setShowVolume: (showVolume) => set({ showVolume }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setShowCrosshairTooltip: (showCrosshairTooltip) => set({ showCrosshairTooltip }),
      setConfirmOrders: (confirmOrders) => set({ confirmOrders }),
      setDefaultOrderType: (defaultOrderType) => set({ defaultOrderType }),
    }),
    {
      name: 'senzoukria-preferences',
      partialize: (s) => ({
        density: s.density,
        fontSize: s.fontSize,
        tradeColorPreset: s.tradeColorPreset,
        customTradeColors: s.customTradeColors,
        showVolume: s.showVolume,
        showGrid: s.showGrid,
        showCrosshairTooltip: s.showCrosshairTooltip,
        confirmOrders: s.confirmOrders,
        defaultOrderType: s.defaultOrderType,
      }),
    }
  )
);
