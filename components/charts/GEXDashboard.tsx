'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface GEXLevel {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

interface GEXSummary {
  netGEX: number;
  totalCallGEX: number;
  totalPutGEX: number;
  callWall: number;
  putWall: number;
  zeroGamma: number;
  maxGamma: number;
  gammaFlip: number;
  hvl: number; // High Volatility Level
  regime: 'positive' | 'negative';
}

interface GEXDashboardProps {
  symbol: string;
  spotPrice: number;
  gexData: GEXLevel[];
  summary: GEXSummary | null;
  height?: number;
}

const COLORS = {
  bg: '#0a0a0a',
  bgCard: '#111111',
  border: '#1f1f1f',
  text: '#888888',
  textBright: '#ffffff',

  // GEX colors
  callGEX: '#22c55e',
  putGEX: '#ef4444',
  netPositive: '#22c55e',
  netNegative: '#ef4444',

  // Level colors
  callWall: '#22c55e',
  putWall: '#ef4444',
  zeroGamma: '#fbbf24',
  spotPrice: '#3b82f6',
  hvl: '#a855f7',
};

export default function GEXDashboard({
  symbol,
  spotPrice,
  gexData,
  summary,
  height = 500,
}: GEXDashboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);

  // Handle resize
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

  // Draw GEX chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || gexData.length === 0) return;

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
    const padding = { top: 40, right: 80, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find ranges
    const strikes = gexData.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);

    let maxGEX = 0;
    gexData.forEach(d => {
      maxGEX = Math.max(maxGEX, Math.abs(d.callGEX), Math.abs(d.putGEX));
    });

    // Scale functions
    const strikeToY = (strike: number) => {
      return padding.top + chartHeight - ((strike - minStrike) / (maxStrike - minStrike)) * chartHeight;
    };

    const gexToX = (gex: number) => {
      const normalized = gex / maxGEX;
      return padding.left + chartWidth / 2 + normalized * (chartWidth / 2);
    };

    // Draw grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Vertical center line (zero GEX)
    ctx.beginPath();
    ctx.moveTo(padding.left + chartWidth / 2, padding.top);
    ctx.lineTo(padding.left + chartWidth / 2, padding.top + chartHeight);
    ctx.stroke();

    // Horizontal grid lines and strike labels
    const numGridLines = 10;
    const strikeStep = (maxStrike - minStrike) / numGridLines;
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.text;

    for (let i = 0; i <= numGridLines; i++) {
      const strike = minStrike + i * strikeStep;
      const y = strikeToY(strike);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillText(`$${strike.toFixed(0)}`, padding.left - 10, y + 4);
    }

    // Draw bars
    const barHeight = Math.max(2, (chartHeight / gexData.length) * 0.7);

    gexData.forEach((level) => {
      const y = strikeToY(level.strike);
      const isHovered = hoveredStrike === level.strike;

      // Call GEX (positive, right side)
      if (level.callGEX > 0) {
        const barWidth = (level.callGEX / maxGEX) * (chartWidth / 2);
        ctx.fillStyle = isHovered ? '#34d399' : COLORS.callGEX;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fillRect(padding.left + chartWidth / 2, y - barHeight / 2, barWidth, barHeight);
        ctx.globalAlpha = 1;
      }

      // Put GEX (negative, left side)
      if (level.putGEX < 0) {
        const barWidth = (Math.abs(level.putGEX) / maxGEX) * (chartWidth / 2);
        ctx.fillStyle = isHovered ? '#f87171' : COLORS.putGEX;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fillRect(padding.left + chartWidth / 2 - barWidth, y - barHeight / 2, barWidth, barHeight);
        ctx.globalAlpha = 1;
      }
    });

    // Draw key levels
    const drawLevel = (price: number, color: string, label: string, side: 'left' | 'right') => {
      if (price < minStrike || price > maxStrike) return;

      const y = strikeToY(price);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = color;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      const labelX = side === 'left' ? padding.left + 5 : padding.left + chartWidth - 5;
      ctx.fillText(`${label}: $${price.toFixed(0)}`, labelX, y - 6);
    };

    // Draw levels if summary exists
    if (summary) {
      drawLevel(summary.callWall, COLORS.callWall, 'Call Wall', 'right');
      drawLevel(summary.putWall, COLORS.putWall, 'Put Wall', 'left');
      drawLevel(summary.zeroGamma, COLORS.zeroGamma, 'Zero Gamma', 'right');
    }

    // Draw spot price
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const y = strikeToY(spotPrice);
      ctx.strokeStyle = COLORS.spotPrice;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = COLORS.spotPrice;
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`SPOT: $${spotPrice.toFixed(2)}`, padding.left + chartWidth / 2, y - 8);
    }

    // Draw axis labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';

    // X-axis labels
    ctx.fillText('← Put GEX (Negative)', padding.left + chartWidth / 4, height - 15);
    ctx.fillText('Call GEX (Positive) →', padding.left + 3 * chartWidth / 4, height - 15);

    // Title
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} Gamma Exposure by Strike`, padding.left, 25);

  }, [gexData, dimensions, spotPrice, summary, hoveredStrike]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse move for hover effect
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || gexData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const padding = { top: 40, bottom: 60 };
    const chartHeight = dimensions.height - padding.top - padding.bottom;

    const strikes = gexData.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);

    const strikeRange = maxStrike - minStrike;
    const normalizedY = (y - padding.top) / chartHeight;
    const strike = maxStrike - normalizedY * strikeRange;

    // Find closest strike
    let closest = gexData[0]?.strike;
    let minDist = Infinity;
    gexData.forEach(d => {
      const dist = Math.abs(d.strike - strike);
      if (dist < minDist) {
        minDist = dist;
        closest = d.strike;
      }
    });

    setHoveredStrike(closest);
  }, [gexData, dimensions]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredStrike(null)}
      />

      {/* Tooltip */}
      {hoveredStrike && (
        <div className="absolute top-2 right-2 bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 text-xs">
          {(() => {
            const level = gexData.find(d => d.strike === hoveredStrike);
            if (!level) return null;
            return (
              <>
                <div className="font-bold text-white mb-2">Strike: ${hoveredStrike}</div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-400">Call GEX:</span>
                  <span className="text-green-400 font-mono">{formatGEX(level.callGEX)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-400">Put GEX:</span>
                  <span className="text-red-400 font-mono">{formatGEX(level.putGEX)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-zinc-700 mt-2 pt-2">
                  <span className="text-zinc-400">Net GEX:</span>
                  <span className={`font-mono font-bold ${level.netGEX >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatGEX(level.netGEX)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 mt-1">
                  <span className="text-zinc-400">Call OI:</span>
                  <span className="text-zinc-300 font-mono">{level.callOI.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-400">Put OI:</span>
                  <span className="text-zinc-300 font-mono">{level.putOI.toLocaleString()}</span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function formatGEX(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}
