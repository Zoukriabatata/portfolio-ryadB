'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CanvasChartEngine, type ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import {
  getAggregator,
  resetAggregator,
  type LiveCandle,
  type TimeframeSeconds,
  TIMEFRAME_LABELS,
} from '@/lib/live/HierarchicalAggregator';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { getIBLiveWS } from '@/lib/live/IBLiveWS';
import { isCMESymbol, loadYahooHistory } from '@/lib/live/YahooHistoryLoader';
import { useThemeStore } from '@/stores/useThemeStore';
import { THEMES } from '@/lib/themes/ThemeSystem';
import {
  getDrawingToolsManager,
  DRAWING_TOOLS,
  TOOL_GROUPS,
  type ToolType,
  type DrawingObject,
} from '@/lib/live/DrawingTools';
import {
  getToolsEngine,
  type ToolType as EngineToolType,
} from '@/lib/tools/ToolsEngine';
import { getToolsRenderer, type RenderContext } from '@/lib/tools/ToolsRenderer';
import { getInteractionController } from '@/lib/tools/InteractionController';
import { ContextMenu, createChartContextMenuItems, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import ToolSettingsBar from '@/components/tools/ToolSettingsBar';
import AdvancedToolSettingsModal from '@/components/tools/AdvancedToolSettingsModal';
import AdvancedChartSettings from '@/components/settings/AdvancedChartSettings';
import FavoritesToolbar from '@/components/tools/FavoritesToolbar';
import { useFavoritesToolbarStore } from '@/stores/useFavoritesToolbarStore';
import { type Tool } from '@/lib/tools/ToolsEngine';
import {
  CursorIcon,
  CrosshairIcon,
  TrendlineIcon,
  HLineIcon,
  VLineIcon,
  RectangleIcon,
  FibonacciIcon,
  TextIcon,
  BrushIcon,
  IndicatorIcon,
  SettingsIcon,
  TrashIcon,
  MoreIcon,
  MagnetIcon,
  CryptoIcon,
  StocksIcon,
  FuturesIcon,
  ForexIcon,
  IndicesIcon,
  OptionsIcon,
  RayIcon,
  ChannelIcon,
  ArrowIcon,
  HighlighterIcon,
  MeasureIcon,
  LongPositionIcon,
  ShortPositionIcon,
} from '@/components/ui/Icons';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { PriceCountdownCompact } from '@/components/trading/PriceCountdown';

/**
 * LIVE CHART PRO - Full-featured trading chart
 * - Multiple asset classes
 * - Drawing tools
 * - Indicators
 * - Color customization
 */

interface LiveChartProProps {
  className?: string;
  onSymbolChange?: (symbol: string) => void;
}

// Asset categories
type AssetCategory = 'crypto' | 'stocks' | 'futures' | 'forex' | 'indices' | 'options';

const ASSET_CATEGORY_ICONS: Record<AssetCategory, React.FC<{ size?: number; color?: string }>> = {
  crypto: CryptoIcon,
  stocks: StocksIcon,
  futures: FuturesIcon,
  forex: ForexIcon,
  indices: IndicesIcon,
  options: OptionsIcon,
};

// Map tool types to custom icon components
const TOOL_ICONS: Partial<Record<ToolType, React.FC<{ size?: number; color?: string }>>> = {
  cursor: CursorIcon,
  crosshair: CrosshairIcon,
  trendline: TrendlineIcon,
  ray: RayIcon,
  hline: HLineIcon,
  vline: VLineIcon,
  rectangle: RectangleIcon,
  parallelChannel: ChannelIcon,
  fibonacciRetracement: FibonacciIcon,
  fibonacciExtension: FibonacciIcon,
  text: TextIcon,
  arrow: ArrowIcon,
  brush: BrushIcon,
  highlighter: HighlighterIcon,
  measure: MeasureIcon,
  longPosition: LongPositionIcon,
  shortPosition: ShortPositionIcon,
};

const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'futures', label: 'Futures' },
  { id: 'forex', label: 'Forex' },
  { id: 'indices', label: 'Indices' },
  { id: 'options', label: 'Options' },
];

// Symbol categories by asset type
const SYMBOL_CATEGORIES_BY_ASSET: Record<AssetCategory, Record<string, { value: string; label: string; exchange?: string }[]>> = {
  crypto: {
    'Major': [
      { value: 'btcusdt', label: 'BTC/USDT' },
      { value: 'ethusdt', label: 'ETH/USDT' },
      { value: 'bnbusdt', label: 'BNB/USDT' },
      { value: 'solusdt', label: 'SOL/USDT' },
      { value: 'xrpusdt', label: 'XRP/USDT' },
      { value: 'adausdt', label: 'ADA/USDT' },
      { value: 'dogeusdt', label: 'DOGE/USDT' },
      { value: 'avaxusdt', label: 'AVAX/USDT' },
    ],
    'DeFi': [
      { value: 'linkusdt', label: 'LINK/USDT' },
      { value: 'uniusdt', label: 'UNI/USDT' },
      { value: 'aaveusdt', label: 'AAVE/USDT' },
      { value: 'mkrusdt', label: 'MKR/USDT' },
    ],
    'Layer 2': [
      { value: 'arbusdt', label: 'ARB/USDT' },
      { value: 'opusdt', label: 'OP/USDT' },
      { value: 'maticusdt', label: 'MATIC/USDT' },
    ],
    'Meme': [
      { value: 'shibusdt', label: 'SHIB/USDT' },
      { value: 'pepeusdt', label: 'PEPE/USDT' },
      { value: 'dogeusdt', label: 'DOGE/USDT' },
    ],
  },
  stocks: {
    'Tech': [
      { value: 'AAPL', label: 'Apple', exchange: 'NASDAQ' },
      { value: 'MSFT', label: 'Microsoft', exchange: 'NASDAQ' },
      { value: 'GOOGL', label: 'Alphabet', exchange: 'NASDAQ' },
      { value: 'AMZN', label: 'Amazon', exchange: 'NASDAQ' },
      { value: 'NVDA', label: 'NVIDIA', exchange: 'NASDAQ' },
      { value: 'META', label: 'Meta', exchange: 'NASDAQ' },
      { value: 'TSLA', label: 'Tesla', exchange: 'NASDAQ' },
    ],
    'Finance': [
      { value: 'JPM', label: 'JPMorgan', exchange: 'NYSE' },
      { value: 'BAC', label: 'Bank of America', exchange: 'NYSE' },
      { value: 'GS', label: 'Goldman Sachs', exchange: 'NYSE' },
      { value: 'V', label: 'Visa', exchange: 'NYSE' },
    ],
    'Healthcare': [
      { value: 'JNJ', label: 'Johnson & Johnson', exchange: 'NYSE' },
      { value: 'UNH', label: 'UnitedHealth', exchange: 'NYSE' },
      { value: 'PFE', label: 'Pfizer', exchange: 'NYSE' },
    ],
  },
  futures: {
    'Index Futures': [
      { value: 'ES', label: 'E-mini S&P 500', exchange: 'CME' },
      { value: 'NQ', label: 'E-mini Nasdaq', exchange: 'CME' },
      { value: 'YM', label: 'E-mini Dow', exchange: 'CBOT' },
      { value: 'RTY', label: 'E-mini Russell', exchange: 'CME' },
    ],
    'Commodities': [
      { value: 'GC', label: 'Gold', exchange: 'COMEX' },
      { value: 'SI', label: 'Silver', exchange: 'COMEX' },
      { value: 'CL', label: 'Crude Oil', exchange: 'NYMEX' },
      { value: 'NG', label: 'Natural Gas', exchange: 'NYMEX' },
    ],
    'Bonds': [
      { value: 'ZB', label: '30Y T-Bond', exchange: 'CBOT' },
      { value: 'ZN', label: '10Y T-Note', exchange: 'CBOT' },
      { value: 'ZF', label: '5Y T-Note', exchange: 'CBOT' },
    ],
  },
  forex: {
    'Majors': [
      { value: 'EURUSD', label: 'EUR/USD' },
      { value: 'GBPUSD', label: 'GBP/USD' },
      { value: 'USDJPY', label: 'USD/JPY' },
      { value: 'USDCHF', label: 'USD/CHF' },
      { value: 'AUDUSD', label: 'AUD/USD' },
      { value: 'USDCAD', label: 'USD/CAD' },
    ],
    'Crosses': [
      { value: 'EURGBP', label: 'EUR/GBP' },
      { value: 'EURJPY', label: 'EUR/JPY' },
      { value: 'GBPJPY', label: 'GBP/JPY' },
      { value: 'AUDJPY', label: 'AUD/JPY' },
    ],
    'Exotics': [
      { value: 'USDMXN', label: 'USD/MXN' },
      { value: 'USDZAR', label: 'USD/ZAR' },
      { value: 'USDTRY', label: 'USD/TRY' },
    ],
  },
  indices: {
    'US Indices': [
      { value: 'SPX', label: 'S&P 500' },
      { value: 'NDX', label: 'Nasdaq 100' },
      { value: 'DJI', label: 'Dow Jones' },
      { value: 'RUT', label: 'Russell 2000' },
      { value: 'VIX', label: 'VIX' },
    ],
    'European': [
      { value: 'DAX', label: 'DAX 40' },
      { value: 'FTSE', label: 'FTSE 100' },
      { value: 'CAC', label: 'CAC 40' },
    ],
    'Asian': [
      { value: 'NI225', label: 'Nikkei 225' },
      { value: 'HSI', label: 'Hang Seng' },
      { value: 'SSEC', label: 'Shanghai' },
    ],
  },
  options: {
    'Index Options': [
      { value: 'SPY', label: 'SPY Options' },
      { value: 'QQQ', label: 'QQQ Options' },
      { value: 'IWM', label: 'IWM Options' },
      { value: 'DIA', label: 'DIA Options' },
    ],
    'Stock Options': [
      { value: 'AAPL_OPT', label: 'AAPL Options' },
      { value: 'TSLA_OPT', label: 'TSLA Options' },
      { value: 'NVDA_OPT', label: 'NVDA Options' },
      { value: 'AMD_OPT', label: 'AMD Options' },
    ],
    'Volatility': [
      { value: 'UVXY', label: 'UVXY' },
      { value: 'SVXY', label: 'SVXY' },
      { value: 'VXX', label: 'VXX' },
    ],
  },
};

// Current category symbols (will change based on selected asset category)
const SYMBOL_CATEGORIES = SYMBOL_CATEGORIES_BY_ASSET.crypto;

// Flatten for quick access
const SYMBOLS = Object.values(SYMBOL_CATEGORIES).flat();

// Indicators
type IndicatorType = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'vwap' | 'atr';

interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period: number;
  color: string;
  visible: boolean;
}

const INDICATOR_PRESETS: { type: IndicatorType; label: string; defaultPeriod: number; description: string }[] = [
  { type: 'sma', label: 'SMA', defaultPeriod: 20, description: 'Simple Moving Average' },
  { type: 'ema', label: 'EMA', defaultPeriod: 21, description: 'Exponential Moving Average' },
  { type: 'rsi', label: 'RSI', defaultPeriod: 14, description: 'Relative Strength Index' },
  { type: 'macd', label: 'MACD', defaultPeriod: 12, description: 'Moving Average Convergence Divergence' },
  { type: 'bollinger', label: 'Bollinger', defaultPeriod: 20, description: 'Bollinger Bands' },
  { type: 'vwap', label: 'VWAP', defaultPeriod: 1, description: 'Volume Weighted Avg Price' },
  { type: 'atr', label: 'ATR', defaultPeriod: 14, description: 'Average True Range' },
];

// Color presets for customization
const COLOR_PRESETS = {
  candles: {
    bullish: ['#26a69a', '#22c55e', '#10b981', '#00e676', '#4ade80', '#16a34a'],
    bearish: ['#ef5350', '#f44336', '#e11d48', '#dc2626', '#f87171', '#be123c'],
  },
  background: ['#0a0a0a', '#0d1117', '#1a1a2e', '#16213e', '#0f0f23', '#121212', '#1e1e2f', '#0d0d0d'],
  indicators: ['#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#FFEB3B', '#4CAF50', '#FF5722'],
};

const TF_GROUPS = {
  seconds: [15, 30] as TimeframeSeconds[],
  minutes: [60, 180, 300, 900, 1800] as TimeframeSeconds[],
  hours: [3600, 14400] as TimeframeSeconds[],
  days: [86400] as TimeframeSeconds[],
};

// Map timeframe to Binance interval
const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
};

export default function LiveChartPro({ className, onSymbolChange }: LiveChartProProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartEngineRef = useRef<CanvasChartEngine | null>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const tickCountRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);

  // Store candles for coordinate conversion
  const candlesRef = useRef<ChartCandle[]>([]);

  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Asset category state
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('crypto');

  // New state for enhanced features
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [showIndicatorsPanel, setShowIndicatorsPanel] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [showCustomizePanel, setShowCustomizePanel] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettingsPosition, setAdvancedSettingsPosition] = useState({ x: 100, y: 100 });

  // Advanced chart settings state
  const [crosshairSettings, setCrosshairSettings] = useState({
    color: '#6b7280',
    width: 1,
    style: 'dashed' as 'solid' | 'dashed' | 'dotted',
  });
  const [candleSettings, setCandleSettings] = useState({
    upColor: '#22c55e',
    downColor: '#ef4444',
    wickUp: '#22c55e',
    wickDown: '#ef4444',
    borderUp: '#22c55e',
    borderDown: '#ef4444',
  });
  const [backgroundSettings, setBackgroundSettings] = useState({
    color: '#0a0a0a',
    showGrid: true,
    gridColor: '#1a1a1a',
  });

  // Drawing tools state
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toolCount, setToolCount] = useState(0); // Track tool count for pointerEvents logic
  const drawingToolsRef = useRef(getDrawingToolsManager());

  // Favorites toolbar store
  const { presets: favoritesPresets, activePreset: favoritesPreset } = useFavoritesToolbarStore();

  // Tool settings bar state - position near selected tool
  const [toolPosition, setToolPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // Canvas for drawings
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);

  // Interaction controller for drawing tools
  const interactionControllerRef = useRef(getInteractionController());
  const toolsRendererRef = useRef(getToolsRenderer());
  const toolsEngineRef = useRef(getToolsEngine());

  // Templates
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const { templates, saveTemplate, getTemplatesByType } = useChartTemplatesStore();


  // Custom colors state
  const [customColors, setCustomColors] = useState({
    background: '',
    candleUp: '',
    candleDown: '',
    wickUp: '',
    wickDown: '',
    priceLineColor: '',
  });

  // Indicator data storage (simplified - for future canvas-based indicators)
  const indicatorDataRef = useRef<Map<string, number[]>>(new Map());

  const { themeId, setTheme, getTheme } = useThemeStore();
  const theme = useMemo(() => getTheme(), [themeId, getTheme]);

  // Refs pour éviter les re-renders
  const currentPriceRef = useRef(0);
  const lastTickCountRef = useRef(0);
  const lastHistoryTimeRef = useRef<number>(0); // Track last historical candle time
  const unsubscribersRef = useRef<(() => void)[]>([]); // Cleanup functions
  const candleDataRef = useRef<Map<number, { open: number; high: number; low: number; close: number }>>(new Map()); // Store candle data for magnet

  // Price position indicator refs
  const sessionHighRef = useRef(0);
  const sessionLowRef = useRef(Infinity);
  const pricePositionRef = useRef<HTMLDivElement>(null);
  const pricePositionBarRef = useRef<HTMLDivElement>(null);

  // Crosshair store for magnet mode
  const { magnetMode } = useCrosshairStore();


  /**
   * Charge l'historique depuis Binance API
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds) => {
    setIsLoading(true);
    try {
      // CME futures → Yahoo Finance
      if (isCMESymbol(sym)) {
        const candles = await loadYahooHistory(sym, tf);
        return candles;
      }

      // Crypto → Binance
      const binanceInterval = TF_TO_BINANCE[tf] || '1m';
      const limit = 500;

      const response = await fetch(
        `/api/binance/api/v3/klines?symbol=${sym.toUpperCase()}&interval=${binanceInterval}&limit=${limit}`,
        { headers: { 'x-market': 'spot' } }
      );
      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error('Invalid Binance response');
        return [];
      }

      // Convertit les données Binance en format LiveCandle
      const candles: LiveCandle[] = data.map((k: (string | number)[]) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        buyVolume: 0,
        sellVolume: 0,
        trades: Number(k[8]),
      }));

      // Pour les TF < 60s, on doit subdiviser les bougies M1
      if (tf < 60) {
        return subdivideCandles(candles, tf);
      }

      return candles;
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Subdivise les bougies M1 en sous-bougies (15s ou 30s)
   */
  const subdivideCandles = (m1Candles: LiveCandle[], targetTf: number): LiveCandle[] => {
    const result: LiveCandle[] = [];
    const subdivisions = 60 / targetTf;

    for (const m1 of m1Candles) {
      const priceStep = (m1.close - m1.open) / subdivisions;
      const volumeStep = m1.volume / subdivisions;

      for (let i = 0; i < subdivisions; i++) {
        const subOpen = m1.open + priceStep * i;
        const subClose = m1.open + priceStep * (i + 1);
        const variation = (Math.random() - 0.5) * Math.abs(m1.high - m1.low) * 0.1;

        result.push({
          time: m1.time + (i * targetTf),
          open: subOpen,
          high: Math.max(subOpen, subClose) + Math.abs(variation),
          low: Math.min(subOpen, subClose) - Math.abs(variation),
          close: subClose,
          volume: volumeStep,
          buyVolume: 0,
          sellVolume: 0,
          trades: Math.floor(m1.trades / subdivisions),
        });
      }
    }

    return result;
  };

  /**
   * Calculate indicator values (simplified for custom chart)
   */
  const calculateIndicator = useCallback((candles: LiveCandle[], config: IndicatorConfig): number[] => {
    const closes = candles.map(c => c.close);
    const result: number[] = [];

    switch (config.type) {
      case 'sma': {
        for (let i = config.period - 1; i < candles.length; i++) {
          const sum = closes.slice(i - config.period + 1, i + 1).reduce((a, b) => a + b, 0);
          result.push(sum / config.period);
        }
        break;
      }
      case 'ema': {
        const multiplier = 2 / (config.period + 1);
        let ema = closes.slice(0, config.period).reduce((a, b) => a + b, 0) / config.period;
        result.push(ema);
        for (let i = config.period; i < candles.length; i++) {
          ema = (closes[i] - ema) * multiplier + ema;
          result.push(ema);
        }
        break;
      }
      case 'bollinger': {
        for (let i = config.period - 1; i < candles.length; i++) {
          const slice = closes.slice(i - config.period + 1, i + 1);
          const sum = slice.reduce((a, b) => a + b, 0);
          result.push(sum / config.period);
        }
        break;
      }
      case 'vwap': {
        let cumVolume = 0;
        let cumVolumePrice = 0;
        for (let i = 0; i < candles.length; i++) {
          const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
          cumVolume += candles[i].volume;
          cumVolumePrice += typicalPrice * candles[i].volume;
          if (cumVolume > 0) {
            result.push(cumVolumePrice / cumVolume);
          }
        }
        break;
      }
      default:
        break;
    }

    return result;
  }, []);

  /**
   * Add an indicator
   */
  const addIndicator = useCallback((type: IndicatorType) => {
    const preset = INDICATOR_PRESETS.find(p => p.type === type);
    if (!preset) return;

    const newIndicator: IndicatorConfig = {
      id: `${type}-${Date.now()}`,
      type,
      period: preset.defaultPeriod,
      color: COLOR_PRESETS.indicators[indicators.length % COLOR_PRESETS.indicators.length],
      visible: true,
    };

    setIndicators(prev => [...prev, newIndicator]);
  }, [indicators.length]);

  /**
   * Remove an indicator
   */
  const removeIndicator = useCallback((id: string) => {
    indicatorDataRef.current.delete(id);
    setIndicators(prev => prev.filter(ind => ind.id !== id));
  }, []);

  /**
   * Get current symbol categories based on asset type
   */
  const currentSymbolCategories = useMemo(() => {
    return SYMBOL_CATEGORIES_BY_ASSET[assetCategory] || SYMBOL_CATEGORIES_BY_ASSET.crypto;
  }, [assetCategory]);

  /**
   * Filter symbols by search query
   */
  const filteredSymbols = useMemo(() => {
    if (!symbolSearchQuery.trim()) return currentSymbolCategories;

    const query = symbolSearchQuery.toLowerCase();
    const filtered: Record<string, { value: string; label: string; exchange?: string }[]> = {};

    Object.entries(currentSymbolCategories).forEach(([category, symbols]) => {
      const matches = symbols.filter(
        s => s.label.toLowerCase().includes(query) || s.value.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });

    return filtered;
  }, [symbolSearchQuery, currentSymbolCategories]);

  /**
   * Subscribe to drawing tools updates
   */
  useEffect(() => {
    const toolsManager = drawingToolsRef.current;
    const unsubscribe = toolsManager.subscribe(() => {
      setDrawings([...toolsManager.getDrawings()]);
      const currentDrawing = toolsManager.getCurrentDrawing();
      setIsDrawing(currentDrawing !== null);
    });

    return unsubscribe;
  }, []);

  /**
   * Handle tool change (for drawing new tools)
   */
  const handleToolChange = useCallback((toolId: ToolType) => {
    setActiveTool(toolId);
    drawingToolsRef.current.setActiveTool(toolId);

    // Deselect any selected tool when switching tools
    if (selectedTool) {
      toolsEngineRef.current.deselectAll();
      setSelectedTool(null);
    }

    // Also update the ToolsEngine for proper drawing
    const engineToolId = mapToolType(toolId);
    if (engineToolId) {
      interactionControllerRef.current.setActiveTool(engineToolId);
    }

    setShowToolsMenu(false);
  }, [selectedTool]);

  /**
   * Handle tool selection (from FavoritesToolbar or existing tool click)
   */
  const handleToolSelect = useCallback((tool: EngineToolType) => {
    setActiveTool(tool as ToolType);
    interactionControllerRef.current.setActiveTool(tool);

    // Deselect any selected tool when switching drawing mode
    if (selectedTool) {
      toolsEngineRef.current.deselectAll();
      setSelectedTool(null);
    }
  }, [selectedTool]);

  // Map DrawingTools ToolType to ToolsEngine ToolType
  const mapToolType = (type: ToolType): EngineToolType | null => {
    const mapping: Partial<Record<ToolType, EngineToolType>> = {
      cursor: 'cursor',
      crosshair: 'crosshair',
      trendline: 'trendline',
      ray: 'ray',
      hline: 'horizontalLine',
      vline: 'verticalLine',
      rectangle: 'rectangle',
      parallelChannel: 'parallelChannel',
      fibonacciRetracement: 'fibRetracement',
      fibonacciExtension: 'fibExtension',
      arrow: 'arrow',
      brush: 'brush',
      highlighter: 'highlighter',
      measure: 'measure',
      longPosition: 'longPosition',
      shortPosition: 'shortPosition',
      text: 'text',
    };
    return mapping[type] || null;
  };

  /**
   * Render drawing tools on canvas
   */
  const renderDrawingTools = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get dimensions from engine viewport for accurate coordinate conversion
    const candles = candlesRef.current;
    if (candles.length === 0) return;

    const engine = chartEngineRef.current;
    if (!engine) return;

    const vp = engine.getViewport();
    const { startIndex, endIndex, chartWidth, chartHeight } = vp;
    const priceMin = vp.priceMin;
    const priceMax = vp.priceMax;

    const renderContext: RenderContext = {
      ctx,
      width: chartWidth,
      height: chartHeight,
      priceToY: (price: number) => {
        return ((priceMax - price) / (priceMax - priceMin)) * chartHeight;
      },
      yToPrice: (y: number) => {
        return priceMax - (y / chartHeight) * (priceMax - priceMin);
      },
      timeToX: (time: number) => {
        // Find candle index for this time
        const candleIndex = candles.findIndex(c => c.time >= time);
        if (candleIndex === -1) return chartWidth;
        const visibleIndex = candleIndex - startIndex;
        const candleTotalWidth = chartWidth / (endIndex - startIndex);
        return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
      },
      xToTime: (x: number) => {
        const visibleCandles = endIndex - startIndex;
        const candleIndex = Math.floor((x / chartWidth) * visibleCandles) + startIndex;
        if (candleIndex >= 0 && candleIndex < candles.length) {
          return candles[candleIndex].time;
        }
        return candles[candles.length - 1]?.time || 0;
      },
      tickSize: 0.01,
      colors: {
        positive: theme.colors.candleUp,
        negative: theme.colors.candleDown,
        selection: theme.colors.toolActive,
        handle: '#ffffff',
        handleBorder: theme.colors.toolActive,
      },
      currentPrice: currentPriceRef.current || 0,
      hoveredToolId: interactionControllerRef.current.getHoveredToolId(),
      hoveredHandle: interactionControllerRef.current.getHoveredHandle(),
    };

    toolsRendererRef.current.render(renderContext);
  }, [theme.colors]);

  /**
   * Setup drawing canvas and interaction controller
   */
  useEffect(() => {
    const canvas = drawingCanvasRef.current;
    const container = chartContainerRef.current;
    if (!canvas || !container) return;

    // Setup canvas size
    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      renderDrawingTools();
    };
    updateCanvasSize();

    // Setup interaction controller
    const controller = interactionControllerRef.current;

    // Lazy coordinate converter — always reads fresh viewport from engine
    const createCoordinateConverter = () => {
      return {
        xToTime: (x: number) => {
          const eng = chartEngineRef.current;
          const c = candlesRef.current;
          if (!eng || c.length === 0) return 0;
          const vp = eng.getViewport();
          const visibleCount = vp.endIndex - vp.startIndex;
          const candleIndex = Math.floor((x / vp.chartWidth) * visibleCount) + vp.startIndex;
          if (candleIndex >= 0 && candleIndex < c.length) return c[candleIndex].time;
          return c[c.length - 1]?.time || 0;
        },
        timeToX: (time: number) => {
          const eng = chartEngineRef.current;
          const c = candlesRef.current;
          if (!eng || c.length === 0) return 0;
          const vp = eng.getViewport();
          const visibleCount = vp.endIndex - vp.startIndex;
          const candleIndex = c.findIndex(cd => cd.time >= time);
          if (candleIndex === -1) return vp.chartWidth;
          const visibleIndex = candleIndex - vp.startIndex;
          const candleTotalWidth = vp.chartWidth / visibleCount;
          return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
        },
        yToPrice: (y: number) => {
          const eng = chartEngineRef.current;
          if (!eng) return 0;
          const vp = eng.getViewport();
          return vp.priceMax - (y / vp.chartHeight) * (vp.priceMax - vp.priceMin);
        },
        priceToY: (price: number) => {
          const eng = chartEngineRef.current;
          if (!eng) return 0;
          const vp = eng.getViewport();
          return ((vp.priceMax - price) / (vp.priceMax - vp.priceMin)) * vp.chartHeight;
        },
      };
    };

    controller.setCoordinateConverter(createCoordinateConverter());

    controller.setCallbacks({
      onToolSelected: (tool: Tool | null) => {
        setSelectedTool(tool);
        if (tool) {
          // Calculate tool position for settings bar
          const converter = createCoordinateConverter();
          let x = 100, y = 100;
          if ('price' in tool && typeof tool.price === 'number') {
            y = converter.priceToY(tool.price);
            x = container.getBoundingClientRect().width / 2;
          } else if ('startPoint' in tool) {
            const startPoint = (tool as { startPoint: { time: number; price: number } }).startPoint;
            x = converter.timeToX(startPoint.time);
            y = converter.priceToY(startPoint.price);
          }
          setToolPosition({ x, y });
        } else {
          setToolPosition(undefined);
        }
        renderDrawingTools();
      },
      onToolCreated: () => {
        renderDrawingTools();
        setToolCount(toolsEngineRef.current.getAllTools().length);
        setActiveTool('cursor');
      },
      onToolUpdated: () => {
        renderDrawingTools();
      },
      onModeChanged: (mode: string) => {
        // Mode is just the string, not the full state
        renderDrawingTools();
      },
      onCursorChanged: (cursor) => {
        if (canvas) {
          canvas.style.cursor = cursor;
        }
      },
      requestRedraw: () => {
        renderDrawingTools();
        setToolCount(toolsEngineRef.current.getAllTools().length);
        // Update coordinate converter when redrawing
        controller.setCoordinateConverter(createCoordinateConverter());
      },
      getOHLCAtTime: (time: number) => {
        const candleMap = candleDataRef.current;
        if (candleMap.size === 0) return null;

        const times = Array.from(candleMap.keys()).sort((a, b) => a - b);
        let closestTime = times[0];
        let minDiff = Math.abs(time - closestTime);

        for (const t of times) {
          const diff = Math.abs(time - t);
          if (diff < minDiff) {
            minDiff = diff;
            closestTime = t;
          }
        }

        const ohlc = candleMap.get(closestTime);
        if (!ohlc) return null;

        return {
          time: closestTime,
          open: ohlc.open,
          high: ohlc.high,
          low: ohlc.low,
          close: ohlc.close,
        };
      },
    });

    // Update bounds on resize
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      const rect = container.getBoundingClientRect();
      controller.setChartBounds(rect);
      controller.setCoordinateConverter(createCoordinateConverter());
    });
    resizeObserver.observe(container);

    // Initial bounds
    controller.setChartBounds(container.getBoundingClientRect());

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderDrawingTools]);

  /**
   * Update magnet mode in controller when it changes
   */
  useEffect(() => {
    interactionControllerRef.current.setMagnetMode(magnetMode);
  }, [magnetMode]);

  /**
   * Handle mouse events for drawing tools
   */
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Left click only
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    interactionControllerRef.current.setChartBounds(rect);
    interactionControllerRef.current.handleMouseDown(e);
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    interactionControllerRef.current.setChartBounds(rect);
    interactionControllerRef.current.handleMouseMove(e);
  }, []);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    interactionControllerRef.current.handleMouseUp(e);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    interactionControllerRef.current.handleMouseLeave();
  }, []);

  /**
   * Handle right-click context menu
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  /**
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Toggle grid visibility
   */
  const toggleGrid = useCallback(() => {
    setShowGrid(prev => {
      const newValue = !prev;
      if (chartEngineRef.current) {
        chartEngineRef.current.setShowGrid(newValue);
      }
      return newValue;
    });
  }, []);

  /**
   * Copy current price to clipboard
   */
  const copyPrice = useCallback(() => {
    if (currentPriceRef.current) {
      navigator.clipboard.writeText(currentPriceRef.current.toString());
    }
  }, []);

  /**
   * Reset chart view
   */
  const resetView = useCallback(() => {
    if (chartEngineRef.current) {
      chartEngineRef.current.fitToData();
    }
  }, []);

  /**
   * Smart Zoom - Zoom on both time and price axis
   */
  const smartZoom = useCallback((zoomIn: boolean) => {
    const engine = chartEngineRef.current;
    if (!engine) return;

    if (zoomIn) {
      engine.zoomIn();
    } else {
      engine.zoomOut();
    }
  }, []);


  /**
   * Handle crosshair settings change from advanced settings modal
   */
  const handleCrosshairChange = useCallback((settings: {
    color?: string;
    width?: number;
    style?: 'solid' | 'dashed' | 'dotted';
  }) => {
    setCrosshairSettings(prev => {
      const updated = { ...prev, ...settings };
      // Apply to chart engine
      if (chartEngineRef.current) {
        chartEngineRef.current.setCrosshairStyle({
          color: updated.color,
          lineWidth: updated.width,
          dashPattern: updated.style === 'solid' ? [] :
                       updated.style === 'dashed' ? [6, 4] : [2, 2],
        });
      }
      return updated;
    });
  }, []);

  /**
   * Handle candle settings change from advanced settings modal
   */
  const handleCandleChange = useCallback((settings: {
    upColor?: string;
    downColor?: string;
    wickUp?: string;
    wickDown?: string;
    borderUp?: string;
    borderDown?: string;
  }) => {
    setCandleSettings(prev => {
      const updated = { ...prev, ...settings };
      // Apply to chart engine
      if (chartEngineRef.current) {
        chartEngineRef.current.setTheme({
          candleUp: updated.upColor,
          candleDown: updated.downColor,
          wickUp: updated.wickUp,
          wickDown: updated.wickDown,
          candleBorderUp: updated.borderUp,
          candleBorderDown: updated.borderDown,
        });
      }
      // Also update customColors for consistency
      setCustomColors(prevColors => ({
        ...prevColors,
        candleUp: updated.upColor,
        candleDown: updated.downColor,
        wickUp: updated.wickUp,
        wickDown: updated.wickDown,
      }));
      return updated;
    });
  }, []);

  /**
   * Handle background settings change from advanced settings modal
   */
  const handleBackgroundChange = useCallback((settings: {
    color?: string;
    showGrid?: boolean;
    gridColor?: string;
  }) => {
    setBackgroundSettings(prev => {
      const updated = { ...prev, ...settings };
      if (updated.showGrid !== undefined) {
        setShowGrid(updated.showGrid);
      }
      // Apply to chart engine
      if (chartEngineRef.current) {
        if (updated.color) {
          chartEngineRef.current.setTheme({
            background: updated.color,
          });
        }
        if (updated.gridColor) {
          chartEngineRef.current.setTheme({
            gridLines: updated.gridColor,
          });
        }
        if (updated.showGrid !== undefined) {
          chartEngineRef.current.setShowGrid(updated.showGrid);
        }
      }
      // Also update customColors for consistency
      if (updated.color) {
        setCustomColors(prevColors => ({
          ...prevColors,
          background: updated.color,
        }));
      }
      return updated;
    });
  }, []);

  /**
   * Open advanced settings modal
   */
  const openAdvancedSettings = useCallback(() => {
    const container = chartContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      setAdvancedSettingsPosition({
        x: rect.right - 350,
        y: rect.top + 50,
      });
    }
    setShowAdvancedSettings(true);
  }, []);

  /**
   * Save current chart settings as a template
   */
  const handleSaveTemplate = useCallback((name: string) => {
    saveTemplate({
      name,
      type: 'live',
      settings: {
        showGrid,
        timeframe: timeframe.toString(),
        colors: customColors,
      },
    });
  }, [saveTemplate, showGrid, timeframe, customColors]);

  /**
   * Load a template and apply settings
   */
  const handleLoadTemplate = useCallback((template: ChartTemplate) => {
    if (template.settings.showGrid !== undefined) {
      setShowGrid(template.settings.showGrid);
    }
    if (template.settings.timeframe) {
      setTimeframe(parseInt(template.settings.timeframe) as TimeframeSeconds);
    }
    if (template.settings.colors) {
      setCustomColors(prev => ({ ...prev, ...template.settings.colors }));
    }
  }, []);

  /**
   * Get available templates for this chart type
   */
  const availableTemplates = useMemo(() => {
    return getTemplatesByType('live');
  }, [getTemplatesByType, templates]);

  /**
   * Get context menu items
   */
  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    return createChartContextMenuItems({
      onCopyPrice: copyPrice,
      onToggleGrid: toggleGrid,
      onOpenSettings: () => {
        // Open advanced settings at click position
        if (contextMenu) {
          setAdvancedSettingsPosition({ x: contextMenu.x, y: contextMenu.y });
        }
        setShowAdvancedSettings(true);
        closeContextMenu();
      },
      onResetView: resetView,
      onClearDrawings: () => toolsEngineRef.current.clearAll(),
      onSaveTemplate: () => setShowSaveTemplateModal(true),
      templates: availableTemplates.map(t => ({
        id: t.id,
        name: t.name,
        onLoad: () => handleLoadTemplate(t),
      })),
      showGrid,
    });
  }, [copyPrice, toggleGrid, resetView, showGrid, availableTemplates, handleLoadTemplate]);

  /**
   * Handle keyboard events for drawing tools and zoom
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      // Smart Zoom shortcuts
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        smartZoom(true);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        smartZoom(false);
        return;
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetView();
        return;
      }

      interactionControllerRef.current.handleKeyDown(e);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      interactionControllerRef.current.handleKeyUp(e);
    };

    // Handle mouse wheel for smart zoom
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        smartZoom(e.deltaY < 0);
      }
    };

    const container = chartContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [smartZoom, resetView]);

  /**
   * Get effective colors (custom > theme)
   */
  const effectiveColors = useMemo(() => ({
    background: customColors.background || theme.colors.background,
    candleUp: customColors.candleUp || theme.colors.candleUp,
    candleDown: customColors.candleDown || theme.colors.candleDown,
    wickUp: customColors.wickUp || theme.colors.wickUp,
    wickDown: customColors.wickDown || theme.colors.wickDown,
    priceLineColor: customColors.priceLineColor || theme.colors.toolActive || '#7ed321',
  }), [customColors, theme.colors]);

  /**
   * Update price position indicator (shows where current price is in the session range)
   */
  const updatePricePositionIndicator = useCallback(() => {
    const price = currentPriceRef.current;
    const high = sessionHighRef.current;
    const low = sessionLowRef.current;

    if (!pricePositionRef.current || !pricePositionBarRef.current || high <= low) return;

    // Calculate position percentage (0% = at low, 100% = at high)
    const position = ((price - low) / (high - low)) * 100;
    const clampedPosition = Math.max(0, Math.min(100, position));

    // Determine color based on position
    let color: string;
    if (clampedPosition >= 66) {
      color = '#22c55e'; // Green (upper third - bullish)
    } else if (clampedPosition >= 33) {
      color = '#eab308'; // Yellow (middle - neutral)
    } else {
      color = '#ef4444'; // Red (lower third - bearish)
    }

    // Update the indicator bar height and color
    pricePositionBarRef.current.style.height = `${clampedPosition}%`;
    pricePositionBarRef.current.style.background = `linear-gradient(to top, ${color}60, ${color}20)`;

    // Update position line
    const positionLine = pricePositionRef.current.querySelector('.position-line') as HTMLElement;
    if (positionLine) {
      positionLine.style.bottom = `${clampedPosition}%`;
      positionLine.style.backgroundColor = color;
      positionLine.style.boxShadow = `0 0 4px ${color}`;
    }
  }, []);

  /**
   * Met à jour le chart avec les données
   */
  const updateChartData = useCallback((candles: LiveCandle[]) => {
    if (!chartEngineRef.current || candles.length === 0) return;

    // Convert to ChartCandle format
    const chartCandles: ChartCandle[] = candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    chartEngineRef.current.setCandles(chartCandles);
    candlesRef.current = chartCandles;

    // Store candle data for magnet snapping
    candleDataRef.current.clear();
    candles.forEach(c => {
      candleDataRef.current.set(c.time, {
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    });

    // Store the last historical timestamp
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      lastHistoryTimeRef.current = lastCandle.time;
    }

    // Met à jour le prix
    if (lastCandle && priceRef.current) {
      currentPriceRef.current = lastCandle.close;
      priceRef.current.textContent = `$${lastCandle.close.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    // Update session high/low for price position indicator
    if (candles.length > 0) {
      const allHighs = candles.map(c => c.high);
      const allLows = candles.map(c => c.low);
      sessionHighRef.current = Math.max(...allHighs);
      sessionLowRef.current = Math.min(...allLows);
      updatePricePositionIndicator();
    }
  }, []);

  /**
   * Crée le chart avec le moteur canvas personnalisé
   */
  useEffect(() => {
    const container = chartContainerRef.current;
    const canvas = chartCanvasRef.current;
    if (!container || !canvas || chartEngineRef.current) return;

    // Initialize canvas
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Create custom chart engine
    const engine = new CanvasChartEngine(canvas, {
      background: theme.colors.background,
      gridLines: theme.colors.gridLines,
      text: theme.colors.text,
      textMuted: theme.colors.textMuted,
      candleUp: theme.colors.candleUp,
      candleDown: theme.colors.candleDown,
      wickUp: theme.colors.wickUp,
      wickDown: theme.colors.wickDown,
      volumeUp: theme.colors.volumeUp,
      volumeDown: theme.colors.volumeDown,
      crosshair: theme.colors.crosshair,
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#374151',
      priceLineColor: customColors.priceLineColor || theme.colors.toolActive || '#7ed321',
    });

    engine.resize(rect.width, rect.height);
    chartEngineRef.current = engine;

    // Handle resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          engine.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      chartEngineRef.current = null;
    };
  }, []);

  /**
   * Applique le thème et les couleurs personnalisées
   */
  useEffect(() => {
    if (!chartEngineRef.current) return;

    chartEngineRef.current.setTheme({
      background: effectiveColors.background,
      gridLines: theme.colors.gridLines,
      text: theme.colors.text,
      textMuted: theme.colors.textMuted,
      candleUp: effectiveColors.candleUp,
      candleDown: effectiveColors.candleDown,
      wickUp: effectiveColors.wickUp,
      wickDown: effectiveColors.wickDown,
      volumeUp: theme.colors.volumeUp,
      volumeDown: theme.colors.volumeDown,
      crosshair: theme.colors.crosshair,
      priceLineColor: effectiveColors.priceLineColor,
    });
  }, [theme, effectiveColors]);

  /**
   * Update indicators when candles change (simplified for custom chart)
   */
  const updateIndicators = useCallback((candles: LiveCandle[]) => {
    if (candles.length === 0) return;

    // Store indicator data for future rendering
    indicators.forEach(config => {
      if (!config.visible) return;

      const data = calculateIndicator(candles, config);
      if (data.length > 0) {
        indicatorDataRef.current.set(config.id, data);
      }
    });
    // TODO: Implement indicator rendering on canvas
  }, [indicators, calculateIndicator]);

  /**
   * Charge l'historique et connecte le WebSocket
   */
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Clean up previous subscriptions
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];

      // 1. Reset aggregator for fresh start
      resetAggregator();
      lastHistoryTimeRef.current = 0;

      // 2. Charge l'historique
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      if (history.length > 0) {
        updateChartData(history);
        updateIndicators(history);
      }

      // 3. Connecte le WebSocket (IB pour CME, Binance pour crypto)
      const isCME = isCMESymbol(symbol);
      const ws = isCME ? getIBLiveWS() : getBinanceLiveWS();
      const aggregator = getAggregator();

      const unsubStatus = ws.onStatus((s) => {
        if (!isMounted) return;
        setStatus(s);
        if (statusDotRef.current) {
          statusDotRef.current.style.backgroundColor =
            s === 'connected' ? theme.colors.success :
            s === 'connecting' ? theme.colors.warning :
            theme.colors.error;
        }
      });
      unsubscribersRef.current.push(unsubStatus);

      // Met à jour le prix et le chart sans re-render React
      const unsubCandle = aggregator.on('candle:update', (candle, tf) => {
        if (tf !== timeframe || !isMounted) return;

        // Met à jour le prix directement dans le DOM
        if (priceRef.current) {
          currentPriceRef.current = candle.close;
          priceRef.current.textContent = `$${candle.close.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }

        // Update session high/low for price position indicator
        if (candle.high > sessionHighRef.current) {
          sessionHighRef.current = candle.high;
        }
        if (candle.low < sessionLowRef.current) {
          sessionLowRef.current = candle.low;
        }
        updatePricePositionIndicator();

        // Only update chart if candle time >= last history time
        if (candle.time >= lastHistoryTimeRef.current) {
          // Update candle data for magnet snapping
          candleDataRef.current.set(candle.time, {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });

          // Update the custom chart engine
          if (chartEngineRef.current) {
            const chartCandle: ChartCandle = {
              time: candle.time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
            };
            chartEngineRef.current.updateCandle(chartCandle);

            // Also update candlesRef for drawing tools
            const existingIndex = candlesRef.current.findIndex(c => c.time === candle.time);
            if (existingIndex >= 0) {
              candlesRef.current[existingIndex] = chartCandle;
            } else {
              candlesRef.current.push(chartCandle);
            }
          }
        }
      });
      unsubscribersRef.current.push(unsubCandle);

      // Met à jour le compteur de ticks (throttled)
      let tickUpdateTimer: NodeJS.Timeout | null = null;
      const unsubTick = ws.onTick(() => {
        if (!tickUpdateTimer) {
          tickUpdateTimer = setTimeout(() => {
            if (tickCountRef.current) {
              tickCountRef.current.textContent = ws.getTickCount().toLocaleString();
            }
            tickUpdateTimer = null;
          }, 500); // Update max 2x par seconde
        }
      });
      unsubscribersRef.current.push(unsubTick);

      // Connect to the appropriate WebSocket
      await ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, [symbol, timeframe, loadHistory, updateChartData, updateIndicators, theme]);

  /**
   * Change de symbole
   */
  const handleSymbolChange = async (newSymbol: string) => {
    if (newSymbol === symbol) return;
    setSymbol(newSymbol);
    getBinanceLiveWS().changeSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
  };

  /**
   * Change de timeframe
   */
  const handleTimeframeChange = async (newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);

    const history = await loadHistory(symbol, newTf);
    if (history.length > 0) {
      updateChartData(history);
    }
  };

  // Find selected symbol label from all categories
  const allSymbols = Object.values(currentSymbolCategories).flat();
  const selectedSymbolLabel = allSymbols.find(s => s.value === symbol)?.label || symbol.toUpperCase();

  return (
    <div
      className={`flex h-full ${className || ''}`}
      style={{ backgroundColor: effectiveColors.background }}
    >
      {/* FavoritesToolbar - Left Side */}
      <FavoritesToolbar
        activeTool={mapToolType(activeTool) || 'cursor'}
        onToolSelect={handleToolSelect}
        onDeleteSelected={() => {
          if (selectedTool) {
            toolsEngineRef.current.deleteTool(selectedTool.id);
            setSelectedTool(null);
            renderDrawingTools();
          }
        }}
        hasSelectedTool={selectedTool !== null}
        colors={{
          surface: theme.colors.surface,
          background: theme.colors.background,
          gridColor: theme.colors.border,
          textPrimary: theme.colors.text,
          textMuted: theme.colors.textMuted,
          deltaPositive: theme.colors.toolActive,
          deltaNegative: theme.colors.error,
        }}
        preset="default"
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}
        >
          {/* Symbol Selector & Price */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setShowSymbolSearch(!showSymbolSearch)}
                className="flex items-center gap-2 text-sm font-bold rounded px-3 py-1.5 border focus:outline-none hover:bg-opacity-80 transition-colors"
                style={{
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                }}
              >
                <span>{selectedSymbolLabel}</span>
                <span style={{ color: theme.colors.textMuted }}>▼</span>
              </button>

              {/* Symbol Search Modal */}
              {showSymbolSearch && (
                <div
                  className="absolute top-full left-0 mt-1 w-96 rounded-lg shadow-2xl z-50 max-h-[450px] overflow-hidden animate-slideDown"
                  style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
                >
                  {/* Asset Category Tabs */}
                  <div className="flex items-center gap-0.5 p-1.5 border-b overflow-x-auto" style={{ borderColor: theme.colors.border }}>
                    {ASSET_CATEGORIES.map((cat, index) => {
                      const IconComponent = ASSET_CATEGORY_ICONS[cat.id];
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setAssetCategory(cat.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap
                            transition-all duration-300 ease-out transform
                            ${assetCategory === cat.id
                              ? 'scale-105 shadow-lg'
                              : 'hover:scale-102 active:scale-95'
                            }`}
                          style={{
                            backgroundColor: assetCategory === cat.id ? theme.colors.toolActive : 'transparent',
                            color: assetCategory === cat.id ? '#fff' : theme.colors.textSecondary,
                            boxShadow: assetCategory === cat.id ? `0 0 10px ${theme.colors.toolActive}40` : 'none',
                            animationDelay: `${index * 30}ms`,
                          }}
                        >
                          <span className={`transition-transform duration-200 ${assetCategory === cat.id ? 'scale-110' : ''}`}>
                            <IconComponent size={16} color={assetCategory === cat.id ? '#fff' : undefined} />
                          </span>
                          <span className="font-medium">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Search Input */}
                  <div className="p-2 border-b" style={{ borderColor: theme.colors.border }}>
                    <input
                      type="text"
                      value={symbolSearchQuery}
                      onChange={(e) => setSymbolSearchQuery(e.target.value)}
                      placeholder={`Search ${assetCategory} symbols...`}
                      autoFocus
                      className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                      style={{
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text,
                        border: `1px solid ${theme.colors.border}`,
                      }}
                    />
                  </div>

                  {/* Note for futures */}
                  {assetCategory === 'futures' && (
                    <div className="px-3 py-2 text-xs border-b" style={{ borderColor: theme.colors.border, color: theme.colors.textSecondary }}>
                      CME Futures via dxFeed. Connectez Interactive Brokers dans les paramètres pour le temps réel.
                    </div>
                  )}

                  {/* Categories */}
                  <div className="overflow-y-auto max-h-64">
                    {Object.entries(filteredSymbols).map(([category, symbols]) => (
                      <div key={category}>
                        <div
                          className="px-3 py-1.5 text-xs font-semibold sticky top-0"
                          style={{ backgroundColor: theme.colors.surface, color: theme.colors.textMuted }}
                        >
                          {category}
                        </div>
                        <div className="grid grid-cols-2 gap-0.5 px-1 pb-1">
                          {symbols.map(s => (
                            <button
                              key={s.value}
                              onClick={() => {
                                handleSymbolChange(s.value);
                                setShowSymbolSearch(false);
                                setSymbolSearchQuery('');
                              }}
                              className="text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between"
                              style={{
                                backgroundColor: symbol === s.value ? theme.colors.toolActive : 'transparent',
                                color: symbol === s.value ? '#fff' : theme.colors.text,
                                opacity: 1,
                              }}
                            >
                              <span>{s.label}</span>
                              {s.exchange && (
                                <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>
                                  {s.exchange}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span
              ref={priceRef}
              className="text-xl font-mono font-bold"
              style={{ color: theme.colors.text }}
            >
              $0.00
            </span>

            {/* Price Position Indicator */}
            <div
              ref={pricePositionRef}
              className="relative w-5 h-7 rounded border overflow-hidden"
              style={{ backgroundColor: '#1a1a1a', borderColor: theme.colors.border }}
              title="Price position in session range (High-Low)"
            >
              {/* Fill bar */}
              <div
                ref={pricePositionBarRef}
                className="absolute inset-x-0 bottom-0 w-full transition-all duration-300"
                style={{
                  height: '50%',
                  background: 'linear-gradient(to top, #eab30860, #eab30820)',
                }}
              />
              {/* Position line */}
              <div
                className="position-line absolute left-0 right-0 h-0.5 transition-all duration-300"
                style={{
                  bottom: '50%',
                  backgroundColor: '#eab308',
                  boxShadow: '0 0 4px #eab308',
                }}
              />
            </div>

            {/* Active Indicators Pills */}
            {indicators.length > 0 && (
              <div className="flex items-center gap-1">
                {indicators.map(ind => (
                  <span
                    key={ind.id}
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: ind.color + '33', color: ind.color }}
                  >
                    {ind.type.toUpperCase()}({ind.period})
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Timeframes */}
          <div className="flex items-center gap-1">
            {Object.entries(TF_GROUPS).map(([group, tfs]) => (
              <div
                key={group}
                className="flex items-center rounded p-0.5 mr-1"
                style={{ backgroundColor: theme.colors.background }}
              >
                {tfs.map((tf, index) => (
                  <button
                    key={tf}
                    onClick={() => handleTimeframeChange(tf)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200
                      ${timeframe === tf ? '' : 'hover:scale-105 active:scale-95 hover:bg-white/5'}
                    `}
                    style={{
                      backgroundColor: timeframe === tf ? theme.colors.toolActive : 'transparent',
                      color: timeframe === tf ? '#fff' : theme.colors.textSecondary,
                    }}
                  >
                    {TIMEFRAME_LABELS[tf]}
                  </button>
                ))}
              </div>
            ))}

            {/* Candle Countdown Timer */}
            <PriceCountdownCompact timeframeSeconds={timeframe} />
          </div>

          {/* Tools & Theme & Status */}
          <div className="flex items-center gap-2">
            {/* Magnet Mode Toggle */}
            <MagnetToggle theme={theme} />

            {/* Indicators Button */}
            <button
              onClick={() => setShowIndicatorsPanel(!showIndicatorsPanel)}
              title="Indicators"
              className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: showIndicatorsPanel ? theme.colors.toolActive : 'transparent',
                color: showIndicatorsPanel ? '#fff' : theme.colors.textSecondary,
              }}
            >
              <IndicatorIcon size={16} color={showIndicatorsPanel ? '#fff' : theme.colors.textSecondary} />
            </button>

            {/* Customize Button */}
            <button
              onClick={() => setShowCustomizePanel(!showCustomizePanel)}
              title="Customize Colors"
              className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: showCustomizePanel ? theme.colors.toolActive : 'transparent',
                color: showCustomizePanel ? '#fff' : theme.colors.textSecondary,
              }}
            >
              <SettingsIcon size={16} color={showCustomizePanel ? '#fff' : theme.colors.textSecondary} />
            </button>

            <div className="w-px h-5" style={{ backgroundColor: theme.colors.border }} />

            <div className="relative">
              <button
                onClick={() => setShowThemePanel(!showThemePanel)}
                className="px-2 py-1 rounded text-xs border transition-colors"
                style={{
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  color: theme.colors.textSecondary,
                }}
              >
                🎨 {THEMES.find(t => t.id === themeId)?.name}
              </button>

              {showThemePanel && (
                <div
                  className="absolute top-full right-0 mt-1 rounded-lg shadow-2xl z-50 p-1.5 min-w-[160px] animate-slideDown"
                  style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
                >
                  {THEMES.map((t, index) => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setShowThemePanel(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2
                        transition-all duration-200 ease-out transform
                        ${themeId === t.id ? 'scale-102' : 'hover:scale-102 active:scale-98'}
                      `}
                      style={{
                        backgroundColor: themeId === t.id ? theme.colors.toolActive : 'transparent',
                        color: themeId === t.id ? '#fff' : theme.colors.text,
                        animationDelay: `${index * 30}ms`,
                      }}
                    >
                      <span
                        className={`w-3 h-3 rounded-full transition-transform duration-200 ${themeId === t.id ? 'scale-125' : ''}`}
                        style={{ backgroundColor: t.colors.candleUp, boxShadow: `0 0 6px ${t.colors.candleUp}` }}
                      />
                      <span className="font-medium">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs" style={{ color: theme.colors.textMuted }}>
              <span ref={tickCountRef}>0</span>
              <div
                ref={statusDotRef}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: theme.colors.textMuted }}
              />
            </div>
          </div>
        </div>

        {/* Chart Area */}
        <div className="flex-1 relative" onContextMenu={handleContextMenu}>
          <div ref={chartContainerRef} className="w-full h-full">
            <canvas
              ref={chartCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: 'crosshair' }}
            />
          </div>

          {/* Drawing Canvas Overlay */}
          <canvas
            ref={drawingCanvasRef}
            className="absolute inset-0"
            style={{
              zIndex: 5,
              // Capture events when: drawing tool active OR we have existing drawings to interact with
              // This allows chart to handle pan/zoom when no tools/drawings to interact with
              pointerEvents: (activeTool !== 'cursor' && activeTool !== 'crosshair') ||
                             toolCount > 0 ? 'auto' : 'none',
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
          />

          {isLoading && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ backgroundColor: `${effectiveColors.background}ee` }}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: theme.colors.toolActive }}
                />
                <span className="text-sm" style={{ color: theme.colors.textSecondary }}>
                  Loading...
                </span>
              </div>
            </div>
          )}

          {/* Smart Zoom Controls */}
          <div
            className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-lg z-20"
            style={{
              backgroundColor: theme.colors.surface + 'dd',
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <button
              onClick={() => smartZoom(true)}
              className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{ color: theme.colors.textSecondary }}
              title="Zoom In (+)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <button
              onClick={() => smartZoom(false)}
              className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{ color: theme.colors.textSecondary }}
              title="Zoom Out (-)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <div className="w-px h-5 bg-zinc-700" />
            <button
              onClick={resetView}
              className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{ color: theme.colors.textSecondary }}
              title="Fit Content (Ctrl+0)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>

          {/* Indicators Panel */}
          {showIndicatorsPanel && (
            <div
              className="absolute top-2 right-2 w-64 rounded-lg shadow-2xl z-20 overflow-hidden animate-slideInRight"
              style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
                <span className="text-sm font-semibold" style={{ color: theme.colors.text }}>Indicators</span>
                <button
                  onClick={() => setShowIndicatorsPanel(false)}
                  className="text-xs"
                  style={{ color: theme.colors.textMuted }}
                >
                  ✕
                </button>
              </div>

              {/* Active Indicators */}
              {indicators.length > 0 && (
                <div className="p-2 border-b" style={{ borderColor: theme.colors.border }}>
                  <div className="text-xs mb-1" style={{ color: theme.colors.textMuted }}>Active</div>
                  {indicators.map(ind => (
                    <div
                      key={ind.id}
                      className="flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: ind.color }}
                        />
                        <span className="text-xs" style={{ color: theme.colors.text }}>
                          {ind.type.toUpperCase()}({ind.period})
                        </span>
                      </div>
                      <button
                        onClick={() => removeIndicator(ind.id)}
                        className="text-xs px-1 hover:opacity-70"
                        style={{ color: theme.colors.textMuted }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Available Indicators */}
              <div className="p-2 max-h-48 overflow-y-auto">
                <div className="text-xs mb-1" style={{ color: theme.colors.textMuted }}>Add Indicator</div>
                <div className="space-y-0.5">
                  {INDICATOR_PRESETS.map(preset => (
                    <button
                      key={preset.type}
                      onClick={() => addIndicator(preset.type)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: theme.colors.background,
                        color: theme.colors.text,
                      }}
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div style={{ color: theme.colors.textMuted }}>{preset.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Customize Panel */}
          {showCustomizePanel && (
            <div
              className="absolute top-2 right-2 w-72 rounded-lg shadow-2xl z-20 overflow-hidden animate-slideInRight"
              style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
                <span className="text-sm font-semibold" style={{ color: theme.colors.text }}>Customize Colors</span>
                <button
                  onClick={() => setShowCustomizePanel(false)}
                  className="text-xs"
                  style={{ color: theme.colors.textMuted }}
                >
                  ✕
                </button>
              </div>

              <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                {/* Background Color */}
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Background</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.background.map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomColors(prev => ({ ...prev, background: color }))}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: customColors.background === color ? theme.colors.toolActive : 'transparent',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={customColors.background || effectiveColors.background}
                      onChange={(e) => setCustomColors(prev => ({ ...prev, background: e.target.value }))}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bullish Candle Color */}
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Bullish Candle</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.candles.bullish.map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomColors(prev => ({ ...prev, candleUp: color, wickUp: color }))}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: customColors.candleUp === color ? theme.colors.toolActive : 'transparent',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={customColors.candleUp || effectiveColors.candleUp}
                      onChange={(e) => setCustomColors(prev => ({ ...prev, candleUp: e.target.value, wickUp: e.target.value }))}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bearish Candle Color */}
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Bearish Candle</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.candles.bearish.map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomColors(prev => ({ ...prev, candleDown: color, wickDown: color }))}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: customColors.candleDown === color ? theme.colors.toolActive : 'transparent',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={customColors.candleDown || effectiveColors.candleDown}
                      onChange={(e) => setCustomColors(prev => ({ ...prev, candleDown: e.target.value, wickDown: e.target.value }))}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Price Line Color */}
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Price Line</div>
                  <div className="flex flex-wrap gap-1">
                    {['#7ed321', '#3b82f6', '#f59e0b', '#22d3ee', '#a855f7', '#ef4444'].map(color => (
                      <button
                        key={color}
                        onClick={() => setCustomColors(prev => ({ ...prev, priceLineColor: color }))}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: customColors.priceLineColor === color ? theme.colors.toolActive : 'transparent',
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={customColors.priceLineColor || effectiveColors.priceLineColor}
                      onChange={(e) => setCustomColors(prev => ({ ...prev, priceLineColor: e.target.value }))}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Reset Button */}
                <button
                  onClick={() => setCustomColors({ background: '', candleUp: '', candleDown: '', wickUp: '', wickDown: '', priceLineColor: '' })}
                  className="w-full py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: theme.colors.background,
                    color: theme.colors.textSecondary,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  Reset to Theme Defaults
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-3 py-1 text-xs border-t"
          style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textMuted }}
        >
          <div className="flex items-center gap-4">
            <span>Binance Spot</span>
            <span>{TIMEFRAME_LABELS[timeframe]}</span>
            {activeTool !== 'cursor' && activeTool !== 'crosshair' && (
              <span style={{ color: theme.colors.toolActive }}>
                Drawing: {activeTool}
              </span>
            )}
            {selectedTool && (
              <span style={{ color: theme.colors.success }}>
                Selected: {selectedTool.type}
              </span>
            )}
          </div>
          <span style={{ color: status === 'connected' ? theme.colors.success : theme.colors.textMuted }}>
            {status === 'connected' ? '● Live' : '○ Offline'}
          </span>
        </div>
      </div>

      {/* Click outside to close modals */}
      {(showSymbolSearch || showThemePanel) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowSymbolSearch(false);
            setShowThemePanel(false);
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
          theme="senzoukria"
        />
      )}

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        onSave={handleSaveTemplate}
      />

      {/* Floating Tool Settings Bar - Shows when a tool is selected */}
      {selectedTool && (
        <ToolSettingsBar
          selectedTool={selectedTool}
          toolPosition={toolPosition}
          colors={{
            surface: theme.colors.surface,
            background: theme.colors.background,
            textPrimary: theme.colors.text,
            textSecondary: theme.colors.textSecondary,
            textMuted: theme.colors.textMuted,
            gridColor: theme.colors.border,
            deltaPositive: theme.colors.success,
            deltaNegative: theme.colors.error,
          }}
          onClose={() => {
            toolsEngineRef.current.deselectAll();
            setSelectedTool(null);
            renderDrawingTools();
          }}
          onOpenAdvanced={(tool) => {
            setAdvancedSettingsPosition({
              x: (toolPosition?.x || 200) + 50,
              y: (toolPosition?.y || 150) + 50,
            });
            setShowAdvancedSettings(true);
          }}
        />
      )}

      {/* Advanced Tool Settings Modal - for selected tools */}
      <AdvancedToolSettingsModal
        isOpen={showAdvancedSettings && selectedTool !== null}
        onClose={() => setShowAdvancedSettings(false)}
        activeTool={selectedTool?.type || 'cursor'}
        selectedTool={selectedTool}
        initialPosition={advancedSettingsPosition}
        theme={theme}
      />

      {/* Advanced Chart Settings Modal - for crosshair, candles, background, templates */}
      <AdvancedChartSettings
        isOpen={showAdvancedSettings && (activeTool === 'cursor' || activeTool === 'crosshair')}
        onClose={() => setShowAdvancedSettings(false)}
        initialPosition={advancedSettingsPosition}
        crosshairColor={crosshairSettings.color}
        crosshairWidth={crosshairSettings.width}
        crosshairStyle={crosshairSettings.style}
        candleUpColor={candleSettings.upColor}
        candleDownColor={candleSettings.downColor}
        wickUpColor={candleSettings.wickUp}
        wickDownColor={candleSettings.wickDown}
        candleBorderUp={candleSettings.borderUp}
        candleBorderDown={candleSettings.borderDown}
        backgroundColor={backgroundSettings.color}
        showGrid={backgroundSettings.showGrid}
        gridColor={backgroundSettings.gridColor}
        onCrosshairChange={handleCrosshairChange}
        onCandleChange={handleCandleChange}
        onBackgroundChange={handleBackgroundChange}
      />
    </div>
  );
}

// ============ MAGNET TOGGLE COMPONENT ============

interface MagnetToggleProps {
  theme: {
    colors: {
      toolActive: string;
      textSecondary: string;
      surface: string;
      border: string;
      text: string;
      textMuted: string;
    };
  };
}

function MagnetToggle({ theme }: MagnetToggleProps) {
  const { magnetMode, setMagnetMode } = useCrosshairStore();
  const [showMenu, setShowMenu] = useState(false);

  const isActive = magnetMode !== 'none';

  const MODES = [
    { value: 'none' as const, label: 'Off', desc: 'Free movement' },
    { value: 'ohlc' as const, label: 'OHLC', desc: 'Snap to Open/High/Low/Close' },
    { value: 'close' as const, label: 'Close', desc: 'Snap to Close price' },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        title={`Magnet: ${magnetMode === 'none' ? 'Off' : magnetMode.toUpperCase()}`}
        className={`w-9 h-9 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95`}
        style={{
          backgroundColor: isActive ? theme.colors.toolActive : 'transparent',
          color: isActive ? '#fff' : theme.colors.textSecondary,
          boxShadow: isActive ? `0 0 15px ${theme.colors.toolActive}60` : 'none',
        }}
      >
        <MagnetIcon size={18} color={isActive ? '#fff' : theme.colors.textSecondary} />
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="absolute left-full top-0 ml-1 w-44 rounded-lg shadow-xl z-50 py-1"
            style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase" style={{ color: theme.colors.textMuted }}>
              Magnet Mode
            </div>
            {MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => {
                  setMagnetMode(mode.value);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5 transition-colors hover:bg-zinc-800/50"
                style={{
                  backgroundColor: magnetMode === mode.value ? theme.colors.toolActive : 'transparent',
                  color: magnetMode === mode.value ? '#fff' : theme.colors.text,
                }}
              >
                <span className="font-medium">{mode.label}</span>
                <span className="text-[10px]" style={{ color: magnetMode === mode.value ? '#fff' : theme.colors.textMuted }}>
                  {mode.desc}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
