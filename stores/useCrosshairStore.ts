/**
 * CROSSHAIR SETTINGS STORE
 *
 * Gère les paramètres de personnalisation du crosshair
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CrosshairLineStyle = 'solid' | 'dashed' | 'dotted';

export type MagnetMode = 'none' | 'ohlc' | 'close';

export interface CrosshairSettings {
  // Appearance
  color: string;
  lineWidth: number;
  lineStyle: CrosshairLineStyle;
  opacity: number;

  // Features
  showPriceLabel: boolean;
  showTimeLabel: boolean;
  showHorizontalLine: boolean;
  showVerticalLine: boolean;

  // Magnet/Snap settings
  magnetMode: MagnetMode;

  // Label style
  labelBackground: string;
  labelTextColor: string;

  // Actions
  setColor: (color: string) => void;
  setLineWidth: (width: number) => void;
  setLineStyle: (style: CrosshairLineStyle) => void;
  setOpacity: (opacity: number) => void;
  setShowPriceLabel: (show: boolean) => void;
  setShowTimeLabel: (show: boolean) => void;
  setShowHorizontalLine: (show: boolean) => void;
  setShowVerticalLine: (show: boolean) => void;
  setMagnetMode: (mode: MagnetMode) => void;
  setLabelBackground: (color: string) => void;
  setLabelTextColor: (color: string) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  color: '#6b7280',
  lineWidth: 1,
  lineStyle: 'dashed' as CrosshairLineStyle,
  opacity: 0.8,
  showPriceLabel: true,
  showTimeLabel: true,
  showHorizontalLine: true,
  showVerticalLine: true,
  magnetMode: 'none' as MagnetMode,
  labelBackground: '#1f2937',
  labelTextColor: '#ffffff',
};

export const useCrosshairStore = create<CrosshairSettings>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setColor: (color) => set({ color }),
      setLineWidth: (lineWidth) => set({ lineWidth }),
      setLineStyle: (lineStyle) => set({ lineStyle }),
      setOpacity: (opacity) => set({ opacity }),
      setShowPriceLabel: (showPriceLabel) => set({ showPriceLabel }),
      setShowTimeLabel: (showTimeLabel) => set({ showTimeLabel }),
      setShowHorizontalLine: (showHorizontalLine) => set({ showHorizontalLine }),
      setShowVerticalLine: (showVerticalLine) => set({ showVerticalLine }),
      setMagnetMode: (magnetMode) => set({ magnetMode }),
      setLabelBackground: (labelBackground) => set({ labelBackground }),
      setLabelTextColor: (labelTextColor) => set({ labelTextColor }),
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'crosshair-settings',
      partialize: (state) => ({
        color: state.color,
        lineWidth: state.lineWidth,
        lineStyle: state.lineStyle,
        opacity: state.opacity,
        showPriceLabel: state.showPriceLabel,
        showTimeLabel: state.showTimeLabel,
        showHorizontalLine: state.showHorizontalLine,
        showVerticalLine: state.showVerticalLine,
        magnetMode: state.magnetMode,
        labelBackground: state.labelBackground,
        labelTextColor: state.labelTextColor,
      }),
    }
  )
);
