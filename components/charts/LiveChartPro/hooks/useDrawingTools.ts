import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getDrawingToolsManager,
  type ToolType,
  type DrawingObject,
} from '@/lib/live/DrawingTools';
import {
  type ToolType as EngineToolType,
  type Tool,
} from '@/lib/tools/ToolsEngine';
import type { RenderContext } from '@/lib/tools/ToolsRenderer';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { useAlertsStore, type PriceAlert } from '@/stores/useAlertsStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import { computeSMA, computeEMA, drawIndicatorLine } from '../utils/indicators';
import { TOOL_TYPE_MAPPING } from '../constants/tools';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs } from './types';

interface UseDrawingToolsParams {
  refs: SharedRefs;
  theme: ChartTheme;
  symbol: string;
}

// Map DrawingTools ToolType to ToolsEngine ToolType
function mapToolType(type: ToolType): EngineToolType | null {
  return TOOL_TYPE_MAPPING[type] || null;
}

export function useDrawingTools({ refs, theme, symbol }: UseDrawingToolsParams) {
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toolCount, setToolCount] = useState(0);
  const [toolPosition, setToolPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const drawingToolsRef = useRef(getDrawingToolsManager());

  const { magnetMode } = useCrosshairStore();
  const { alerts } = useAlertsStore();
  const { positions, orders } = useTradingStore();
  const { indicators: indicatorConfigs } = useIndicatorStore();

  // Refs to avoid re-renders
  const alertsRef = useRef<PriceAlert[]>([]);
  alertsRef.current = alerts;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const indicatorConfigsRef = useRef(indicatorConfigs);
  indicatorConfigsRef.current = indicatorConfigs;

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

    if (selectedTool) {
      refs.toolsEngine.current.deselectAll();
      setSelectedTool(null);
    }

    const engineToolId = mapToolType(toolId);
    if (engineToolId) {
      refs.interactionController.current.setActiveTool(engineToolId);
    }
  }, [selectedTool, refs]);

  /**
   * Handle tool selection (from FavoritesToolbar or existing tool click)
   */
  const handleToolSelect = useCallback((tool: EngineToolType) => {
    setActiveTool(tool as ToolType);
    refs.interactionController.current.setActiveTool(tool);

    if (selectedTool) {
      refs.toolsEngine.current.deselectAll();
      setSelectedTool(null);
    }
  }, [selectedTool, refs]);

  /**
   * Render drawing tools on canvas
   */
  const renderDrawingTools = useCallback(() => {
    const canvas = refs.drawingCanvas.current;
    const container = refs.chartContainer.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const candles = refs.candles.current;
    if (candles.length === 0) return;

    const engine = refs.chartEngine.current;
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
      currentPrice: refs.currentPrice.current || 0,
      hoveredToolId: refs.interactionController.current.getHoveredToolId(),
      hoveredHandle: refs.interactionController.current.getHoveredHandle(),
    };

    refs.toolsRenderer.current.render(renderContext);

    // Draw alert lines
    const activeAlerts = alertsRef.current.filter(a => !a.triggered && a.symbol === symbol);
    for (const alert of activeAlerts) {
      const y = renderContext.priceToY(alert.price);
      if (y < 0 || y > chartHeight) continue;

      ctx.save();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      const label = `🔔 ${alert.price.toFixed(2)}`;
      ctx.setLineDash([]);
      ctx.font = '10px monospace';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.fillRect(chartWidth - textWidth - 12, y - 8, textWidth + 8, 16);
      ctx.fillStyle = '#eab308';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, chartWidth - 8, y);
      ctx.restore();
    }

    // Draw position lines
    const symbolUpper = symbol.toUpperCase();
    const openPositions = positionsRef.current.filter(p => p.symbol === symbolUpper);
    for (const pos of openPositions) {
      const y = renderContext.priceToY(pos.entryPrice);
      if (y < -50 || y > chartHeight + 50) continue;

      const isLong = pos.side === 'buy';
      const color = isLong ? '#10b981' : '#ef4444';
      const pnlColor = pos.pnl >= 0 ? '#10b981' : '#ef4444';

      ctx.save();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 4]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = 'bold 10px monospace';
      const sideLabel = isLong ? 'LONG' : 'SHORT';
      const entryLabel = `${sideLabel} ${pos.quantity} @ ${pos.entryPrice.toFixed(2)}`;
      const entryWidth = ctx.measureText(entryLabel).width;
      ctx.fillStyle = color + '20';
      ctx.fillRect(4, y - 18, entryWidth + 12, 16);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(entryLabel, 10, y - 10);

      if (pos.currentPrice > 0) {
        const currentY = renderContext.priceToY(pos.currentPrice);
        if (currentY >= 0 && currentY <= chartHeight) {
          const pnlStr = `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)} (${pos.pnlPercent >= 0 ? '+' : ''}${pos.pnlPercent.toFixed(2)}%)`;
          ctx.font = 'bold 11px monospace';
          const pnlWidth = ctx.measureText(pnlStr).width;

          ctx.fillStyle = pnlColor + '08';
          const zoneTop = Math.min(y, currentY);
          const zoneHeight = Math.abs(y - currentY);
          ctx.fillRect(0, zoneTop, chartWidth, zoneHeight);

          ctx.fillStyle = pnlColor + '25';
          ctx.fillRect(4, currentY - 8, pnlWidth + 12, 16);
          ctx.fillStyle = pnlColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(pnlStr, 10, currentY);
        }
      }

      ctx.restore();
    }

    // Draw pending order lines
    const pendingOrders = ordersRef.current.filter(o => o.status === 'pending' && o.symbol === symbolUpper);
    for (const order of pendingOrders) {
      const orderPrice = order.price || order.stopPrice || 0;
      if (orderPrice <= 0) continue;
      const y = renderContext.priceToY(orderPrice);
      if (y < -20 || y > chartHeight + 20) continue;

      const isBuy = order.side === 'buy';
      const isStop = order.type === 'stop' || order.type === 'stop_limit';
      const color = isBuy ? '#3b82f6' : '#f97316';
      const typeLabel = isStop ? 'STOP' : 'LIMIT';

      ctx.save();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(isStop ? [3, 3] : [6, 3]);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = '9px monospace';
      const orderLabel = `${typeLabel} ${isBuy ? 'BUY' : 'SELL'} ${order.quantity} @ ${orderPrice.toFixed(2)}`;
      const labelW = ctx.measureText(orderLabel).width;
      ctx.fillStyle = color + '18';
      ctx.fillRect(chartWidth - labelW - 30, y - 8, labelW + 26, 16);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(orderLabel, chartWidth - 22, y);

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(chartWidth - 18, y - 6, 12, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('×', chartWidth - 12, y + 1);

      if (refs.currentPrice.current > 0) {
        const currentY = renderContext.priceToY(refs.currentPrice.current);
        const priceDiff = isBuy ? (refs.currentPrice.current - orderPrice) : (orderPrice - refs.currentPrice.current);
        const pnlPreview = priceDiff * order.quantity;
        if (Math.abs(y - currentY) > 10) {
          ctx.fillStyle = pnlPreview >= 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)';
          const zoneTop = Math.min(y, currentY);
          const zoneH = Math.abs(y - currentY);
          ctx.fillRect(0, zoneTop, chartWidth, zoneH);
        }
      }

      ctx.restore();
    }

    // Draw indicator overlays (SMA, EMA, Bollinger, VWAP)
    const enabledIndicators = indicatorConfigsRef.current.filter(i => i.enabled);
    for (const indicator of enabledIndicators) {
      const closes = candles.map(c => c.close);
      let values: number[] = [];
      let upperBand: number[] | null = null;
      let lowerBand: number[] | null = null;

      const period = indicator.params.period || 20;

      if (indicator.type === 'SMA') {
        values = computeSMA(closes, period);
      } else if (indicator.type === 'EMA') {
        values = computeEMA(closes, period);
      } else if (indicator.type === 'BollingerBands') {
        const stdDev = indicator.params.stdDev || 2;
        const sma = computeSMA(closes, period);
        values = sma;
        upperBand = sma.map((v, i) => {
          if (v === 0) return 0;
          const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
          const std = Math.sqrt(slice.reduce((s, x) => s + (x - v) ** 2, 0) / slice.length);
          return v + std * stdDev;
        });
        lowerBand = sma.map((v, i) => {
          if (v === 0) return 0;
          const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
          const std = Math.sqrt(slice.reduce((s, x) => s + (x - v) ** 2, 0) / slice.length);
          return v - std * stdDev;
        });
      } else if (indicator.type === 'VWAP') {
        let cumTPV = 0, cumVol = 0;
        values = candles.map(c => {
          const tp = (c.high + c.low + c.close) / 3;
          const vol = c.volume || 1;
          cumTPV += tp * vol;
          cumVol += vol;
          return cumVol > 0 ? cumTPV / cumVol : 0;
        });
      } else {
        continue;
      }

      if (values.length === 0) continue;

      drawIndicatorLine(ctx, values, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, indicator.style.lineWidth);

      if (upperBand && lowerBand) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = indicator.style.color;
        ctx.beginPath();
        let started = false;
        for (let i = startIndex; i < Math.min(endIndex, upperBand.length); i++) {
          if (upperBand[i] === 0) continue;
          const x = ((i - startIndex) / (endIndex - startIndex)) * chartWidth;
          const y = ((priceMax - upperBand[i]) / (priceMax - priceMin)) * chartHeight;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        for (let i = Math.min(endIndex, lowerBand.length) - 1; i >= startIndex; i--) {
          if (lowerBand[i] === 0) continue;
          const x = ((i - startIndex) / (endIndex - startIndex)) * chartWidth;
          const y = ((priceMax - lowerBand[i]) / (priceMax - priceMin)) * chartHeight;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        drawIndicatorLine(ctx, upperBand, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 1, [4, 3]);
        drawIndicatorLine(ctx, lowerBand, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 1, [4, 3]);
      }
    }
  }, [refs, theme.colors, symbol]);

  /**
   * Setup drawing canvas and interaction controller
   */
  useEffect(() => {
    const canvas = refs.drawingCanvas.current;
    const container = refs.chartContainer.current;
    if (!canvas || !container) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      renderDrawingTools();
    };
    updateCanvasSize();

    const controller = refs.interactionController.current;

    const createCoordinateConverter = () => {
      return {
        xToTime: (x: number) => {
          const eng = refs.chartEngine.current;
          const c = refs.candles.current;
          if (!eng || c.length === 0) return 0;
          const vp = eng.getViewport();
          const visibleCount = vp.endIndex - vp.startIndex;
          const candleIndex = Math.floor((x / vp.chartWidth) * visibleCount) + vp.startIndex;
          if (candleIndex >= 0 && candleIndex < c.length) return c[candleIndex].time;
          return c[c.length - 1]?.time || 0;
        },
        timeToX: (time: number) => {
          const eng = refs.chartEngine.current;
          const c = refs.candles.current;
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
          const eng = refs.chartEngine.current;
          if (!eng) return 0;
          const vp = eng.getViewport();
          return vp.priceMax - (y / vp.chartHeight) * (vp.priceMax - vp.priceMin);
        },
        priceToY: (price: number) => {
          const eng = refs.chartEngine.current;
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
        setToolCount(refs.toolsEngine.current.getAllTools().length);
        setActiveTool('cursor');
      },
      onToolDeleted: () => {
        setToolCount(refs.toolsEngine.current.getAllTools().length);
      },
      onToolUpdated: () => {
        renderDrawingTools();
      },
      onModeChanged: () => {
        renderDrawingTools();
      },
      onActiveToolChanged: (tool: string) => {
        setActiveTool(tool as ToolType);
      },
      onCursorChanged: (cursor) => {
        if (canvas) {
          canvas.style.cursor = cursor;
        }
      },
      requestRedraw: () => {
        renderDrawingTools();
        setToolCount(refs.toolsEngine.current.getAllTools().length);
        controller.setCoordinateConverter(createCoordinateConverter());
      },
      getOHLCAtTime: (time: number) => {
        const candleMap = refs.candleData.current;
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

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      const rect = container.getBoundingClientRect();
      controller.setChartBounds(rect);
      controller.setCoordinateConverter(createCoordinateConverter());
    });
    resizeObserver.observe(container);

    controller.setChartBounds(container.getBoundingClientRect());

    return () => {
      resizeObserver.disconnect();
    };
  }, [refs, renderDrawingTools]);

  /**
   * Update magnet mode in controller when it changes
   */
  useEffect(() => {
    refs.interactionController.current.setMagnetMode(magnetMode);
  }, [refs, magnetMode]);

  /**
   * Mouse event handlers
   */
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const controller = refs.interactionController.current;
    controller.setChartBounds(rect);

    const currentTool = controller.getActiveTool();
    if (currentTool === 'cursor' || currentTool === 'crosshair') {
      const engine = refs.toolsEngine.current;
      const converter = controller.getCoordinateConverter();
      if (converter && engine.getAllTools().length > 0) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const point = { time: converter.xToTime(x), price: converter.yToPrice(y) };
        const hit = engine.hitTest(point, converter.priceToY, converter.timeToX, 15);
        if (!hit) {
          engine.deselectAll();
          setSelectedTool(null);
          setToolPosition(undefined);
          renderDrawingTools();
          return;
        }
      }
    }

    controller.handleMouseDown(e);
  }, [refs, renderDrawingTools]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    refs.interactionController.current.setChartBounds(rect);
    refs.interactionController.current.handleMouseMove(e);
  }, [refs]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    refs.interactionController.current.handleMouseUp(e);
  }, [refs]);

  const handleCanvasMouseLeave = useCallback(() => {
    refs.interactionController.current.handleMouseLeave();
  }, [refs]);

  return {
    activeTool,
    setActiveTool,
    selectedTool,
    setSelectedTool,
    toolPosition,
    setToolPosition,
    toolCount,
    isDrawing,
    drawings,
    handleToolChange,
    handleToolSelect,
    renderDrawingTools,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
    mapToolType,
  };
}
