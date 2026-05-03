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
import { evaluateAllPositions } from '@/lib/tools/ExecutionEngine';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { useAlertsStore, type PriceAlert } from '@/stores/useAlertsStore';
import { useTradingStore, type Position, type Order } from '@/stores/useTradingStore';
import { useAccountPrefsStore } from '@/stores/useAccountPrefsStore';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import { getSoundManager } from '@/lib/audio/SoundManager';
import { drawIndicatorLine, getSourceValues, lineStyleToDash, computeEMA, computeSMA } from '../utils/indicators';
import { TOOL_TYPE_MAPPING } from '../constants/tools';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs } from './types';
import { getLastToolbarInteraction } from '@/components/tools/ToolSettingsBar';
import type { ClusterRenderer } from '@/lib/rendering/ClusterRenderer';
import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';

interface UseDrawingToolsParams {
  refs: SharedRefs;
  theme: ChartTheme;
  symbol: string;
  clusterRenderer?: ClusterRenderer;
  getFootprintForTime?: (time: number) => FootprintCandle | undefined;
  showClusterOverlay?: boolean;
}

// Map DrawingTools ToolType to ToolsEngine ToolType
function mapToolType(type: ToolType): EngineToolType | null {
  return TOOL_TYPE_MAPPING[type] || null;
}

export function useDrawingTools({ refs, theme, symbol, clusterRenderer, getFootprintForTime, showClusterOverlay }: UseDrawingToolsParams) {
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [drawings, setDrawings] = useState<DrawingObject[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toolCount, setToolCount] = useState(0);
  const [toolPosition, setToolPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const drawingToolsRef = useRef(getDrawingToolsManager());

  const { magnetMode } = useCrosshairStore();
  const { alerts } = useAlertsStore();
  // Read positions/orders imperatively to avoid re-renders from every price update (every 250ms)
  const positionsRef = useRef(useTradingStore.getState().positions);
  const ordersRef = useRef(useTradingStore.getState().orders);
  const { indicators: indicatorConfigs } = useIndicatorStore();

  // Refs to avoid re-renders
  const alertsRef = useRef<PriceAlert[]>([]);
  alertsRef.current = alerts;
  const indicatorConfigsRef = useRef(indicatorConfigs);
  indicatorConfigsRef.current = indicatorConfigs;

  // PnL badge drag state machine
  const pnlDragRef = useRef<{
    active: boolean;
    position: Position | null;
    startY: number;
    currentY: number;
    dragPrice: number;
    orderType: 'limit' | 'stop' | null;
    thresholdMet: boolean;
    lastTickY: number;
  }>({ active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 });
  const hoveredBadgeSymbol = useRef<string | null>(null);
  const hoveredOrderId = useRef<string | null>(null);
  const posCloseHovered = useRef<string | null>(null);
  // Order drag state (drag limit/stop to modify price)
  const orderDragRef = useRef<{
    active: boolean;
    order: import('@/stores/useTradingStore').Order | null;
    startY: number;
    currentY: number;
    dragPrice: number;
  }>({ active: false, order: null, startY: 0, currentY: 0, dragPrice: 0 });
  const [hasPositionsOrOrders, setHasPositionsOrOrders] = useState(false);

  // Subscribe imperatively to trading store — avoids re-render on every 250ms price update
  useEffect(() => {
    const checkHas = (state: ReturnType<typeof useTradingStore.getState>) => {
      const sym = symbol.toUpperCase();
      return state.positions.some(p => p.symbol === sym) ||
             state.orders.some(o => o.status === 'pending' && o.symbol === sym);
    };
    // Initialize
    const initialState = useTradingStore.getState();
    positionsRef.current = initialState.positions;
    ordersRef.current = initialState.orders;
    setHasPositionsOrOrders(checkHas(initialState));

    return useTradingStore.subscribe((state) => {
      positionsRef.current = state.positions;
      ordersRef.current = state.orders;
      setHasPositionsOrOrders(checkHas(state));
    });
  }, [symbol]);

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

  // ═══ BADGE DESIGN CONSTANTS ═══
  const BADGE_FONT = '600 10px system-ui, sans-serif';
  const BADGE_H = 20;
  const BADGE_R = 4;
  const BADGE_PAD = 7;
  const BADGE_SEP = 1;
  const BADGE_MARGIN = 6;
  const CLOSE_SIZE = 16;
  const CLOSE_GAP = 4;
  const CLOSE_R = 3;
  const CLOSE_ICON = 3;

  const ORDER_COLORS = {
    LIMIT:  { line: '#5b8def', badge: '#1e2d4a', text: '#7da8f7', sep: '#2a3d5c' },
    STOP:   { line: '#d97b4a', badge: '#3a2518', text: '#e8965f', sep: '#4d3322' },
    LONG:   { line: '#4a7a5e', badge: '#162a1e', text: '#6cb585', sep: '#1f3a28' },
    SHORT:  { line: '#a15555', badge: '#2e1818', text: '#d07070', sep: '#3d2222' },
    TP:     { line: '#3d8b5a', badge: '#162a1e', text: '#5ec07e', sep: '#1f3a28' },
    SL:     { line: '#c05050', badge: '#2e1818', text: '#e07070', sep: '#3d2222' },
    CLOSE_BG: 'rgba(255,255,255,0.06)',
    CLOSE_BG_HOVER: 'rgba(239,68,68,0.25)',
    CLOSE_X: 'rgba(255,255,255,0.35)',
    CLOSE_X_HOVER: 'rgba(255,255,255,0.85)',
  };

  /**
   * Build the segment list shown on a pending-order badge:
   *   ["6x", "LIMIT", "78742.86"]                      (no matching position)
   *   ["6x", "LIMIT", "78742.86", "+$439"]             (matched against position)
   *
   * If the symbol has an open position, computes the P&L delta the order
   * would realize if it filled at its trigger price. Green for profit,
   * shown verbatim as the segment text — the colour decoration happens
   * inside drawSegmentedBadge via the colorSet.
   */
  const buildOrderSegments = useCallback((
    order: Order,
    orderPrice: number,
  ): string[] => {
    const isStop    = order.type === 'stop' || order.type === 'stop_limit';
    const typeLabel = isStop ? 'STOP' : 'LIMIT';
    const segs: string[] = [`${order.quantity}x`, typeLabel, orderPrice.toFixed(2)];

    // Match against open position on the same symbol. The pending order is
    // assumed to be a closing leg (TP/SL bracket on the position).
    const pos = positionsRef.current.find(p => p.symbol === order.symbol);
    if (!pos || pos.entryPrice <= 0) return segs;

    const closeQty = Math.min(order.quantity, pos.quantity);
    const pnl = pos.side === 'buy'
      ? (orderPrice - pos.entryPrice) * closeQty
      : (pos.entryPrice - orderPrice) * closeQty;

    const sign = pnl > 0 ? '+' : (pnl < 0 ? '-' : '');
    segs.push(`${sign}$${Math.abs(pnl).toFixed(0)}`);
    return segs;
  }, []);

  // ═══ HIT-TEST HELPERS for PnL badge & order buttons ═══

  /** Measure a segmented badge and return centered geometry */
  const measureBadge = useCallback((
    ctx: CanvasRenderingContext2D,
    segments: string[],
    chartWidth: number,
    showClose: boolean,
  ) => {
    ctx.font = BADGE_FONT;
    const segWidths = segments.map(s => ctx.measureText(s).width + BADGE_PAD * 2);
    const totalW = segWidths.reduce((a, b) => a + b, 0) + (segments.length - 1) * BADGE_SEP;
    const closeW = showClose ? CLOSE_SIZE + CLOSE_GAP : 0;
    const fullW = totalW + closeW;
    const badgeX = (chartWidth - fullW) / 2;
    const closeX = badgeX + totalW + CLOSE_GAP;
    return { totalW, segWidths, badgeX, closeX, closeW };
  }, []);

  const hitTestPnlBadge = useCallback((
    mx: number, my: number,
    posArr: Position[],
    priceToY: (p: number) => number,
    chartWidth: number,
    ctx: CanvasRenderingContext2D,
  ): { position: Position; badgeRect: { x: number; y: number; w: number; h: number } } | null => {
    const symbolUpper = symbol.toUpperCase();
    for (const pos of posArr) {
      if (pos.symbol !== symbolUpper) continue;
      const posY = priceToY(pos.entryPrice);
      const isLong = pos.side === 'buy';
      const pnlStr = pos.currentPrice > 0
        ? `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`
        : '$0.00';
      const segments = [`${isLong ? 'LONG' : 'SHORT'} ${pos.quantity}x`, pnlStr];
      const { totalW, badgeX } = measureBadge(ctx, segments, chartWidth, true);
      const badgeY = posY - BADGE_H / 2;
      const hitW = totalW + CLOSE_GAP + CLOSE_SIZE;
      if (mx >= badgeX && mx <= badgeX + hitW && my >= badgeY && my <= badgeY + BADGE_H) {
        return { position: pos, badgeRect: { x: badgeX, y: badgeY, w: totalW, h: BADGE_H } };
      }
    }
    return null;
  }, [symbol, measureBadge]);

  const hitTestCloseButton = useCallback((
    mx: number, my: number,
    posArr: Position[],
    priceToY: (p: number) => number,
    chartWidth: number,
    ctx: CanvasRenderingContext2D,
    hoveredSym: string | null,
  ): Position | null => {
    if (!hoveredSym) return null;
    const symbolUpper = symbol.toUpperCase();
    for (const pos of posArr) {
      if (pos.symbol !== symbolUpper || pos.symbol !== hoveredSym) continue;
      const posY = priceToY(pos.entryPrice);
      const isLong = pos.side === 'buy';
      const pnlStr = pos.currentPrice > 0 ? `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}` : '$0.00';
      const { closeX } = measureBadge(ctx, [`${isLong ? 'LONG' : 'SHORT'} ${pos.quantity}x`, pnlStr], chartWidth, true);
      const cbY = posY - CLOSE_SIZE / 2;
      if (mx >= closeX - 2 && mx <= closeX + CLOSE_SIZE + 2 && my >= cbY - 2 && my <= cbY + CLOSE_SIZE + 2) {
        return pos;
      }
    }
    return null;
  }, [symbol, measureBadge]);

  const hitTestOrderCancel = useCallback((
    mx: number, my: number,
    orderArr: Order[],
    priceToY: (p: number) => number,
    chartWidth: number,
    ctx: CanvasRenderingContext2D,
  ) => {
    const symbolUpper = symbol.toUpperCase();
    const pending = orderArr.filter(o => o.status === 'pending' && o.symbol === symbolUpper);
    for (const order of pending) {
      const orderPrice = order.price || order.stopPrice || 0;
      if (orderPrice <= 0) continue;
      const oy = priceToY(orderPrice);
      const segments = buildOrderSegments(order, orderPrice);
      const { closeX } = measureBadge(ctx, segments, chartWidth, true);
      const cbY = oy - CLOSE_SIZE / 2;
      if (mx >= closeX - 2 && mx <= closeX + CLOSE_SIZE + 2 && my >= cbY - 2 && my <= cbY + CLOSE_SIZE + 2) {
        return order;
      }
    }
    return null;
  }, [symbol, measureBadge, buildOrderSegments]);

  /** Hit-test order BADGE area (for drag-to-modify) */
  const hitTestOrderBadge = useCallback((
    mx: number, my: number,
    orderArr: Order[],
    priceToY: (p: number) => number,
    chartWidth: number,
    ctx: CanvasRenderingContext2D,
  ) => {
    const symbolUpper = symbol.toUpperCase();
    const pending = orderArr.filter(o => o.status === 'pending' && o.symbol === symbolUpper);
    for (const order of pending) {
      const orderPrice = order.price || order.stopPrice || 0;
      if (orderPrice <= 0) continue;
      const oy = priceToY(orderPrice);
      const segments = buildOrderSegments(order, orderPrice);
      const { badgeX, totalW } = measureBadge(ctx, segments, chartWidth, true);
      const badgeY = oy - BADGE_H / 2;
      if (mx >= badgeX && mx <= badgeX + totalW && my >= badgeY && my <= badgeY + BADGE_H) {
        return order;
      }
    }
    return null;
  }, [symbol, measureBadge, buildOrderSegments]);

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
        if (candles.length === 0) return 0;

        const candleTotalWidth = chartWidth / (endIndex - startIndex);

        // Extrapolate beyond candle range (unrestricted positioning)
        if (candles.length < 2) {
          const visibleIndex = 0 - startIndex;
          return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
        }
        const interval = candles[candles.length - 1].time - candles[candles.length - 2].time;
        let lo = 0, hi = candles.length - 1;
        if (time <= candles[0].time) {
          const fractionalIndex = (time - candles[0].time) / interval;
          const visibleIndex = fractionalIndex - startIndex;
          return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
        }
        if (time >= candles[hi].time) {
          const fractionalIndex = hi + (time - candles[hi].time) / interval;
          const visibleIndex = fractionalIndex - startIndex;
          return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
        }

        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (candles[mid].time <= time) lo = mid;
          else hi = mid;
        }

        let candleIndex: number;
        if (candles[lo].time === time) {
          candleIndex = lo;
        } else {
          const leftTime = candles[lo].time;
          const rightTime = candles[hi].time;
          const ratio = (time - leftTime) / (rightTime - leftTime);
          candleIndex = lo + ratio;
        }

        const visibleIndex = candleIndex - startIndex;
        return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
      },
      xToTime: (x: number) => {
        if (candles.length === 0) return Date.now() / 1000;

        const visibleCandles = endIndex - startIndex;
        const candleIndexFloat = (x / chartWidth) * visibleCandles + startIndex;
        const candleIndex = Math.floor(candleIndexFloat);
        const fraction = candleIndexFloat - candleIndex;

        // Extrapolate beyond candle range (unrestricted drag)
        if (candles.length < 2) return candles[0]?.time || Date.now() / 1000;
        const interval = candles[candles.length - 1].time - candles[candles.length - 2].time;
        if (candleIndex < 0) {
          return candles[0].time + candleIndexFloat * interval;
        }
        if (candleIndex >= candles.length - 1) {
          const overshoot = candleIndexFloat - (candles.length - 1);
          return candles[candles.length - 1].time + overshoot * interval;
        }

        // Linear interpolation between two candles
        const leftTime = candles[candleIndex].time;
        const rightTime = candles[candleIndex + 1].time;
        return leftTime + (rightTime - leftTime) * fraction;
      },
      tickSize: 0.01,
      colors: {
        positive: theme.colors.candleUp,
        negative: theme.colors.candleDown,
        selection: '#2962FF', // Professional blue
        handle: '#ffffff',
        handleBorder: '#2962FF', // Professional blue
      },
      currentPrice: refs.currentPrice.current || 0,
      hoveredToolId: refs.interactionController.current.getHoveredToolId(),
      hoveredHandle: refs.interactionController.current.getHoveredHandle(),
      altKey: refs.interactionController.current.getState().modifiers.alt,
      // Pass candles so the position renderer can compute the actual
      // high/low excursion within each position's [startTime, endTime] window.
      candles,
    };

    // Render cluster overlay (between candles and drawing tools in z-order)
    if (showClusterOverlay && clusterRenderer && getFootprintForTime) {
      const candleTotalWidth = chartWidth / (endIndex - startIndex);
      const visibleFootprints: FootprintCandle[] = [];
      for (const candle of candles) {
        const fp = getFootprintForTime(candle.time);
        if (fp) visibleFootprints.push(fp);
      }
      if (visibleFootprints.length > 0) {
        clusterRenderer.renderClusters(
          ctx, visibleFootprints, renderContext.priceToY, renderContext.timeToX,
          chartWidth, chartHeight, candleTotalWidth,
        );
      }
    }

    // Evaluate positions against latest candle (high/low based execution)
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      evaluateAllPositions(lastCandle);
    }

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

    // ═══ Position lines — fine line + right-aligned segmented badge ═══
    const symbolUpper = symbol.toUpperCase();
    const nowMs = Date.now();
    const openPositions = positionsRef.current.filter(p => p.symbol === symbolUpper);

    /** Render a segmented badge on canvas and return geometry */
    const drawSegmentedBadge = (
      segments: string[],
      centerY: number,
      colors: { badge: string; text: string; sep: string },
      showClose: boolean,
      closeHovered: boolean,
    ) => {
      ctx.font = BADGE_FONT;
      const segWidths = segments.map(s => ctx.measureText(s).width + BADGE_PAD * 2);
      const totalW = segWidths.reduce((a, b) => a + b, 0) + (segments.length - 1) * BADGE_SEP;
      const closeW = showClose ? CLOSE_SIZE + CLOSE_GAP : 0;
      const fullW = totalW + closeW;
      const badgeX = (chartWidth - fullW) / 2;
      const badgeY = centerY - BADGE_H / 2;

      // Badge background
      ctx.fillStyle = colors.badge;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, totalW, BADGE_H, BADGE_R);
      ctx.fill();
      ctx.strokeStyle = colors.sep;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Segments text + separators
      let xCursor = badgeX;
      for (let i = 0; i < segments.length; i++) {
        const segW = segWidths[i];
        ctx.fillStyle = colors.text;
        ctx.font = BADGE_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(segments[i], xCursor + segW / 2, centerY);
        if (i < segments.length - 1) {
          ctx.fillStyle = colors.sep;
          ctx.fillRect(xCursor + segW, badgeY + 4, BADGE_SEP, BADGE_H - 8);
        }
        xCursor += segW + BADGE_SEP;
      }

      // Close button (right of badge)
      if (showClose) {
        const cbX = badgeX + totalW + CLOSE_GAP;
        const cbY = centerY - CLOSE_SIZE / 2;
        ctx.fillStyle = closeHovered ? ORDER_COLORS.CLOSE_BG_HOVER : ORDER_COLORS.CLOSE_BG;
        ctx.beginPath();
        ctx.roundRect(cbX, cbY, CLOSE_SIZE, CLOSE_SIZE, CLOSE_R);
        ctx.fill();
        ctx.strokeStyle = closeHovered ? ORDER_COLORS.CLOSE_X_HOVER : ORDER_COLORS.CLOSE_X;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        const cx = cbX + CLOSE_SIZE / 2;
        ctx.beginPath();
        ctx.moveTo(cx - CLOSE_ICON, centerY - CLOSE_ICON);
        ctx.lineTo(cx + CLOSE_ICON, centerY + CLOSE_ICON);
        ctx.moveTo(cx + CLOSE_ICON, centerY - CLOSE_ICON);
        ctx.lineTo(cx - CLOSE_ICON, centerY + CLOSE_ICON);
        ctx.stroke();
      }

      return { badgeX, totalW };
    };

    for (const pos of openPositions) {
      const y = renderContext.priceToY(pos.entryPrice);
      if (y < -50 || y > chartHeight + 50) continue;

      const isLong = pos.side === 'buy';
      const colorSet = isLong ? ORDER_COLORS.LONG : ORDER_COLORS.SHORT;
      const age = nowMs - (pos.openedAt || 0);
      const isNew = age < 1500;
      const flashAlpha = isNew ? 0.12 * (1 - age / 1500) : 0;

      ctx.save();

      // Flash background on new positions (subtle)
      if (isNew) {
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = colorSet.line;
        ctx.fillRect(0, y - 10, chartWidth, 20);
        ctx.globalAlpha = 1;
      }

      // Fine line
      ctx.strokeStyle = colorSet.line;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(chartWidth, Math.round(y) + 0.5);
      ctx.stroke();

      // Segmented badge — right-aligned
      ctx.globalAlpha = 1;
      const sideLabel = isLong ? 'LONG' : 'SHORT';
      const pnlStr = pos.currentPrice > 0
        ? `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`
        : '$0.00';
      const isHovered = hoveredBadgeSymbol.current === pos.symbol;
      const isCloseHovered = posCloseHovered.current === pos.symbol;
      drawSegmentedBadge(
        [`${sideLabel} ${pos.quantity}x`, pnlStr],
        y, colorSet, isHovered, isCloseHovered,
      );

      ctx.restore();
    }

    // ═══ Pending order lines — fine line + segmented badge ═══
    const pendingOrders = ordersRef.current.filter(o => o.status === 'pending' && o.symbol === symbolUpper);
    for (const order of pendingOrders) {
      const orderPrice = order.price || order.stopPrice || 0;
      if (orderPrice <= 0) continue;
      const y = renderContext.priceToY(orderPrice);
      if (y < -20 || y > chartHeight + 20) continue;

      const isStop = order.type === 'stop' || order.type === 'stop_limit';
      const typeLabel = isStop ? 'STOP' : 'LIMIT';
      const colorSet = isStop ? ORDER_COLORS.STOP : ORDER_COLORS.LIMIT;

      ctx.save();

      // Fine line
      ctx.strokeStyle = colorSet.line;
      ctx.lineWidth = 1;
      ctx.setLineDash(isStop ? [4, 4] : []);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(chartWidth, Math.round(y) + 0.5);
      ctx.stroke();

      // Segmented badge — adds a "+$X" / "-$Y" segment when there's a
      // matching open position, so the trader sees their realized P&L
      // impact directly on the chart instead of just the price level.
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const isOrderHovered = hoveredOrderId.current === order.id;
      drawSegmentedBadge(
        buildOrderSegments(order, orderPrice),
        y, colorSet, true, isOrderHovered,
      );

      // P&L preview zone (subtle)
      if (refs.currentPrice.current > 0) {
        const isBuy = order.side === 'buy';
        const currentY = renderContext.priceToY(refs.currentPrice.current);
        const priceDiff = isBuy ? (refs.currentPrice.current - orderPrice) : (orderPrice - refs.currentPrice.current);
        if (Math.abs(y - currentY) > 10) {
          ctx.fillStyle = priceDiff >= 0 ? 'rgba(16,185,129,0.03)' : 'rgba(239,68,68,0.03)';
          const zoneTop = Math.min(y, currentY);
          const zoneH = Math.abs(y - currentY);
          ctx.fillRect(0, zoneTop, chartWidth, zoneH);
        }
      }

      ctx.restore();
    }

    // ═══ Ghost line during PnL badge drag ═══
    const drag = pnlDragRef.current;
    if (drag.active && drag.thresholdMet && drag.orderType) {
      const ghostY = renderContext.priceToY(drag.dragPrice);
      if (ghostY >= 0 && ghostY <= chartHeight) {
        ctx.save();

        const isTP = drag.orderType === 'limit';
        const ghostColors = isTP ? ORDER_COLORS.TP : ORDER_COLORS.SL;

        // Fine dashed line
        ctx.strokeStyle = ghostColors.line;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(ghostY) + 0.5);
        ctx.lineTo(chartWidth, Math.round(ghostY) + 0.5);
        ctx.stroke();

        // Segmented badge (no close button)
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9;
        const pos = drag.position;
        const qtyText = pos ? `${pos.quantity}x` : '1x';
        drawSegmentedBadge(
          [qtyText, isTP ? 'TP' : 'SL', drag.dragPrice.toFixed(2)],
          ghostY, ghostColors, false, false,
        );

        ctx.restore();
      }
    }

    // ═══ Ghost line during order drag (modify price) ═══
    const orderDrag = orderDragRef.current;
    if (orderDrag.active && orderDrag.order) {
      const ghostY = renderContext.priceToY(orderDrag.dragPrice);
      if (ghostY >= 0 && ghostY <= chartHeight) {
        ctx.save();
        const isStop = orderDrag.order.type === 'stop' || orderDrag.order.type === 'stop_limit';
        const ghostColors = isStop ? ORDER_COLORS.STOP : ORDER_COLORS.LIMIT;

        ctx.strokeStyle = ghostColors.line;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(ghostY) + 0.5);
        ctx.lineTo(chartWidth, Math.round(ghostY) + 0.5);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9;
        // Build segments using the live drag price so the $ figure
        // updates as the user drags the SL/TP up and down.
        const dragSegments = buildOrderSegments(orderDrag.order, orderDrag.dragPrice);
        drawSegmentedBadge(
          dragSegments,
          ghostY, ghostColors, false, false,
        );
        ctx.restore();
      }
    }

    // Draw indicator overlays (SMA, EMA, Bollinger, VWAP, VolumeProfile)
    // Clip to chart area so indicators don't bleed into time/price axes
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartWidth, chartHeight);
    ctx.clip();

    const enabledIndicators = indicatorConfigsRef.current.filter(i => i.enabled);
    for (const indicator of enabledIndicators) {
      let values: number[] = [];
      const dash = lineStyleToDash(indicator.style.lineStyle);
      const opacity = indicator.style.opacity ?? 0.85;

      if (indicator.type === 'VWAP') {
        // VWAP + optional standard deviation bands
        let cumTPV = 0, cumVol = 0, cumTP2V = 0;
        const vwapValues: number[] = [];
        const stdDevValues: number[] = [];
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          const tp = (c.high + c.low + c.close) / 3;
          const vol = c.volume || 1;
          cumTPV += tp * vol;
          cumVol += vol;
          cumTP2V += tp * tp * vol;
          const vwap = cumVol > 0 ? cumTPV / cumVol : 0;
          vwapValues.push(vwap);
          const variance = cumVol > 0 ? (cumTP2V / cumVol) - (vwap * vwap) : 0;
          stdDevValues.push(Math.sqrt(Math.max(0, variance)));
        }
        values = vwapValues;

        // Draw VWAP deviation bands if enabled
        const showBands1 = indicator.params.showBand1 === 1;
        const showBands2 = indicator.params.showBand2 === 1;
        const showBands3 = indicator.params.showBand3 === 1;
        if (showBands1 || showBands2 || showBands3) {
          const bandSets = [
            { show: showBands1, mult: 1, alpha: 0.12 },
            { show: showBands2, mult: 2, alpha: 0.08 },
            { show: showBands3, mult: 3, alpha: 0.05 },
          ];
          for (const band of bandSets) {
            if (!band.show) continue;
            const upper = vwapValues.map((v, i) => v > 0 ? v + stdDevValues[i] * band.mult : 0);
            const lower = vwapValues.map((v, i) => v > 0 ? v - stdDevValues[i] * band.mult : 0);
            drawIndicatorLine(ctx, upper, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 0.5, [3, 3], opacity * 0.5);
            drawIndicatorLine(ctx, lower, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 0.5, [3, 3], opacity * 0.5);
            // Fill between bands
            ctx.save();
            ctx.globalAlpha = band.alpha;
            ctx.fillStyle = indicator.style.color;
            ctx.beginPath();
            let s = false;
            for (let i = startIndex; i < Math.min(endIndex, upper.length); i++) {
              if (upper[i] === 0) continue;
              const x = ((i - startIndex) / (endIndex - startIndex)) * chartWidth;
              const y = ((priceMax - upper[i]) / (priceMax - priceMin)) * chartHeight;
              if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
            }
            for (let i = Math.min(endIndex, lower.length) - 1; i >= startIndex; i--) {
              if (lower[i] === 0) continue;
              const x = ((i - startIndex) / (endIndex - startIndex)) * chartWidth;
              const y = ((priceMax - lower[i]) / (priceMax - priceMin)) * chartHeight;
              ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      } else if (indicator.type === 'TWAP') {
        let cumTP = 0;
        values = candles.map((c, i) => {
          const tp = (c.high + c.low + c.close) / 3;
          cumTP += tp;
          return cumTP / (i + 1);
        });
      } else if (indicator.type === 'EMA') {
        const period = indicator.params.period ?? 20;
        const source = getSourceValues(candles, (indicator.style.source as import('@/types/charts').IndicatorSource) || 'close');
        values = computeEMA(source, period);
      } else if (indicator.type === 'SMA') {
        const period = indicator.params.period ?? 50;
        const source = getSourceValues(candles, (indicator.style.source as import('@/types/charts').IndicatorSource) || 'close');
        values = computeSMA(source, period);
      } else {
        continue;
      }

      if (values.length === 0) continue;

      drawIndicatorLine(ctx, values, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, indicator.style.lineWidth, dash, opacity);

      // Show label at the last visible value
      if (indicator.style.showLabel !== false && values.length > 0) {
        const lastIdx = Math.min(endIndex - 1, values.length - 1);
        if (lastIdx >= 0 && values[lastIdx] > 0) {
          const lx = ((lastIdx - startIndex) / (endIndex - startIndex)) * chartWidth;
          const ly = ((priceMax - values[lastIdx]) / (priceMax - priceMin)) * chartHeight;
          if (lx > 0 && lx < chartWidth && ly > 0 && ly < chartHeight) {
            const labelText = indicator.type;
            ctx.save();
            ctx.font = 'bold 9px sans-serif';
            const tw = ctx.measureText(labelText).width;
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = '#0d0f13';
            ctx.fillRect(lx + 4, ly - 6, tw + 6, 12);
            ctx.globalAlpha = opacity;
            ctx.fillStyle = indicator.style.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, lx + 7, ly);
            ctx.restore();
          }
        }
      }

    }

    // ═══ Magnet snap indicator ═══
    const icState = refs.interactionController.current.getState();
    if (magnetMode !== 'none' && icState.mode === 'drawing' && icState.currentPoint) {
      const snapX = renderContext.timeToX(icState.currentPoint.time);
      const snapY = renderContext.priceToY(icState.currentPoint.price);
      if (snapX >= 0 && snapX <= renderContext.width && snapY >= 0 && snapY <= renderContext.height) {
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(snapX, snapY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(snapX - 11, snapY);
        ctx.lineTo(snapX + 11, snapY);
        ctx.moveTo(snapX, snapY - 11);
        ctx.lineTo(snapX, snapY + 11);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Restore clip
    ctx.restore();
  }, [refs, theme.colors, symbol, magnetMode]);

  // Re-draw when indicators change (toggle, color, params)
  useEffect(() => {
    renderDrawingTools();
  }, [indicatorConfigs, renderDrawingTools]);

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
          const candleIndexFloat = (x / vp.chartWidth) * visibleCount + vp.startIndex;
          const candleIndex = Math.floor(candleIndexFloat);
          const fraction = candleIndexFloat - candleIndex;

          // Extrapolate beyond candle range (unrestricted drag)
          if (c.length < 2) return c[0]?.time || 0;
          const interval = c[c.length - 1].time - c[c.length - 2].time;
          if (candleIndex < 0) {
            return c[0].time + candleIndexFloat * interval;
          }
          if (candleIndex >= c.length - 1) {
            const overshoot = candleIndexFloat - (c.length - 1);
            return c[c.length - 1].time + overshoot * interval;
          }

          // Interpolate between candles for precise timestamp
          const leftTime = c[candleIndex].time;
          const rightTime = c[candleIndex + 1].time;
          return leftTime + (rightTime - leftTime) * fraction;
        },
        timeToX: (time: number) => {
          const eng = refs.chartEngine.current;
          const c = refs.candles.current;
          if (!eng || c.length === 0) return 0;
          const vp = eng.getViewport();
          const visibleCount = vp.endIndex - vp.startIndex;
          const candleTotalWidth = vp.chartWidth / visibleCount;

          if (c.length < 2) {
            const visibleIndex = 0 - vp.startIndex;
            return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
          }

          const interval = c[c.length - 1].time - c[c.length - 2].time;

          // Extrapolate beyond candle range (unrestricted positioning)
          if (time <= c[0].time) {
            const fractionalIndex = (time - c[0].time) / interval;
            const visibleIndex = fractionalIndex - vp.startIndex;
            return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
          }
          if (time >= c[c.length - 1].time) {
            const fractionalIndex = (c.length - 1) + (time - c[c.length - 1].time) / interval;
            const visibleIndex = fractionalIndex - vp.startIndex;
            return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
          }

          // Find candles that bracket this timestamp
          let leftIdx = 0;
          let rightIdx = c.length - 1;
          for (let i = 0; i < c.length; i++) {
            if (c[i].time <= time) leftIdx = i;
            if (c[i].time >= time && rightIdx === c.length - 1) { rightIdx = i; break; }
          }

          // Interpolate for precise position
          let candleIndex: number;
          if (leftIdx === rightIdx) {
            candleIndex = leftIdx;
          } else {
            const ratio = (time - c[leftIdx].time) / (c[rightIdx].time - c[leftIdx].time);
            candleIndex = leftIdx + ratio;
          }

          const visibleIndex = candleIndex - vp.startIndex;
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
        // Refresh selectedTool so UI components get fresh data
        const engine = refs.toolsEngine.current;
        const selected = engine.getSelectedTools();
        if (selected.length === 1) {
          setSelectedTool({ ...selected[0] });
        } else if (selected.length === 0) {
          setSelectedTool(null);
        }
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

    // Re-render drawing tools whenever the chart viewport changes (zoom, pan, new data)
    const chartEngine = refs.chartEngine.current;
    const viewportHandler = () => renderDrawingTools();
    if (chartEngine) {
      chartEngine.addViewportChangeListener(viewportHandler);
    }

    return () => {
      resizeObserver.disconnect();
      if (chartEngine) {
        chartEngine.removeViewportChangeListener(viewportHandler);
      }
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
  // Track whether we're forwarding events to chart (no tool hit on mousedown)
  const forwardingToChartRef = useRef(false);
  // Guard: prevent deselection when interacting with UI overlays (ToolSettingsBar etc.)
  const ignoreNextCanvasClickRef = useRef(false);
  // Tool context menu state
  const [toolContextMenu, setToolContextMenu] = useState<{
    x: number;
    y: number;
    tool: Tool;
  } | null>(null);
  // Text editor state
  const [textEditorState, setTextEditorState] = useState<{
    tool: Tool;
    position: { x: number; y: number };
  } | null>(null);

  const forwardEventToChart = useCallback((e: React.MouseEvent<HTMLCanvasElement>, type: string) => {
    const chartCanvas = refs.chartCanvas.current;
    if (!chartCanvas) return;
    chartCanvas.dispatchEvent(new MouseEvent(type, {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      bubbles: true,
    }));
  }, [refs]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    // Skip if ToolSettingsBar was interacted with very recently (within 200ms)
    // The timestamp is set via native capture-phase listener, so it's always
    // set before this React handler fires
    if (Date.now() - getLastToolbarInteraction() < 200) {
      return;
    }

    // Skip if a UI overlay (ToolSettingsBar) consumed this interaction
    if (ignoreNextCanvasClickRef.current) {
      ignoreNextCanvasClickRef.current = false;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const controller = refs.interactionController.current;
    controller.setChartBounds(rect);

    const currentTool = controller.getActiveTool();

    // ═══ TRADE INTERACTION PRIORITY CHECK ═══
    if (currentTool === 'cursor' || currentTool === 'crosshair') {
      const canvas = refs.drawingCanvas.current;
      const converter = controller.getCoordinateConverter();
      if (canvas && converter) {
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const vp = refs.chartEngine.current?.getViewport();
        const chartWidth = vp?.chartWidth || canvas.width;
        const canvasCtx = canvas.getContext('2d');

        if (canvasCtx) {
          // 1. Close button (highest priority, smallest target)
          const closeHit = hitTestCloseButton(mx, my, positionsRef.current, converter.priceToY, chartWidth, canvasCtx, hoveredBadgeSymbol.current);
          if (closeHit) {
            e.preventDefault();
            forwardingToChartRef.current = false;
            useTradingStore.getState().closePosition(closeHit.symbol);
            return;
          }

          // 2. Order cancel "×" button
          const cancelHit = hitTestOrderCancel(mx, my, ordersRef.current, converter.priceToY, chartWidth, canvasCtx);
          if (cancelHit) {
            e.preventDefault();
            forwardingToChartRef.current = false;
            useTradingStore.getState().cancelOrder(cancelHit.id);
            renderDrawingTools();
            return;
          }

          // 2b. Order badge drag (to modify price)
          const orderBadgeHit = hitTestOrderBadge(mx, my, ordersRef.current, converter.priceToY, chartWidth, canvasCtx);
          if (orderBadgeHit) {
            e.preventDefault();
            forwardingToChartRef.current = false;
            const orderPrice = orderBadgeHit.price || orderBadgeHit.stopPrice || 0;
            orderDragRef.current = {
              active: true,
              order: orderBadgeHit,
              startY: my,
              currentY: my,
              dragPrice: orderPrice,
            };
            const drawingCanvas = refs.drawingCanvas.current;
            if (drawingCanvas) drawingCanvas.style.cursor = 'ns-resize';
            // Window events for drag beyond canvas
            const onWindowMove = (ev: MouseEvent) => {
              if (!orderDragRef.current.active || !drawingCanvas) return;
              const r = drawingCanvas.getBoundingClientRect();
              const wy = ev.clientY - r.top;
              orderDragRef.current.currentY = wy;
              const conv = refs.interactionController.current.getCoordinateConverter();
              if (conv) {
                const rawPrice = conv.yToPrice(wy);
                orderDragRef.current.dragPrice = Math.round(rawPrice * 100) / 100;
              }
              renderDrawingTools();
            };
            const onWindowUp = () => {
              window.removeEventListener('mousemove', onWindowMove);
              window.removeEventListener('mouseup', onWindowUp);
              if (!orderDragRef.current.active) return;
              const dragOrder = orderDragRef.current.order;
              const newPrice = orderDragRef.current.dragPrice;
              orderDragRef.current = { active: false, order: null, startY: 0, currentY: 0, dragPrice: 0 };
              if (drawingCanvas) drawingCanvas.style.cursor = '';
              if (dragOrder && newPrice > 0) {
                const oldPrice = dragOrder.price || dragOrder.stopPrice || 0;
                if (Math.abs(newPrice - oldPrice) > 0.001) {
                  const tradingState = useTradingStore.getState();
                  tradingState.cancelOrder(dragOrder.id);
                  const isStop = dragOrder.type === 'stop' || dragOrder.type === 'stop_limit';
                  tradingState.placeOrder({
                    broker: dragOrder.broker,
                    symbol: dragOrder.symbol,
                    side: dragOrder.side,
                    type: dragOrder.type,
                    quantity: dragOrder.quantity,
                    price: isStop ? undefined : newPrice,
                    stopPrice: isStop ? newPrice : undefined,
                    marketPrice: refs.currentPrice.current || 0,
                  });
                }
              }
              renderDrawingTools();
            };
            window.addEventListener('mousemove', onWindowMove);
            window.addEventListener('mouseup', onWindowUp);
            return;
          }

          // 3. PnL badge (start drag)
          const badgeHit = hitTestPnlBadge(mx, my, positionsRef.current, converter.priceToY, chartWidth, canvasCtx);
          if (badgeHit) {
            e.preventDefault();
            forwardingToChartRef.current = false;
            pnlDragRef.current = {
              active: true,
              position: badgeHit.position,
              startY: my,
              currentY: my,
              dragPrice: badgeHit.position.entryPrice,
              orderType: null,
              thresholdMet: false,
              lastTickY: my,
            };

            // Window events so drag continues outside canvas
            const drawingCanvas = refs.drawingCanvas.current;
            const onWindowMove = (ev: MouseEvent) => {
              if (!pnlDragRef.current.active || !drawingCanvas) return;
              const r = drawingCanvas.getBoundingClientRect();
              const wy = ev.clientY - r.top;
              pnlDragRef.current.currentY = wy;

              if (!positionsRef.current.some(p => p.symbol === pnlDragRef.current.position?.symbol)) {
                pnlDragRef.current = { active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 };
                if (drawingCanvas) drawingCanvas.style.cursor = '';
                renderDrawingTools();
                return;
              }

              const conv = refs.interactionController.current.getCoordinateConverter();
              if (conv) {
                const rawPrice = conv.yToPrice(wy);
                pnlDragRef.current.dragPrice = Math.round(rawPrice / 0.01) * 0.01;
                const dist = Math.abs(wy - pnlDragRef.current.startY);
                if (dist > 15) pnlDragRef.current.thresholdMet = true;
                if (pnlDragRef.current.thresholdMet && pnlDragRef.current.position) {
                  const pos = pnlDragRef.current.position;
                  const entryY = conv.priceToY(pos.entryPrice);
                  if (pos.side === 'buy') {
                    pnlDragRef.current.orderType = wy < entryY ? 'limit' : 'stop';
                  } else {
                    pnlDragRef.current.orderType = wy > entryY ? 'limit' : 'stop';
                  }
                }
                if (Math.abs(wy - pnlDragRef.current.lastTickY) > 20) {
                  pnlDragRef.current.lastTickY = wy;
                  const { soundEnabled } = useAccountPrefsStore.getState();
                  if (soundEnabled) getSoundManager().playDragTick();
                }
              }
              drawingCanvas.style.cursor = 'ns-resize';
              renderDrawingTools();
            };
            const onWindowUp = (ev: MouseEvent) => {
              window.removeEventListener('mousemove', onWindowMove);
              window.removeEventListener('mouseup', onWindowUp);
              if (!pnlDragRef.current.active) return;
              // Reuse mouseup logic — synthesize a React-like event
              const r = drawingCanvas?.getBoundingClientRect();
              if (r && pnlDragRef.current.thresholdMet && pnlDragRef.current.position && pnlDragRef.current.orderType) {
                const tradingState = useTradingStore.getState();
                const broker = tradingState.activeBroker;
                if (broker) {
                  const pos = pnlDragRef.current.position;
                  const orderSide = pos.side === 'buy' ? 'sell' : 'buy';
                  const existingOrders = tradingState.orders.filter(
                    (o: { status: string; symbol: string; side: string; type: string }) =>
                      o.status === 'pending' && o.symbol === pos.symbol
                      && o.side === orderSide && o.type === pnlDragRef.current.orderType
                  );
                  for (const existing of existingOrders) tradingState.cancelOrder(existing.id);
                  if (pnlDragRef.current.orderType === 'limit') {
                    tradingState.placeOrder({ broker, symbol: pos.symbol, side: orderSide as 'buy' | 'sell', type: 'limit', quantity: pos.quantity, price: pnlDragRef.current.dragPrice, marketPrice: refs.currentPrice.current || 0 });
                  } else {
                    tradingState.placeOrder({ broker, symbol: pos.symbol, side: orderSide as 'buy' | 'sell', type: 'stop', quantity: pos.quantity, stopPrice: pnlDragRef.current.dragPrice, marketPrice: refs.currentPrice.current || 0 });
                  }
                  const { soundEnabled } = useAccountPrefsStore.getState();
                  if (soundEnabled) getSoundManager().playOrderConfirm();
                }
              }
              pnlDragRef.current = { active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 };
              if (drawingCanvas) drawingCanvas.style.cursor = '';
              renderDrawingTools();
            };
            window.addEventListener('mousemove', onWindowMove);
            window.addEventListener('mouseup', onWindowUp);
            return;
          }
        }
      }
    }

    // In cursor mode, check if we're clicking on a tool first
    if (currentTool === 'cursor' || currentTool === 'crosshair') {
      const engine = refs.toolsEngine.current;
      const converter = controller.getCoordinateConverter();
      if (converter) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const point = { time: converter.xToTime(x), price: converter.yToPrice(y) };
        const hit = engine.hitTest(point, converter.priceToY, converter.timeToX, 15);

        if (hit) {
          forwardingToChartRef.current = false;
          controller.handleMouseDown(e);
        } else {
          // No tool hit - forward all events to chart for pan/zoom
          forwardingToChartRef.current = true;
          engine.deselectAll();
          setSelectedTool(null);
          setToolPosition(undefined);
          renderDrawingTools();
          forwardEventToChart(e, 'mousedown');
        }
        return;
      }
    }

    // Drawing mode - always handle
    forwardingToChartRef.current = false;
    controller.handleMouseDown(e);
  }, [refs, renderDrawingTools, forwardEventToChart, hitTestPnlBadge, hitTestCloseButton, hitTestOrderCancel, hitTestOrderBadge]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // ═══ PnL BADGE DRAG HANDLING ═══
    const drag = pnlDragRef.current;
    if (drag.active) {
      const rect = e.currentTarget.getBoundingClientRect();
      const my = e.clientY - rect.top;
      drag.currentY = my;

      // Check if position still exists (may have been closed externally)
      if (drag.position && !positionsRef.current.some(p => p.symbol === drag.position!.symbol)) {
        pnlDragRef.current = { active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 };
        const canvas = refs.drawingCanvas.current;
        if (canvas) canvas.style.cursor = '';
        renderDrawingTools();
        return;
      }

      const converter = refs.interactionController.current.getCoordinateConverter();
      if (converter) {
        const rawPrice = converter.yToPrice(my);
        drag.dragPrice = Math.round(rawPrice * 100) / 100; // snap to 0.01 tick

        const pixelDelta = Math.abs(my - drag.startY);
        drag.thresholdMet = pixelDelta >= 15;

        if (drag.thresholdMet && drag.position) {
          const isLong = drag.position.side === 'buy';
          const draggedUp = my < drag.startY;
          // Long: UP = limit (TP above), DOWN = stop (SL below)
          // Short: UP = stop (SL above), DOWN = limit (TP below)
          drag.orderType = (isLong && draggedUp) || (!isLong && !draggedUp) ? 'limit' : 'stop';
        }

        // Drag tick sound every ~20px
        if (drag.thresholdMet && Math.abs(my - drag.lastTickY) >= 20) {
          const { soundEnabled } = useAccountPrefsStore.getState();
          if (soundEnabled) getSoundManager().playDragTick();
          drag.lastTickY = my;
        }
      }

      const canvas = refs.drawingCanvas.current;
      if (canvas) canvas.style.cursor = 'ns-resize';
      renderDrawingTools();
      return;
    }

    if (forwardingToChartRef.current) {
      forwardEventToChart(e, 'mousemove');
      return;
    }

    // ═══ PnL badge hover detection (for close button visibility) ═══
    const canvas = refs.drawingCanvas.current;
    const converter = refs.interactionController.current.getCoordinateConverter();
    if (canvas && converter) {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my2 = e.clientY - rect.top;
      const vp = refs.chartEngine.current?.getViewport();
      const chartWidth = vp?.chartWidth || canvas.width;
      const canvasCtx = canvas.getContext('2d');
      if (canvasCtx) {
        let needsRedraw = false;

        // Position badge hover
        const badgeHit = hitTestPnlBadge(mx, my2, positionsRef.current, converter.priceToY, chartWidth, canvasCtx);
        const newHovered = badgeHit ? badgeHit.position.symbol : null;
        if (newHovered !== hoveredBadgeSymbol.current) {
          hoveredBadgeSymbol.current = newHovered;
          needsRedraw = true;
        }

        // Position close button hover
        if (newHovered) {
          const closeHit = hitTestCloseButton(mx, my2, positionsRef.current, converter.priceToY, chartWidth, canvasCtx, newHovered);
          const newCloseHovered = closeHit ? closeHit.symbol : null;
          if (newCloseHovered !== posCloseHovered.current) {
            posCloseHovered.current = newCloseHovered;
            needsRedraw = true;
          }
          canvas.style.cursor = closeHit ? 'pointer' : 'grab';
        } else {
          if (posCloseHovered.current !== null) { posCloseHovered.current = null; needsRedraw = true; }
          canvas.style.cursor = '';
        }

        // Order cancel hover
        const orderCancelHit = hitTestOrderCancel(mx, my2, ordersRef.current, converter.priceToY, chartWidth, canvasCtx);
        const newOrderHovered = orderCancelHit ? orderCancelHit.id : null;
        if (newOrderHovered !== hoveredOrderId.current) {
          hoveredOrderId.current = newOrderHovered;
          needsRedraw = true;
        }
        if (newOrderHovered) {
          canvas.style.cursor = 'pointer';
        } else if (!newHovered) {
          // Order badge hover (show grab cursor for drag-to-modify)
          const orderBadge = hitTestOrderBadge(mx, my2, ordersRef.current, converter.priceToY, chartWidth, canvasCtx);
          if (orderBadge) {
            canvas.style.cursor = 'grab';
          }
        }

        if (needsRedraw) renderDrawingTools();
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    refs.interactionController.current.setChartBounds(rect);
    refs.interactionController.current.handleMouseMove(e);

    // Always forward mousemove to chart engine so crosshair lines update
    forwardEventToChart(e, 'mousemove');
  }, [refs, forwardEventToChart, renderDrawingTools, hitTestPnlBadge, hitTestCloseButton, hitTestOrderCancel, hitTestOrderBadge]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // ═══ PnL BADGE DRAG RELEASE ═══
    const drag = pnlDragRef.current;
    if (drag.active) {
      if (drag.thresholdMet && drag.position && drag.orderType) {
        const tradingState = useTradingStore.getState();
        const broker = tradingState.activeBroker;
        if (broker) {
          const pos = drag.position;
          const orderSide = pos.side === 'buy' ? 'sell' : 'buy';

          // DEDUP: Cancel existing pending order of same type/side before placing new
          const existingOrders = tradingState.orders.filter(
            (o: { status: string; symbol: string; side: string; type: string }) =>
              o.status === 'pending' && o.symbol === pos.symbol
              && o.side === orderSide && o.type === drag.orderType
          );
          for (const existing of existingOrders) {
            tradingState.cancelOrder(existing.id);
          }

          if (drag.orderType === 'limit') {
            tradingState.placeOrder({
              broker,
              symbol: pos.symbol,
              side: orderSide as 'buy' | 'sell',
              type: 'limit',
              quantity: pos.quantity,
              price: drag.dragPrice,
              marketPrice: refs.currentPrice.current || 0,
            });
          } else {
            tradingState.placeOrder({
              broker,
              symbol: pos.symbol,
              side: orderSide as 'buy' | 'sell',
              type: 'stop',
              quantity: pos.quantity,
              stopPrice: drag.dragPrice,
              marketPrice: refs.currentPrice.current || 0,
            });
          }

          const { soundEnabled } = useAccountPrefsStore.getState();
          if (soundEnabled) getSoundManager().playOrderConfirm();
        }
      }

      // Reset drag state
      pnlDragRef.current = { active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 };
      const canvas = refs.drawingCanvas.current;
      if (canvas) canvas.style.cursor = '';
      renderDrawingTools();
      return;
    }

    if (forwardingToChartRef.current) {
      forwardingToChartRef.current = false;
      forwardEventToChart(e, 'mouseup');
      return;
    }
    refs.interactionController.current.handleMouseUp(e);
  }, [refs, forwardEventToChart, renderDrawingTools]);

  const handleCanvasMouseLeave = useCallback(() => {
    // If PnL drag is active, let window events handle — don't cancel
    if (pnlDragRef.current.active) {
      return;
    }

    if (forwardingToChartRef.current) {
      forwardingToChartRef.current = false;
    }
    // Always forward mouseleave to chart so crosshair hides
    const chartCanvas = refs.chartCanvas.current;
    if (chartCanvas) {
      chartCanvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }
    refs.interactionController.current.handleMouseLeave();
  }, [refs, renderDrawingTools]);

  // ESC key cancels PnL drag
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pnlDragRef.current.active) {
        pnlDragRef.current = { active: false, position: null, startY: 0, currentY: 0, dragPrice: 0, orderType: null, thresholdMet: false, lastTickY: 0 };
        const canvas = refs.drawingCanvas.current;
        if (canvas) canvas.style.cursor = '';
        renderDrawingTools();
      }
    };
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [refs, renderDrawingTools]);

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const converter = refs.interactionController.current.getCoordinateConverter();
    if (!converter) return;

    const point = {
      time: converter.xToTime(x),
      price: converter.yToPrice(y),
    };

    // Hit test to find tool under cursor
    const hit = refs.toolsEngine.current.hitTest(
      point,
      converter.priceToY,
      converter.timeToX,
      15 // tolerance
    );

    if (hit) {
      // Show tool context menu
      setToolContextMenu({
        x: e.clientX,
        y: e.clientY,
        tool: hit.tool,
      });
    } else {
      // No tool hit - allow event to bubble to chart's context menu
      // (don't preventDefault in this case)
    }
  }, [refs]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const converter = refs.interactionController.current.getCoordinateConverter();
    if (!converter) return;

    const point = {
      time: converter.xToTime(x),
      price: converter.yToPrice(y),
    };

    // Hit test to find tool
    const hit = refs.toolsEngine.current.hitTest(
      point,
      converter.priceToY,
      converter.timeToX,
      15
    );

    if (hit && hit.tool.type === 'text') {
      // Start text editing
      refs.toolsEngine.current.startTextEdit(hit.tool.id);

      // Show text editor at tool position
      setTextEditorState({
        tool: hit.tool,
        position: { x: e.clientX, y: e.clientY },
      });
    }
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
    handleCanvasContextMenu,
    handleCanvasDoubleClick,
    toolContextMenu,
    setToolContextMenu,
    textEditorState,
    setTextEditorState,
    mapToolType,
    ignoreNextCanvasClickRef,
    hasPositionsOrOrders,
  };
}
