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
import { computeSMA, computeEMA, drawIndicatorLine, getSourceValues, lineStyleToDash } from '../utils/indicators';
import { TOOL_TYPE_MAPPING } from '../constants/tools';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs } from './types';
import { getLastToolbarInteraction } from '@/components/tools/ToolSettingsBar';

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
        if (candles.length === 0) return 0;

        const candleTotalWidth = chartWidth / (endIndex - startIndex);

        // Binary search for the candle bracket
        let lo = 0, hi = candles.length - 1;
        if (time <= candles[0].time) {
          const visibleIndex = 0 - startIndex;
          return visibleIndex * candleTotalWidth + candleTotalWidth / 2;
        }
        if (time >= candles[hi].time) {
          const visibleIndex = hi - startIndex;
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

        // Clamp to valid range
        if (candleIndex < 0) return candles[0].time;
        if (candleIndex >= candles.length - 1) return candles[candles.length - 1].time;

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

    // Draw position lines — solid gray 2px with single centered P&L badge
    const symbolUpper = symbol.toUpperCase();
    const nowMs = Date.now();
    const openPositions = positionsRef.current.filter(p => p.symbol === symbolUpper);
    for (const pos of openPositions) {
      const y = renderContext.priceToY(pos.entryPrice);
      if (y < -50 || y > chartHeight + 50) continue;

      const pnlColor = pos.pnl >= 0 ? '#10b981' : '#ef4444';
      const age = nowMs - (pos.openedAt || 0);
      const isNew = age < 1500; // Flash effect for 1.5s
      const flashAlpha = isNew ? 0.15 * (1 - age / 1500) : 0;

      ctx.save();

      // Flash background glow on new positions
      if (isNew) {
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = pos.side === 'buy' ? '#10b981' : '#ef4444';
        ctx.fillRect(0, y - 12, chartWidth, 24);
        ctx.globalAlpha = 1;
      }

      // Solid gray line, 2px
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Single centered P&L badge on the line
      const pnlStr = pos.currentPrice > 0
        ? `${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)}`
        : '$0.00';
      ctx.font = 'bold 11px monospace';
      const pnlWidth = ctx.measureText(pnlStr).width;
      const badgeW = pnlWidth + 14;
      const badgeH = 18;
      const badgeX = (chartWidth - badgeW) / 2;
      const badgeY = y - badgeH / 2;

      ctx.fillStyle = '#1a1a2e';
      ctx.strokeStyle = pnlColor + 'B0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = pnlColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pnlStr, chartWidth / 2, y);

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

    // Draw indicator overlays (SMA, EMA, Bollinger, VWAP, VolumeProfile)
    // Clip to chart area so indicators don't bleed into time/price axes
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, chartWidth, chartHeight);
    ctx.clip();

    const enabledIndicators = indicatorConfigsRef.current.filter(i => i.enabled);
    for (const indicator of enabledIndicators) {
      // --- Volume Profile: rendered as horizontal bars from right side ---
      // Uses ALL loaded candles (full session) so the profile stays fixed when panning
      if (indicator.type === 'VolumeProfile') {
        if (candles.length === 0) continue;

        // Find price range of ALL loaded candles (session-fixed)
        let vpMin = Infinity, vpMax = -Infinity;
        for (const c of candles) {
          if (c.low < vpMin) vpMin = c.low;
          if (c.high > vpMax) vpMax = c.high;
        }
        if (!isFinite(vpMin) || !isFinite(vpMax) || vpMin >= vpMax) continue;

        // Build volume profile buckets from ALL candles
        const vpRange = vpMax - vpMin;
        const numBars = indicator.params.bars || 50;
        const bucketSize = vpRange / numBars;
        const buckets: { price: number; buyVol: number; sellVol: number; total: number }[] = [];
        for (let b = 0; b < numBars; b++) {
          buckets.push({ price: vpMin + (b + 0.5) * bucketSize, buyVol: 0, sellVol: 0, total: 0 });
        }

        for (const c of candles) {
          const isBull = c.close >= c.open;
          const cLow = c.low, cHigh = c.high;
          const candleRange = cHigh - cLow || 1;
          for (let b = 0; b < numBars; b++) {
            const bLow = vpMin + b * bucketSize;
            const bHigh = bLow + bucketSize;
            const overlap = Math.max(0, Math.min(cHigh, bHigh) - Math.max(cLow, bLow));
            if (overlap <= 0) continue;
            const vol = (overlap / candleRange) * c.volume;
            if (isBull) buckets[b].buyVol += vol;
            else buckets[b].sellVol += vol;
            buckets[b].total += vol;
          }
        }

        // Find max volume for normalization
        let maxVol = 0;
        for (const b of buckets) if (b.total > maxVol) maxVol = b.total;
        if (maxVol === 0) continue;

        // Find POC
        let pocIdx = 0;
        for (let i = 1; i < buckets.length; i++) {
          if (buckets[i].total > buckets[pocIdx].total) pocIdx = i;
        }

        // Value Area (70% of total volume)
        const totalVol = buckets.reduce((s, b) => s + b.total, 0);
        const vaPercent = (indicator.params.vaPercent || 70) / 100;
        const targetVA = totalVol * vaPercent;
        let vaVol = buckets[pocIdx].total;
        let vaLow = pocIdx, vaHigh = pocIdx;
        while (vaVol < targetVA && (vaLow > 0 || vaHigh < buckets.length - 1)) {
          const upVol = vaHigh < buckets.length - 1 ? buckets[vaHigh + 1].total : 0;
          const downVol = vaLow > 0 ? buckets[vaLow - 1].total : 0;
          if (upVol >= downVol && vaHigh < buckets.length - 1) { vaHigh++; vaVol += buckets[vaHigh].total; }
          else if (vaLow > 0) { vaLow--; vaVol += buckets[vaLow].total; }
          else break;
        }

        // Draw bars (left or right side based on position setting)
        const vpPosition = indicator.style.position || 'right';
        const maxBarWidth = chartWidth * 0.25;
        const barH = Math.max(1, (bucketSize / (priceMax - priceMin)) * chartHeight - 1);
        const vpOpacity = indicator.style.fillOpacity ?? 1;

        ctx.save();
        for (let i = 0; i < buckets.length; i++) {
          const b = buckets[i];
          if (b.total === 0) continue;
          const y = ((priceMax - b.price) / (priceMax - priceMin)) * chartHeight - barH / 2;
          const barW = (b.total / maxVol) * maxBarWidth;
          const inVA = i >= vaLow && i <= vaHigh;
          const isPOC = i === pocIdx;

          if (isPOC) {
            ctx.globalAlpha = 0.7 * vpOpacity;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
          } else if (inVA) {
            ctx.globalAlpha = 0.5 * vpOpacity;
            ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
          } else {
            ctx.globalAlpha = 0.35 * vpOpacity;
            ctx.fillStyle = 'rgba(156, 163, 175, 0.3)';
          }
          const barX = vpPosition === 'left' ? 0 : chartWidth - barW;
          ctx.fillRect(barX, y, barW, barH);

          // Delta color on edge
          const deltaW = Math.min(3, barW * 0.15);
          ctx.globalAlpha = 0.8 * vpOpacity;
          ctx.fillStyle = b.buyVol >= b.sellVol ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
          const deltaX = vpPosition === 'left' ? barW - deltaW : chartWidth - barW;
          ctx.fillRect(deltaX, y, deltaW, barH);
        }

        // POC dashed line
        const pocY = ((priceMax - buckets[pocIdx].price) / (priceMax - priceMin)) * chartHeight;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(0, pocY);
        ctx.lineTo(chartWidth, pocY);
        ctx.stroke();
        ctx.setLineDash([]);

        // VAH/VAL dashed lines
        const vahPrice = vpMin + (vaHigh + 1) * bucketSize;
        const valPrice = vpMin + vaLow * bucketSize;
        const vahY = ((priceMax - vahPrice) / (priceMax - priceMin)) * chartHeight;
        const valY = ((priceMax - valPrice) / (priceMax - priceMin)) * chartHeight;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, vahY); ctx.lineTo(chartWidth, vahY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, valY); ctx.lineTo(chartWidth, valY); ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.globalAlpha = 1;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`POC ${buckets[pocIdx].price.toFixed(2)}`, 4, pocY - 3);
        ctx.fillStyle = '#3b82f6';
        ctx.fillText(`VAH ${vahPrice.toFixed(2)}`, 4, vahY - 3);
        ctx.fillText(`VAL ${valPrice.toFixed(2)}`, 4, valY + 11);

        ctx.restore();
        continue;
      }

      // --- Line indicators (SMA, EMA, Bollinger, VWAP, TWAP) ---
      const source = indicator.style.source || 'close';
      const srcValues = getSourceValues(candles as { open: number; high: number; low: number; close: number }[], source);
      let values: number[] = [];
      let upperBand: number[] | null = null;
      let lowerBand: number[] | null = null;

      const period = indicator.params.period || 20;
      const dash = lineStyleToDash(indicator.style.lineStyle);
      const opacity = indicator.style.opacity ?? 0.85;

      if (indicator.type === 'SMA') {
        values = computeSMA(srcValues, period);
      } else if (indicator.type === 'EMA') {
        values = computeEMA(srcValues, period);
      } else if (indicator.type === 'BollingerBands') {
        const stdDev = indicator.params.stdDev || 2;
        const sma = computeSMA(srcValues, period);
        values = sma;
        upperBand = sma.map((v, i) => {
          if (v === 0) return 0;
          const slice = srcValues.slice(Math.max(0, i - period + 1), i + 1);
          const std = Math.sqrt(slice.reduce((s, x) => s + (x - v) ** 2, 0) / slice.length);
          return v + std * stdDev;
        });
        lowerBand = sma.map((v, i) => {
          if (v === 0) return 0;
          const slice = srcValues.slice(Math.max(0, i - period + 1), i + 1);
          const std = Math.sqrt(slice.reduce((s, x) => s + (x - v) ** 2, 0) / slice.length);
          return v - std * stdDev;
        });
      } else if (indicator.type === 'VWAP') {
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
            const labelText = indicator.type === 'SMA' || indicator.type === 'EMA'
              ? `${indicator.type}${indicator.params.period || 20}`
              : indicator.type;
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

      if (upperBand && lowerBand) {
        const bbFill = indicator.style.fillOpacity ?? 0.05;
        ctx.save();
        ctx.globalAlpha = bbFill;
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

        drawIndicatorLine(ctx, upperBand, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 1, [4, 3], opacity * 0.6);
        drawIndicatorLine(ctx, lowerBand, candles, startIndex, endIndex, chartWidth, chartHeight, priceMin, priceMax, indicator.style.color, 1, [4, 3], opacity * 0.6);
      }
    }

    // Restore clip
    ctx.restore();
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
          const candleIndexFloat = (x / vp.chartWidth) * visibleCount + vp.startIndex;
          const candleIndex = Math.floor(candleIndexFloat);
          const fraction = candleIndexFloat - candleIndex;

          if (candleIndex < 0) return c[0].time;
          if (candleIndex >= c.length - 1) return c[c.length - 1].time;

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

          // Find candles that bracket this timestamp
          let leftIdx = -1;
          let rightIdx = -1;
          for (let i = 0; i < c.length; i++) {
            if (c[i].time <= time) leftIdx = i;
            if (c[i].time >= time && rightIdx === -1) { rightIdx = i; break; }
          }

          if (leftIdx === -1) leftIdx = 0;
          if (rightIdx === -1) rightIdx = c.length - 1;

          // Interpolate for precise position
          let candleIndex: number;
          if (leftIdx === rightIdx) {
            candleIndex = leftIdx;
          } else {
            const ratio = (time - c[leftIdx].time) / (c[rightIdx].time - c[leftIdx].time);
            candleIndex = leftIdx + ratio;
          }

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

    // Re-render drawing tools whenever the chart viewport changes (zoom, pan, new data)
    const chartEngine = refs.chartEngine.current;
    if (chartEngine) {
      chartEngine.setOnViewportChange(() => {
        renderDrawingTools();
      });
    }

    return () => {
      resizeObserver.disconnect();
      if (chartEngine) {
        chartEngine.setOnViewportChange(() => {});
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
  }, [refs, renderDrawingTools, forwardEventToChart]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (forwardingToChartRef.current) {
      forwardEventToChart(e, 'mousemove');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    refs.interactionController.current.setChartBounds(rect);
    refs.interactionController.current.handleMouseMove(e);
  }, [refs, forwardEventToChart]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (forwardingToChartRef.current) {
      forwardingToChartRef.current = false;
      forwardEventToChart(e, 'mouseup');
      return;
    }
    refs.interactionController.current.handleMouseUp(e);
  }, [refs, forwardEventToChart]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (forwardingToChartRef.current) {
      forwardingToChartRef.current = false;
      // Trigger mouseup on chart canvas to end drag
      const chartCanvas = refs.chartCanvas.current;
      if (chartCanvas) {
        chartCanvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }
      return;
    }
    refs.interactionController.current.handleMouseLeave();
  }, [refs]);

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
  };
}
