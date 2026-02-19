'use client';

import { useRef, useEffect } from 'react';
import { scaleLinear, drawGrid, generateYTicks, formatCurrency } from '@/lib/journal/chartUtils';

interface EquityCurveChartProps {
  data: { date: string; cumulativePnl: number }[];
  height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 30, left: 60 };

export default function EquityCurveChart({ data, height = 220 }: EquityCurveChartProps) {
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

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Data range
    const values = data.map(d => d.cumulativePnl);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(0, ...values);
    const yPad = (maxVal - minVal) * 0.1 || 10;

    const scaleX = scaleLinear([0, data.length - 1], [PADDING.left, width - PADDING.right]);
    const scaleY = scaleLinear([minVal - yPad, maxVal + yPad], [height - PADDING.bottom, PADDING.top]);

    // Grid
    const yTicks = generateYTicks(minVal - yPad, maxVal + yPad, 5);
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
    const zeroY = scaleY(0);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, zeroY);
    ctx.lineTo(width - PADDING.right, zeroY);
    ctx.stroke();

    // Area fill
    ctx.beginPath();
    ctx.moveTo(scaleX(0), zeroY);
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(scaleX(i), scaleY(data[i].cumulativePnl));
    }
    ctx.lineTo(scaleX(data.length - 1), zeroY);
    ctx.closePath();

    const lastValue = data[data.length - 1].cumulativePnl;
    const gradColor = lastValue >= 0 ? '34, 197, 94' : '239, 68, 68';
    const grad = ctx.createLinearGradient(0, PADDING.top, 0, height - PADDING.bottom);
    grad.addColorStop(0, `rgba(${gradColor}, 0.2)`);
    grad.addColorStop(1, `rgba(${gradColor}, 0.02)`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = scaleX(i);
      const y = scaleY(data[i].cumulativePnl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = lastValue >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dot
    const lastX = scaleX(data.length - 1);
    const lastY = scaleY(lastValue);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lastValue >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
    ctx.fill();

  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-[var(--text-muted)]">No trade data</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Equity Curve</p>
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
