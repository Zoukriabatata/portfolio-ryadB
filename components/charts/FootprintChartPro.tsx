'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  getOrderflowEngine,
  resetOrderflowEngine,
  configureOrderflow,
  type FootprintCandle,
  type PriceLevel,
} from '@/lib/orderflow/OrderflowEngine';
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
} from '@/lib/footprint';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
} from '@/stores/useFootprintSettingsStore';
import ToolSettingsPanel from '@/components/tools/ToolSettingsPanel';
import LayoutManagerPanel from '@/components/tools/LayoutManagerPanel';

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

// Symbols
const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC/USDT', tickSize: 10 },
  { value: 'ethusdt', label: 'ETH/USDT', tickSize: 1 },
  { value: 'solusdt', label: 'SOL/USDT', tickSize: 0.1 },
];

// Timeframes
const TIMEFRAMES: TimeframeSeconds[] = [15, 30, 60, 180, 300, 900, 1800, 3600];

// Tick sizes by symbol
const TICK_SIZE_OPTIONS: Record<string, number[]> = {
  btcusdt: [5, 10, 25, 50, 100],
  ethusdt: [0.5, 1, 2, 5, 10],
  solusdt: [0.05, 0.1, 0.25, 0.5],
};

// Map TF to Binance
const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h',
};

// Tool icons
const TOOL_ICONS: Record<ToolType, string> = {
  cursor: '↖',
  crosshair: '+',
  trendline: '╱',
  horizontalLine: '─',
  horizontalRay: '→',
  verticalLine: '│',
  rectangle: '▢',
  fibRetracement: '📐',
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

  // State
  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [tickSize, setTickSize] = useState(10);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showToolSettings, setShowToolSettings] = useState(false);
  const [showLayoutManager, setShowLayoutManager] = useState(false);

  // Refs
  const priceRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<FootprintCandle[]>([]);
  const currentPriceRef = useRef<number>(0);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number; price: number; time: number } | null>(null);

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
      deltaProfilePosition: settings.deltaProfilePosition,
    });

    return () => {
      layoutEngineRef.current = null;
    };
  }, [settings.footprintWidth, settings.rowHeight, settings.maxVisibleFootprints, settings.features.showOHLC, settings.features.showDeltaProfile, settings.deltaProfilePosition]);

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
   * Load historical data using FootprintDataService (REAL trade data)
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds): Promise<FootprintCandle[]> => {
    setIsLoading(true);
    try {
      const service = getFootprintDataService();
      service.setImbalanceRatio(settings.imbalance.ratio);

      // Calculate hours based on timeframe
      const hoursMap: Record<number, number> = {
        15: 2,    // 2 hours for 15s candles
        30: 3,    // 3 hours for 30s candles
        60: 4,    // 4 hours for 1m candles
        180: 6,   // 6 hours for 3m candles
        300: 8,   // 8 hours for 5m candles
        900: 12,  // 12 hours for 15m candles
        1800: 24, // 24 hours for 30m candles
        3600: 48, // 48 hours for 1h candles
      };
      const hoursBack = hoursMap[tf] || 4;

      console.log(`[FootprintChartPro] Loading ${hoursBack}h of real footprint data for ${sym}...`);

      const candles = await service.loadHistory({
        symbol: sym,
        timeframe: tf,
        tickSize,
        hoursBack,
        imbalanceRatio: settings.imbalance.ratio,
      });

      console.log(`[FootprintChartPro] Loaded ${candles.length} footprint candles`);

      return candles;
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
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
    if (candles.length === 0) {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', width / 2, height / 2);
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

    // Grid
    if (features.showGrid) {
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = colors.gridOpacity;

      for (let price = metrics.visiblePriceMin; price <= metrics.visiblePriceMax; price += tickSize * 5) {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Render each visible candle
    metrics.visibleCandles.forEach((candle, idx) => {
      const fpX = layout.getFootprintX(idx, metrics);

      // === OHLC CANDLE ===
      if (features.showOHLC) {
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

      // === FOOTPRINT CELLS ===
      const cellStartX = fpX + (features.showOHLC ? ohlcWidth : 0);
      const centerX = cellStartX + fpWidth / 2;

      let maxLevelVol = 1;
      candle.levels.forEach(level => {
        maxLevelVol = Math.max(maxLevelVol, level.bidVolume, level.askVolume);
      });

      candle.levels.forEach((level, price) => {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY - rowH || y > footprintAreaY + footprintAreaHeight + rowH) return;

        const cellY = y - rowH / 2;
        const isPOC = price === candle.poc;

        // POC highlight
        if (isPOC && features.showPOC) {
          ctx.fillStyle = colors.pocColor;
          ctx.globalAlpha = colors.pocOpacity;
          ctx.fillRect(cellStartX + 2, cellY, fpWidth - 4, rowH);
          ctx.globalAlpha = 1;

          ctx.strokeStyle = colors.pocColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(cellStartX + 2, cellY, fpWidth - 4, rowH);
        }

        // Imbalance highlights
        if (features.showImbalances) {
          if (level.imbalanceBuy) {
            ctx.fillStyle = colors.imbalanceBuyBg;
            ctx.globalAlpha = colors.imbalanceOpacity;
            ctx.fillRect(centerX, cellY + 1, fpWidth / 2 - 6, rowH - 2);
            ctx.globalAlpha = 1;
          }
          if (level.imbalanceSell) {
            ctx.fillStyle = colors.imbalanceSellBg;
            ctx.globalAlpha = colors.imbalanceOpacity;
            ctx.fillRect(cellStartX + 4, cellY + 1, fpWidth / 2 - 6, rowH - 2);
            ctx.globalAlpha = 1;
          }
        }

        // Volume bars
        const barH = Math.min(rowH - 4, 5);
        const barMaxW = fpWidth / 2 - 22;

        if (level.bidVolume > 0) {
          const bidW = (level.bidVolume / maxLevelVol) * barMaxW;
          ctx.fillStyle = colors.bidColor;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(centerX - 3 - bidW, y + rowH / 2 - barH - 1, bidW, barH);
          ctx.globalAlpha = 1;
        }

        if (level.askVolume > 0) {
          const askW = (level.askVolume / maxLevelVol) * barMaxW;
          ctx.fillStyle = colors.askColor;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(centerX + 3, y + rowH / 2 - barH - 1, askW, barH);
          ctx.globalAlpha = 1;
        }

        // Text
        const fontSize = Math.max(8, Math.round(fonts.volumeFontSize * zoom));
        ctx.font = isPOC
          ? `bold ${fontSize}px ${fonts.volumeFont}`
          : `${fontSize}px ${fonts.volumeFont}`;

        if (level.bidVolume > 0) {
          ctx.fillStyle = level.imbalanceSell ? '#ff6b6b' : colors.bidTextColor;
          ctx.textAlign = 'right';
          ctx.fillText(formatVol(level.bidVolume), centerX - 4, y + 3);
        }

        ctx.fillStyle = colors.textMuted;
        ctx.font = `${Math.max(7, fontSize - 2)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('x', centerX, y + 3);

        ctx.font = isPOC
          ? `bold ${fontSize}px ${fonts.volumeFont}`
          : `${fontSize}px ${fonts.volumeFont}`;
        if (level.askVolume > 0) {
          ctx.fillStyle = level.imbalanceBuy ? '#4ade80' : colors.askTextColor;
          ctx.textAlign = 'left';
          ctx.fillText(formatVol(level.askVolume), centerX + 4, y + 3);
        }
      });

      // Vertical separator
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fpX + totalFpWidth, footprintAreaY);
      ctx.lineTo(fpX + totalFpWidth, footprintAreaY + footprintAreaHeight);
      ctx.stroke();

      // Time label
      const date = new Date(candle.time * 1000);
      ctx.fillStyle = colors.textMuted;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
        fpX + totalFpWidth / 2,
        height - 30
      );

      // Delta total
      if (features.showTotalDelta) {
        const delta = candle.totalDelta;
        ctx.fillStyle = delta >= 0 ? colors.deltaPositive : colors.deltaNegative;
        ctx.font = `bold ${fonts.deltaFontSize}px ${fonts.deltaFont}`;
        ctx.fillText(
          (delta >= 0 ? '+' : '') + formatVol(delta),
          fpX + totalFpWidth / 2,
          height - 12
        );
      }
    });

    // === DELTA PROFILE ===
    if (features.showDeltaProfile && metrics.visibleCandles.length > 0) {
      const dpPos = layout.getDeltaProfilePosition(metrics);
      const dpWidth = dpPos.width;
      const dpX = dpPos.x;

      ctx.fillStyle = colors.surface;
      ctx.fillRect(dpX, footprintAreaY, dpWidth, footprintAreaHeight);

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

      deltaByPrice.forEach((delta, price) => {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) return;

        const barWidth = (Math.abs(delta) / maxDelta) * (dpWidth - 10);
        const isPositive = delta >= 0;

        ctx.fillStyle = isPositive ? colors.deltaPositive : colors.deltaNegative;
        ctx.globalAlpha = 0.7;

        if (isPositive) {
          ctx.fillRect(dpX + 5, y - rowH / 4, barWidth, rowH / 2);
        } else {
          ctx.fillRect(dpX + dpWidth - 5 - barWidth, y - rowH / 4, barWidth, rowH / 2);
        }
      });
      ctx.globalAlpha = 1;
    }

    // === CURRENT PRICE LINE ===
    if (features.showCurrentPrice && currentPriceRef.current > 0) {
      const priceY = layout.priceToY(currentPriceRef.current, metrics);
      if (priceY >= footprintAreaY && priceY <= footprintAreaY + footprintAreaHeight) {
        ctx.strokeStyle = colors.currentPriceColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width, priceY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = colors.currentPriceColor;
        ctx.font = `bold ${fonts.priceFontSize}px ${fonts.priceFont}`;
        ctx.textAlign = 'right';
        ctx.fillText(
          `$${currentPriceRef.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          width - 5,
          priceY - 5
        );
      }
    }

    // === PRICE SCALE ===
    ctx.fillStyle = colors.surface;
    ctx.fillRect(width - 55, footprintAreaY, 55, footprintAreaHeight);

    ctx.fillStyle = colors.textSecondary;
    ctx.font = `${fonts.priceFontSize}px ${fonts.priceFont}`;
    ctx.textAlign = 'right';

    for (let price = metrics.visiblePriceMin; price <= metrics.visiblePriceMax; price += tickSize * 10) {
      const y = layout.priceToY(price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;
      ctx.fillText(`$${price.toLocaleString()}`, width - 5, y + 4);
    }

    // === FOOTER BACKGROUND ===
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, height - 45, width, 45);

    // === CROSSHAIR ===
    if (activeTool === 'crosshair' && mousePositionRef.current) {
      const { x, y, price } = mousePositionRef.current;

      ctx.strokeStyle = colors.textMuted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, footprintAreaY);
      ctx.lineTo(x, footprintAreaY + footprintAreaHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.setLineDash([]);

      // Price label on crosshair
      ctx.fillStyle = colors.background;
      ctx.fillRect(width - 55, y - 10, 55, 20);
      ctx.fillStyle = colors.textPrimary;
      ctx.font = `bold 10px ${fonts.priceFont}`;
      ctx.textAlign = 'right';
      ctx.fillText(`$${price.toFixed(2)}`, width - 5, y + 4);
    }

    // === RENDER TOOLS ===
    const renderContext: RenderContext = {
      ctx,
      width,
      height,
      priceToY: (price: number) => layout.priceToY(price, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      timeToX: (time: number) => {
        const index = metrics.visibleCandles.findIndex(c => c.time === time);
        if (index >= 0) return layout.getFootprintX(index, metrics);
        return 100; // Default
      },
      xToTime: () => Date.now() / 1000,
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
  }, [settings, tickSize, activeTool]);

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

    const init = async () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];

      // Reset services
      resetOrderflowEngine();
      resetFootprintDataService();
      configureOrderflow({ tickSize, imbalanceRatio: settings.imbalance.ratio });

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

      // Process live ticks using FootprintDataService
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

        // Process tick as trade using FootprintDataService
        const trade: Trade = {
          id: `${tick.timestamp}_${tick.price}`,
          price: tick.price,
          quantity: tick.quantity,
          time: tick.timestamp,
          isBuyerMaker: tick.isBuyerMaker,
        };

        // Update candles with new trade
        candlesRef.current = footprintService.processLiveTrade(
          trade,
          timeframe,
          tickSize,
          candlesRef.current
        );

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

      ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, [symbol, timeframe, tickSize, loadHistory, settings.imbalance.ratio, settings.colors.deltaPositive, settings.colors.deltaNegative]);

  /**
   * Wheel handler (zoom / scroll)
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const layout = layoutEngineRef.current;
    if (!layout) return;

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

    // Update controller with current metrics and bounds
    const controller = getInteractionController();
    controller.setChartBounds(rect);
    controller.setCoordinateConverter({
      xToTime: (x: number) => layout.xToTime(x, metrics),
      timeToX: (time: number) => layout.timeToX(time, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      priceToY: (price: number) => layout.priceToY(price, metrics),
    });

    controller.handleMouseDown(e);
  }, []);

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
    const price = layout.yToPrice(y, metrics);
    const time = layout.xToTime(x, metrics);

    // Store mouse position for crosshair
    mousePositionRef.current = { x, y, price, time };

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
  }, []);

  /**
   * Mouse up handler
   */
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const controller = getInteractionController();
    controller.handleMouseUp(e);
  }, []);

  /**
   * Mouse leave handler
   */
  const handleMouseLeave = useCallback(() => {
    mousePositionRef.current = null;
    const controller = getInteractionController();
    controller.handleMouseLeave();
  }, []);

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
    setSymbol(newSymbol);
    setTickSize(info?.tickSize || 10);
    resetOrderflowEngine();
    resetFootprintDataService();
    candlesRef.current = [];
    layoutEngineRef.current?.resetScroll();
    getBinanceLiveWS().changeSymbol(newSymbol);
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
          <select
            value={symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="text-sm font-bold rounded px-3 py-1.5 border focus:outline-none"
            style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
          >
            {SYMBOLS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-3">
            <span ref={priceRef} className="text-xl font-mono font-bold" style={{ color: settings.colors.textPrimary }}>
              $0.00
            </span>
            <span className="text-xs" style={{ color: settings.colors.textMuted }}>
              Delta: <span ref={deltaRef} style={{ color: settings.colors.deltaPositive }}>+0</span>
            </span>
          </div>
        </div>

        {/* Center: Timeframes */}
        <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: settings.colors.background }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className="px-2 py-1 rounded text-xs font-medium"
              style={{
                backgroundColor: timeframe === tf ? settings.colors.currentPriceColor : 'transparent',
                color: timeframe === tf ? '#fff' : settings.colors.textSecondary,
              }}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* Right: Tools & Settings */}
        <div className="flex items-center gap-2">
          {/* Drawing Tools */}
          <div className="flex items-center gap-0.5 rounded p-0.5" style={{ backgroundColor: settings.colors.background }}>
            {DRAWING_TOOLS.map(tool => (
              <button
                key={tool}
                onClick={() => handleToolSelect(tool)}
                className="px-2 py-1 rounded text-xs"
                style={{
                  backgroundColor: activeTool === tool ? settings.colors.currentPriceColor : 'transparent',
                  color: activeTool === tool ? '#fff' : settings.colors.textSecondary,
                }}
                title={tool}
              >
                {TOOL_ICONS[tool]}
              </button>
            ))}
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

          {/* Layout Manager */}
          <button
            onClick={() => setShowLayoutManager(!showLayoutManager)}
            className="px-2 py-1 rounded text-xs border"
            style={{
              backgroundColor: showLayoutManager ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showLayoutManager ? '#fff' : settings.colors.textSecondary,
            }}
            title="Layouts"
          >
            💾
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-2 py-1 rounded text-xs border"
            style={{
              backgroundColor: showSettings ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showSettings ? '#fff' : settings.colors.textSecondary,
            }}
          >
            ⚙️
          </button>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div ref={statusDotRef} className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.colors.textMuted }} />
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chart */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: activeTool === 'crosshair' ? 'crosshair' : 'default' }}
        >
          <canvas ref={canvasRef} className="w-full h-full" />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${settings.colors.background}ee` }}>
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: settings.colors.currentPriceColor }} />
                <span className="text-sm" style={{ color: settings.colors.textSecondary }}>Loading...</span>
              </div>
            </div>
          )}
        </div>

        {/* Tool Settings Panel */}
        {showToolSettings && selectedTool && (
          <div className="w-56 border-l overflow-hidden flex-shrink-0" style={{ borderColor: settings.colors.gridColor }}>
            <ToolSettingsPanel
              selectedTool={selectedTool}
              colors={settings.colors}
              onClose={() => setShowToolSettings(false)}
            />
          </div>
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
        <span>Binance • Footprint {TIMEFRAME_LABELS[timeframe]} • Tick ${tickSize}</span>
        <span>Scroll: Zoom | Shift+Scroll: Navigate | Del: Remove tool | Esc: Deselect</span>
        <span style={{ color: status === 'connected' ? settings.colors.deltaPositive : settings.colors.textMuted }}>
          {status === 'connected' ? '● Live' : '○ Offline'}
        </span>
      </div>
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
