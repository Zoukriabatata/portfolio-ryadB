'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface TermData {
  expiration: number;
  expirationLabel: string;
  daysToExpiry: number;
  atmIV: number;
  callIV: number;
  putIV: number;
}

interface IVTermStructureProps {
  symbol: string;
  data: TermData[];
  height?: number;
}

const COLORS = {
  bg: '#0a0a0a',
  grid: '#1a1a1a',
  text: '#888888',
  textBright: '#ffffff',
  atmIV: '#3b82f6',
  callIV: '#22c55e',
  putIV: '#ef4444',
};

export default function IVTermStructure({
  symbol,
  data,
  height = 300,
}: IVTermStructureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Padding
    const padding = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Sort by days to expiry
    const sortedData = [...data].sort((a, b) => a.daysToExpiry - b.daysToExpiry);

    // Find IV range
    const allIVs = sortedData.flatMap(d => [d.atmIV, d.callIV, d.putIV]).filter(iv => iv > 0);
    const minIV = Math.max(0, Math.min(...allIVs) - 0.02);
    const maxIV = Math.max(...allIVs) + 0.02;

    // X scale - days to expiry
    const maxDays = Math.max(...sortedData.map(d => d.daysToExpiry));
    const minDays = 0;

    const daysToX = (days: number) => {
      return padding.left + (days / maxDays) * chartWidth;
    };

    const ivToY = (iv: number) => {
      return padding.top + chartHeight - ((iv - minIV) / (maxIV - minIV)) * chartHeight;
    };

    // Draw grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.text;

    // Horizontal grid
    const ivStep = (maxIV - minIV) / 4;
    for (let i = 0; i <= 4; i++) {
      const iv = minIV + i * ivStep;
      const y = ivToY(iv);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padding.left - 8, y + 4);
    }

    // Draw lines
    const drawLine = (getIV: (d: TermData) => number, color: string) => {
      const validData = sortedData.filter(d => getIV(d) > 0);
      if (validData.length < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(daysToX(validData[0].daysToExpiry), ivToY(getIV(validData[0])));

      for (let i = 1; i < validData.length; i++) {
        ctx.lineTo(daysToX(validData[i].daysToExpiry), ivToY(getIV(validData[i])));
      }
      ctx.stroke();

      // Draw points
      validData.forEach(d => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(daysToX(d.daysToExpiry), ivToY(getIV(d)), 5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    drawLine(d => d.atmIV, COLORS.atmIV);

    // Draw expiration labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';

    sortedData.forEach(d => {
      const x = daysToX(d.daysToExpiry);
      ctx.save();
      ctx.translate(x, height - padding.bottom + 15);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(d.expirationLabel, 0, 0);
      ctx.restore();

      // Days label
      ctx.fillText(`${d.daysToExpiry}d`, x, height - padding.bottom + 45);
    });

    // Title
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} IV Term Structure (ATM)`, padding.left, 25);

  }, [data, dimensions, symbol]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
