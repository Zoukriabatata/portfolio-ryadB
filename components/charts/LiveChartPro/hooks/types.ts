import type { MutableRefObject } from 'react';
import type { CanvasChartEngine, ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import type { TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';
import type { InteractionController } from '@/lib/tools/InteractionController';
import type { ToolsEngine } from '@/lib/tools/ToolsEngine';
import type { ToolsRenderer } from '@/lib/tools/ToolsRenderer';

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SharedRefs {
  chartEngine: MutableRefObject<CanvasChartEngine | null>;
  chartContainer: MutableRefObject<HTMLDivElement | null>;
  chartCanvas: MutableRefObject<HTMLCanvasElement | null>;
  drawingCanvas: MutableRefObject<HTMLCanvasElement | null>;
  candles: MutableRefObject<ChartCandle[]>;
  currentPrice: MutableRefObject<number>;
  price: MutableRefObject<HTMLSpanElement | null>;
  tickCount: MutableRefObject<HTMLSpanElement | null>;
  statusDot: MutableRefObject<HTMLDivElement | null>;
  interactionController: MutableRefObject<InteractionController>;
  toolsEngine: MutableRefObject<ToolsEngine>;
  toolsRenderer: MutableRefObject<ToolsRenderer>;
  candleData: MutableRefObject<Map<number, OHLC>>;
  lastHistoryTime: MutableRefObject<number>;
  lastAlertCheck: MutableRefObject<number>;
  unsubscribers: MutableRefObject<(() => void)[]>;
  handleTimeframeChange: MutableRefObject<(tf: TimeframeSeconds) => void>;
  sessionHigh: MutableRefObject<number>;
  sessionLow: MutableRefObject<number>;
  pricePosition: MutableRefObject<HTMLDivElement | null>;
  pricePositionBar: MutableRefObject<HTMLDivElement | null>;
}

export interface CustomColors {
  background: string;
  candleUp: string;
  candleDown: string;
  wickUp: string;
  wickDown: string;
  priceLineColor: string;
}

export interface CrosshairSettings {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface CandleSettings {
  upColor: string;
  downColor: string;
  wickUp: string;
  wickDown: string;
  borderUp: string;
  borderDown: string;
}

export interface BackgroundSettings {
  color: string;
  showGrid: boolean;
  gridColor: string;
}

export interface EffectiveColors {
  background: string;
  candleUp: string;
  candleDown: string;
  wickUp: string;
  wickDown: string;
  priceLineColor: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  background: '',
  candleUp: '',
  candleDown: '',
  wickUp: '',
  wickDown: '',
  priceLineColor: '',
};

export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  color: '#6b7280',
  width: 1,
  style: 'dashed',
};

export const DEFAULT_CANDLE_SETTINGS: CandleSettings = {
  upColor: '#22c55e',
  downColor: '#ef4444',
  wickUp: '#22c55e',
  wickDown: '#ef4444',
  borderUp: '#22c55e',
  borderDown: '#ef4444',
};

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  color: '#0a0a0a',
  showGrid: true,
  gridColor: '#1a1a1a',
};
