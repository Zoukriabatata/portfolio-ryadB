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

  // Volume Bubble orderflow settings
  volumeBubbleMode: 'total' | 'delta' | 'bid' | 'ask';
  volumeBubbleScaling: 'sqrt' | 'linear' | 'log';
  volumeBubbleMaxSize: number;
  volumeBubbleMinFilter: number;
  volumeBubbleOpacity: number;
  volumeBubblePositiveColor: string;
  volumeBubbleNegativeColor: string;
  volumeBubbleNormalization: 'session' | 'visible' | 'rolling';
  volumeBubbleShowPieChart: boolean;

  // Cluster overlay
  showClusterOverlay: boolean;
  clusterOverlayOpacity: number;

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

  // VP Engine settings
  vpHistoryDepth: number; // minutes (default 240 = 4h)
  vpProfileMode: 'session' | 'visible' | 'custom' | 'daily';
  vpCustomRangeMinutes: number;
  vpGradientEnabled: boolean;
  vpAskGradientEnd: string; // low-volume end color
  vpBidGradientEnd: string; // low-volume end color

  setVPSetting: <K extends keyof PreferencesState>(key: K, value: PreferencesState[K]) => void;

  // Long/Short position tool settings
  posTpColor: string;
  posSlColor: string;
  posEntryColor: string;
  posZoneOpacity: number;
  posShowZoneFill: boolean;
  posShowLabels: boolean;
  posDefaultCompact: boolean;
  posSmartArrow: boolean;
  posDynamicOpacity: boolean;
  posOpacityCurve: 'linear' | 'exponential' | 'aggressive';
  posOpacityIntensity: number; // 0-100
  posArrowExponent: number;    // 1.0-3.0
  posArrowIntensity: number;   // 0-100
  posArrowThickness: number;   // 1-3
  posArrowFill: boolean;
  posProgressTrail: boolean;   // Trail behind arrow
  posTrailIntensity: number;   // 0-100
  posHeatFill: boolean;        // Progressive zone heat fill
  posHeatIntensity: number;    // 0-100
  posTimeWeight: number;       // 0-100 (time weight %, price = 100 - this)
  posGradientMode: 'static' | 'dynamic' | 'heat'; // Zone fill gradient mode

  // Volume bar appearance
  volumeBarBullColor: string;
  volumeBarBearColor: string;
  volumeBarOpacity: number;

  // Price line settings
  showCurrentPriceLine: boolean;
  priceLineStyle: 'dashed' | 'solid' | 'dotted';
  priceLineWidth: number;
  priceLineColor: string; // '' = auto from theme
  priceLineOpacity: number;
  priceLabelBgColor: string; // '' = auto green/red
  priceLabelTextColor: string; // 'auto' = WCAG contrast
  priceLabelOpacity: number;
  priceLabelBorderRadius: number;
  setShowCurrentPriceLine: (show: boolean) => void;
  setPriceLineStyle: (style: 'dashed' | 'solid' | 'dotted') => void;
  setPriceLineWidth: (width: number) => void;
  setPriceLineColor: (color: string) => void;
  setPriceLineOpacity: (opacity: number) => void;
  setPriceLabelBgColor: (color: string) => void;
  setPriceLabelTextColor: (color: string) => void;
  setPriceLabelOpacity: (opacity: number) => void;
  setPriceLabelBorderRadius: (radius: number) => void;

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
      showVolumeBubbles: true,
      showGrid: true,
      showCrosshairTooltip: true,
      volumeMode: 'classic',
      showVolumeProfile: false,

      // Volume Bubble orderflow defaults
      volumeBubbleMode: 'total',
      volumeBubbleScaling: 'sqrt',
      volumeBubbleMaxSize: 30,
      volumeBubbleMinFilter: 0,
      volumeBubbleOpacity: 0.6,
      volumeBubblePositiveColor: '#22c55e',
      volumeBubbleNegativeColor: '#ef4444',
      volumeBubbleNormalization: 'visible',
      volumeBubbleShowPieChart: false,
      // Cluster overlay defaults
      showClusterOverlay: false,
      clusterOverlayOpacity: 0.8,

      // VP Level Lines defaults
      vpPocEnabled: true, vpPocColor: '#f59e0b', vpPocWidth: 1.5, vpPocStyle: 'solid', vpPocLabel: true,
      vpVahEnabled: true, vpVahColor: '#3b82f6', vpVahWidth: 1, vpVahStyle: 'dashed', vpVahLabel: true,
      vpValEnabled: true, vpValColor: '#3b82f6', vpValWidth: 1, vpValStyle: 'dashed', vpValLabel: true,
      // VP Panel defaults
      vpBidColor: '#ef4444', vpAskColor: '#22c55e', vpBarOpacity: 0.6,
      vpShowBackground: false, vpBackgroundColor: '#3b82f6', vpBackgroundOpacity: 0.05,

      // VP Engine defaults
      vpHistoryDepth: 240,
      vpProfileMode: 'daily',
      vpCustomRangeMinutes: 240,
      vpGradientEnabled: false,
      vpAskGradientEnd: '#0a3d1a',
      vpBidGradientEnd: '#3d0a0a',

      // Long/Short position tool defaults
      posTpColor: '#22c55e',
      posSlColor: '#ef4444',
      posEntryColor: '#a3a3a3',
      posZoneOpacity: 0.12,
      posShowZoneFill: true,
      posShowLabels: false,
      posDefaultCompact: true,
      posSmartArrow: true,
      posDynamicOpacity: true,
      posOpacityCurve: 'exponential' as const,
      posOpacityIntensity: 60,
      posArrowExponent: 1.6,
      posArrowIntensity: 50,
      posArrowThickness: 1.4,
      posArrowFill: true,
      posProgressTrail: true,
      posTrailIntensity: 25,
      posHeatFill: true,
      posHeatIntensity: 40,
      posTimeWeight: 60,
      posGradientMode: 'dynamic' as const,

      // Volume bar appearance
      volumeBarBullColor: '#22c55e',
      volumeBarBearColor: '#ef4444',
      volumeBarOpacity: 0.4,

      showCurrentPriceLine: true,
      priceLineStyle: 'dashed',
      priceLineWidth: 1,
      priceLineColor: '',
      priceLineOpacity: 1,
      priceLabelBgColor: '',
      priceLabelTextColor: 'auto',
      priceLabelOpacity: 1,
      priceLabelBorderRadius: 0,
      confirmOrders: true,
      defaultOrderType: 'market',

      setShowCurrentPriceLine: (showCurrentPriceLine) => set({ showCurrentPriceLine }),
      setPriceLineStyle: (priceLineStyle) => set({ priceLineStyle }),
      setPriceLineWidth: (priceLineWidth) => set({ priceLineWidth: Math.max(1, Math.min(4, priceLineWidth)) }),
      setPriceLineColor: (priceLineColor) => set({ priceLineColor }),
      setPriceLineOpacity: (priceLineOpacity) => set({ priceLineOpacity: Math.max(0.1, Math.min(1, priceLineOpacity)) }),
      setPriceLabelBgColor: (priceLabelBgColor) => set({ priceLabelBgColor }),
      setPriceLabelTextColor: (priceLabelTextColor) => set({ priceLabelTextColor }),
      setPriceLabelOpacity: (priceLabelOpacity) => set({ priceLabelOpacity: Math.max(0.5, Math.min(1, priceLabelOpacity)) }),
      setPriceLabelBorderRadius: (priceLabelBorderRadius) => set({ priceLabelBorderRadius: Math.max(0, Math.min(8, priceLabelBorderRadius)) }),
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
        volumeBubbleMode: s.volumeBubbleMode, volumeBubbleScaling: s.volumeBubbleScaling,
        volumeBubbleMaxSize: s.volumeBubbleMaxSize, volumeBubbleMinFilter: s.volumeBubbleMinFilter,
        volumeBubbleOpacity: s.volumeBubbleOpacity, volumeBubblePositiveColor: s.volumeBubblePositiveColor,
        volumeBubbleNegativeColor: s.volumeBubbleNegativeColor, volumeBubbleNormalization: s.volumeBubbleNormalization,
        volumeBubbleShowPieChart: s.volumeBubbleShowPieChart,
        showClusterOverlay: s.showClusterOverlay, clusterOverlayOpacity: s.clusterOverlayOpacity,
        vpPocEnabled: s.vpPocEnabled, vpPocColor: s.vpPocColor, vpPocWidth: s.vpPocWidth, vpPocStyle: s.vpPocStyle, vpPocLabel: s.vpPocLabel,
        vpVahEnabled: s.vpVahEnabled, vpVahColor: s.vpVahColor, vpVahWidth: s.vpVahWidth, vpVahStyle: s.vpVahStyle, vpVahLabel: s.vpVahLabel,
        vpValEnabled: s.vpValEnabled, vpValColor: s.vpValColor, vpValWidth: s.vpValWidth, vpValStyle: s.vpValStyle, vpValLabel: s.vpValLabel,
        vpBidColor: s.vpBidColor, vpAskColor: s.vpAskColor, vpBarOpacity: s.vpBarOpacity,
        vpShowBackground: s.vpShowBackground, vpBackgroundColor: s.vpBackgroundColor, vpBackgroundOpacity: s.vpBackgroundOpacity,
        vpHistoryDepth: s.vpHistoryDepth, vpProfileMode: s.vpProfileMode, vpCustomRangeMinutes: s.vpCustomRangeMinutes,
        vpGradientEnabled: s.vpGradientEnabled, vpAskGradientEnd: s.vpAskGradientEnd, vpBidGradientEnd: s.vpBidGradientEnd,
        posTpColor: s.posTpColor, posSlColor: s.posSlColor, posEntryColor: s.posEntryColor,
        posZoneOpacity: s.posZoneOpacity, posShowZoneFill: s.posShowZoneFill,
        posShowLabels: s.posShowLabels, posDefaultCompact: s.posDefaultCompact,
        posSmartArrow: s.posSmartArrow, posDynamicOpacity: s.posDynamicOpacity,
        posOpacityCurve: s.posOpacityCurve, posOpacityIntensity: s.posOpacityIntensity,
        posArrowExponent: s.posArrowExponent, posArrowIntensity: s.posArrowIntensity,
        posArrowThickness: s.posArrowThickness, posArrowFill: s.posArrowFill,
        posProgressTrail: s.posProgressTrail, posTrailIntensity: s.posTrailIntensity,
        posHeatFill: s.posHeatFill, posHeatIntensity: s.posHeatIntensity, posTimeWeight: s.posTimeWeight,
        posGradientMode: s.posGradientMode,
        volumeBarBullColor: s.volumeBarBullColor, volumeBarBearColor: s.volumeBarBearColor, volumeBarOpacity: s.volumeBarOpacity,
        showCurrentPriceLine: s.showCurrentPriceLine,
        priceLineStyle: s.priceLineStyle,
        priceLineWidth: s.priceLineWidth,
        priceLineColor: s.priceLineColor,
        priceLineOpacity: s.priceLineOpacity,
        priceLabelBgColor: s.priceLabelBgColor,
        priceLabelTextColor: s.priceLabelTextColor,
        priceLabelOpacity: s.priceLabelOpacity,
        priceLabelBorderRadius: s.priceLabelBorderRadius,
        confirmOrders: s.confirmOrders,
        defaultOrderType: s.defaultOrderType,
      }),
    }
  )
);
