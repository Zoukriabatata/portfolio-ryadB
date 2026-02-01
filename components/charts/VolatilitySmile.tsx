'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface OptionData {
  strike: number;
  iv: number;
  delta: number;
  type: 'call' | 'put';
  volume: number;
  openInterest: number;
}

interface VolatilitySmileProps {
  symbol: string;
  spotPrice: number;
  callData: OptionData[];
  putData: OptionData[];
  expiration: string;
  height?: number;
}

const COLORS = {
  bg: '#0a0a0a',
  grid: '#1a1a1a',
  text: '#888888',
  textBright: '#ffffff',
  callIV: '#22c55e',
  putIV: '#ef4444',
  combined: '#3b82f6',
  atm: '#fbbf24',
  spot: '#a855f7',
};

export default function VolatilitySmile({
  symbol,
  spotPrice,
  callData,
  putData,
  expiration,
  height = 400,
}: VolatilitySmileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredPoint, setHoveredPoint] = useState<{ strike: number; iv: number; type: string } | null>(null);
  const [showCalls, setShowCalls] = useState(true);
  const [showPuts, setShowPuts] = useState(true);

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
    if (!canvas) return;

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

    // Combine and filter data
    const allData = [
      ...(showCalls ? callData.filter(d => d.iv > 0 && d.iv < 2) : []),
      ...(showPuts ? putData.filter(d => d.iv > 0 && d.iv < 2) : []),
    ];

    if (allData.length === 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No volatility data available', width / 2, height / 2);
      return;
    }

    // Padding
    const padding = { top: 40, right: 60, bottom: 50, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find ranges
    const strikes = allData.map(d => d.strike);
    const ivs = allData.map(d => d.iv);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const minIV = Math.max(0, Math.min(...ivs) - 0.05);
    const maxIV = Math.max(...ivs) + 0.05;

    // Scale functions
    const strikeToX = (strike: number) => {
      return padding.left + ((strike - minStrike) / (maxStrike - minStrike)) * chartWidth;
    };

    const ivToY = (iv: number) => {
      return padding.top + chartHeight - ((iv - minIV) / (maxIV - minIV)) * chartHeight;
    };

    // Draw grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    // Horizontal grid (IV levels)
    const ivStep = (maxIV - minIV) / 5;
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.text;

    for (let i = 0; i <= 5; i++) {
      const iv = minIV + i * ivStep;
      const y = ivToY(iv);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padding.left - 10, y + 4);
    }

    // Vertical grid (Strike levels)
    const strikeStep = (maxStrike - minStrike) / 8;
    for (let i = 0; i <= 8; i++) {
      const strike = minStrike + i * strikeStep;
      const x = strikeToX(strike);

      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillText(`$${strike.toFixed(0)}`, x, height - padding.bottom + 20);
    }

    // Draw spot price line
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const spotX = strikeToX(spotPrice);
      ctx.strokeStyle = COLORS.spot;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(spotX, padding.top);
      ctx.lineTo(spotX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = COLORS.spot;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`SPOT $${spotPrice.toFixed(2)}`, spotX, padding.top - 10);
    }

    // Draw call IV curve
    if (showCalls && callData.length > 0) {
      const sortedCalls = [...callData].filter(d => d.iv > 0 && d.iv < 2).sort((a, b) => a.strike - b.strike);

      if (sortedCalls.length > 1) {
        ctx.strokeStyle = COLORS.callIV;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(strikeToX(sortedCalls[0].strike), ivToY(sortedCalls[0].iv));

        for (let i = 1; i < sortedCalls.length; i++) {
          ctx.lineTo(strikeToX(sortedCalls[i].strike), ivToY(sortedCalls[i].iv));
        }
        ctx.stroke();

        // Draw points
        sortedCalls.forEach(d => {
          ctx.fillStyle = COLORS.callIV;
          ctx.beginPath();
          ctx.arc(strikeToX(d.strike), ivToY(d.iv), 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    // Draw put IV curve
    if (showPuts && putData.length > 0) {
      const sortedPuts = [...putData].filter(d => d.iv > 0 && d.iv < 2).sort((a, b) => a.strike - b.strike);

      if (sortedPuts.length > 1) {
        ctx.strokeStyle = COLORS.putIV;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(strikeToX(sortedPuts[0].strike), ivToY(sortedPuts[0].iv));

        for (let i = 1; i < sortedPuts.length; i++) {
          ctx.lineTo(strikeToX(sortedPuts[i].strike), ivToY(sortedPuts[i].iv));
        }
        ctx.stroke();

        // Draw points
        sortedPuts.forEach(d => {
          ctx.fillStyle = COLORS.putIV;
          ctx.beginPath();
          ctx.arc(strikeToX(d.strike), ivToY(d.iv), 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    // Axis labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Strike Price', width / 2, height - 10);

    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Implied Volatility', 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} Volatility Smile - ${expiration}`, padding.left, 25);

  }, [callData, putData, dimensions, spotPrice, symbol, expiration, showCalls, showPuts]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse interaction
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { top: 40, right: 60, bottom: 50, left: 70 };
    const chartWidth = dimensions.width - padding.left - padding.right;
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    const allData = [...callData, ...putData].filter(d => d.iv > 0 && d.iv < 2);
    if (allData.length === 0) return;

    const strikes = allData.map(d => d.strike);
    const ivs = allData.map(d => d.iv);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const minIV = Math.max(0, Math.min(...ivs) - 0.05);
    const maxIV = Math.max(...ivs) + 0.05;

    const mouseStrike = minStrike + ((x - padding.left) / chartWidth) * (maxStrike - minStrike);
    const mouseIV = maxIV - ((y - padding.top) / chartHeight) * (maxIV - minIV);

    // Find closest point
    let closest: { strike: number; iv: number; type: string } | null = null;
    let minDist = Infinity;

    allData.forEach(d => {
      const dist = Math.sqrt(
        Math.pow((d.strike - mouseStrike) / (maxStrike - minStrike), 2) +
        Math.pow((d.iv - mouseIV) / (maxIV - minIV), 2)
      );
      if (dist < minDist && dist < 0.1) {
        minDist = dist;
        closest = { strike: d.strike, iv: d.iv, type: d.type };
      }
    });

    setHoveredPoint(closest);
  }, [callData, putData, dimensions]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showCalls}
            onChange={(e) => setShowCalls(e.target.checked)}
            className="w-3 h-3 accent-green-500"
          />
          <span className="text-green-400">Calls</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showPuts}
            onChange={(e) => setShowPuts(e.target.checked)}
            className="w-3 h-3 accent-red-500"
          />
          <span className="text-red-400">Puts</span>
        </label>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      />

      {/* Tooltip */}
      {hoveredPoint && (
        <div className="absolute top-12 right-2 bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 text-xs z-10">
          <div className="font-bold text-white mb-2">
            Strike: ${hoveredPoint.strike.toFixed(2)}
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">IV:</span>
            <span className={hoveredPoint.type === 'call' ? 'text-green-400' : 'text-red-400'}>
              {(hoveredPoint.iv * 100).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">Type:</span>
            <span className={hoveredPoint.type === 'call' ? 'text-green-400' : 'text-red-400'}>
              {hoveredPoint.type.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
