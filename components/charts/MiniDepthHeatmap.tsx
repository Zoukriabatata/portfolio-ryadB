'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';

interface MiniDepthHeatmapProps {
  priceMin: number;
  priceMax: number;
  chartHeight: number;
  onClose: () => void;
}

const FRAME_INTERVAL = 66; // ~15fps — plenty for depth data

export default function MiniDepthHeatmap({ priceMin, priceMax, chartHeight, onClose }: MiniDepthHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const render = useCallback((timestamp: number) => {
    // Frame-rate cap
    if (timestamp - lastFrameRef.current < FRAME_INTERVAL) {
      animRef.current = requestAnimationFrame(render);
      return;
    }
    lastFrameRef.current = timestamp;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { bids, asks, midPrice } = useOrderbookStore.getState();
    const dpr = window.devicePixelRatio || 1;
    const width = 32;
    const height = chartHeight;
    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) {
      animRef.current = requestAnimationFrame(render);
      return;
    }

    ctx.clearRect(0, 0, width * dpr, height * dpr);

    // Convert Map to sorted arrays within visible range
    let maxQty = 0;
    const visibleBids: [number, number][] = [];
    const visibleAsks: [number, number][] = [];

    bids.forEach((qty, price) => {
      if (price >= priceMin && price <= priceMax) {
        visibleBids.push([price, qty]);
        if (qty > maxQty) maxQty = qty;
      }
    });
    asks.forEach((qty, price) => {
      if (price >= priceMin && price <= priceMax) {
        visibleAsks.push([price, qty]);
        if (qty > maxQty) maxQty = qty;
      }
    });

    if (maxQty === 0) maxQty = 1;

    // Draw each level as a horizontal band
    const pixelsPerPrice = height / priceRange;
    const bandHeight = Math.max(1, pixelsPerPrice * (priceRange / 200));

    for (const [price, qty] of visibleBids) {
      const y = ((priceMax - price) / priceRange) * height;
      const intensity = Math.min(1, qty / maxQty);
      const alpha = 0.1 + intensity * 0.7;
      ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
      ctx.fillRect(0, y - bandHeight / 2, width, bandHeight);
    }

    for (const [price, qty] of visibleAsks) {
      const y = ((priceMax - price) / priceRange) * height;
      const intensity = Math.min(1, qty / maxQty);
      const alpha = 0.1 + intensity * 0.7;
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.fillRect(0, y - bandHeight / 2, width, bandHeight);
    }

    // Mid-price line
    if (midPrice > priceMin && midPrice < priceMax) {
      const midY = ((priceMax - midPrice) / priceRange) * height;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    animRef.current = requestAnimationFrame(render);
  }, [priceMin, priceMax, chartHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 32 * dpr;
    canvas.height = chartHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [chartHeight, render]);

  return (
    <div
      className="absolute right-[80px] top-0 z-10 flex flex-col"
      style={{ height: chartHeight }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: 32, height: chartHeight }}
      />
      <button
        onClick={onClose}
        className="absolute top-1 -left-5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] opacity-40 hover:opacity-100 transition-opacity"
        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        title="Hide depth map"
      >
        ×
      </button>
    </div>
  );
}
