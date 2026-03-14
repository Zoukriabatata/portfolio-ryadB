// Advanced Chart Types

import type { Time } from 'lightweight-charts';

export type DrawingTool =
  | 'cursor'
  | 'trendline'
  | 'horizontalLine'
  | 'rectangle'
  | 'fibonacci'
  | 'text';

export interface DrawingPoint {
  time: Time;
  price: number;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
}

export interface Drawing {
  id: string;
  type: DrawingTool;
  points: { price: number; time: number }[];
  style: DrawingStyle;
  visible: boolean;
  locked: boolean;
}

export interface Marker {
  id: string;
  time: number;
  price: number;
  label: string;
  type: 'support' | 'resistance' | 'orderBlock' | 'custom';
  color: string;
}

export interface ChartCoordinate {
  x: number;
  y: number;
}

export interface FibonacciLevel {
  ratio: number;
  label: string;
  price: number;
}

export const FIBONACCI_LEVELS: { ratio: number; label: string }[] = [
  { ratio: 0, label: '0%' },
  { ratio: 0.236, label: '23.6%' },
  { ratio: 0.382, label: '38.2%' },
  { ratio: 0.5, label: '50%' },
  { ratio: 0.618, label: '61.8%' },
  { ratio: 0.786, label: '78.6%' },
  { ratio: 1, label: '100%' },
  { ratio: 1.272, label: '127.2%' },
  { ratio: 1.618, label: '161.8%' },
];

export interface VolumeProfileBar {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  isPOC: boolean;
  isValueArea: boolean;
}

export interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

export type IndicatorType = 'VWAP' | 'TWAP';

export type IndicatorSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
export type IndicatorLineStyle = 'solid' | 'dashed' | 'dotted';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  enabled: boolean;
  params: Record<string, number>;
  style: {
    color: string;
    lineWidth: number;
    lineStyle?: IndicatorLineStyle;
    opacity?: number;         // 0-1, default 0.85
    showLabel?: boolean;      // show value label on chart
    source?: IndicatorSource; // price source for SMA/EMA
    fillOpacity?: number;     // BB fill opacity, VP bar opacity
    position?: 'left' | 'right'; // VP bar position
  };
  paneId?: string;  // 'main' or separate pane ID
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: 'vwap', type: 'VWAP', enabled: false, params: {}, style: { color: '#f59e0b', lineWidth: 2 }, paneId: 'main' },
  { id: 'twap', type: 'TWAP', enabled: false, params: {}, style: { color: '#3b82f6', lineWidth: 1.5 }, paneId: 'main' },
];

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 1,
  lineStyle: 'solid',
};
