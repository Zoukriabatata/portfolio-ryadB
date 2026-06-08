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
  ohlcOpen: MutableRefObject<HTMLSpanElement | null>;
  ohlcHigh: MutableRefObject<HTMLSpanElement | null>;
  ohlcLow: MutableRefObject<HTMLSpanElement | null>;
  ohlcClose: MutableRefObject<HTMLSpanElement | null>;
  footerVolume: MutableRefObject<HTMLSpanElement | null>;
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

// NOTE: these are static seed values for the user color-picker / saved
// templates (persisted), not live render colors — the canvas reads the live
// brand tokens via getThemeFromCSS() in useChartEngine. They must stay literal
// hex (the picker edits hex and themeColor() resolves to #000000 during SSR),
// so they're aligned to the brand palette instead of routed through themeColor().
export const DEFAULT_CROSSHAIR_SETTINGS: CrosshairSettings = {
  color: '#515878', // --text-muted
  width: 1,
  style: 'dashed',
};

export const DEFAULT_CANDLE_SETTINGS: CandleSettings = {
  upColor: '#26d97f',   // --bull
  downColor: '#f04f4f', // --bear
  wickUp: '#26d97f',
  wickDown: '#f04f4f',
  borderUp: '#26d97f',
  borderDown: '#f04f4f',
};

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  color: '#07080f', // --background
  showGrid: true,
  gridColor: '#15182a', // neutral grid, near --surface-elevated
};
