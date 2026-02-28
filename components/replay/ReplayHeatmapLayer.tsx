'use client';

/**
 * ReplayHeatmapLayer
 *
 * Canvas 2D layer that renders depth heatmap behind the main chart.
 * Uses RenderData from ReplayEngine → IBHeatmapAdapter.
 *
 * Features:
 * - Passive orders as colored rectangles (bid=cyan, ask=magenta)
 * - Trade bubbles sized by volume
 * - Best bid/ask staircase lines
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { RenderData } from '@/lib/heatmap-webgl/HybridRenderer';
import { PRICE_AXIS_W } from '@/lib/replay/ReplayChartRenderer';

interface ReplayHeatmapLayerProps {
  visible: boolean;
}

const BID_COLOR = { r: 0, g: 188, b: 212 };   // Cyan
const ASK_COLOR = { r: 236, g: 64, b: 122 };   // Magenta/Pink

export default function ReplayHeatmapLayer({ visible }: ReplayHeatmapLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      sizeRef.current.w = Math.floor(width);
      sizeRef.current.h = Math.floor(height);
    });
    obs.observe(el);
    const r = el.getBoundingClientRect();
    sizeRef.current.w = Math.floor(r.width);
    sizeRef.current.h = Math.floor(r.height);
    return () => obs.disconnect();
  }, []);

  const draw = useCallback(() => {
    if (!visible) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const { w, h } = sizeRef.current;
    if (w < 10 || h < 10) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, w, h);

    const chartW = w - PRICE_AXIS_W;
    if (chartW < 10) { rafRef.current = requestAnimationFrame(draw); return; }

    // Get heatmap data from replay engine
    const engine = getReplayEngine();
    let renderData: RenderData;
    try {
      renderData = engine.getHeatmapRenderData(chartW, h);
    } catch {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const { priceMin, priceMax, passiveOrders, trades, bestBidPoints, bestAskPoints, currentPrice } = renderData;
    const pRange = priceMax - priceMin;
    if (pRange <= 0) { rafRef.current = requestAnimationFrame(draw); return; }

    const p2y = (p: number) => ((priceMax - p) / pRange) * h;

    // ── Passive Orders (heatmap cells) ──
    const cellH = Math.max(1, (renderData.tickSize / pRange) * h);

    for (const order of passiveOrders) {
      const y = p2y(order.price);
      if (y < -cellH || y > h + cellH) continue;

      const alpha = Math.min(0.6, order.intensity * 0.5);
      const color = order.side === 'bid' ? BID_COLOR : ASK_COLOR;

      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha})`;
      ctx.fillRect(order.x, y - cellH / 2, Math.max(2, chartW * 0.01), cellH);
    }

    // ── Best Bid/Ask Staircase Lines ──
    if (bestBidPoints && bestBidPoints.length > 1) {
      ctx.strokeStyle = 'rgba(0, 188, 212, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < bestBidPoints.length; i++) {
        const pt = bestBidPoints[i];
        const y = p2y(pt.price);
        if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
      }
      ctx.stroke();
    }

    if (bestAskPoints && bestAskPoints.length > 1) {
      ctx.strokeStyle = 'rgba(236, 64, 122, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < bestAskPoints.length; i++) {
        const pt = bestAskPoints[i];
        const y = p2y(pt.price);
        if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
      }
      ctx.stroke();
    }

    // ── Trade Bubbles ──
    if (trades.length > 0) {
      let maxTradeSize = 0;
      for (const t of trades) if (t.size > maxTradeSize) maxTradeSize = t.size;

      for (const trade of trades) {
        const y = p2y(trade.price);
        if (y < -20 || y > h + 20) continue;

        const radius = Math.max(2, Math.min(12, (trade.size / maxTradeSize) * 12));
        const alpha = Math.max(0.2, 1 - trade.age);

        // Circle
        const color = trade.side === 'buy' ? BID_COLOR : ASK_COLOR;
        ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(trade.x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = `rgba(${color.r},${color.g},${color.b},${alpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [visible]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
