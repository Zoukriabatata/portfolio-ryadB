'use client';

import { useRef, useEffect } from 'react';
import { scaleLinear, drawGrid, generateYTicks, formatCurrency } from '@/lib/journal/chartUtils';

interface DrawdownChartProps {
  data: { date: string; drawdown: number; drawdownPct: number }[];
  height?: number;
}

const PADDING = { top: 10, right: 20, bottom: 30, left: 60 };

export default function DrawdownChart({ data, height = 160 }: DrawdownChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const values = data.map(d => d.drawdown);
    const minVal = Math.min(...values, 0);

    const scaleX = scaleLinear([0, data.length - 1], [PADDING.left, width - PADDING.right]);
    const scaleY = scaleLinear([minVal * 1.1, 0], [height - PADDING.bottom, PADDING.top]);

    // Grid
    const yTicks = generateYTicks(minVal * 1.1, 0, 4);
    drawGrid(ctx, width, height, PADDING, yTicks, scaleY);

    // Y axis labels
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of yTicks) {
      ctx.fillText(formatCurrency(tick), PADDING.left - 8, scaleY(tick));
    }

    // Zero line
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, scaleY(0));
    ctx.lineTo(width - PADDING.right, scaleY(0));
    ctx.stroke();

    // Area fill (inverted - fills downward)
    ctx.beginPath();
    ctx.moveTo(scaleX(0), scaleY(0));
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(scaleX(i), scaleY(data[i].drawdown));
    }
    ctx.lineTo(scaleX(data.length - 1), scaleY(0));
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, scaleY(0), 0, height - PADDING.bottom);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.05)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = scaleX(i);
      const y = scaleY(data[i].drawdown);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgb(239, 68, 68)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [data, height]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Drawdown</p>
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
