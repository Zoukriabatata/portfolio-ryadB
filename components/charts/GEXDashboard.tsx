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
  hvl: number;
  regime: 'positive' | 'negative';
}

interface GEXDashboardProps {
  symbol: string;
  spotPrice: number;
  gexData: GEXLevel[];
  summary: GEXSummary | null;
  height?: number | 'auto';
}

const COLORS = {
  bg: '#0a0a0a',
  bgCard: '#111111',
  border: '#1f1f1f',
  text: '#888888',
  textBright: '#ffffff',
  callGEX: '#22c55e',
  putGEX: '#ef4444',
  netPositive: '#22c55e',
  netNegative: '#ef4444',
  callWall: '#22c55e',
  putWall: '#ef4444',
  zeroGamma: '#fbbf24',
  spotPrice: '#3b82f6',
  hvl: '#a855f7',
};

const PADDING = { top: 40, right: 80, bottom: 60, left: 80 };

export default function GEXDashboard({
  symbol,
  spotPrice,
  gexData,
  summary,
  height = 500,
}: GEXDashboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: typeof height === 'number' ? height : 500 });
  const [hoveredStrike, setHoveredStrike] = useState<number | null>(null);

  // Zoom & pan
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const panRef = useRef({ active: false, startY: 0, startMin: 0, startMax: 0 });

  // Reset zoom when data changes
  useEffect(() => { setZoomRange(null); }, [gexData.length]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerHeight = height === 'auto' ? containerRef.current.clientHeight : height;
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(400, containerHeight),
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Draw
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

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;

    // Strike range (zoom-aware)
    const allStrikes = gexData.map(d => d.strike);
    const dataMin = Math.min(...allStrikes);
    const dataMax = Math.max(...allStrikes);
    const minStrike = zoomRange?.min ?? dataMin;
    const maxStrike = zoomRange?.max ?? dataMax;
    const strikeRange = maxStrike - minStrike;
    if (strikeRange <= 0) return;

    // Visible data + auto-scale GEX
    const visibleData = gexData.filter(d => d.strike >= minStrike && d.strike <= maxStrike);
    let maxGEX = 0;
    visibleData.forEach(d => {
      maxGEX = Math.max(maxGEX, Math.abs(d.callGEX), Math.abs(d.putGEX));
    });
    if (maxGEX === 0) maxGEX = 1;

    const strikeToY = (strike: number) =>
      PADDING.top + chartHeight - ((strike - minStrike) / strikeRange) * chartHeight;

    // Grid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Center line (zero GEX)
    ctx.beginPath();
    ctx.moveTo(PADDING.left + chartWidth / 2, PADDING.top);
    ctx.lineTo(PADDING.left + chartWidth / 2, PADDING.top + chartHeight);
    ctx.stroke();

    // Grid lines + strike labels
    const numGridLines = 10;
    const strikeStep = strikeRange / numGridLines;
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.text;

    for (let i = 0; i <= numGridLines; i++) {
      const strike = minStrike + i * strikeStep;
      const y = strikeToY(strike);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(`$${strike.toFixed(0)}`, PADDING.left - 10, y + 4);
    }

    // Bars
    const barHeight = Math.max(2, (chartHeight / visibleData.length) * 0.7);

    visibleData.forEach((level) => {
      const y = strikeToY(level.strike);
      const isHovered = hoveredStrike === level.strike;

      if (level.callGEX > 0) {
        const barWidth = (level.callGEX / maxGEX) * (chartWidth / 2);
        ctx.fillStyle = isHovered ? '#34d399' : COLORS.callGEX;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fillRect(PADDING.left + chartWidth / 2, y - barHeight / 2, barWidth, barHeight);
        ctx.globalAlpha = 1;
      }

      if (level.putGEX < 0) {
        const barWidth = (Math.abs(level.putGEX) / maxGEX) * (chartWidth / 2);
        ctx.fillStyle = isHovered ? '#f87171' : COLORS.putGEX;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fillRect(PADDING.left + chartWidth / 2 - barWidth, y - barHeight / 2, barWidth, barHeight);
        ctx.globalAlpha = 1;
      }
    });

    // Key levels
    const drawLevel = (price: number, color: string, label: string, side: 'left' | 'right') => {
      if (price < minStrike || price > maxStrike) return;
      const y = strikeToY(price);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      const labelX = side === 'left' ? PADDING.left + 5 : PADDING.left + chartWidth - 5;
      ctx.fillText(`${label}: $${price.toFixed(0)}`, labelX, y - 6);
    };

    if (summary) {
      drawLevel(summary.callWall, COLORS.callWall, 'Call Wall', 'right');
      drawLevel(summary.putWall, COLORS.putWall, 'Put Wall', 'left');
      drawLevel(summary.zeroGamma, COLORS.zeroGamma, 'Zero Gamma', 'right');
    }

    // Spot price
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const y = strikeToY(spotPrice);
      ctx.strokeStyle = COLORS.spotPrice;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();

      ctx.fillStyle = COLORS.spotPrice;
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`SPOT: $${spotPrice.toFixed(2)}`, PADDING.left + chartWidth / 2, y - 8);
    }

    // Axis labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('\u2190 Put GEX (Negative)', PADDING.left + chartWidth / 4, height - 15);
    ctx.fillText('Call GEX (Positive) \u2192', PADDING.left + 3 * chartWidth / 4, height - 15);

    // Title
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} Gamma Exposure by Strike`, PADDING.left, 25);

    // Zoom indicator
    if (zoomRange) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      const pct = ((strikeRange / (dataMax - dataMin)) * 100).toFixed(0);
      ctx.fillText(`${pct}% \u00b7 scroll to zoom \u00b7 double-click to reset`, width - PADDING.right, height - 5);
    }
  }, [gexData, dimensions, spotPrice, summary, hoveredStrike, zoomRange, symbol]);

  useEffect(() => { draw(); }, [draw]);

  // Wheel zoom (uses functional updater to avoid zoomRange dependency)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gexData.length < 3) return;

    const strikes = gexData.map(d => d.strike);
    const dataMin = Math.min(...strikes);
    const dataMax = Math.max(...strikes);
    const dataRange = dataMax - dataMin;
    if (dataRange <= 0) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      setZoomRange(prev => {
        const currentMin = prev?.min ?? dataMin;
        const currentMax = prev?.max ?? dataMax;
        const range = currentMax - currentMin;

        const rect = canvas.getBoundingClientRect();
        const chartH = rect.height - PADDING.top - PADDING.bottom;
        const normalizedY = (e.clientY - rect.top - PADDING.top) / chartH;
        const cursorStrike = currentMax - normalizedY * range;

        const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const newRange = Math.min(dataRange, Math.max(dataRange * 0.05, range * zoomFactor));

        const fraction = Math.max(0, Math.min(1, (cursorStrike - currentMin) / range));
        let newMin = cursorStrike - fraction * newRange;
        let newMax = cursorStrike + (1 - fraction) * newRange;

        if (newMin < dataMin) { newMax += dataMin - newMin; newMin = dataMin; }
        if (newMax > dataMax) { newMin -= newMax - dataMax; newMax = dataMax; }
        newMin = Math.max(dataMin, newMin);
        newMax = Math.min(dataMax, newMax);

        if (newMax - newMin >= dataRange * 0.98) return null;
        return { min: newMin, max: newMax };
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [gexData]);

  // Mouse: hover + pan
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || gexData.length === 0) return;

    // Pan when dragging
    if (panRef.current.active) {
      const chartH = dimensions.height - PADDING.top - PADDING.bottom;
      const range = panRef.current.startMax - panRef.current.startMin;
      const strikeDelta = ((e.clientY - panRef.current.startY) / chartH) * range;

      const allStrikes = gexData.map(d => d.strike);
      const dataMin = Math.min(...allStrikes);
      const dataMax = Math.max(...allStrikes);

      let newMin = panRef.current.startMin + strikeDelta;
      let newMax = panRef.current.startMax + strikeDelta;

      if (newMin < dataMin) { newMax += dataMin - newMin; newMin = dataMin; }
      if (newMax > dataMax) { newMin -= newMax - dataMax; newMax = dataMax; }

      setZoomRange({ min: Math.max(dataMin, newMin), max: Math.min(dataMax, newMax) });
      return;
    }

    // Hover
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const chartHeight = dimensions.height - PADDING.top - PADDING.bottom;

    const allStrikes = gexData.map(d => d.strike);
    const minStrike = zoomRange?.min ?? Math.min(...allStrikes);
    const maxStrike = zoomRange?.max ?? Math.max(...allStrikes);

    const normalizedY = (y - PADDING.top) / chartHeight;
    const strike = maxStrike - normalizedY * (maxStrike - minStrike);

    let closest = gexData[0]?.strike;
    let minDist = Infinity;
    gexData.forEach(d => {
      const dist = Math.abs(d.strike - strike);
      if (dist < minDist) { minDist = dist; closest = d.strike; }
    });

    setHoveredStrike(closest);
  }, [gexData, dimensions, zoomRange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !zoomRange) return;
    panRef.current = {
      active: true,
      startY: e.clientY,
      startMin: zoomRange.min,
      startMax: zoomRange.max,
    };
  }, [zoomRange]);

  const handleMouseUp = useCallback(() => {
    panRef.current.active = false;
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full" style={{ height: height === 'auto' ? '100%' : height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: panRef.current.active ? 'grabbing' : zoomRange ? 'grab' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredStrike(null); panRef.current.active = false; }}
        onDoubleClick={() => setZoomRange(null)}
      />

      {/* Tooltip */}
      {hoveredStrike && !panRef.current.active && (() => {
        const level = gexData.find(d => d.strike === hoveredStrike);
        if (!level) return null;
        return (
          <div className="absolute top-2 right-2 rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Strike: ${hoveredStrike}</div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Call GEX:</span>
              <span className="font-mono" style={{ color: 'var(--bull)' }}>{formatGEX(level.callGEX)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Put GEX:</span>
              <span className="font-mono" style={{ color: 'var(--bear)' }}>{formatGEX(level.putGEX)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t mt-2 pt-2" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Net GEX:</span>
              <span className="font-mono font-bold" style={{ color: level.netGEX >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {formatGEX(level.netGEX)}
              </span>
            </div>
            <div className="flex justify-between gap-4 mt-1">
              <span style={{ color: 'var(--text-muted)' }}>Call OI:</span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{level.callOI.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Put OI:</span>
              <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{level.putOI.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}
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
