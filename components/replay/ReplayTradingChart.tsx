'use client';

/**
 * ReplayTradingChart
 *
 * Full trading chart for replay mode — fusion of /live + /footprint.
 * Renders OHLCV candles from ReplayEngine's footprint adapter.
 *
 * - Auto mode: ≤20 visible candles → footprint, >20 → candles only
 * - Scroll to zoom (visible candle count), drag to pan
 * - Current price line, volume bars, POC/VAH/VAL markers
 * - Feeds current price to useMarketStore for QuickTradeBar
 */

import { useEffect, useRef, useCallback } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { FootprintCandle } from '@/lib/ib/IBFootprintAdapter';
import { useMarketStore } from '@/stores/useMarketStore';

interface ReplayTradingChartProps {
  symbol: string;
  isPlaying: boolean;
}

// Colors
const COLORS = {
  bg: '#0a0a0f',
  candle_up: '#10b981',
  candle_down: '#ef4444',
  candle_up_fill: 'rgba(16,185,129,0.35)',
  candle_down_fill: 'rgba(239,68,68,0.35)',
  grid: 'rgba(255,255,255,0.04)',
  gridText: 'rgba(255,255,255,0.3)',
  priceLine: '#f59e0b',
  volume_up: 'rgba(16,185,129,0.3)',
  volume_down: 'rgba(239,68,68,0.3)',
  fp_bid: 'rgba(239,68,68,0.7)',
  fp_ask: 'rgba(16,185,129,0.7)',
  fp_imbalance_buy: 'rgba(16,185,129,1)',
  fp_imbalance_sell: 'rgba(239,68,68,1)',
  fp_poc_bg: 'rgba(16,185,129,0.15)',
  fp_cell_bg: 'rgba(255,255,255,0.03)',
  crosshair: 'rgba(255,255,255,0.15)',
};

const PRICE_AXIS_W = 70;
const TIME_AXIS_H = 24;
const VOLUME_H_PCT = 0.15;

export default function ReplayTradingChart({ symbol, isPlaying }: ReplayTradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Use refs for render-loop state to avoid stale closures
  const stateRef = useRef({
    w: 0,
    h: 0,
    visibleCount: 40,
    scrollOffset: 0,
    mouseX: -1,
    mouseY: -1,
    isDragging: false,
    dragStartX: 0,
    dragStartOffset: 0,
  });

  // Resize observer — update ref dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      stateRef.current.w = Math.floor(width);
      stateRef.current.h = Math.floor(height);
    });
    obs.observe(el);
    // Initial measurement
    const rect = el.getBoundingClientRect();
    stateRef.current.w = Math.floor(rect.width);
    stateRef.current.h = Math.floor(rect.height);
    return () => obs.disconnect();
  }, []);

  // Zoom with scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 3 : -3;
      stateRef.current.visibleCount = Math.max(5, Math.min(200, stateRef.current.visibleCount + delta));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Mouse handlers (write to ref, no re-renders)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current;
    s.isDragging = true;
    s.dragStartX = e.clientX;
    s.dragStartOffset = s.scrollOffset;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = stateRef.current;
    s.mouseX = e.clientX - rect.left;
    s.mouseY = e.clientY - rect.top;

    if (s.isDragging) {
      const dx = e.clientX - s.dragStartX;
      const chartW = s.w - PRICE_AXIS_W;
      const candleW = chartW / s.visibleCount;
      const candleShift = Math.round(dx / candleW);
      s.scrollOffset = Math.max(0, s.dragStartOffset + candleShift);
    }
  }, []);

  const handleMouseUp = useCallback(() => { stateRef.current.isDragging = false; }, []);
  const handleMouseLeave = useCallback(() => {
    stateRef.current.isDragging = false;
    stateRef.current.mouseX = -1;
    stateRef.current.mouseY = -1;
  }, []);

  // Stable draw function — reads everything from refs
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const s = stateRef.current;
    const { w, h, visibleCount, scrollOffset, mouseX, mouseY } = s;

    // Skip if container is not sized yet
    if (w < 10 || h < 10) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Get data
    const engine = getReplayEngine();
    const allCandles = engine.getFootprintCandles() as FootprintCandle[];
    const currentPrice = engine.getCurrentPrice();

    if (currentPrice > 0) {
      useMarketStore.setState({ currentPrice });
    }

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (allCandles.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for trade data...', w / 2, h / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Visible range
    const totalCandles = allCandles.length;
    const endIdx = Math.max(0, totalCandles - scrollOffset);
    const startIdx = Math.max(0, endIdx - visibleCount);
    const candles = allCandles.slice(startIdx, endIdx);

    if (candles.length === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    const showFootprint = visibleCount <= 20;
    const chartW = w - PRICE_AXIS_W;
    const volumeH = h * VOLUME_H_PCT;
    const chartH = h - TIME_AXIS_H - volumeH;
    const candleW = chartW / visibleCount;
    const bodyW = Math.max(1, candleW * (showFootprint ? 0.92 : 0.7));

    // Price range
    let priceHigh = -Infinity, priceLow = Infinity, maxVol = 0;
    for (const c of candles) {
      if (c.high > priceHigh) priceHigh = c.high;
      if (c.low < priceLow) priceLow = c.low;
      if (c.totalVolume > maxVol) maxVol = c.totalVolume;
    }
    const range = priceHigh - priceLow || 1;
    priceHigh += range * 0.05;
    priceLow -= range * 0.05;
    const priceRange = priceHigh - priceLow;

    const priceToY = (p: number) => ((priceHigh - p) / priceRange) * chartH;
    const yToPrice = (y: number) => priceHigh - (y / chartH) * priceRange;

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSteps = 8;
    const priceStep = priceRange / gridSteps;
    ctx.font = '9px monospace';
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridSteps; i++) {
      const price = priceLow + i * priceStep;
      const y = priceToY(price);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      ctx.fillText(price.toFixed(2), w - 4, y + 3);
    }

    // Candles
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * candleW;
      const cx = x + candleW / 2;
      const isUp = c.close >= c.open;

      if (showFootprint) {
        drawFootprintCandle(ctx, c, x, candleW, bodyW, priceHigh, priceLow, priceRange, chartH);
      } else {
        const openY = priceToY(c.open);
        const closeY = priceToY(c.close);
        const highY = priceToY(c.high);
        const lowY = priceToY(c.low);
        const bodyTop = Math.min(openY, closeY);
        const bodyH = Math.max(1, Math.abs(closeY - openY));

        // Wick
        ctx.strokeStyle = isUp ? COLORS.candle_up : COLORS.candle_down;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, highY); ctx.lineTo(cx, lowY); ctx.stroke();

        // Body
        if (bodyH < 2) {
          ctx.fillStyle = isUp ? COLORS.candle_up : COLORS.candle_down;
          ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, 1);
        } else {
          ctx.fillStyle = isUp ? COLORS.candle_up_fill : COLORS.candle_down_fill;
          ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
          ctx.strokeStyle = isUp ? COLORS.candle_up : COLORS.candle_down;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
        }
      }

      // Volume bar
      const volH = maxVol > 0 ? (c.totalVolume / maxVol) * volumeH * 0.85 : 0;
      const volY = chartH + volumeH - volH;
      ctx.fillStyle = c.close >= c.open ? COLORS.volume_up : COLORS.volume_down;
      ctx.fillRect(x + 1, volY, candleW - 2, volH);
    }

    // Current price line
    if (currentPrice >= priceLow && currentPrice <= priceHigh) {
      const priceY = priceToY(currentPrice);
      ctx.strokeStyle = COLORS.priceLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(0, priceY); ctx.lineTo(chartW, priceY); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COLORS.priceLine;
      ctx.fillRect(chartW, priceY - 8, PRICE_AXIS_W, 16);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(currentPrice.toFixed(2), chartW + PRICE_AXIS_W / 2, priceY + 3);
    }

    // Time axis
    ctx.fillStyle = COLORS.gridText;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += timeStep) {
      const c = candles[i];
      const x = i * candleW + candleW / 2;
      const d = new Date(c.time * 1000);
      ctx.fillText(
        `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
        x, h - 4,
      );
    }

    // Crosshair
    if (mouseX >= 0 && mouseX < chartW && mouseY >= 0 && mouseY < chartH) {
      ctx.strokeStyle = COLORS.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, mouseY); ctx.lineTo(chartW, mouseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mouseX, 0); ctx.lineTo(mouseX, chartH + volumeH); ctx.stroke();
      ctx.setLineDash([]);

      const cursorPrice = yToPrice(mouseY);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(chartW, mouseY - 8, PRICE_AXIS_W, 16);
      ctx.fillStyle = '#000';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cursorPrice.toFixed(2), chartW + PRICE_AXIS_W / 2, mouseY + 3);
    }

    // Separators
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(chartW, chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, h); ctx.stroke();

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // Start/stop render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor: 'crosshair', minHeight: 0 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT CANDLE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function drawFootprintCandle(
  ctx: CanvasRenderingContext2D,
  candle: FootprintCandle,
  x: number,
  candleW: number,
  bodyW: number,
  priceHigh: number,
  priceLow: number,
  priceRange: number,
  chartH: number,
) {
  const priceToY = (p: number) => ((priceHigh - p) / priceRange) * chartH;
  const isUp = candle.close >= candle.open;
  const levels = Array.from(candle.levels.values()).sort((a, b) => b.price - a.price);

  if (levels.length === 0) return;

  let maxLevelVol = 0;
  for (const l of levels) {
    if (l.totalVolume > maxLevelVol) maxLevelVol = l.totalVolume;
  }

  const prices = levels.map(l => l.price);
  let tickSize = 1;
  if (prices.length > 1) {
    const diffs: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      diffs.push(Math.abs(prices[i] - prices[i - 1]));
    }
    tickSize = Math.min(...diffs.filter(d => d > 0)) || 1;
  }

  const cellH = Math.max(2, (tickSize / priceRange) * chartH);
  const halfBody = bodyW / 2;
  const cx = x + candleW / 2;

  for (const level of levels) {
    const y = priceToY(level.price);
    const intensity = maxLevelVol > 0 ? level.totalVolume / maxLevelVol : 0;

    const isPOC = level.price === candle.poc;
    ctx.fillStyle = isPOC ? COLORS.fp_poc_bg : COLORS.fp_cell_bg;
    ctx.fillRect(cx - halfBody, y - cellH / 2, bodyW, cellH);

    const bidW = (halfBody - 2) * (maxLevelVol > 0 ? level.bidVolume / maxLevelVol : 0);
    const askW = (halfBody - 2) * (maxLevelVol > 0 ? level.askVolume / maxLevelVol : 0);

    ctx.fillStyle = level.imbalanceSell
      ? COLORS.fp_imbalance_sell
      : `rgba(239,68,68,${0.2 + intensity * 0.6})`;
    ctx.fillRect(cx - 1 - bidW, y - cellH / 2 + 0.5, bidW, cellH - 1);

    ctx.fillStyle = level.imbalanceBuy
      ? COLORS.fp_imbalance_buy
      : `rgba(16,185,129,${0.2 + intensity * 0.6})`;
    ctx.fillRect(cx + 1, y - cellH / 2 + 0.5, askW, cellH - 1);

    if (cellH >= 10 && candleW > 50) {
      ctx.font = `${Math.min(9, cellH - 2)}px monospace`;
      if (level.bidVolume > 0) {
        ctx.fillStyle = COLORS.fp_bid;
        ctx.textAlign = 'right';
        ctx.fillText(formatVol(level.bidVolume), cx - 3, y + 3);
      }
      if (level.askVolume > 0) {
        ctx.fillStyle = COLORS.fp_ask;
        ctx.textAlign = 'left';
        ctx.fillText(formatVol(level.askVolume), cx + 3, y + 3);
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx - 0.5, y - cellH / 2, 1, cellH);
  }

  // Candle border
  const openY = priceToY(candle.open);
  const closeY = priceToY(candle.close);
  ctx.strokeStyle = isUp ? COLORS.candle_up : COLORS.candle_down;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - halfBody, Math.min(openY, closeY), bodyW, Math.max(1, Math.abs(closeY - openY)));

  // Wicks
  const highY = priceToY(candle.high);
  const lowY = priceToY(candle.low);
  ctx.strokeStyle = isUp ? COLORS.candle_up : COLORS.candle_down;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, highY); ctx.lineTo(cx, Math.min(openY, closeY));
  ctx.moveTo(cx, Math.max(openY, closeY)); ctx.lineTo(cx, lowY);
  ctx.stroke();

  // Delta label
  if (candleW > 30) {
    const delta = candle.totalDelta;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = delta >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
    ctx.fillText((delta >= 0 ? '+' : '') + formatVol(delta), cx, lowY + 12);
  }
}

function formatVol(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (a >= 1) return v.toFixed(0);
  return v.toFixed(2);
}
