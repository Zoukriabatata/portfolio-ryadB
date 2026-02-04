'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  getOrderflowEngine,
  resetOrderflowEngine,
  configureOrderflow,
  type FootprintCandle,
  type PriceLevel,
} from '@/lib/orderflow/OrderflowEngine';
import { getTradeAbsorptionEngine } from '@/lib/orderflow/TradeAbsorptionEngine';
import type { PassiveOrderLevel } from '@/types/passive-liquidity';
import {
  FootprintLayoutEngine,
  type LayoutMetrics,
} from '@/lib/orderflow/FootprintLayoutEngine';
import {
  getToolsEngine,
  resetToolsEngine,
  type ToolType,
  type Tool,
  type HandlePosition,
} from '@/lib/tools/ToolsEngine';
import { getToolsRenderer, type RenderContext } from '@/lib/tools/ToolsRenderer';
import { layoutPersistence, type LayoutData } from '@/lib/tools/LayoutPersistence';
import {
  getInteractionController,
  resetInteractionController,
  type InteractionMode,
} from '@/lib/tools/InteractionController';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { type TimeframeSeconds, TIMEFRAME_LABELS } from '@/lib/live/HierarchicalAggregator';
import {
  getFootprintDataService,
  resetFootprintDataService,
  type Trade,
  getSessionFootprintService,
  resetSessionFootprintService,
  getOptimizedFootprintService,
  resetOptimizedFootprintService,
} from '@/lib/footprint';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
  type FootprintColors,
} from '@/stores/useFootprintSettingsStore';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { useTimezoneStore, TIMEZONES, type TimezoneId } from '@/stores/useTimezoneStore';
import { useToolSettingsStore } from '@/stores/useToolSettingsStore';
import ToolSettingsPanel from '@/components/tools/ToolSettingsPanel';
import AdvancedToolSettingsModal from '@/components/tools/AdvancedToolSettingsModal';
import LayoutManagerPanel from '@/components/tools/LayoutManagerPanel';
import {
  getCachedLODState,
  invalidateLODCache,
  formatVolume,
  computeFootprintLOD,
  computeDeltaProfileWidth,
  type LODState,
  type FootprintLODState,
} from '@/lib/rendering';
import {
  getDxFeedFootprintEngine,
  resetDxFeedFootprintEngine,
} from '@/lib/dxfeed';
import {
  getTradeSimulator,
  resetTradeSimulator,
} from '@/lib/simulation';
import {
  CursorIcon,
  CrosshairIcon,
  TrendlineIcon,
  HLineIcon,
  RectangleIcon,
  LongPositionIcon,
  ShortPositionIcon,
  SettingsIcon,
  LayoutIcon,
} from '@/components/ui/Icons';
import { ContextMenu, createChartContextMenuItems, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import InlineTextEditor from '@/components/tools/InlineTextEditor';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import { useCoinStore } from '@/stores/useCoinStore';
import FootprintAdvancedSettings from '@/components/settings/FootprintAdvancedSettings';
import ToolSettingsBar from '@/components/tools/ToolSettingsBar';
import { PriceCountdownCompact } from '@/components/trading/PriceCountdown';
import FavoritesToolbar from '@/components/tools/FavoritesToolbar';
import { useFavoritesToolbarStore } from '@/stores/useFavoritesToolbarStore';

/**
 * FOOTPRINT CHART PRO - Style ATAS / NinjaTrader / TradingView
 *
 * Features:
 * - Layout fixe (pas de scroll page)
 * - Tools Engine avec sélection / drag / resize / delete
 * - Sauvegarde / chargement de layouts
 * - Personnalisation complète
 */

interface FootprintChartProProps {
  className?: string;
}

// Symbols - Crypto + CME Futures
const SYMBOLS = [
  // Crypto (Binance)
  { value: 'btcusdt', label: 'BTC/USDT', tickSize: 10, exchange: 'binance' },
  // CME Index Futures - Tick = 0.25 points for all
  { value: 'NQ', label: 'NQ (E-mini Nasdaq)', tickSize: 0.25, exchange: 'cme' },
  { value: 'MNQ', label: 'MNQ (Micro Nasdaq)', tickSize: 0.25, exchange: 'cme' },
  { value: 'ES', label: 'ES (E-mini S&P)', tickSize: 0.25, exchange: 'cme' },
  { value: 'MES', label: 'MES (Micro S&P)', tickSize: 0.25, exchange: 'cme' },
];

// Timeframes (footprint compatible only - 15m+ removed, candles only)
const TIMEFRAMES: TimeframeSeconds[] = [15, 30, 60, 180, 300];

// Tick sizes by symbol (for footprint aggregation)
// CME: 1 tick = 0.25 points (1 bid x 1 ask = 0.25)
const TICK_SIZE_OPTIONS: Record<string, number[]> = {
  // Crypto
  btcusdt: [5, 10, 25, 50, 100],
  // NQ/MNQ - tick = 0.25 points
  NQ: [0.25, 0.5, 1, 2, 4],
  MNQ: [0.25, 0.5, 1, 2, 4],
  // ES/MES - tick = 0.25 points
  ES: [0.25, 0.5, 1, 2, 4],
  MES: [0.25, 0.5, 1, 2, 4],
};

// Map symbol to exchange for data source routing
const SYMBOL_EXCHANGE: Record<string, 'binance' | 'cme'> = {
  btcusdt: 'binance',
  NQ: 'cme',
  MNQ: 'cme',
  ES: 'cme',
  MES: 'cme',
};

// Map TF to Binance interval
const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h',
};

// Tool icons - map to React components
const TOOL_ICON_COMPONENTS: Partial<Record<ToolType, React.FC<{ size?: number; color?: string }>>> = {
  cursor: CursorIcon,
  crosshair: CrosshairIcon,
  trendline: TrendlineIcon,
  horizontalLine: HLineIcon,
  rectangle: RectangleIcon,
  longPosition: LongPositionIcon,
  shortPosition: ShortPositionIcon,
};

// Fallback string icons for tools without custom icons
const TOOL_ICONS_FALLBACK: Record<ToolType, string> = {
  cursor: '↖',
  crosshair: '+',
  trendline: '╱',
  ray: '→',
  horizontalLine: '─',
  horizontalRay: '⟶',
  verticalLine: '│',
  rectangle: '▢',
  parallelChannel: '⫽',
  fibRetracement: '📐',
  fibExtension: '📏',
  arrow: '➤',
  brush: '✎',
  highlighter: '🖍',
  measure: '📐',
  longPosition: '▲',
  shortPosition: '▼',
  text: 'T',
};

const DRAWING_TOOLS: ToolType[] = [
  'cursor',
  'crosshair',
  'horizontalLine',
  'trendline',
  'rectangle',
  'longPosition',
  'shortPosition',
];

export default function FootprintChartPro({ className }: FootprintChartProProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutEngineRef = useRef<FootprintLayoutEngine | null>(null);
  const animationRef = useRef<number | null>(null);

  // Settings store
  const settings = useFootprintSettingsStore();
  const crosshairSettings = useCrosshairStore();
  const { timezone, setTimezone, formatTime, getTimezoneLabel } = useTimezoneStore();
  const { presets: favoritesPresets, addToolToPreset, removeToolFromPreset, activePreset: favoritesPreset } = useFavoritesToolbarStore();

  // State
  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [tickSize, setTickSize] = useState(10);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [textEditorState, setTextEditorState] = useState<{
    isOpen: boolean;
    toolId: string;
    content: string;
    position: { x: number; y: number };
    style: {
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: 'normal' | 'bold';
      color?: string;
      backgroundColor?: string;
    };
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showToolSettings, setShowToolSettings] = useState(false);
  const [showLayoutManager, setShowLayoutManager] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettingsPosition, setAdvancedSettingsPosition] = useState({ x: 100, y: 100 });
  const [toolPosition, setToolPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [toolSettingsModalPosition, setToolSettingsModalPosition] = useState({ x: 200, y: 150 });

  // Templates
  const { templates, saveTemplate, getTemplatesByType } = useChartTemplatesStore();
  const [showGrid, setShowGrid] = useState(settings.features.showGrid);

  // Coin store for task tracking
  const { updateTaskProgress } = useCoinStore();

  // Track footprint chart open (once per session)
  const hasTrackedOpenRef = useRef(false);
  useEffect(() => {
    if (!hasTrackedOpenRef.current) {
      hasTrackedOpenRef.current = true;
      updateTaskProgress('footprint_master');
      updateTaskProgress('daily_login');
    }
  }, [updateTaskProgress]);

  // Refs
  const priceRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<FootprintCandle[]>([]);
  const currentPriceRef = useRef<number>(0);

  // DEBUG: Direct trade tracking (bypasses candle logic)
  const debugTradesRef = useRef<Array<{ price: number; size: number; side: 'BID' | 'ASK'; time: number }>>([]);
  const debugTradeCountRef = useRef(0);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number; price: number; time: number } | null>(null);
  const lodRef = useRef<LODState | null>(null);
  const footprintLodRef = useRef<FootprintLODState | null>(null);
  const vwapDataRef = useRef<{ price: number; time: number }[]>([]);
  const twapDataRef = useRef<{ price: number; time: number }[]>([]);

  // Passive liquidity hover state for debug tooltip
  const hoveredPassiveLevelRef = useRef<PassiveOrderLevel | null>(null);
  const passiveLevelBoundsRef = useRef<Array<{
    level: PassiveOrderLevel;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // Drag state for panning and zooming
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const isPriceScaleDragRef = useRef(false);
  const priceScaleDragStartRef = useRef<{ y: number; zoomY: number } | null>(null);

  // Available tick sizes
  const availableTickSizes = useMemo(() => {
    return TICK_SIZE_OPTIONS[symbol] || [10];
  }, [symbol]);

  /**
   * Initialize layout engine
   */
  useEffect(() => {
    layoutEngineRef.current = new FootprintLayoutEngine({
      footprintWidth: settings.footprintWidth,
      rowHeight: settings.rowHeight,
      maxVisibleFootprints: settings.maxVisibleFootprints,
      showOHLC: settings.features.showOHLC,
      showDeltaProfile: settings.features.showDeltaProfile,
      showVolumeProfile: settings.features.showVolumeProfile,
      deltaProfilePosition: settings.deltaProfilePosition,
      candleGap: settings.candleGap || 3,
    });

    return () => {
      layoutEngineRef.current = null;
    };
  }, [settings.footprintWidth, settings.rowHeight, settings.maxVisibleFootprints, settings.features.showOHLC, settings.features.showDeltaProfile, settings.features.showVolumeProfile, settings.deltaProfilePosition, settings.candleGap]);

  /**
   * Initialize auto-save and restore
   */
  useEffect(() => {
    // Try to restore auto-save on mount
    const autoSave = layoutPersistence.loadAutoSave();
    if (autoSave) {
      layoutPersistence.applyLayout(autoSave);
    }

    // Start auto-save
    layoutPersistence.startAutoSave(() => ({
      chart: { symbol, timeframe, tickSize },
      colors: settings.colors,
      fonts: settings.fonts,
      features: settings.features,
      imbalance: settings.imbalance,
      layout: {
        footprintWidth: settings.footprintWidth,
        rowHeight: settings.rowHeight,
        maxVisibleFootprints: settings.maxVisibleFootprints,
        deltaProfilePosition: settings.deltaProfilePosition,
      },
    }));

    return () => {
      layoutPersistence.stopAutoSave();
    };
  }, [symbol, timeframe, tickSize, settings]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const controller = getInteractionController();
      const handled = controller.handleKeyDown(e);

      if (handled) {
        e.preventDefault();
        // Sync state after keyboard action
        const state = controller.getState();
        if (!state.selectedToolId) {
          setSelectedTool(null);
        }
        if (state.activeTool === 'cursor') {
          setActiveTool('cursor');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const controller = getInteractionController();
      controller.handleKeyUp(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  /**
   * Subscribe to tool events
   */
  useEffect(() => {
    const engine = getToolsEngine();

    const unsubSelect = engine.on('tool:select', (tool) => {
      // Only set selected tool if it's a complete Tool (has id)
      if (tool && 'id' in tool) {
        setSelectedTool(tool as Tool);
        setShowToolSettings(true);
      }
    });

    const unsubDeselect = engine.on('tool:deselect', () => {
      const selected = engine.getSelectedTools();
      if (selected.length === 0) {
        setSelectedTool(null);
        setShowToolSettings(false);
      } else {
        setSelectedTool(selected[0]);
      }
    });

    const unsubDelete = engine.on('tool:delete', () => {
      const selected = engine.getSelectedTools();
      if (selected.length === 0) {
        setSelectedTool(null);
        setShowToolSettings(false);
      }
    });

    return () => {
      unsubSelect();
      unsubDeselect();
      unsubDelete();
    };
  }, []);

  /**
   * Load footprint data using hybrid approach (klines + live trades)
   *
   * Historical: Klines with takerBuyVolume (fast, no rate limits)
   * Live: WebSocket aggTrades (real-time, exact bid/ask)
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds): Promise<FootprintCandle[]> => {
    const exchange = SYMBOL_EXCHANGE[sym] || 'binance';

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('Loading footprint data...');

    // CME Futures - Use dxFeed (handled in useEffect, not loadHistory)
    if (exchange === 'cme') {
      console.log(`[FootprintChartPro] CME symbol ${sym} - using dxFeed`);
      return []; // CME uses dxFeed, not Binance historical data
    }

    try {
      resetOptimizedFootprintService();

      const service = getOptimizedFootprintService({
        symbol: sym,
        timeframe: tf,
        tickSize,
        imbalanceRatio: settings.imbalance.ratio,
        recentHours: 0,   // No aggTrades fetch (avoid rate limits)
        totalHours: 4,    // 4h of klines
      });

      service.setProgressCallback((progress, message) => {
        setLoadingProgress(progress);
        setLoadingMessage(message);
      });

      console.log(`[FootprintChartPro] Loading footprint for ${sym}...`);

      const candles = await service.loadOptimized();

      console.log(`[FootprintChartPro] ✓ Loaded ${candles.length} candles`);

      return candles;
    } catch (error) {
      console.error('Failed to load footprint:', error);
      setLoadingMessage('Error loading data');

      // Fallback to legacy service
      const service = getFootprintDataService();
      service.setImbalanceRatio(settings.imbalance.ratio);

      return await service.loadHistory({
        symbol: sym,
        timeframe: tf,
        tickSize,
        hoursBack: 4,
        imbalanceRatio: settings.imbalance.ratio,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tickSize, settings.imbalance.ratio]);

  /**
   * Canvas rendering
   */
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const layout = layoutEngineRef.current;
    if (!canvas || !container || !layout) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { colors, fonts, features } = settings;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Update layout engine size
    layout.setContainerSize(width, height);

    // Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    const candles = candlesRef.current;
    const debugTrades = debugTradesRef.current;
    const exchange = SYMBOL_EXCHANGE[symbol] || 'binance';

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG MODE: If no candles but we have debug trades, render them directly
    // This proves data is flowing even if candle aggregation is broken
    // ═══════════════════════════════════════════════════════════════════════
    if (candles.length === 0 && exchange === 'cme' && debugTrades.length > 0) {
      // Background
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, height);

      // Title
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`DEBUG MODE - ${symbol}`, width / 2, 30);
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(`✓ ${debugTradeCountRef.current} trades received (candle aggregation bypassed)`, width / 2, 50);

      // Calculate price range from debug trades
      const prices = debugTrades.map(t => t.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;
      const padding = priceRange * 0.1;

      // Draw debug trades as colored rectangles
      const tradeWidth = Math.max(4, (width - 100) / Math.min(debugTrades.length, 50));
      const chartTop = 80;
      const chartHeight = height - 120;
      const chartLeft = 60;
      const chartWidth = width - 80;

      // Price axis
      ctx.fillStyle = colors.textMuted;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const price = minPrice - padding + (priceRange + 2 * padding) * (1 - i / 5);
        const y = chartTop + chartHeight * (i / 5);
        ctx.fillText(price.toFixed(2), chartLeft - 5, y + 3);
        ctx.strokeStyle = colors.gridColor;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(width - 20, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw each trade as a bar
      const visibleTrades = debugTrades.slice(-50);
      visibleTrades.forEach((trade, i) => {
        const x = chartLeft + (i / Math.min(visibleTrades.length, 50)) * chartWidth;
        const normalizedPrice = (trade.price - (minPrice - padding)) / (priceRange + 2 * padding);
        const y = chartTop + chartHeight * (1 - normalizedPrice);
        const barHeight = Math.max(3, trade.size * 2);

        // Color by side: ASK (buy) = green, BID (sell) = red
        ctx.fillStyle = trade.side === 'ASK' ? colors.deltaPositive : colors.deltaNegative;
        ctx.fillRect(x, y - barHeight / 2, tradeWidth - 1, barHeight);
      });

      // Legend
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.deltaPositive;
      ctx.fillRect(chartLeft, height - 30, 12, 12);
      ctx.fillStyle = colors.textPrimary;
      ctx.fillText('ASK (Buy)', chartLeft + 18, height - 20);
      ctx.fillStyle = colors.deltaNegative;
      ctx.fillRect(chartLeft + 100, height - 30, 12, 12);
      ctx.fillStyle = colors.textPrimary;
      ctx.fillText('BID (Sell)', chartLeft + 118, height - 20);

      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ Candle aggregation not working - showing raw trades', width / 2, height - 5);

      return;
    }

    if (candles.length === 0) {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';

      if (exchange === 'cme') {
        // CME - Show different messages based on connection state
        ctx.fillText(`${symbol} - CME Futures`, width / 2, height / 2 - 50);

        if (status === 'connected') {
          // Connected but no trades yet
          ctx.font = '12px system-ui';
          ctx.fillStyle = '#f59e0b';  // Orange - waiting
          ctx.fillText('⏳ Waiting for first trade...', width / 2, height / 2 - 20);
          ctx.fillStyle = colors.textMuted;
          ctx.font = '11px system-ui';
          ctx.fillText('dxFeed connected - market may be closed', width / 2, height / 2 + 5);
          ctx.fillText(`Debug trades received: ${debugTradeCountRef.current}`, width / 2, height / 2 + 25);

          // Show market hours info
          ctx.fillStyle = '#6b7280';
          ctx.font = '10px system-ui';
          ctx.fillText('CME Futures: Sun 6pm - Fri 5pm ET (with daily breaks)', width / 2, height / 2 + 50);
        } else if (status === 'connecting') {
          ctx.font = '12px system-ui';
          ctx.fillStyle = '#22c55e';
          ctx.fillText('Connecting to dxFeed...', width / 2, height / 2);
        } else {
          ctx.font = '12px system-ui';
          ctx.fillStyle = colors.deltaNegative;
          ctx.fillText('Disconnected', width / 2, height / 2);
        }
      } else {
        ctx.fillText('Waiting for data...', width / 2, height / 2);
      }
      return;
    }

    // Calculate metrics
    const metrics = layout.calculateMetrics(candles, tickSize);
    metricsRef.current = metrics;

    const { footprintAreaX, footprintAreaY, footprintAreaWidth, footprintAreaHeight } = metrics;
    const zoom = layout.getZoom();
    const rowH = settings.rowHeight * zoom;
    const fpWidth = settings.footprintWidth * zoom;
    const ohlcWidth = 14 * zoom;

    // Grid - Intelligent spacing based on zoom level
    if (features.showGrid) {
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = colors.gridOpacity;

      // Use intelligent grid spacing from layout engine
      const gridLevels = layout.getVisiblePriceLevels(metrics, tickSize);
      for (const price of gridLevels) {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════════════════
    // LOD STATE: FOOTPRINT vs CANDLES
    // - visibleBars <= 100 AND timeframe < 15m → FOOTPRINT
    // - visibleBars > 100 OR timeframe >= 15m → CANDLES
    // ═══════════════════════════════════════════════════════════════
    const footprintWidth = layout.getEffectiveFootprintWidth();
    const lod = getCachedLODState(
      metrics.visibleCandles.length,
      footprintWidth,
      rowH,
      100, // threshold
      timeframe
    );
    lodRef.current = lod;

    const isFootprintMode = lod.mode === 'footprint';

    // ═══════════════════════════════════════════════════════════════
    // INTELLIGENT PASSIVE LIQUIDITY - CORRÉLÉ AU FOOTPRINT
    // ═══════════════════════════════════════════════════════════════
    // - Couvre TOUTE la plage de prix visible
    // - Chaque trade footprint CONSOMME le passif correspondant
    // - Création forcée si trade sans passif
    // ═══════════════════════════════════════════════════════════════
    if (features.showPassiveLiquidity && settings.passiveLiquidity.enabled && isFootprintMode) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getPassiveLiquiditySimulator } = require('@/lib/orderflow/PassiveLiquiditySimulator');
      const simulator = getPassiveLiquiditySimulator();

      // Configure with current price and tick size
      simulator.setConfig({
        basePrice: currentPriceRef.current || metrics.visiblePriceMin + (metrics.visiblePriceMax - metrics.visiblePriceMin) / 2,
        tickSize,
        baseLiquidity: 15, // Volume par niveau
      });

      // CRITICAL: Generate levels for the ENTIRE visible price range
      simulator.setVisibleRange(metrics.visiblePriceMin, metrics.visiblePriceMax);

      // Tick for status updates (animations, fades)
      simulator.tick();

      const plSettings = settings.passiveLiquidity;

      // ═══════════════════════════════════════════════════════════════
      // UNIFIED PASSIVE LIQUIDITY RENDERING
      // ═══════════════════════════════════════════════════════════════
      // RÈGLE: Toutes les barres partent du bord DROIT vers l'INTÉRIEUR
      // - Même sens visuel pour bid et ask
      // - Couleur différencie bid (cyan) / ask (red)
      // - Le passif EXPLIQUE la footprint (pas décoratif)
      // ═══════════════════════════════════════════════════════════════

      const plSnapshot = simulator.getSnapshot();
      const maxVolume = Math.max(plSnapshot.maxBidVolume || 1, plSnapshot.maxAskVolume || 1);
      const maxBarWidth = plSettings.maxBarWidth * plSettings.intensity;
      const barHeight = rowH * 0.45; // Thinner bars for cleaner look

      // Position: Fixed to right edge, all bars extend LEFT (inward)
      const rightEdge = footprintAreaX + footprintAreaWidth - 5;

      ctx.save();

      // Helper function for formatting volume
      const formatPassiveVol = (vol: number): string => {
        const abs = Math.abs(vol);
        if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        if (abs >= 100) return Math.round(vol).toString();
        return vol.toFixed(1);
      };

      // Get coherent levels directly from simulator (not legacy format)
      const coherentLevels = simulator.getLevelsInRange(metrics.visiblePriceMin, metrics.visiblePriceMax);

      // Clear and rebuild bounds for hover detection
      passiveLevelBoundsRef.current = [];

      for (const level of coherentLevels) {
        const y = layout.priceToY(level.price, metrics);
        if (y < footprintAreaY - barHeight || y > footprintAreaY + footprintAreaHeight + barHeight) continue;

        // Skip if no remaining volume or not visible
        if (level.remainingVolume <= 0 || level.opacity < 0.05) continue;

        // ═══════════════════════════════════════════════════════════════
        // UNIFIED DIRECTION: All bars extend from RIGHT edge INWARD (left)
        // ═══════════════════════════════════════════════════════════════
        const volumeRatio = level.remainingVolume / maxVolume;
        const barWidth = Math.min(maxBarWidth, volumeRatio * maxBarWidth);
        const barX = rightEdge - barWidth; // Extend LEFT from right edge

        // Color based on side and status
        const baseColor = level.side === 'bid' ? plSettings.bidColor : plSettings.askColor;
        let color = baseColor;
        let opacityMod = 1.0;

        if (level.status === 'absorbing') {
          // Brighter color + pulse when absorbing
          color = level.side === 'bid' ? '#00ffff' : '#ff6666';
          const pulsePhase = (Date.now() % 400) / 400;
          opacityMod = 0.7 + 0.3 * Math.sin(pulsePhase * Math.PI * 2);
        } else if (level.status === 'executed') {
          color = '#666666';
          opacityMod = 0.3;
        } else if (level.status === 'spoofed') {
          color = '#ff0000';
          opacityMod = 0.5;
        }

        // Calculate final opacity
        const intensity = level.remainingVolume / level.initialVolume;
        const alpha = plSettings.opacity * level.opacity * opacityMod * (0.5 + intensity * 0.4);

        // Y offset: bid slightly above price line, ask slightly below
        const yOffset = level.side === 'bid' ? -barHeight * 0.6 : barHeight * 0.6;
        const barY = y + yOffset - barHeight / 2;

        // Store bounds for hover detection
        passiveLevelBoundsRef.current.push({
          level,
          x: barX,
          y: barY,
          width: barWidth,
          height: barHeight,
        });

        // Draw bar
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Absorption pulse effect (pulsing border)
        if (level.status === 'absorbing') {
          const pulsePhase = (Date.now() % 250) / 250;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1 + pulsePhase * 1.5;
          ctx.globalAlpha = (1 - pulsePhase) * 0.9;
          ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        }

        // Volume label (to the left of bar)
        if (level.remainingVolume > 0.5) {
          ctx.fillStyle = color;
          ctx.globalAlpha = Math.min(0.85, alpha * 1.3);
          ctx.font = '8px "Consolas", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(formatPassiveVol(level.remainingVolume), barX - 2, y + yOffset + 3);
        }

        // Spoofing indicator (red X)
        if (level.status === 'spoofed') {
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.8;
          const xSize = barHeight * 0.5;
          const xCenter = barX + barWidth / 2;
          ctx.beginPath();
          ctx.moveTo(xCenter - xSize, y + yOffset - xSize);
          ctx.lineTo(xCenter + xSize, y + yOffset + xSize);
          ctx.moveTo(xCenter + xSize, y + yOffset - xSize);
          ctx.lineTo(xCenter - xSize, y + yOffset + xSize);
          ctx.stroke();
        }

        // Iceberg indicator (diamond/ice symbol + hidden volume indicator)
        if (level.isIceberg && level.hiddenVolume > 0) {
          ctx.globalAlpha = 0.9;

          // Draw small diamond icon at the right edge of bar
          const iconSize = 4;
          const iconX = barX + barWidth + 3;
          const iconY = y + yOffset;

          // Diamond shape (iceberg symbol)
          ctx.fillStyle = '#60a5fa'; // Light blue for "ice"
          ctx.beginPath();
          ctx.moveTo(iconX, iconY - iconSize);
          ctx.lineTo(iconX + iconSize, iconY);
          ctx.lineTo(iconX, iconY + iconSize);
          ctx.lineTo(iconX - iconSize, iconY);
          ctx.closePath();
          ctx.fill();

          // Small "H" indicator for hidden volume
          ctx.fillStyle = '#93c5fd';
          ctx.font = 'bold 6px "Consolas", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`+${formatPassiveVol(level.hiddenVolume)}`, iconX + iconSize + 2, iconY + 2);

          // Show refill count if > 0
          if (level.refillCount > 0) {
            ctx.fillStyle = '#fbbf24'; // Amber for refills
            ctx.fillText(`(${level.refillCount}x)`, iconX + iconSize + 25, iconY + 2);
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // DEBUG HOVER TOOLTIP
      // ═══════════════════════════════════════════════════════════════
      if (hoveredPassiveLevelRef.current) {
        const hl = hoveredPassiveLevelRef.current;
        const tooltipWidth = 180;
        const isIcebergLevel = hl.isIceberg && (hl.hiddenVolume > 0 || hl.refillCount > 0);
        const tooltipHeight = isIcebergLevel ? 115 : 85; // Taller for icebergs
        const padding = 8;
        const lineHeight = 14;

        // Position tooltip near mouse but keep in bounds
        const mp = mousePositionRef.current;
        let tooltipX = mp ? mp.x + 15 : footprintAreaX + 100;
        let tooltipY = mp ? mp.y - tooltipHeight - 10 : footprintAreaY + 50;

        // Keep in bounds
        if (tooltipX + tooltipWidth > width - 60) tooltipX = width - 60 - tooltipWidth - 10;
        if (tooltipY < footprintAreaY) tooltipY = footprintAreaY + 10;

        // Draw tooltip background
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(15, 18, 25, 0.95)';
        ctx.strokeStyle = isIcebergLevel ? '#60a5fa' : (hl.side === 'bid' ? '#22d3ee' : '#ef4444');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 6);
        ctx.fill();
        ctx.stroke();

        // Title (with iceberg badge if applicable)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Consolas", monospace';
        ctx.textAlign = 'left';
        const titleText = isIcebergLevel
          ? `ICEBERG ${hl.side.toUpperCase()} @ ${hl.price.toFixed(2)}`
          : `PASSIVE ${hl.side.toUpperCase()} @ ${hl.price.toFixed(2)}`;
        ctx.fillText(titleText, tooltipX + padding, tooltipY + padding + 10);

        // Status indicator
        const statusColors: Record<string, string> = {
          active: '#4ade80',
          absorbing: '#fbbf24',
          executed: '#94a3b8',
          spoofed: '#ef4444',
        };
        ctx.fillStyle = statusColors[hl.status] || '#9ca3af';
        ctx.font = '9px "Consolas", monospace';
        ctx.fillText(`Status: ${hl.status.toUpperCase()}`, tooltipX + padding, tooltipY + padding + 10 + lineHeight);

        // Initial volume
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(`Initial: ${formatPassiveVol(hl.initialVolume)}`, tooltipX + padding, tooltipY + padding + 10 + lineHeight * 2);

        // Remaining volume
        ctx.fillStyle = hl.remainingVolume > hl.initialVolume * 0.5 ? '#4ade80' : hl.remainingVolume > 0 ? '#fbbf24' : '#ef4444';
        ctx.fillText(`Remaining: ${formatPassiveVol(hl.remainingVolume)}`, tooltipX + padding, tooltipY + padding + 10 + lineHeight * 3);

        // Absorbed volume
        ctx.fillStyle = hl.absorbedVolume > 0 ? '#f97316' : '#6b7280';
        ctx.fillText(`Absorbed: ${formatPassiveVol(hl.absorbedVolume)} (${((hl.absorbedVolume / Math.max(1, hl.initialVolume)) * 100).toFixed(1)}%)`, tooltipX + padding, tooltipY + padding + 10 + lineHeight * 4);

        // Iceberg info (if applicable)
        if (isIcebergLevel) {
          ctx.fillStyle = '#60a5fa';
          ctx.fillText(`Hidden: ${formatPassiveVol(hl.hiddenVolume)} | Refills: ${hl.refillCount}`, tooltipX + padding, tooltipY + padding + 10 + lineHeight * 5);

          // Total iceberg volume
          ctx.fillStyle = '#93c5fd';
          ctx.fillText(`Total: ${formatPassiveVol(hl.totalIcebergVolume)}`, tooltipX + padding, tooltipY + padding + 10 + lineHeight * 6);
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // ABSORPTION STATS PANEL (top-right corner)
      // ═══════════════════════════════════════════════════════════════
      if (plSettings.showStats !== false) {
        const stats = simulator.getStatistics();
        const panelWidth = 160;
        const panelHeight = 95;
        const panelX = footprintAreaX + footprintAreaWidth - panelWidth - 10;
        const panelY = footprintAreaY + 10;
        const padding = 8;
        const lineHeight = 12;

        // Panel background
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 6);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(100, 100, 120, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Title with mode indicator
        const isRealtimeMode = plSettings.useRealOrderbook ?? false;
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'bold 9px "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('PASSIVE LIQUIDITY', panelX + padding, panelY + padding + 8);

        // Mode badge (SIM or LIVE)
        const modeText = isRealtimeMode ? 'LIVE' : 'SIM';
        const modeColor = isRealtimeMode ? '#22c55e' : '#6b7280';
        const modeWidth = ctx.measureText(modeText).width + 8;
        ctx.fillStyle = isRealtimeMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)';
        ctx.fillRect(panelX + panelWidth - padding - modeWidth, panelY + padding, modeWidth, 12);
        ctx.fillStyle = modeColor;
        ctx.font = 'bold 8px "Consolas", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(modeText, panelX + panelWidth - padding - modeWidth / 2, panelY + padding + 9);
        ctx.textAlign = 'left';

        // Bid volume
        ctx.fillStyle = plSettings.bidColor;
        ctx.font = '9px "Consolas", monospace';
        ctx.fillText(`BID: ${formatPassiveVol(stats.totalBidVolume)}`, panelX + padding, panelY + padding + 8 + lineHeight * 1.5);

        // Ask volume
        ctx.fillStyle = plSettings.askColor;
        ctx.fillText(`ASK: ${formatPassiveVol(stats.totalAskVolume)}`, panelX + padding + 70, panelY + padding + 8 + lineHeight * 1.5);

        // Absorbed
        ctx.fillStyle = '#f97316';
        ctx.fillText(`Absorbed: ${formatPassiveVol(stats.totalAbsorbed)}`, panelX + padding, panelY + padding + 8 + lineHeight * 2.5);

        // Imbalance bar
        const imbalance = stats.volumeImbalance;
        const maxImbalance = Math.max(stats.totalBidVolume, stats.totalAskVolume) || 1;
        const imbalanceRatio = Math.min(1, Math.abs(imbalance) / maxImbalance);
        const barWidth = panelWidth - padding * 2;
        const barY = panelY + padding + 8 + lineHeight * 3.5;
        const barHeight = 6;

        // Bar background
        ctx.fillStyle = 'rgba(50, 50, 60, 0.5)';
        ctx.fillRect(panelX + padding, barY, barWidth, barHeight);

        // Imbalance indicator
        const centerX = panelX + padding + barWidth / 2;
        const indicatorWidth = barWidth * imbalanceRatio * 0.5;
        ctx.fillStyle = imbalance > 0 ? plSettings.bidColor : plSettings.askColor;
        if (imbalance > 0) {
          ctx.fillRect(centerX, barY, indicatorWidth, barHeight);
        } else {
          ctx.fillRect(centerX - indicatorWidth, barY, indicatorWidth, barHeight);
        }

        // Center line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, barY - 1);
        ctx.lineTo(centerX, barY + barHeight + 1);
        ctx.stroke();

        // Imbalance label
        ctx.fillStyle = imbalance > 0 ? '#4ade80' : imbalance < 0 ? '#ef4444' : '#9ca3af';
        ctx.font = '8px "Consolas", monospace';
        ctx.textAlign = 'center';
        const imbalanceLabel = imbalance > 0 ? `+${formatPassiveVol(imbalance)} BID` : imbalance < 0 ? `${formatPassiveVol(imbalance)} ASK` : 'BALANCED';
        ctx.fillText(imbalanceLabel, centerX, barY + barHeight + 10);
      }

      ctx.restore();
    }

    // Render each visible candle
    metrics.visibleCandles.forEach((candle, idx) => {
      const fpX = layout.getFootprintX(idx, metrics);

      // === OHLC CANDLE (only in footprint mode - thin candle on left) ===
      if (features.showOHLC && isFootprintMode) {
        const ohlcX = fpX;
        const isBullish = candle.close >= candle.open;

        const openY = layout.priceToY(candle.open, metrics);
        const closeY = layout.priceToY(candle.close, metrics);
        const highY = layout.priceToY(candle.high, metrics);
        const lowY = layout.priceToY(candle.low, metrics);

        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        const bodyX = ohlcX + 2;
        const bodyW = ohlcWidth - 4;

        // Wick
        ctx.strokeStyle = isBullish ? colors.candleUpWick : colors.candleDownWick;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bodyX + bodyW / 2, highY);
        ctx.lineTo(bodyX + bodyW / 2, lowY);
        ctx.stroke();

        // Body
        ctx.fillStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
        ctx.fillRect(bodyX, bodyTop, bodyW, bodyHeight);

        // Border
        ctx.strokeStyle = isBullish ? colors.candleUpBorder : colors.candleDownBorder;
        ctx.strokeRect(bodyX, bodyTop, bodyW, bodyHeight);
      }

      // === FOOTPRINT CELLS (only in footprint mode) - ATAS Professional Style ===
      if (isFootprintMode) {
        const cellStartX = fpX + (features.showOHLC ? ohlcWidth : 0);
        const centerX = cellStartX + fpWidth / 2;
        const isBullish = candle.close >= candle.open;

        // ═══════════════════════════════════════════════════════════════
        // LAYER 1: CANDLE CONTAINER - ATAS Style with visible border
        // ═══════════════════════════════════════════════════════════════
        const containerX = cellStartX + 2;
        const containerW = fpWidth - 4;
        const containerTop = layout.priceToY(candle.high, metrics) - rowH / 2;
        const containerBottom = layout.priceToY(candle.low, metrics) + rowH / 2;
        const containerH = containerBottom - containerTop;

        // Container background (configurable opacity)
        const containerOpacity = colors.footprintContainerOpacity ?? 0.03;
        ctx.fillStyle = isBullish ? colors.deltaPositive : colors.deltaNegative;
        ctx.globalAlpha = containerOpacity;
        ctx.fillRect(containerX, containerTop, containerW, containerH);
        ctx.globalAlpha = 1;

        // Container border - visible ATAS style
        // Use white/light border like in the ATAS screenshots
        ctx.strokeStyle = isBullish ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(containerX, containerTop, containerW, containerH);

        // Left color indicator bar (like ATAS)
        ctx.fillStyle = isBullish ? colors.deltaPositive : colors.deltaNegative;
        ctx.fillRect(containerX, containerTop, 2, containerH);

        // Calculate max volume for normalization
        let maxLevelVol = 1;
        candle.levels.forEach(level => {
          maxLevelVol = Math.max(maxLevelVol, level.bidVolume, level.askVolume);
        });

        // ═══════════════════════════════════════════════════════════════
        // LAYER 2: DELTA PROFILE BARS (Fill entire row height)
        // ═══════════════════════════════════════════════════════════════
        const barMaxW = (fpWidth / 2) - 8; // More space for bars

        candle.levels.forEach((level, price) => {
          const y = layout.priceToY(price, metrics);
          if (y < footprintAreaY - rowH || y > footprintAreaY + footprintAreaHeight + rowH) return;

          const cellY = y - rowH / 2;
          const barH = rowH - 2; // Fill the row height with small padding

          // Bid volume bar (left side, fills from center to left)
          if (level.bidVolume > 0) {
            const intensity = level.bidVolume / maxLevelVol;
            const bidW = intensity * barMaxW;
            ctx.fillStyle = colors.bidColor;
            ctx.globalAlpha = 0.15 + intensity * 0.25; // Intensity-based opacity
            ctx.fillRect(centerX - 2 - bidW, cellY + 1, bidW, barH);
            ctx.globalAlpha = 1;
          }

          // Ask volume bar (right side, fills from center to right)
          if (level.askVolume > 0) {
            const intensity = level.askVolume / maxLevelVol;
            const askW = intensity * barMaxW;
            ctx.fillStyle = colors.askColor;
            ctx.globalAlpha = 0.15 + intensity * 0.25; // Intensity-based opacity
            ctx.fillRect(centerX + 2, cellY + 1, askW, barH);
            ctx.globalAlpha = 1;
          }
        });

        // ═══════════════════════════════════════════════════════════════
        // LAYER 3: POC HIGHLIGHT (Before text)
        // ═══════════════════════════════════════════════════════════════
        if (features.showPOC && candle.poc) {
          const pocY = layout.priceToY(candle.poc, metrics);
          const pocCellY = pocY - rowH / 2;

          // Subtle gold background
          ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
          ctx.fillRect(cellStartX + 2, pocCellY + 1, fpWidth - 4, rowH - 2);

          // Gold left border (ATAS style indicator)
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(cellStartX + 1, pocCellY + 2, 2, rowH - 4);
        }

        // ═══════════════════════════════════════════════════════════════
        // LAYER 4: TEXT (Foreground layer - render LAST)
        // ═══════════════════════════════════════════════════════════════
        const fontSize = Math.max(9, Math.min(11, Math.round(fonts.volumeFontSize * zoom)));
        const monoFont = `${fontSize}px "Consolas", "Monaco", "Courier New", monospace`;
        const boldMonoFont = `bold ${fontSize}px "Consolas", "Monaco", "Courier New", monospace`;

        candle.levels.forEach((level, price) => {
          const y = layout.priceToY(price, metrics);
          if (y < footprintAreaY - rowH || y > footprintAreaY + footprintAreaHeight + rowH) return;

          const isPOC = price === candle.poc;
          const textY = y + fontSize / 3;

          // ─────────────────────────────────────────────────────────────
          // BID TEXT (Left side)
          // ─────────────────────────────────────────────────────────────
          if (level.bidVolume > 0) {
            // ATAS-style: Imbalance = bright color on NUMBER, not background
            if (features.showImbalances && level.imbalanceSell) {
              // Sell imbalance: Bright red/magenta on bid number
              ctx.fillStyle = '#ff4757';
              ctx.font = boldMonoFont;
            } else {
              ctx.fillStyle = isPOC ? '#fbbf24' : colors.bidTextColor;
              ctx.font = isPOC ? boldMonoFont : monoFont;
            }
            ctx.textAlign = 'right';
            ctx.fillText(formatVolATAS(level.bidVolume, zoom), centerX - 5, textY);
          }

          // ─────────────────────────────────────────────────────────────
          // SEPARATOR (x) - White color
          // ─────────────────────────────────────────────────────────────
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          ctx.font = `${fontSize - 1}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('x', centerX, textY);
          ctx.globalAlpha = 1;

          // ─────────────────────────────────────────────────────────────
          // ASK TEXT (Right side)
          // ─────────────────────────────────────────────────────────────
          if (level.askVolume > 0) {
            // ATAS-style: Imbalance = bright color on NUMBER, not background
            if (features.showImbalances && level.imbalanceBuy) {
              // Buy imbalance: Bright green/cyan on ask number
              ctx.fillStyle = '#2ed573';
              ctx.font = boldMonoFont;
            } else {
              ctx.fillStyle = isPOC ? '#fbbf24' : colors.askTextColor;
              ctx.font = isPOC ? boldMonoFont : monoFont;
            }
            ctx.textAlign = 'left';
            ctx.fillText(formatVolATAS(level.askVolume, zoom), centerX + 5, textY);
          }
        });
      } else {
        // === CANDLE MODE: Render clean candlestick with crisp pixel-perfect lines ===
        const isBullish = candle.close >= candle.open;

        // Use integer coordinates + 0.5 offset for crisp 1px lines
        const openY = Math.round(layout.priceToY(candle.open, metrics));
        const closeY = Math.round(layout.priceToY(candle.close, metrics));
        const highY = Math.round(layout.priceToY(candle.high, metrics));
        const lowY = Math.round(layout.priceToY(candle.low, metrics));

        const bodyTop = Math.min(openY, closeY);
        const bodyBottom = Math.max(openY, closeY);
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);
        const candleWidth = Math.max(2, Math.round(footprintWidth * lod.candleBodyWidth));
        const candleX = Math.round(fpX + (footprintWidth - candleWidth) / 2);
        const centerX = Math.round(fpX + footprintWidth / 2) + 0.5; // +0.5 for crisp 1px line

        // Wick - use 0.5 offset for crisp rendering
        ctx.strokeStyle = isBullish ? colors.candleUpWick : colors.candleDownWick;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, highY + 0.5);
        ctx.lineTo(centerX, lowY + 0.5);
        ctx.stroke();

        // Body
        ctx.fillStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
        ctx.fillRect(candleX, bodyTop, candleWidth, bodyHeight);

        // Border - only if candle is wide enough
        if (candleWidth > 3) {
          ctx.strokeStyle = isBullish ? colors.candleUpBorder : colors.candleDownBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(candleX + 0.5, bodyTop + 0.5, candleWidth - 1, bodyHeight - 1);
        }
      }

      // Vertical separator
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fpX + totalFpWidth, footprintAreaY);
      ctx.lineTo(fpX + totalFpWidth, footprintAreaY + footprintAreaHeight);
      ctx.stroke();

    });

    // ═══════════════════════════════════════════════════════════════
    // VWAP/TWAP LINE - Combined indicator
    // ═══════════════════════════════════════════════════════════════
    if (features.showVWAPTWAP && metrics.visibleCandles.length > 0) {
      // Calculate VWAP: Sum(Price * Volume) / Sum(Volume)
      let cumulativeTPV = 0; // Total Price * Volume
      let cumulativeVolume = 0;
      const vwapPoints: { x: number; y: number }[] = [];

      metrics.visibleCandles.forEach((candle, idx) => {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        cumulativeTPV += typicalPrice * candle.totalVolume;
        cumulativeVolume += candle.totalVolume;

        const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
        const fpX = layout.getFootprintX(idx, metrics);
        const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
        const x = fpX + totalFpWidth / 2;
        const y = layout.priceToY(vwap, metrics);

        if (y >= footprintAreaY && y <= footprintAreaY + footprintAreaHeight) {
          vwapPoints.push({ x, y });
        }
      });

      // Draw VWAP line
      if (vwapPoints.length > 1) {
        ctx.strokeStyle = '#ff9800'; // Orange for VWAP
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(vwapPoints[0].x, vwapPoints[0].y);
        for (let i = 1; i < vwapPoints.length; i++) {
          ctx.lineTo(vwapPoints[i].x, vwapPoints[i].y);
        }
        ctx.stroke();

        // VWAP label
        const lastPoint = vwapPoints[vwapPoints.length - 1];
        ctx.fillStyle = '#ff9800';
        ctx.font = 'bold 9px "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('VWAP', lastPoint.x + 5, lastPoint.y - 3);
      }

      // Calculate TWAP: Simple average of typical prices
      let twapSum = 0;
      const twapPoints: { x: number; y: number }[] = [];

      metrics.visibleCandles.forEach((candle, idx) => {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        twapSum += typicalPrice;
        const twap = twapSum / (idx + 1);

        const fpX = layout.getFootprintX(idx, metrics);
        const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
        const x = fpX + totalFpWidth / 2;
        const y = layout.priceToY(twap, metrics);

        if (y >= footprintAreaY && y <= footprintAreaY + footprintAreaHeight) {
          twapPoints.push({ x, y });
        }
      });

      // Draw TWAP line (dashed)
      if (twapPoints.length > 1) {
        ctx.strokeStyle = '#2196f3'; // Blue for TWAP
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(twapPoints[0].x, twapPoints[0].y);
        for (let i = 1; i < twapPoints.length; i++) {
          ctx.lineTo(twapPoints[i].x, twapPoints[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // TWAP label
        const lastPoint = twapPoints[twapPoints.length - 1];
        ctx.fillStyle = '#2196f3';
        ctx.font = 'bold 9px "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.fillText('TWAP', lastPoint.x + 5, lastPoint.y + 10);
      }
    }

    // === DELTA PROFILE (only in footprint mode) - ATAS Professional Style ===
    if (isFootprintMode && features.showDeltaProfile && metrics.visibleCandles.length > 0) {
      const dpPos = layout.getDeltaProfilePosition(metrics);
      const dpWidth = dpPos.width;
      const dpX = dpPos.x;

      // Background
      ctx.fillStyle = colors.surface;
      ctx.fillRect(dpX, footprintAreaY, dpWidth, footprintAreaHeight);

      // Left border separator
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dpX, footprintAreaY);
      ctx.lineTo(dpX, footprintAreaY + footprintAreaHeight);
      ctx.stroke();

      // Collect delta by price with smoothing
      const deltaByPrice = new Map<number, number>();
      let maxDelta = 1;

      metrics.visibleCandles.forEach(candle => {
        candle.levels.forEach((level, price) => {
          const current = deltaByPrice.get(price) || 0;
          const newDelta = current + level.delta;
          deltaByPrice.set(price, newDelta);
          maxDelta = Math.max(maxDelta, Math.abs(newDelta));
        });
      });

      // ATAS-compliant: Raw delta profile (no smoothing)
      // Pas de lissage destructeur - affichage exact du delta agrégé
      const smoothedDelta = deltaByPrice;

      // Center line (zero reference)
      const centerLineX = dpX + dpWidth / 2;
      ctx.strokeStyle = colors.textMuted;
      ctx.globalAlpha = 0.2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(centerLineX, footprintAreaY);
      ctx.lineTo(centerLineX, footprintAreaY + footprintAreaHeight);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Render smoothed delta bars
      const barMaxWidth = (dpWidth - 10) / 2;

      smoothedDelta.forEach((delta, price) => {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) return;

        const barWidth = (Math.abs(delta) / maxDelta) * barMaxWidth;
        const isPositive = delta >= 0;
        const barH = Math.max(2, rowH * 0.5);

        // Gradient-like opacity based on intensity
        const intensity = Math.abs(delta) / maxDelta;
        ctx.globalAlpha = 0.4 + intensity * 0.5;

        ctx.fillStyle = isPositive ? colors.deltaPositive : colors.deltaNegative;

        if (isPositive) {
          // Positive delta: green bar from center to right
          ctx.fillRect(centerLineX, y - barH / 2, barWidth, barH);
        } else {
          // Negative delta: red bar from center to left
          ctx.fillRect(centerLineX - barWidth, y - barH / 2, barWidth, barH);
        }
      });
      ctx.globalAlpha = 1;
    }

    // === SESSION VOLUME PROFILE - ATAS Professional Style ===
    // Aggregates volume by price across all visible candles
    if (isFootprintMode && features.showVolumeProfile && metrics.visibleCandles.length > 0) {
      const vpPos = layout.getVolumeProfilePosition(metrics);
      const vpWidth = vpPos.width;
      const vpX = vpPos.x;

      // Background
      ctx.fillStyle = colors.surface;
      ctx.fillRect(vpX, footprintAreaY, vpWidth, footprintAreaHeight);

      // Left border separator
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vpX, footprintAreaY);
      ctx.lineTo(vpX, footprintAreaY + footprintAreaHeight);
      ctx.stroke();

      // Collect volume by price
      const volumeByPrice = new Map<number, { total: number; bid: number; ask: number }>();
      let maxVolume = 1;
      let pocPrice = 0;
      let pocVolume = 0;

      metrics.visibleCandles.forEach(candle => {
        candle.levels.forEach((level, price) => {
          const current = volumeByPrice.get(price) || { total: 0, bid: 0, ask: 0 };
          current.total += level.totalVolume;
          current.bid += level.bidVolume;
          current.ask += level.askVolume;
          volumeByPrice.set(price, current);

          if (current.total > maxVolume) {
            maxVolume = current.total;
          }
          if (current.total > pocVolume) {
            pocVolume = current.total;
            pocPrice = price;
          }
        });
      });

      // Calculate VAH/VAL (70% of volume)
      const sortedPrices = Array.from(volumeByPrice.entries())
        .sort((a, b) => b[1].total - a[1].total);
      const totalVolume = sortedPrices.reduce((sum, [_, v]) => sum + v.total, 0);
      const targetVolume = totalVolume * 0.7;

      let accumulatedVolume = 0;
      const valueAreaPrices = new Set<number>();
      for (const [price, data] of sortedPrices) {
        valueAreaPrices.add(price);
        accumulatedVolume += data.total;
        if (accumulatedVolume >= targetVolume) break;
      }

      const valueAreaArray = Array.from(valueAreaPrices);
      const vah = Math.max(...valueAreaArray);
      const val = Math.min(...valueAreaArray);

      // Render volume bars
      const barMaxWidth = vpWidth - 6;

      volumeByPrice.forEach((data, price) => {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) return;

        const barWidth = (data.total / maxVolume) * barMaxWidth;
        const barH = Math.max(2, rowH * 0.6);
        const isPOC = price === pocPrice;
        const isValueArea = valueAreaPrices.has(price);

        // Determine bar color
        if (isPOC) {
          ctx.fillStyle = '#fbbf24'; // Gold for POC
          ctx.globalAlpha = 0.9;
        } else if (isValueArea) {
          ctx.fillStyle = '#3b82f6'; // Blue for Value Area
          ctx.globalAlpha = 0.7;
        } else {
          ctx.fillStyle = '#6b7280'; // Gray for outside VA
          ctx.globalAlpha = 0.4;
        }

        ctx.fillRect(vpX + 3, y - barH / 2, barWidth, barH);
        ctx.globalAlpha = 1;
      });

      // Draw VAH/VAL/POC lines - EXTENDED ACROSS ENTIRE CHART
      if (vah !== val) {
        const vahY = layout.priceToY(vah, metrics);
        const valY = layout.priceToY(val, metrics);
        const sessPocY = layout.priceToY(pocPrice, metrics);

        // Draw extended lines across the entire chart (not just VP area)
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.5;

        // VAH Line - extends across chart
        if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, vahY);
          ctx.lineTo(vpX - 5, vahY);
          ctx.stroke();

          // Also draw in VP area (solid)
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(vpX, vahY);
          ctx.lineTo(vpX + vpWidth, vahY);
          ctx.stroke();
          ctx.setLineDash([3, 3]);
        }

        // VAL Line - extends across chart
        if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, valY);
          ctx.lineTo(vpX - 5, valY);
          ctx.stroke();

          // Also draw in VP area (solid)
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(vpX, valY);
          ctx.lineTo(vpX + vpWidth, valY);
          ctx.stroke();
          ctx.setLineDash([3, 3]);
        }

        // POC Line - extends across chart (golden)
        if (sessPocY >= footprintAreaY && sessPocY <= footprintAreaY + footprintAreaHeight) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, sessPocY);
          ctx.lineTo(vpX - 5, sessPocY);
          ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Labels on left side of chart
        ctx.font = 'bold 9px "Consolas", monospace';
        ctx.textAlign = 'left';

        if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
          ctx.fillStyle = '#6366f1';
          ctx.fillText('VAH', 4, vahY - 3);
        }
        if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
          ctx.fillStyle = '#6366f1';
          ctx.fillText('VAL', 4, valY + 10);
        }
        if (sessPocY >= footprintAreaY && sessPocY <= footprintAreaY + footprintAreaHeight) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('POC', 4, sessPocY + 3);
        }

        // Also add labels on the VP side
        ctx.textAlign = 'right';
        if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
          ctx.fillStyle = '#6366f1';
          ctx.fillText('VAH', vpX + vpWidth - 2, vahY - 2);
        }
        if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
          ctx.fillStyle = '#6366f1';
          ctx.fillText('VAL', vpX + vpWidth - 2, valY + 8);
        }
      }

      // POC Label in VP area
      const pocY = layout.priceToY(pocPrice, metrics);
      if (pocY >= footprintAreaY && pocY <= footprintAreaY + footprintAreaHeight) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 8px "Consolas", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('POC', vpX + vpWidth - 2, pocY + 3);
      }
    }

    // === CURRENT PRICE LINE - Customizable Style ===
    if (features.showCurrentPrice && currentPriceRef.current > 0) {
      const priceY = layout.priceToY(currentPriceRef.current, metrics);
      if (priceY >= footprintAreaY && priceY <= footprintAreaY + footprintAreaHeight) {
        // Line with customizable style
        ctx.strokeStyle = colors.currentPriceColor;
        ctx.lineWidth = colors.currentPriceLineWidth || 1;

        // Set line style based on settings
        const lineStyle = colors.currentPriceLineStyle || 'dashed';
        if (lineStyle === 'dashed') {
          ctx.setLineDash([4, 2]);
        } else if (lineStyle === 'dotted') {
          ctx.setLineDash([2, 2]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width - 62, priceY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label box (only if showLabel enabled)
        if (colors.currentPriceShowLabel !== false) {
          const labelH = 18;
          const labelY = priceY - labelH / 2;

          // Box background (use custom label bg color if set)
          ctx.fillStyle = colors.currentPriceLabelBg || colors.currentPriceColor;
          ctx.fillRect(width - 60, labelY, 60, labelH);

          // Triangle pointer
          ctx.beginPath();
          ctx.moveTo(width - 62, priceY);
          ctx.lineTo(width - 60, priceY - 4);
          ctx.lineTo(width - 60, priceY + 4);
          ctx.closePath();
          ctx.fill();

          // Price text
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(
            `$${currentPriceRef.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            width - 4,
            priceY + 4
          );
        }
      }
    }

    // === PRICE SCALE - Professional Style ===
    // Background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(width - 60, footprintAreaY, 60, footprintAreaHeight);

    // Left border
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - 60, footprintAreaY);
    ctx.lineTo(width - 60, footprintAreaY + footprintAreaHeight);
    ctx.stroke();

    // Price labels - Intelligent precision based on zoom level
    ctx.fillStyle = colors.textSecondary;
    ctx.font = `${fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
    ctx.textAlign = 'right';

    // Use intelligent grid levels for price labels
    const isCME = SYMBOL_EXCHANGE[symbol] === 'cme';
    const priceLevels = layout.getVisiblePriceLevels(metrics, tickSize);

    // Filter to show only every Nth label based on zoom for readability
    const zoomY = layout.getZoomY();
    const labelSkip = zoomY < 0.3 ? 3 : zoomY < 0.7 ? 2 : 1;

    priceLevels.forEach((price, idx) => {
      // Skip some labels when very zoomed out for readability
      if (idx % labelSkip !== 0) return;

      const y = layout.priceToY(price, metrics);

      // FIXED: Allow some overflow to show prices beyond visible candle data
      // Add 15px padding to both top and bottom for price labels
      const labelPadding = 15;
      if (y < footprintAreaY - labelPadding || y > footprintAreaY + footprintAreaHeight + labelPadding) return;

      // Tick mark
      ctx.strokeStyle = colors.gridColor;
      ctx.beginPath();
      ctx.moveTo(width - 60, y);
      ctx.lineTo(width - 56, y);
      ctx.stroke();

      // Format price with intelligent precision
      const formattedPrice = layout.formatPriceWithZoom(price, tickSize, isCME);
      const prefix = isCME ? '' : '$';
      ctx.fillText(`${prefix}${formattedPrice}`, width - 4, y + 3);
    });

    // ═══════════════════════════════════════════════════════════════
    // CLUSTER STATIC PANEL - Bottom panel with Time/Ask/Bid/Delta/Volume
    // Time markers integrated as first row
    // ═══════════════════════════════════════════════════════════════
    const clusterRowH = 16; // Height per row (compact)
    const numRows = features.showHourMarkers ? 5 : 4; // Time + Ask/Bid/Delta/Volume
    const clusterStaticHeight = features.showClusterStatic ? (clusterRowH * numRows + 4) : 0;
    const footerHeight = clusterStaticHeight + 6;
    const footerY = height - footerHeight;

    // Footer background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, footerY, width, footerHeight);

    // Top border of footer
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(width, footerY);
    ctx.stroke();

    if (features.showClusterStatic && metrics.visibleCandles.length > 0) {
      const labelWidth = 50; // Width for row labels
      const clusterY = footerY + 2;
      const visibleCount = metrics.visibleCandles.length;

      // Calculate cell width to determine display mode
      const sampleFpX = layout.getFootprintX(0, metrics);
      const sampleFpX2 = metrics.visibleCandles.length > 1 ? layout.getFootprintX(1, metrics) : sampleFpX + fpWidth;
      const cellWidth = sampleFpX2 - sampleFpX;

      // Determine display mode based on cell width (more reliable than candle count)
      // showValues when cell is wide enough for text (~40px minimum)
      const showValues = cellWidth >= 40;

      // Row labels
      const rowLabels = features.showHourMarkers ? ['Time', 'Ask', 'Bid', 'Delta', 'Vol'] : ['Ask', 'Bid', 'Delta', 'Vol'];
      ctx.font = '9px "Consolas", "Monaco", monospace';
      ctx.textAlign = 'left';

      // Row labels background
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, clusterY, labelWidth, clusterRowH * numRows);

      rowLabels.forEach((label, i) => {
        ctx.fillStyle = colors.textMuted;
        ctx.fillText(label, 4, clusterY + clusterRowH * i + 11);

        // Row separator
        ctx.strokeStyle = colors.gridColor;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, clusterY + clusterRowH * (i + 1));
        ctx.lineTo(width, clusterY + clusterRowH * (i + 1));
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Vertical separator after labels
      ctx.strokeStyle = colors.gridColor;
      ctx.beginPath();
      ctx.moveTo(labelWidth, clusterY);
      ctx.lineTo(labelWidth, clusterY + clusterRowH * numRows);
      ctx.stroke();

      // Calculate max values for color normalization
      let maxAsk = 1, maxBid = 1, maxDelta = 1, maxVolume = 1;
      metrics.visibleCandles.forEach(candle => {
        let totalAsk = 0, totalBid = 0;
        candle.levels.forEach(level => {
          totalAsk += level.askVolume;
          totalBid += level.bidVolume;
        });
        maxAsk = Math.max(maxAsk, totalAsk);
        maxBid = Math.max(maxBid, totalBid);
        maxDelta = Math.max(maxDelta, Math.abs(candle.totalDelta));
        maxVolume = Math.max(maxVolume, candle.totalVolume);
      });

      // Row offsets (different if time row is included)
      const timeRowOffset = features.showHourMarkers ? 0 : -1;
      const askRowY = clusterY + clusterRowH * (1 + timeRowOffset);
      const bidRowY = clusterY + clusterRowH * (2 + timeRowOffset);
      const deltaRowY = clusterY + clusterRowH * (3 + timeRowOffset);
      const volRowY = clusterY + clusterRowH * (4 + timeRowOffset);

      // Render cluster data for each candle
      metrics.visibleCandles.forEach((candle, idx) => {
        const fpX = layout.getFootprintX(idx, metrics);
        const totalFpW = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
        const cellX = fpX;
        const cellW = totalFpW;
        const centerX = cellX + cellW / 2;

        // Calculate totals for this candle
        let totalAsk = 0;
        let totalBid = 0;
        candle.levels.forEach(level => {
          totalAsk += level.askVolume;
          totalBid += level.bidVolume;
        });
        const delta = candle.totalDelta;
        const volume = candle.totalVolume;

        // Time row (if enabled) - FIXED: Uses timezone store for formatting
        if (features.showHourMarkers) {
          const date = new Date(candle.time * 1000);
          const isHourBoundary = date.getMinutes() === 0 && date.getSeconds() === 0;

          // Time row background for hour boundaries
          if (isHourBoundary) {
            ctx.fillStyle = 'rgba(100, 150, 200, 0.15)';
            ctx.fillRect(cellX, clusterY, cellW, clusterRowH);
          }

          if (showValues) {
            // Show time text - use timezone-aware formatting
            const timeLabel = formatTime(candle.time, 'time');
            ctx.font = isHourBoundary ? 'bold 8px "Consolas", monospace' : '8px "Consolas", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = isHourBoundary ? colors.textPrimary : colors.textMuted;
            ctx.fillText(timeLabel, centerX, clusterY + 11);
          }
        }

        // Cell padding to prevent overlap with borders
        const cellPadding = 1;
        const paddedCellX = cellX + cellPadding;
        const paddedCellW = Math.max(1, cellW - cellPadding * 2);
        const paddedRowH = clusterRowH - 1;

        // FIXED: Clip all cell rendering to prevent overlap
        ctx.save();
        ctx.beginPath();
        ctx.rect(cellX, clusterY, cellW, clusterRowH * numRows);
        ctx.clip();

        if (showValues) {
          // ═══════════════════════════════════════════════════════════════
          // VALUES MODE - Show numbers when cells are wide enough
          // ═══════════════════════════════════════════════════════════════

          // Delta row background color - using cluster delta colors from settings
          const deltaIntensity = Math.min(1, Math.abs(delta) / Math.max(1, volume) * 2);
          const deltaOpacity = (colors.clusterDeltaOpacity || 0.35) * deltaIntensity;
          if (delta > 0) {
            ctx.fillStyle = colors.clusterDeltaPositive || colors.deltaPositive;
            ctx.globalAlpha = deltaOpacity;
          } else if (delta < 0) {
            ctx.fillStyle = colors.clusterDeltaNegative || colors.deltaNegative;
            ctx.globalAlpha = deltaOpacity;
          }
          if (delta !== 0) {
            ctx.fillRect(paddedCellX, deltaRowY + 1, paddedCellW, paddedRowH);
            ctx.globalAlpha = 1;
          }

          // Draw vertical separator
          ctx.strokeStyle = colors.gridColor;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(cellX + cellW, clusterY);
          ctx.lineTo(cellX + cellW, clusterY + clusterRowH * numRows);
          ctx.stroke();
          ctx.globalAlpha = 1;

          // FIXED: Use smaller font when cells are narrow, adaptive sizing
          const isNarrowCell = cellW < 60;
          const fontSize = isNarrowCell ? 7 : 8;
          ctx.font = `${fontSize}px "Consolas", "Monaco", monospace`;
          ctx.textAlign = 'center';

          // FIXED: Use abbreviated format for narrow cells
          const formatVal = isNarrowCell
            ? (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(Math.round(v))
            : formatVolCluster;

          // Ask row
          ctx.fillStyle = colors.askTextColor;
          ctx.fillText(formatVal(totalAsk), centerX, askRowY + 11);

          // Bid row
          ctx.fillStyle = colors.bidTextColor;
          ctx.fillText(formatVal(totalBid), centerX, bidRowY + 11);

          // Delta row
          ctx.fillStyle = delta >= 0 ? colors.deltaPositive : colors.deltaNegative;
          ctx.font = `bold ${fontSize}px "Consolas", "Monaco", monospace`;
          ctx.fillText(formatVal(delta), centerX, deltaRowY + 11);

          // Volume row
          ctx.fillStyle = colors.textMuted;
          ctx.font = `${fontSize}px "Consolas", "Monaco", monospace`;
          ctx.fillText(formatVal(volume), centerX, volRowY + 11);

        } else {
          // ═══════════════════════════════════════════════════════════════
          // COLORS MODE - Show colored cells only (no text)
          // ═══════════════════════════════════════════════════════════════

          // Ask row - green intensity
          const askIntensity = totalAsk / maxAsk;
          ctx.fillStyle = colors.askColor;
          ctx.globalAlpha = 0.15 + askIntensity * 0.55;
          ctx.fillRect(paddedCellX, askRowY + 1, paddedCellW, paddedRowH);
          ctx.globalAlpha = 1;

          // Bid row - red intensity
          const bidIntensity = totalBid / maxBid;
          ctx.fillStyle = colors.bidColor;
          ctx.globalAlpha = 0.15 + bidIntensity * 0.55;
          ctx.fillRect(paddedCellX, bidRowY + 1, paddedCellW, paddedRowH);
          ctx.globalAlpha = 1;

          // Delta row - green/red based on sign with cluster delta colors
          const deltaIntensity = Math.abs(delta) / maxDelta;
          const baseOpacity = colors.clusterDeltaOpacity || 0.35;
          if (delta >= 0) {
            ctx.fillStyle = colors.clusterDeltaPositive || colors.deltaPositive;
          } else {
            ctx.fillStyle = colors.clusterDeltaNegative || colors.deltaNegative;
          }
          ctx.globalAlpha = baseOpacity * 0.5 + deltaIntensity * baseOpacity;
          ctx.fillRect(paddedCellX, deltaRowY + 1, paddedCellW, paddedRowH);
          ctx.globalAlpha = 1;

          // Volume row - gray intensity
          const volIntensity = volume / maxVolume;
          ctx.fillStyle = '#787882';
          ctx.globalAlpha = 0.15 + volIntensity * 0.45;
          ctx.fillRect(paddedCellX, volRowY + 1, paddedCellW, paddedRowH);
          ctx.globalAlpha = 1;
        }

        // FIXED: Restore clipping state
        ctx.restore();
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CROSSHAIR - Using CrosshairStore Settings
    // ═══════════════════════════════════════════════════════════════
    if (activeTool === 'crosshair' && mousePositionRef.current) {
      const { x, y, price, time } = mousePositionRef.current;

      // Use crosshair settings from store
      ctx.strokeStyle = crosshairSettings.color;
      ctx.globalAlpha = crosshairSettings.opacity;
      ctx.lineWidth = crosshairSettings.lineWidth;

      // Set line style based on settings
      if (crosshairSettings.lineStyle === 'dashed') {
        ctx.setLineDash([6, 4]);
      } else if (crosshairSettings.lineStyle === 'dotted') {
        ctx.setLineDash([2, 2]);
      } else {
        ctx.setLineDash([]);
      }

      // Vertical line
      if (crosshairSettings.showVerticalLine) {
        ctx.beginPath();
        ctx.moveTo(x, footprintAreaY);
        ctx.lineTo(x, footerY);
        ctx.stroke();
      }

      // Horizontal line
      if (crosshairSettings.showHorizontalLine) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width - 60, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Price label box (right side) - only if showPriceLabel enabled
      if (crosshairSettings.showPriceLabel) {
        const labelHeight = 18;
        const labelY = y - labelHeight / 2;

        // Background with border - use labelBackground from settings
        ctx.fillStyle = crosshairSettings.labelBackground;
        ctx.fillRect(width - 58, labelY, 56, labelHeight);

        // Price text - use labelTextColor from settings
        ctx.fillStyle = crosshairSettings.labelTextColor;
        ctx.font = `bold 10px "Consolas", "Monaco", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`$${price.toFixed(2)}`, width - 4, y + 3);
      }

      // Time label box (bottom, above cluster static) - only if showTimeLabel enabled
      if (crosshairSettings.showTimeLabel) {
        const timeLabelWidth = 60;
        const timeLabelX = x - timeLabelWidth / 2;
        const timeLabelY = footerY - 18;

        // Background with border - use labelBackground from settings
        ctx.fillStyle = crosshairSettings.labelBackground;
        ctx.fillRect(timeLabelX, timeLabelY, timeLabelWidth, 16);

        // Time text - use labelTextColor from settings + timezone-aware formatting
        ctx.fillStyle = crosshairSettings.labelTextColor;
        ctx.font = '9px "Consolas", "Monaco", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(time, 'time'), x, timeLabelY + 11);
      }
    }

    // === RENDER TOOLS ===
    const renderContext: RenderContext = {
      ctx,
      width,
      height,
      priceToY: (price: number) => layout.priceToY(price, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      // Use proper layout conversion for time coordinates
      timeToX: (time: number) => layout.timeToX(time, metrics),
      xToTime: (x: number) => layout.xToTime(x, metrics),
      tickSize,
      colors: {
        positive: colors.deltaPositive,
        negative: colors.deltaNegative,
        selection: colors.currentPriceColor,
        handle: '#ffffff',
        handleBorder: colors.currentPriceColor,
      },
    };

    getToolsRenderer().render(renderContext);
  }, [settings, tickSize, activeTool, crosshairSettings]);

  /**
   * Animation loop
   */
  useEffect(() => {
    const animate = () => {
      renderCanvas();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [renderCanvas]);

  /**
   * Initialize and connect
   */
  useEffect(() => {
    let isMounted = true;
    const MAX_CANDLES = 500; // Keep more candles for history
    const exchange = SYMBOL_EXCHANGE[symbol] || 'binance';

    const init = async () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];

      // Reset services
      resetOrderflowEngine();
      resetFootprintDataService();
      resetSessionFootprintService();
      resetOptimizedFootprintService();
      resetDxFeedFootprintEngine();
      configureOrderflow({ tickSize, imbalanceRatio: settings.imbalance.ratio });

      // ═══════════════════════════════════════════════════════════════════════
      // CME FUTURES (SIMULATION MODE - No external connection needed)
      // ═══════════════════════════════════════════════════════════════════════
      if (exchange === 'cme') {
        console.log(`[FootprintChartPro] Initializing CME symbol: ${symbol} (SIMULATION MODE)`);

        // Reset previous simulator if any
        resetTradeSimulator();

        // Initialize footprint engine for CME data
        const dxFeedEngine = getDxFeedFootprintEngine({
          symbol: symbol,
          timeframe: timeframe,
          imbalanceRatio: settings.imbalance.ratio,
        });

        // Status callback
        dxFeedEngine.onStatus((s, message) => {
          if (!isMounted) return;
          console.log(`[Simulator] Status: ${s}`, message || '');

          if (s === 'connected') {
            setStatus('connected');
            setIsLoading(false);
            if (statusDotRef.current) {
              statusDotRef.current.style.backgroundColor = settings.colors.deltaPositive;
            }
          } else if (s === 'connecting') {
            setStatus('connecting');
            if (statusDotRef.current) {
              statusDotRef.current.style.backgroundColor = '#eab308';
            }
          } else {
            setStatus('disconnected');
            if (statusDotRef.current) {
              statusDotRef.current.style.backgroundColor = settings.colors.textMuted;
            }
          }
        });

        // Candles callback - receives FootprintCandle[] from engine
        dxFeedEngine.onCandles((candles) => {
          if (!isMounted) return;

          // Skip empty arrays
          if (candles.length === 0) {
            return;
          }

          // Convert to our format
          const convertedCandles = candles.map(c => ({
            time: c.openTime,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            levels: c.levels,
            totalVolume: c.totalVolume,
            totalBuyVolume: c.totalBuyVolume,
            totalSellVolume: c.totalSellVolume,
            totalDelta: c.totalDelta,
            totalTrades: c.totalTrades,
            poc: c.poc,
            vah: c.vah,
            val: c.val,
            isClosed: c.isClosed,
          }));

          candlesRef.current = convertedCandles;

          // Update price display
          const lastCandle = candles[candles.length - 1];
          if (lastCandle) {
            currentPriceRef.current = lastCandle.close;
            if (priceRef.current) {
              priceRef.current.textContent = lastCandle.close.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }

            // Update delta display
            if (deltaRef.current) {
              const delta = lastCandle.totalDelta;
              deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
              deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
            }
          }
        });

        // Start simulation mode (no external connection)
        setIsLoading(true);
        setLoadingMessage('Generating historical data...');

        // Start engine in simulation mode
        dxFeedEngine.startSimulationMode();

        // Create the trade simulator
        const simulator = getTradeSimulator({
          symbol: symbol,
          tradesPerSecond: 8,  // 8 trades/sec for realistic activity
          volatility: 1.2,     // Slight volatility increase
        });

        // ═══════════════════════════════════════════════════════════════════
        // GENERATE HISTORICAL DATA (300 candles for good navigation)
        // ═══════════════════════════════════════════════════════════════════
        console.log(`[FootprintChartPro] Generating historical data for ${symbol}...`);
        const historicalTrades = simulator.generateHistoricalTrades(
          300,          // 300 candles for navigation history
          timeframe,    // Use selected timeframe
          150           // ~150 trades per candle
        );

        // Inject historical trades into footprint engine
        console.log(`[FootprintChartPro] Injecting ${historicalTrades.length} historical trades...`);
        for (const trade of historicalTrades) {
          dxFeedEngine.injectTrade({
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp,
          });
        }
        console.log(`[FootprintChartPro] ✓ Historical data loaded`);

        // ═══════════════════════════════════════════════════════════════════
        // START LIVE SIMULATION
        // ═══════════════════════════════════════════════════════════════════
        setLoadingMessage('Starting live simulation...');

        // Connect simulator trades to footprint engine for live data
        const unsubSimulator = simulator.onTrade((trade) => {
          if (!isMounted) return;

          // Inject trade into footprint engine
          dxFeedEngine.injectTrade({
            price: trade.price,
            size: trade.size,
            side: trade.side,
            timestamp: trade.timestamp,
          });

          // Debug tracking
          debugTradeCountRef.current++;
          debugTradesRef.current = [...debugTradesRef.current.slice(-99), {
            price: trade.price,
            size: trade.size,
            side: trade.side,
            time: trade.timestamp,
          }];

          // Update current price
          currentPriceRef.current = trade.price;
          if (priceRef.current) {
            priceRef.current.textContent = trade.price.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }
        });
        unsubscribersRef.current.push(unsubSimulator);

        // Start generating live trades
        simulator.start();
        console.log(`[FootprintChartPro] ✓ Live simulator started for ${symbol}`);

        // Add cleanup for simulator
        unsubscribersRef.current.push(() => {
          simulator.stop();
          resetTradeSimulator();
        });

        setIsLoading(false);

        return; // Exit early for CME - don't run Binance logic
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CRYPTO (Binance)
      // ═══════════════════════════════════════════════════════════════════════

      // Load historical footprint data (REAL trade data)
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      candlesRef.current = history;
      console.log(`[FootprintChartPro] Initialized with ${history.length} historical candles`);

      const ws = getBinanceLiveWS();
      const engine = getOrderflowEngine();
      const footprintService = getFootprintDataService();
      footprintService.setImbalanceRatio(settings.imbalance.ratio);

      // Status updates
      const unsubStatus = ws.onStatus((s) => {
        if (!isMounted) return;
        setStatus(s);
        if (statusDotRef.current) {
          statusDotRef.current.style.backgroundColor =
            s === 'connected' ? settings.colors.deltaPositive :
            s === 'connecting' ? '#eab308' :
            settings.colors.deltaNegative;
        }
      });
      unsubscribersRef.current.push(unsubStatus);

      // Process live ticks via OptimizedFootprintService
      // Live trades use isBuyerMaker for exact bid/ask classification
      const unsubTick = ws.onTick((tick) => {
        if (!isMounted) return;

        // Update price display
        currentPriceRef.current = tick.price;
        if (priceRef.current) {
          priceRef.current.textContent = `$${tick.price.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }

        // Process live trade
        try {
          const service = getOptimizedFootprintService();
          const updatedCandle = service.processLiveTrade({
            price: tick.price,
            quantity: tick.quantity,
            time: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          });

          if (updatedCandle) {
            candlesRef.current = service.getCandlesArray();
          }
        } catch {
          // Fallback to legacy service
          const trade: Trade = {
            id: `${tick.timestamp}_${tick.price}`,
            price: tick.price,
            quantity: tick.quantity,
            time: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          };

          candlesRef.current = footprintService.processLiveTrade(
            trade,
            timeframe,
            tickSize,
            candlesRef.current
          );
        }

        // Limit candles to MAX_CANDLES
        if (candlesRef.current.length > MAX_CANDLES) {
          candlesRef.current = candlesRef.current.slice(-MAX_CANDLES);
        }

        // Update delta display
        const currentCandle = candlesRef.current[candlesRef.current.length - 1];
        if (currentCandle && deltaRef.current) {
          const delta = currentCandle.totalDelta;
          deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
          deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
        }

        // ═══════════════════════════════════════════════════════════════
        // FEED TRADE TO ABSORPTION ENGINE
        // This enables coherent passive liquidity that reacts to trades
        // ═══════════════════════════════════════════════════════════════
        if (settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled) {
          const absorptionEngine = getTradeAbsorptionEngine();
          absorptionEngine.feedTrade({
            price: tick.price,
            quantity: tick.quantity,
            timestamp: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          });
        }
      });
      unsubscribersRef.current.push(unsubTick);

      // Also keep the engine-based processing for compatibility
      const unsubFootprint = engine.on('footprint:update', (candle, tf) => {
        if (tf !== timeframe || !isMounted) return;
        // The tick handler already updates candlesRef, this is just for delta display
        if (deltaRef.current) {
          const delta = candle.totalDelta;
          deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
          deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
        }
      });
      unsubscribersRef.current.push(unsubFootprint);

      // ═══════════════════════════════════════════════════════════════
      // REAL ORDERBOOK DATA (Binance Depth Stream)
      // Subscribe to depth updates when in realtime mode
      // ═══════════════════════════════════════════════════════════════
      if (settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getPassiveLiquiditySimulator } = require('@/lib/orderflow/PassiveLiquiditySimulator');
        const simulator = getPassiveLiquiditySimulator();

        // Check if realtime mode is enabled (can be toggled in settings)
        const useRealtimeOrderbook = settings.passiveLiquidity.useRealOrderbook ?? false;

        if (useRealtimeOrderbook) {
          simulator.setDataSource('realtime');

          const unsubDepth = ws.onDepthUpdate((depth) => {
            if (!isMounted) return;
            simulator.processOrderbookSnapshot(depth);
          });
          unsubscribersRef.current.push(unsubDepth);

          console.log('[FootprintChartPro] Subscribed to real orderbook data');
        } else {
          simulator.setDataSource('simulation');
        }
      }

      ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
      // Disconnect from dxFeed if connected
      resetDxFeedFootprintEngine();
    };
  }, [symbol, timeframe, tickSize, loadHistory, settings.imbalance.ratio, settings.colors.deltaPositive, settings.colors.deltaNegative]);

  /**
   * Wheel handler (zoom / scroll)
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const layout = layoutEngineRef.current;
    if (!layout) return;

    // Invalidate LOD cache on zoom (will be recomputed on next render)
    invalidateLODCache();

    if (e.shiftKey) {
      layout.scroll(e.deltaY);
    } else {
      const currentZoom = layout.getZoom();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      layout.setZoom(currentZoom + delta);
    }
  }, []);

  /**
   * Setup interaction controller
   */
  useEffect(() => {
    const controller = getInteractionController();
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;

    // Set callbacks
    controller.setCallbacks({
      onToolSelected: (tool) => {
        setSelectedTool(tool);
      },
      onToolCreated: (tool) => {
        // Apply ONLY visual style settings from store to newly created tool
        // Extension settings (extendLeft, extendRight) should use the engine defaults (false)
        // This prevents persisted old settings from overriding the correct defaults
        if (tool) {
          const toolsEngine = getToolsEngine();
          const toolDefaults = useToolSettingsStore.getState().getToolDefault(tool.type);

          // Build style update - only visual properties
          const styleUpdate: Record<string, unknown> = { ...tool.style };
          let hasStyleChange = false;

          if (toolDefaults.color && toolDefaults.color !== tool.style.color) {
            styleUpdate.color = toolDefaults.color;
            hasStyleChange = true;
          }
          if (toolDefaults.lineWidth && toolDefaults.lineWidth !== tool.style.lineWidth) {
            styleUpdate.lineWidth = toolDefaults.lineWidth;
            hasStyleChange = true;
          }
          if (toolDefaults.lineStyle && toolDefaults.lineStyle !== tool.style.lineStyle) {
            styleUpdate.lineStyle = toolDefaults.lineStyle;
            hasStyleChange = true;
          }
          if (toolDefaults.fillOpacity !== undefined) {
            styleUpdate.fillOpacity = toolDefaults.fillOpacity;
            hasStyleChange = true;
          }

          // Apply ONLY style updates - DO NOT override extension settings
          // The ToolsEngine already sets extendLeft: false, extendRight: false as defaults
          if (hasStyleChange) {
            toolsEngine.updateTool(tool.id, { style: styleUpdate } as any);
          }

          // For text tools, automatically open the inline editor
          if (tool.type === 'text') {
            const layout = layoutEngineRef.current;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (layout && rect) {
              const textTool = tool as any;
              const metrics = layout.calculateMetrics(candlesRef.current, tickSize);
              const toolX = layout.timeToX(textTool.point.time, metrics);
              const toolY = layout.priceToY(textTool.point.price, metrics);

              toolsEngine.startTextEdit(tool.id);
              setTextEditorState({
                isOpen: true,
                toolId: tool.id,
                content: textTool.content || 'Text',
                position: {
                  x: rect.left + toolX,
                  y: rect.top + toolY,
                },
                style: {
                  fontSize: textTool.fontSize || 14,
                  fontFamily: textTool.fontFamily || 'system-ui, sans-serif',
                  fontWeight: textTool.fontWeight || 'normal',
                  color: textTool.fontColor || textTool.style?.color || '#ffffff',
                  backgroundColor: textTool.backgroundColor || 'rgba(0, 0, 0, 0.85)',
                },
              });
            }
          }
        }
        setSelectedTool(tool);
      },
      onModeChanged: (mode) => {
        // Reset to cursor after drawing completes
        if (mode === 'idle') {
          setActiveTool('cursor');
        }
      },
      onCursorChanged: (cursor) => {
        if (containerRef.current) {
          containerRef.current.style.cursor = cursor;
        }
      },
      requestRedraw: () => {
        // Animation loop handles this
      },
    });

    return () => {
      resetInteractionController();
    };
  }, []);

  /**
   * Update coordinate converter when metrics change
   */
  useEffect(() => {
    const controller = getInteractionController();
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;

    if (layout && metrics) {
      controller.setCoordinateConverter({
        xToTime: (x: number) => layout.xToTime(x, metrics),
        timeToX: (time: number) => layout.timeToX(time, metrics),
        yToPrice: (y: number) => layout.yToPrice(y, metrics),
        priceToY: (price: number) => layout.priceToY(price, metrics),
      });
    }
  }, [metricsRef.current]);

  /**
   * Update active tool in controller
   */
  useEffect(() => {
    const controller = getInteractionController();
    controller.setActiveTool(activeTool);
  }, [activeTool]);

  /**
   * Mouse down handler
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;
    if (!layout || !metrics) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;

    // Check if click is on price scale (right side, last 60px)
    if (x > width - 60) {
      // Start price scale drag for vertical zoom
      isPriceScaleDragRef.current = true;
      priceScaleDragStartRef.current = {
        y: e.clientY,
        zoomY: layout.getZoomY(),
      };
      e.preventDefault();
      return;
    }

    // Check if we should select a tool or pan (cursor tool active)
    if (activeTool === 'cursor' || activeTool === 'crosshair') {
      // First check if clicking on an existing tool
      const toolsEngine = getToolsEngine();
      const point = {
        time: layout.xToTime(x, metrics),
        price: layout.yToPrice(y, metrics),
      };

      const hitResult = toolsEngine.hitTest(
        point,
        (price: number) => layout.priceToY(price, metrics),
        (time: number) => layout.timeToX(time, metrics),
        12 // tolerance in pixels
      );

      if (hitResult) {
        // Clicked on a tool - select it and start dragging
        toolsEngine.selectTool(hitResult.tool.id);
        setSelectedTool(hitResult.tool);

        if (!hitResult.tool.locked) {
          // Start dragging the tool
          toolsEngine.startDrag(hitResult.tool.id, hitResult.handle, point);
        }
        e.preventDefault();
        return;
      }

      // No tool hit - deselect and start panning
      toolsEngine.deselectAll();
      setSelectedTool(null);

      isDraggingRef.current = true;
      // CRITICAL: Lock price range for free diagonal panning
      layout.startPan(metrics);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: 0, // Not used with pan() method
        scrollY: 0,
      };
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      e.preventDefault();
      return;
    }

    // Update controller with current metrics and bounds for drawing tools
    const controller = getInteractionController();
    controller.setChartBounds(rect);
    controller.setCoordinateConverter({
      xToTime: (x: number) => layout.xToTime(x, metrics),
      timeToX: (time: number) => layout.timeToX(time, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      priceToY: (price: number) => layout.priceToY(price, metrics),
    });

    controller.handleMouseDown(e);
  }, [activeTool]);

  /**
   * Mouse move handler
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;
    if (!layout || !metrics) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle price scale drag (vertical zoom)
    if (isPriceScaleDragRef.current && priceScaleDragStartRef.current) {
      const deltaY = priceScaleDragStartRef.current.y - e.clientY; // Up = positive
      const zoomDelta = deltaY * 0.01; // Increased sensitivity for more zoom range
      const newZoomY = Math.max(0.1, Math.min(20, priceScaleDragStartRef.current.zoomY + zoomDelta));
      layout.setZoomY(newZoomY);
      invalidateLODCache();
      return;
    }

    // Handle tool dragging
    const toolsEngine = getToolsEngine();
    if (toolsEngine.isDragging()) {
      const point = {
        time: layout.xToTime(x, metrics),
        price: layout.yToPrice(y, metrics),
      };
      toolsEngine.updateDrag(point);
      return;
    }

    // Handle chart panning - FREE diagonal movement
    // Uses pan() with delta movement for smooth TradingView-like feel
    if (isDraggingRef.current && dragStartRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Use pan() for smooth incremental movement with momentum tracking
      layout.pan(deltaX, deltaY);

      // Update reference point for next frame
      dragStartRef.current.x = e.clientX;
      dragStartRef.current.y = e.clientY;

      invalidateLODCache();
      return;
    }

    const price = layout.yToPrice(y, metrics);
    const time = layout.xToTime(x, metrics);

    // Store mouse position for crosshair
    mousePositionRef.current = { x, y, price, time };

    // ═══════════════════════════════════════════════════════════════
    // PASSIVE LIQUIDITY HOVER DETECTION
    // ═══════════════════════════════════════════════════════════════
    let foundHoveredLevel: PassiveOrderLevel | null = null;
    for (const bound of passiveLevelBoundsRef.current) {
      if (
        x >= bound.x &&
        x <= bound.x + bound.width &&
        y >= bound.y &&
        y <= bound.y + bound.height
      ) {
        foundHoveredLevel = bound.level;
        break;
      }
    }
    hoveredPassiveLevelRef.current = foundHoveredLevel;

    // Update cursor based on position
    if (containerRef.current) {
      const width = rect.width;
      if (x > width - 60) {
        containerRef.current.style.cursor = 'ns-resize'; // Vertical resize for price scale
      } else if (activeTool === 'crosshair') {
        containerRef.current.style.cursor = 'crosshair';
      } else if (activeTool === 'cursor') {
        containerRef.current.style.cursor = 'grab';
      } else {
        containerRef.current.style.cursor = 'default';
      }
    }

    // Update controller
    const controller = getInteractionController();
    controller.setChartBounds(rect);
    controller.setCoordinateConverter({
      xToTime: (x: number) => layout.xToTime(x, metrics),
      timeToX: (time: number) => layout.timeToX(time, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      priceToY: (price: number) => layout.priceToY(price, metrics),
    });

    controller.handleMouseMove(e);
  }, [activeTool]);

  /**
   * Mouse up handler
   */
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;

    // End tool dragging if active
    const toolsEngine = getToolsEngine();
    if (toolsEngine.isDragging()) {
      toolsEngine.endDrag();
    }

    // Reset drag states
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      // End pan but keep price range locked (don't auto-fit)
      if (layout) {
        layout.endPan(false);
        // Start momentum scrolling for smooth deceleration
        layout.startMomentum();
      }
      if (containerRef.current) {
        containerRef.current.style.cursor = activeTool === 'crosshair' ? 'crosshair' : 'grab';
      }
    }

    if (isPriceScaleDragRef.current) {
      isPriceScaleDragRef.current = false;
      priceScaleDragStartRef.current = null;
    }

    const controller = getInteractionController();
    controller.handleMouseUp(e);
  }, [activeTool]);

  /**
   * Mouse leave handler
   */
  const handleMouseLeave = useCallback(() => {
    // Don't reset drag states on leave - window events will handle mouse up
    mousePositionRef.current = null;
    hoveredPassiveLevelRef.current = null; // Clear hover state
    const controller = getInteractionController();
    controller.handleMouseLeave();
  }, []);

  /**
   * Double click handler - Edit text or reset view
   */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!layout || !rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;

    // Double-click on price scale = reset Y zoom only
    if (x > width - 60) {
      layout.setZoomY(1);
      layout.resetPriceRange();
      invalidateLODCache();
      return;
    }

    // Check if double-clicking on a text tool to edit it
    const toolsEngine = getToolsEngine();
    const metrics = layout.calculateMetrics(candlesRef.current, tickSize);
    const point = {
      time: layout.xToTime(x, metrics),
      price: layout.yToPrice(y, metrics),
    };

    const hitResult = toolsEngine.hitTest(
      point,
      (price: number) => layout.priceToY(price, metrics),
      (time: number) => layout.timeToX(time, metrics),
      10 // Tolerance in pixels
    );

    // If clicked on a text tool, enter edit mode with inline editor
    if (hitResult && hitResult.tool && hitResult.tool.type === 'text') {
      const textTool = hitResult.tool as any;
      toolsEngine.startTextEdit(hitResult.tool.id);

      // Calculate screen position for the editor
      const toolX = layout.timeToX(textTool.point.time, metrics);
      const toolY = layout.priceToY(textTool.point.price, metrics);

      // Open inline text editor
      setTextEditorState({
        isOpen: true,
        toolId: hitResult.tool.id,
        content: textTool.content || '',
        position: {
          x: rect.left + toolX,
          y: rect.top + toolY,
        },
        style: {
          fontSize: textTool.fontSize || 14,
          fontFamily: textTool.fontFamily || 'system-ui, sans-serif',
          fontWeight: textTool.fontWeight || 'normal',
          color: textTool.fontColor || textTool.style?.color || '#ffffff',
          backgroundColor: textTool.backgroundColor || 'rgba(0, 0, 0, 0.85)',
        },
      });
      return;
    }

    // Double-click on chart = reset entire view
    layout.resetToOptimalView(candlesRef.current.length);
    invalidateLODCache();
  }, []);

  /**
   * Text editor save handler
   */
  const handleTextEditorSave = useCallback((newContent: string) => {
    if (!textEditorState) return;

    const toolsEngine = getToolsEngine();
    if (newContent.trim()) {
      toolsEngine.finishTextEdit(textEditorState.toolId, newContent);
    } else {
      // Empty content - delete the tool
      toolsEngine.cancelTextEdit(textEditorState.toolId);
      toolsEngine.deleteTool(textEditorState.toolId);
    }
    setTextEditorState(null);
  }, [textEditorState]);

  /**
   * Text editor cancel handler
   */
  const handleTextEditorCancel = useCallback(() => {
    if (!textEditorState) return;

    const toolsEngine = getToolsEngine();
    toolsEngine.cancelTextEdit(textEditorState.toolId);
    setTextEditorState(null);
  }, [textEditorState]);

  /**
   * Global mouse event handlers for drag operations
   */
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const layout = layoutEngineRef.current;
      if (!layout) return;

      // Handle price scale drag (vertical zoom)
      if (isPriceScaleDragRef.current && priceScaleDragStartRef.current) {
        const deltaY = priceScaleDragStartRef.current.y - e.clientY;
        const zoomDelta = deltaY * 0.01; // Increased sensitivity
        const newZoomY = Math.max(0.1, Math.min(20, priceScaleDragStartRef.current.zoomY + zoomDelta));
        layout.setZoomY(newZoomY);
        invalidateLODCache();
      }

      // Handle chart panning - FREE diagonal movement
      if (isDraggingRef.current && dragStartRef.current) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        // Use pan() for smooth incremental movement
        layout.pan(deltaX, deltaY);

        // Update reference point for next frame
        dragStartRef.current.x = e.clientX;
        dragStartRef.current.y = e.clientY;

        invalidateLODCache();
      }
    };

    const handleGlobalMouseUp = () => {
      const layout = layoutEngineRef.current;

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragStartRef.current = null;
        // End pan but keep view (don't auto-fit)
        if (layout) {
          layout.endPan(false);
          layout.startMomentum();
        }
        if (containerRef.current) {
          containerRef.current.style.cursor = activeTool === 'crosshair' ? 'crosshair' : 'grab';
        }
      }

      if (isPriceScaleDragRef.current) {
        isPriceScaleDragRef.current = false;
        priceScaleDragStartRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [activeTool]);

  /**
   * Handle layout load
   */
  const handleLoadLayout = useCallback((layout: LayoutData) => {
    // Apply chart settings
    if (layout.chart.symbol !== symbol) {
      setSymbol(layout.chart.symbol);
    }
    if (layout.chart.timeframe !== timeframe) {
      setTimeframe(layout.chart.timeframe as TimeframeSeconds);
    }
    if (layout.chart.tickSize !== tickSize) {
      setTickSize(layout.chart.tickSize);
    }

    // Apply colors, fonts, features
    settings.setColors(layout.colors);
    settings.setFonts(layout.fonts);
    settings.setFeatures(layout.features);
    settings.setImbalance(layout.imbalance);
    settings.setLayout(layout.layout);
  }, [symbol, timeframe, tickSize, settings]);

  /**
   * Handlers
   */
  const handleSymbolChange = useCallback((newSymbol: string) => {
    if (newSymbol === symbol) return;
    const info = SYMBOLS.find(s => s.value === newSymbol);
    const exchange = SYMBOL_EXCHANGE[newSymbol] || 'binance';

    setSymbol(newSymbol);
    setTickSize(info?.tickSize || 10);
    resetOrderflowEngine();
    resetFootprintDataService();
    candlesRef.current = [];
    layoutEngineRef.current?.resetScroll();

    if (exchange === 'binance') {
      // Binance: Connect to live WebSocket
      getBinanceLiveWS().changeSymbol(newSymbol);
    } else {
      // CME: Disconnect Binance WS, dxFeed connection handled by useEffect
      getBinanceLiveWS().disconnect();
      resetDxFeedFootprintEngine();
      console.log(`[FootprintChartPro] CME symbol selected: ${newSymbol}`);
      // The useEffect will handle dxFeed connection when symbol state updates
    }
  }, [symbol]);

  const handleTimeframeChange = useCallback((newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);
    layoutEngineRef.current?.resetScroll();
  }, [timeframe]);

  const handleToolSelect = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool !== 'cursor' && tool !== 'crosshair') {
      getToolsEngine().deselectAll();
      setSelectedTool(null);
    }
  }, []);

  /**
   * Context menu handlers
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid(prev => {
      const newValue = !prev;
      settings.setFeatures({ showGrid: newValue });
      return newValue;
    });
  }, [settings]);

  const copyPrice = useCallback(() => {
    if (currentPriceRef.current) {
      navigator.clipboard.writeText(currentPriceRef.current.toString());
    }
  }, []);

  const resetView = useCallback(() => {
    layoutEngineRef.current?.resetScroll();
  }, []);

  /**
   * Save current chart settings as a template
   */
  const handleSaveTemplate = useCallback((name: string) => {
    saveTemplate({
      name,
      type: 'footprint',
      settings: {
        showGrid,
        footprintSettings: {
          features: settings.features,
          imbalance: settings.imbalance,
          layout: {
            footprintWidth: settings.footprintWidth,
            rowHeight: settings.rowHeight,
            maxVisibleFootprints: settings.maxVisibleFootprints,
            deltaProfilePosition: settings.deltaProfilePosition,
          },
        },
        colors: settings.colors as unknown as Record<string, string | number>,
      },
    });
  }, [saveTemplate, showGrid, settings]);

  /**
   * Load a template and apply settings
   */
  const handleLoadTemplate = useCallback((template: ChartTemplate) => {
    if (template.settings.showGrid !== undefined) {
      setShowGrid(template.settings.showGrid);
    }
    if (template.settings.footprintSettings) {
      const fp = template.settings.footprintSettings;
      if (fp.features) {
        settings.setFeatures(fp.features);
      }
      if (fp.imbalance) {
        settings.setImbalance(fp.imbalance);
      }
      if (fp.layout) {
        settings.setLayout(fp.layout);
      }
    }
    if (template.settings.colors) {
      settings.setColors(template.settings.colors as unknown as Partial<FootprintColors>);
    }
  }, [settings]);

  /**
   * Get available templates for this chart type
   */
  const availableTemplates = useMemo(() => {
    return getTemplatesByType('footprint');
  }, [getTemplatesByType, templates]);

  const openAdvancedSettings = useCallback((e?: React.MouseEvent | MouseEvent) => {
    const x = e ? ('clientX' in e ? e.clientX : 100) : 100;
    const y = e ? ('clientY' in e ? e.clientY : 100) : 100;
    setAdvancedSettingsPosition({ x: Math.max(20, x - 200), y: Math.max(60, y - 50) });
    setShowAdvancedSettings(true);
  }, []);

  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    return createChartContextMenuItems({
      onCopyPrice: copyPrice,
      onToggleGrid: toggleGrid,
      onOpenSettings: () => openAdvancedSettings(),
      onResetView: resetView,
      onClearDrawings: () => getToolsEngine().clearAll(),
      onSaveTemplate: () => setShowSaveTemplateModal(true),
      templates: availableTemplates.map(t => ({
        id: t.id,
        name: t.name,
        onLoad: () => handleLoadTemplate(t),
      })),
      showGrid,
    });
  }, [copyPrice, toggleGrid, resetView, showGrid, availableTemplates, handleLoadTemplate, openAdvancedSettings]);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${className || ''}`}
      style={{ backgroundColor: settings.colors.background }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor }}
      >
        {/* Left: Symbol & Price */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              className="text-sm font-bold rounded px-3 py-1.5 border focus:outline-none"
              style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
            >
              <optgroup label="Crypto (Binance)">
                {SYMBOLS.filter(s => s.exchange === 'binance').map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </optgroup>
              <optgroup label="CME Futures">
                {SYMBOLS.filter(s => s.exchange === 'cme').map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </optgroup>
            </select>
            {/* Exchange badge */}
            <span
              className="text-xs px-2 py-0.5 rounded font-medium"
              style={{
                backgroundColor: SYMBOL_EXCHANGE[symbol] === 'binance' ? 'rgba(247, 147, 26, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: SYMBOL_EXCHANGE[symbol] === 'binance' ? '#f7931a' : '#3b82f6',
              }}
            >
              {SYMBOL_EXCHANGE[symbol] === 'binance' ? 'Binance' : 'CME'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span ref={priceRef} className="text-xl font-mono font-bold" style={{ color: settings.colors.textPrimary }}>
              {SYMBOL_EXCHANGE[symbol] === 'cme' ? '' : '$'}0.00
            </span>
            <span className="text-xs" style={{ color: settings.colors.textMuted }}>
              Delta: <span ref={deltaRef} style={{ color: settings.colors.deltaPositive }}>+0</span>
            </span>
          </div>
        </div>

        {/* Center: Timeframes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: settings.colors.background }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200
                  ${timeframe === tf ? '' : 'hover:scale-105 active:scale-95 hover:bg-white/5'}
                `}
                style={{
                  backgroundColor: timeframe === tf ? settings.colors.currentPriceColor : 'transparent',
                  color: timeframe === tf ? '#fff' : settings.colors.textSecondary,
                }}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>

          {/* Candle Countdown Timer */}
          <PriceCountdownCompact timeframeSeconds={timeframe} />
        </div>

        {/* Right: Tools & Settings */}
        <div className="flex items-center gap-2">
          {/* Drawing Tools with Favorites */}
          <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: settings.colors.background }}>
            {DRAWING_TOOLS.map((tool, index) => {
              const IconComponent = TOOL_ICON_COMPONENTS[tool];
              const isFavorite = favoritesPresets[favoritesPreset]?.tools.includes(tool);

              return (
                <div key={tool} className="relative group">
                  <button
                    onClick={() => handleToolSelect(tool)}
                    className={`px-2 py-1.5 rounded text-xs flex items-center justify-center
                      transition-all duration-200 ease-out transform
                      ${activeTool === tool
                        ? 'scale-110 shadow-lg'
                        : 'hover:scale-110 active:scale-95 hover:bg-white/10'
                      }
                    `}
                    style={{
                      backgroundColor: activeTool === tool ? settings.colors.currentPriceColor : 'transparent',
                      color: activeTool === tool ? '#fff' : settings.colors.textSecondary,
                      boxShadow: activeTool === tool ? `0 0 12px ${settings.colors.currentPriceColor}60` : 'none',
                    }}
                    title={tool}
                  >
                    <span className={`transition-transform duration-200 ${activeTool === tool ? 'scale-110' : ''}`}>
                      {IconComponent ? (
                        <IconComponent size={16} color={activeTool === tool ? '#fff' : settings.colors.textSecondary} />
                      ) : (
                        TOOL_ICONS_FALLBACK[tool]
                      )}
                    </span>
                  </button>

                  {/* Star icon for favorites - appears on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFavorite) {
                        removeToolFromPreset(favoritesPreset, tool);
                      } else {
                        addToolToPreset(favoritesPreset, tool);
                      }
                    }}
                    className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                      transition-all duration-200 opacity-0 group-hover:opacity-100
                      ${isFavorite ? 'opacity-100' : ''}
                    `}
                    style={{
                      backgroundColor: isFavorite ? '#f59e0b' : settings.colors.background,
                      border: `1px solid ${isFavorite ? '#f59e0b' : settings.colors.gridColor}`,
                    }}
                    title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill={isFavorite ? '#fff' : 'none'}
                      stroke={isFavorite ? '#fff' : settings.colors.textMuted}
                      strokeWidth="2"
                    >
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Tick Size */}
          <select
            value={tickSize}
            onChange={(e) => setTickSize(Number(e.target.value))}
            className="text-xs rounded px-2 py-1 border"
            style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
          >
            {availableTickSizes.map(ts => (
              <option key={ts} value={ts}>${ts}</option>
            ))}
          </select>

          {/* Timezone Selector */}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value as TimezoneId)}
            className="text-xs rounded px-2 py-1 border"
            style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
            title="Timezone"
          >
            {(Object.keys(TIMEZONES) as TimezoneId[]).map(tz => (
              <option key={tz} value={tz}>{TIMEZONES[tz].label}</option>
            ))}
          </select>

          {/* Layout Manager */}
          <button
            onClick={() => setShowLayoutManager(!showLayoutManager)}
            className="px-2 py-1.5 rounded text-xs border flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showLayoutManager ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showLayoutManager ? '#fff' : settings.colors.textSecondary,
            }}
            title="Layouts"
          >
            <LayoutIcon size={16} color={showLayoutManager ? '#fff' : settings.colors.textSecondary} />
          </button>

          {/* Orderbook Mode Toggle */}
          {settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled && (
            <button
              onClick={() => {
                const newValue = !settings.passiveLiquidity.useRealOrderbook;
                settings.setPassiveLiquidity({ useRealOrderbook: newValue });
                // Force reconnect to apply the change
                const ws = getBinanceLiveWS();
                ws.changeSymbol(symbol);
              }}
              className="px-2 py-1 rounded text-xs border flex items-center gap-1.5 transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: settings.passiveLiquidity.useRealOrderbook
                  ? 'rgba(34, 197, 94, 0.2)'
                  : settings.colors.background,
                borderColor: settings.passiveLiquidity.useRealOrderbook
                  ? '#22c55e'
                  : settings.colors.gridColor,
                color: settings.passiveLiquidity.useRealOrderbook
                  ? '#22c55e'
                  : settings.colors.textSecondary,
              }}
              title={settings.passiveLiquidity.useRealOrderbook
                ? 'Using REAL Binance orderbook - Click to switch to simulation'
                : 'Using SIMULATION - Click to switch to real orderbook'}
            >
              <span className="text-[10px] font-mono">
                {settings.passiveLiquidity.useRealOrderbook ? 'LIVE' : 'SIM'}
              </span>
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: settings.passiveLiquidity.useRealOrderbook ? '#22c55e' : '#6b7280',
                }}
              />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="px-2 py-1.5 rounded text-xs border flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showAdvancedSettings ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showAdvancedSettings ? '#fff' : settings.colors.textSecondary,
            }}
            title="Advanced Settings"
          >
            <SettingsIcon size={16} color={showAdvancedSettings ? '#fff' : settings.colors.textSecondary} />
          </button>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div ref={statusDotRef} className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.colors.textMuted }} />
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Favorites Toolbar - Left side */}
        <FavoritesToolbar
          activeTool={activeTool}
          onToolSelect={handleToolSelect}
          onDeleteSelected={() => {
            const toolsEngine = getToolsEngine();
            toolsEngine.deleteSelected();
            setSelectedTool(null);
          }}
          hasSelectedTool={selectedTool !== null}
          colors={{
            surface: settings.colors.surface,
            background: settings.colors.background,
            gridColor: settings.colors.gridColor,
            textPrimary: settings.colors.textPrimary,
            textMuted: settings.colors.textMuted,
            deltaPositive: settings.colors.deltaPositive,
            deltaNegative: settings.colors.deltaNegative,
          }}
          preset="footprint"
        />

        {/* Chart */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{ cursor: activeTool === 'crosshair' ? 'crosshair' : 'default' }}
        >
          <canvas ref={canvasRef} className="w-full h-full" />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${settings.colors.background}ee` }}>
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg" style={{ backgroundColor: settings.colors.surface }}>
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: settings.colors.currentPriceColor }} />
                <div className="text-center">
                  <div className="text-sm font-medium mb-1" style={{ color: settings.colors.textPrimary }}>
                    Loading Session...
                  </div>
                  <div className="text-xs mb-2" style={{ color: settings.colors.textSecondary }}>
                    {loadingMessage || 'Initializing...'}
                  </div>
                  {loadingProgress > 0 && (
                    <div className="w-48 h-2 rounded-full overflow-hidden" style={{ backgroundColor: settings.colors.background }}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${loadingProgress}%`,
                          backgroundColor: settings.colors.currentPriceColor,
                        }}
                      />
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: settings.colors.textMuted }}>
                    {loadingProgress.toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advanced Tool Settings Modal (Floating, Draggable) */}
        {showToolSettings && selectedTool && (
          <AdvancedToolSettingsModal
            isOpen={showToolSettings}
            onClose={() => setShowToolSettings(false)}
            activeTool={selectedTool.type}
            selectedTool={selectedTool}
            initialPosition={toolSettingsModalPosition}
            theme={{
              colors: {
                surface: settings.colors.surface,
                border: settings.colors.gridColor,
                text: settings.colors.textPrimary,
                textSecondary: settings.colors.textSecondary,
                textMuted: settings.colors.textMuted,
                toolActive: settings.colors.deltaPositive,
                background: settings.colors.background,
              },
            }}
          />
        )}

        {/* Inline Text Editor (appears on double-click on text tool) */}
        {textEditorState && (
          <InlineTextEditor
            isOpen={textEditorState.isOpen}
            initialContent={textEditorState.content}
            position={textEditorState.position}
            onSave={handleTextEditorSave}
            onCancel={handleTextEditorCancel}
            style={textEditorState.style}
          />
        )}

        {/* Layout Manager Panel */}
        {showLayoutManager && (
          <div className="w-64 border-l overflow-hidden flex-shrink-0" style={{ borderColor: settings.colors.gridColor }}>
            <LayoutManagerPanel
              currentChart={{ symbol, timeframe, tickSize }}
              currentColors={settings.colors}
              currentFonts={settings.fonts}
              currentFeatures={settings.features}
              currentImbalance={settings.imbalance}
              currentLayout={{
                footprintWidth: settings.footprintWidth,
                rowHeight: settings.rowHeight,
                maxVisibleFootprints: settings.maxVisibleFootprints,
                deltaProfilePosition: settings.deltaProfilePosition,
              }}
              onLoadLayout={handleLoadLayout}
              colors={settings.colors}
              onClose={() => setShowLayoutManager(false)}
            />
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="w-64 border-l p-3 overflow-y-auto flex-shrink-0" style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: settings.colors.textPrimary }}>Settings</h3>

            {/* Presets */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Theme</label>
              <div className="flex flex-wrap gap-1">
                {Object.keys(COLOR_PRESETS).map(preset => (
                  <button
                    key={preset}
                    onClick={() => settings.setColors(COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS])}
                    className="px-2 py-1 rounded text-xs capitalize"
                    style={{ backgroundColor: settings.colors.background, color: settings.colors.textSecondary }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Features */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Features</label>
              {Object.entries(settings.features).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 mb-1 text-xs cursor-pointer" style={{ color: settings.colors.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => settings.setFeatures({ [key]: e.target.checked })}
                  />
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
              ))}
            </div>

            {/* Imbalance */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Imbalance Ratio</label>
              <select
                value={settings.imbalance.ratio}
                onChange={(e) => settings.setImbalance({ ratio: Number(e.target.value) })}
                className="w-full text-xs rounded px-2 py-1"
                style={{ backgroundColor: settings.colors.background, color: settings.colors.textPrimary }}
              >
                <option value={2}>200%</option>
                <option value={3}>300%</option>
                <option value={4}>400%</option>
                <option value={5}>500%</option>
              </select>
            </div>

            {/* Layout */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Row Height: {settings.rowHeight}px</label>
              <input
                type="range"
                min={12}
                max={28}
                value={settings.rowHeight}
                onChange={(e) => settings.setLayout({ rowHeight: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Container Opacity */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>
                Container Opacity: {Math.round((settings.colors.footprintContainerOpacity ?? 0.03) * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={20}
                value={(settings.colors.footprintContainerOpacity ?? 0.03) * 100}
                onChange={(e) => settings.setColors({ footprintContainerOpacity: Number(e.target.value) / 100 })}
                className="w-full"
              />
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* COLOR CUSTOMIZATION */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            {/* Background Color */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Background Color</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {['#0c0c0c', '#000000', '#0a0e14', '#0d1117', '#1a1a2e', '#16213e', '#1e3a5f', '#ffffff', '#f8f9fa'].map(color => (
                  <button
                    key={color}
                    onClick={() => settings.setColors({ background: color })}
                    className="w-6 h-6 rounded border-2"
                    style={{
                      backgroundColor: color,
                      borderColor: settings.colors.background === color ? settings.colors.currentPriceColor : 'transparent',
                    }}
                    title={color}
                  />
                ))}
              </div>
              <input
                type="color"
                value={settings.colors.background}
                onChange={(e) => settings.setColors({ background: e.target.value })}
                className="w-full h-7 rounded cursor-pointer"
                title="Custom color"
              />
            </div>

            {/* Bullish Candle Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Bullish Candle</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Body</span>
                  <div className="flex gap-1 flex-1">
                    {['#26a69a', '#00c853', '#00bfa5', '#3fb950', '#198754', '#22c55e'].map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleUpBody: color })}
                        className="w-5 h-5 rounded border"
                        style={{
                          backgroundColor: color,
                          borderColor: settings.colors.candleUpBody === color ? '#fff' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={settings.colors.candleUpBody}
                    onChange={(e) => settings.setColors({ candleUpBody: e.target.value })}
                    className="w-6 h-5 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Border</span>
                  <input
                    type="color"
                    value={settings.colors.candleUpBorder}
                    onChange={(e) => settings.setColors({ candleUpBorder: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Wick</span>
                  <input
                    type="color"
                    value={settings.colors.candleUpWick}
                    onChange={(e) => settings.setColors({ candleUpWick: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Bearish Candle Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Bearish Candle</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Body</span>
                  <div className="flex gap-1 flex-1">
                    {['#ef5350', '#ff1744', '#ff5252', '#f85149', '#dc3545', '#ef4444'].map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleDownBody: color })}
                        className="w-5 h-5 rounded border"
                        style={{
                          backgroundColor: color,
                          borderColor: settings.colors.candleDownBody === color ? '#fff' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={settings.colors.candleDownBody}
                    onChange={(e) => settings.setColors({ candleDownBody: e.target.value })}
                    className="w-6 h-5 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Border</span>
                  <input
                    type="color"
                    value={settings.colors.candleDownBorder}
                    onChange={(e) => settings.setColors({ candleDownBorder: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Wick</span>
                  <input
                    type="color"
                    value={settings.colors.candleDownWick}
                    onChange={(e) => settings.setColors({ candleDownWick: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Grid & Surface Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Grid & Surface</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Grid</span>
                  <input
                    type="color"
                    value={settings.colors.gridColor}
                    onChange={(e) => settings.setColors({ gridColor: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Surface</span>
                  <input
                    type="color"
                    value={settings.colors.surface}
                    onChange={(e) => settings.setColors({ surface: e.target.value })}
                    className="w-full h-5 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={settings.resetToDefaults}
              className="w-full py-2 rounded text-xs"
              style={{ backgroundColor: settings.colors.deltaNegative, color: '#fff' }}
            >
              Reset to Defaults
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 py-1 text-xs border-t flex-shrink-0"
        style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor, color: settings.colors.textMuted }}
      >
        <span>
          {SYMBOL_EXCHANGE[symbol] === 'binance' ? 'Binance' : 'CME'} • {symbol.toUpperCase()} • Footprint {TIMEFRAME_LABELS[timeframe]} • Tick {SYMBOL_EXCHANGE[symbol] === 'binance' ? '$' : ''}{tickSize}
        </span>
        <span className="flex items-center gap-3">
          {/* Zoom level indicator */}
          {layoutEngineRef.current && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{
              backgroundColor: settings.colors.gridColor,
              color: settings.colors.textPrimary
            }}>
              Y-Zoom: {layoutEngineRef.current.getZoomY().toFixed(1)}x • {layoutEngineRef.current.getZoomLevelDescription()}
            </span>
          )}
          <span>Drag: Pan | Scroll: Zoom | Double-click: Reset | Del: Remove tool</span>
        </span>
        <span style={{
          color: status === 'connected'
            ? settings.colors.deltaPositive
            : status === 'connecting'
              ? '#eab308'
              : settings.colors.textMuted
        }}>
          {status === 'connected'
            ? `● Live${SYMBOL_EXCHANGE[symbol] === 'cme' ? ' (dxFeed)' : ''}`
            : status === 'connecting'
              ? '◐ Connecting...'
              : '○ Offline'
          }
        </span>
      </div>

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

      {/* Advanced Settings Modal */}
      <FootprintAdvancedSettings
        isOpen={showAdvancedSettings}
        onClose={() => setShowAdvancedSettings(false)}
        initialPosition={advancedSettingsPosition}
      />

      {/* Floating Tool Settings Bar */}
      {selectedTool && !showToolSettings && (
        <ToolSettingsBar
          selectedTool={selectedTool}
          toolPosition={toolPosition}
          colors={settings.colors}
          onClose={() => {
            getToolsEngine().deselectAll();
            setSelectedTool(null);
          }}
          onOpenAdvanced={() => {
            // Position the modal near the tool for better UX
            if (toolPosition) {
              setToolSettingsModalPosition({
                x: Math.max(50, Math.min(window.innerWidth - 400, toolPosition.x + 20)),
                y: Math.max(50, Math.min(window.innerHeight - 400, toolPosition.y + 20)),
              });
            }
            setShowToolSettings(true);
          }}
        />
      )}
    </div>
  );
}

function formatVol(vol: number): string {
  const abs = Math.abs(vol);
  if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  if (abs >= 100) return Math.round(vol).toString();
  if (abs >= 10) return vol.toFixed(1);
  return vol.toFixed(2);
}

/**
 * ATAS-style volume formatting with zoom-based detail level
 * - Zoomed out: More aggressive abbreviation (K, M)
 * - Zoomed in: Full detail
 * - Smooth transition between levels
 */
function formatVolATAS(vol: number, zoom: number = 1): string {
  const abs = Math.abs(vol);
  if (abs < 1) return '';

  // Zoom thresholds for detail level
  // zoom < 0.6: Very abbreviated (show K for 500+)
  // zoom 0.6-1.0: Moderately abbreviated (show K for 1000+)
  // zoom > 1.0: Full detail (show K for 10000+)

  if (zoom < 0.5) {
    // Very zoomed out - maximum abbreviation
    if (abs >= 1000000) return `${Math.round(vol / 1000000)}M`;
    if (abs >= 1000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 100) return Math.round(vol / 10) * 10 + '';  // Round to nearest 10
    return Math.round(vol).toString();
  } else if (zoom < 0.8) {
    // Moderately zoomed out
    if (abs >= 100000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 10000) return `${(vol / 1000).toFixed(0)}K`;
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return Math.round(vol).toString();
  } else if (zoom < 1.2) {
    // Normal zoom - standard formatting
    if (abs >= 10000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return Math.round(vol).toString();
  } else {
    // Zoomed in - full detail
    if (abs >= 100000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 10000) return Math.round(vol).toLocaleString();
    return Math.round(vol).toString();
  }
}

/**
 * Format volume for Cluster Static panel
 * Compact display for small cells
 */
function formatVolCluster(vol: number): string {
  const abs = Math.abs(vol);
  if (abs < 0.1) return '0';
  if (abs >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${Math.round(vol / 1000)}K`;
  if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return Math.round(vol).toString();
}
