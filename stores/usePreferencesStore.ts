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
  showVolumeBubbles: boolean;
  showGrid: boolean;
  showCrosshairTooltip: boolean;
  setShowVolume: (show: boolean) => void;
  setShowVolumeBubbles: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setShowCrosshairTooltip: (show: boolean) => void;

  // Volume display mode
  volumeMode: 'classic' | 'bidask' | 'delta';
  showVolumeProfile: boolean;
  setVolumeMode: (mode: 'classic' | 'bidask' | 'delta') => void;
  setShowVolumeProfile: (show: boolean) => void;

  // VP Level Lines
  vpPocEnabled: boolean;
  vpPocColor: string;
  vpPocWidth: number;
  vpPocStyle: 'solid' | 'dashed';
  vpPocLabel: boolean;
  vpVahEnabled: boolean;
  vpVahColor: string;
  vpVahWidth: number;
  vpVahStyle: 'solid' | 'dashed';
  vpVahLabel: boolean;
  vpValEnabled: boolean;
  vpValColor: string;
  vpValWidth: number;
  vpValStyle: 'solid' | 'dashed';
  vpValLabel: boolean;

  // VP Panel colors
  vpBidColor: string;
  vpAskColor: string;
  vpBarOpacity: number;
  vpShowBackground: boolean;
  vpBackgroundColor: string;
  vpBackgroundOpacity: number;

  setVPSetting: <K extends keyof PreferencesState>(key: K, value: PreferencesState[K]) => void;

  // Long/Short position tool settings
  posTpColor: string;
  posSlColor: string;
  posEntryColor: string;
  posZoneOpacity: number;
  posShowZoneFill: boolean;
  posShowLabels: boolean;
  posDefaultCompact: boolean;

  // Price line settings
  showCurrentPriceLine: boolean;
  priceLineStyle: 'dashed' | 'solid';
  priceLineWidth: number;
  priceLineColor: string; // '' = auto from theme
  priceLabelBgColor: string; // '' = auto green/red
  priceLabelTextColor: string;
  priceLabelOpacity: number;
  setShowCurrentPriceLine: (show: boolean) => void;
  setPriceLineStyle: (style: 'dashed' | 'solid') => void;
  setPriceLineWidth: (width: number) => void;
  setPriceLineColor: (color: string) => void;
  setPriceLabelBgColor: (color: string) => void;
  setPriceLabelTextColor: (color: string) => void;
  setPriceLabelOpacity: (opacity: number) => void;

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
      showVolumeBubbles: false,
      showGrid: true,
      showCrosshairTooltip: true,
      volumeMode: 'classic',
      showVolumeProfile: false,

      // VP Level Lines defaults
      vpPocEnabled: true, vpPocColor: '#f59e0b', vpPocWidth: 1.5, vpPocStyle: 'solid', vpPocLabel: true,
      vpVahEnabled: true, vpVahColor: '#3b82f6', vpVahWidth: 1, vpVahStyle: 'dashed', vpVahLabel: true,
      vpValEnabled: true, vpValColor: '#3b82f6', vpValWidth: 1, vpValStyle: 'dashed', vpValLabel: true,
      // VP Panel defaults
      vpBidColor: '#ef4444', vpAskColor: '#22c55e', vpBarOpacity: 0.6,
      vpShowBackground: false, vpBackgroundColor: '#3b82f6', vpBackgroundOpacity: 0.05,

      // Long/Short position tool defaults
      posTpColor: '#22c55e',
      posSlColor: '#ef4444',
      posEntryColor: '#a3a3a3',
      posZoneOpacity: 0.08,
      posShowZoneFill: true,
      posShowLabels: false,
      posDefaultCompact: true,

      showCurrentPriceLine: true,
      priceLineStyle: 'dashed',
      priceLineWidth: 1,
      priceLineColor: '',
      priceLabelBgColor: '',
      priceLabelTextColor: '#ffffff',
      priceLabelOpacity: 1,
      confirmOrders: true,
      defaultOrderType: 'market',

      setShowCurrentPriceLine: (showCurrentPriceLine) => set({ showCurrentPriceLine }),
      setPriceLineStyle: (priceLineStyle) => set({ priceLineStyle }),
      setPriceLineWidth: (priceLineWidth) => set({ priceLineWidth: Math.max(1, Math.min(4, priceLineWidth)) }),
      setPriceLineColor: (priceLineColor) => set({ priceLineColor }),
      setPriceLabelBgColor: (priceLabelBgColor) => set({ priceLabelBgColor }),
      setPriceLabelTextColor: (priceLabelTextColor) => set({ priceLabelTextColor }),
      setPriceLabelOpacity: (priceLabelOpacity) => set({ priceLabelOpacity: Math.max(0.5, Math.min(1, priceLabelOpacity)) }),
      setVolumeMode: (volumeMode) => set({ volumeMode }),
      setShowVolumeProfile: (showVolumeProfile) => set({ showVolumeProfile }),
      setVPSetting: (key, value) => set({ [key]: value } as any),
      setDensity: (density) => set({ density }),
      setFontSize: (fontSize) => set({ fontSize: Math.max(10, Math.min(16, fontSize)) }),
      setTradeColorPreset: (preset) => set({ tradeColorPreset: preset }),
      setCustomTradeColors: (colors) => set({ customTradeColors: colors }),
      setShowVolume: (showVolume) => set({ showVolume }),
      setShowVolumeBubbles: (showVolumeBubbles) => set({ showVolumeBubbles }),
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
        showVolumeBubbles: s.showVolumeBubbles,
        showGrid: s.showGrid,
        showCrosshairTooltip: s.showCrosshairTooltip,
        volumeMode: s.volumeMode,
        showVolumeProfile: s.showVolumeProfile,
        vpPocEnabled: s.vpPocEnabled, vpPocColor: s.vpPocColor, vpPocWidth: s.vpPocWidth, vpPocStyle: s.vpPocStyle, vpPocLabel: s.vpPocLabel,
        vpVahEnabled: s.vpVahEnabled, vpVahColor: s.vpVahColor, vpVahWidth: s.vpVahWidth, vpVahStyle: s.vpVahStyle, vpVahLabel: s.vpVahLabel,
        vpValEnabled: s.vpValEnabled, vpValColor: s.vpValColor, vpValWidth: s.vpValWidth, vpValStyle: s.vpValStyle, vpValLabel: s.vpValLabel,
        vpBidColor: s.vpBidColor, vpAskColor: s.vpAskColor, vpBarOpacity: s.vpBarOpacity,
        vpShowBackground: s.vpShowBackground, vpBackgroundColor: s.vpBackgroundColor, vpBackgroundOpacity: s.vpBackgroundOpacity,
        posTpColor: s.posTpColor, posSlColor: s.posSlColor, posEntryColor: s.posEntryColor,
        posZoneOpacity: s.posZoneOpacity, posShowZoneFill: s.posShowZoneFill,
        posShowLabels: s.posShowLabels, posDefaultCompact: s.posDefaultCompact,
        showCurrentPriceLine: s.showCurrentPriceLine,
        priceLineStyle: s.priceLineStyle,
        priceLineWidth: s.priceLineWidth,
        priceLineColor: s.priceLineColor,
        priceLabelBgColor: s.priceLabelBgColor,
        priceLabelTextColor: s.priceLabelTextColor,
        priceLabelOpacity: s.priceLabelOpacity,
        confirmOrders: s.confirmOrders,
        defaultOrderType: s.defaultOrderType,
      }),
    }
  )
);
