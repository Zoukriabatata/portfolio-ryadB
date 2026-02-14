'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { ESLevel } from '@/lib/analysis/institutionalBias';

interface ZoneMapChartProps {
  levels: ESLevel[];
  esSpot: number;
  rangeHigh: number;
  rangeLow: number;
}

interface HoverInfo {
  x: number;
  y: number;
  level: ESLevel;
}

const COLORS = {
  support: '#22c55e',
  resistance: '#ef4444',
  pivot: '#eab308',
  round: '#64748b',
  spot: '#3b82f6',
  bg: '#0a0a0a',
  grid: '#1a1a1a',
  text: '#888',
  textDim: '#555',
};

export function ZoneMapChart({ levels, esSpot, rangeHigh, rangeLow }: ZoneMapChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Padding
  const padTop = 20;
  const padBottom = 20;
  const padLeft = 60;
  const padRight = 16;

  // Price range with margin
  const margin = (rangeHigh - rangeLow) * 0.1;
  const priceHigh = rangeHigh + margin;
  const priceLow = rangeLow - margin;

  const priceToY = useCallback((price: number, h: number) => {
    const chartH = h - padTop - padBottom;
    return padTop + (1 - (price - priceLow) / (priceHigh - priceLow)) * chartH;
  }, [priceHigh, priceLow]);

  const yToPrice = useCallback((y: number, h: number) => {
    const chartH = h - padTop - padBottom;
    return priceLow + (1 - (y - padTop) / chartH) * (priceHigh - priceLow);
  }, [priceHigh, priceLow]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dims.w === 0 || dims.h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const { w, h } = dims;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Price grid
    const priceRange = priceHigh - priceLow;
    const step = priceRange > 200 ? 25 : priceRange > 100 ? 10 : 5;
    const gridStart = Math.ceil(priceLow / step) * step;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    ctx.font = '9px monospace';
    ctx.fillStyle = COLORS.textDim;
    ctx.textAlign = 'right';

    for (let p = gridStart; p <= priceHigh; p += step) {
      const y = priceToY(p, h);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(0), padLeft - 6, y + 3);
    }

    // Sort levels by strength for drawing order (weakest first)
    const sortedLevels = [...levels].sort((a, b) => a.strength - b.strength);

    // Draw level zones
    const chartW = w - padLeft - padRight;
    for (const level of sortedLevels) {
      const y = priceToY(level.price, h);
      if (y < padTop || y > h - padBottom) continue;

      const alpha = 0.08 + (level.strength / 100) * 0.2;
      const barWidth = (level.strength / 100) * chartW * 0.8;

      // Zone band
      const bandHeight = level.source === 'gex' ? 8 : level.source === 'implied_move' ? 6 : 3;
      ctx.fillStyle = level.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillRect(padLeft, y - bandHeight / 2, barWidth, bandHeight);

      // Line
      ctx.strokeStyle = level.color;
      ctx.lineWidth = level.source === 'round_number' ? 0.5 : 1.5;
      ctx.globalAlpha = level.source === 'round_number' ? 0.3 : 0.7;
      if (level.source === 'round_number') {
        ctx.setLineDash([3, 3]);
      }
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + barWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Label
      ctx.font = level.source === 'round_number' ? '8px monospace' : '9px monospace';
      ctx.fillStyle = level.color;
      ctx.textAlign = 'left';
      ctx.fillText(
        `${level.label} ${level.price.toFixed(0)}`,
        padLeft + barWidth + 6,
        y + 3,
      );
    }

    // Spot price line
    const spotY = priceToY(esSpot, h);
    ctx.strokeStyle = COLORS.spot;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, spotY);
    ctx.lineTo(w - padRight, spotY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spot label
    ctx.fillStyle = COLORS.spot;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`SPOT ${esSpot.toFixed(0)}`, w - padRight - 4, spotY - 6);

    // Spot marker
    ctx.beginPath();
    ctx.arc(padLeft + 8, spotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.spot;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

  }, [dims, levels, esSpot, priceHigh, priceLow, priceToY]);

  // Mouse hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const price = yToPrice(y, dims.h);

    // Find nearest level
    let nearest: ESLevel | null = null;
    let minDist = Infinity;
    for (const level of levels) {
      const dist = Math.abs(level.price - price);
      if (dist < minDist) {
        minDist = dist;
        nearest = level;
      }
    }

    const threshold = (priceHigh - priceLow) * 0.03;
    if (nearest && minDist < threshold) {
      setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, level: nearest });
    } else {
      setHover(null);
    }
  }, [dims, levels, priceHigh, priceLow, yToPrice]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px] rounded-xl border border-[var(--border)] bg-[#0a0a0a] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      />

      {/* Tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
          style={{
            left: Math.min(hover.x + 12, dims.w - 160),
            top: hover.y - 40,
          }}
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hover.level.color }} />
            <span className="text-[11px] font-bold" style={{ color: hover.level.color }}>
              {hover.level.label}
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)] font-mono">
            {hover.level.price.toFixed(0)} | {hover.level.type} | Str: {hover.level.strength}
          </div>
          <div className="text-[9px] text-[var(--text-muted)]">
            {Math.abs(hover.level.price - esSpot).toFixed(0)} pts from spot
            ({((hover.level.price - esSpot) / esSpot * 100).toFixed(2)}%)
          </div>
        </div>
      )}

      {/* Header overlay */}
      <div className="absolute top-2 left-2 text-[9px] text-[var(--text-muted)] font-mono">
        ZONE MAP | {levels.length} levels
      </div>
    </div>
  );
}
