'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { MultiGreekData, GreekType } from '@/types/options';
import { GREEK_META } from '@/types/options';

interface CumulativeGEXChartProps {
  data: MultiGreekData[];
  spotPrice: number;
  symbol: string;
  selectedGreek: GreekType;
  zeroGammaLevel: number;
  callWall: number;
  putWall: number;
  height?: number | 'auto';
}

const COLORS = {
  bg: '#0a0a0a',
  grid: '#1a1a1a',
  text: '#888888',
  textBright: '#ffffff',
  positive: '#22c55e',
  negative: '#ef4444',
  spotPrice: '#3b82f6',
  zeroGamma: '#fbbf24',
  callWall: '#10b981',
  putWall: '#f43f5e',
};

const PADDING = { top: 40, right: 60, bottom: 50, left: 80 };

export default function CumulativeGEXChart({
  data,
  spotPrice,
  symbol,
  selectedGreek,
  zeroGammaLevel,
  callWall,
  putWall,
  height = 500,
}: CumulativeGEXChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: typeof height === 'number' ? height : 500 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Zoom & pan
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const panRef = useRef({ startX: 0, startMin: 0, startMax: 0 });

  // Cumulative data
  const cumulativeData = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.strike - b.strike);
    let cumulative = 0;
    return sorted.map(d => {
      cumulative += d[selectedGreek];
      return { strike: d.strike, value: cumulative, raw: d[selectedGreek] };
    });
  }, [data, selectedGreek]);

  // Reset zoom when data changes
  useEffect(() => { setZoomRange(null); }, [cumulativeData.length]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const h = height === 'auto' ? el.clientHeight : (typeof height === 'number' ? height : 500);
      setDimensions({ width: el.clientWidth, height: Math.max(300, h) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || cumulativeData.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: h } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, h);

    const cw = width - PADDING.left - PADDING.right;
    const ch = h - PADDING.top - PADDING.bottom;

    // Strike range (zoom-aware)
    const allStrikes = cumulativeData.map(d => d.strike);
    const dataMin = Math.min(...allStrikes);
    const dataMax = Math.max(...allStrikes);
    const minStrike = zoomRange?.min ?? dataMin;
    const maxStrike = zoomRange?.max ?? dataMax;
    const strikeRange = maxStrike - minStrike;
    if (strikeRange <= 0) return;

    // Visible data
    const visibleData = cumulativeData.filter(d => d.strike >= minStrike && d.strike <= maxStrike);
    if (visibleData.length < 2) return;

    // Auto-scale Y
    const values = visibleData.map(d => d.value);
    const minVal = Math.min(0, ...values);
    const maxVal = Math.max(0, ...values);
    const valRange = maxVal - minVal || 1;

    const toX = (strike: number) => PADDING.left + ((strike - minStrike) / strikeRange) * cw;
    const toY = (val: number) => PADDING.top + ch - ((val - minVal) / valRange) * ch;
    const zeroY = toY(0);

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    // Horizontal grid
    const numHLines = 6;
    ctx.font = '10px monospace';
    ctx.fillStyle = COLORS.text;
    for (let i = 0; i <= numHLines; i++) {
      const val = minVal + (i / numHLines) * valRange;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + cw, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      const formatted = Math.abs(val) >= 1e6 ? `${(val / 1e6).toFixed(1)}M`
        : Math.abs(val) >= 1e3 ? `${(val / 1e3).toFixed(1)}K`
        : val.toFixed(0);
      ctx.fillText(formatted, PADDING.left - 8, y + 4);
    }

    // Vertical grid (strike labels)
    const numVLines = Math.min(10, visibleData.length);
    const vStep = Math.max(1, Math.floor(visibleData.length / numVLines));
    for (let i = 0; i < visibleData.length; i += vStep) {
      const x = toX(visibleData[i].strike);
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + ch);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(`$${visibleData[i].strike.toFixed(0)}`, x, h - PADDING.bottom + 16);
    }

    // Zero line
    ctx.strokeStyle = COLORS.zeroGamma;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(PADDING.left, zeroY);
    ctx.lineTo(PADDING.left + cw, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Area fill: green above zero, red below
    ctx.beginPath();
    ctx.moveTo(toX(visibleData[0].strike), zeroY);
    for (const d of visibleData) {
      ctx.lineTo(toX(d.strike), Math.min(toY(Math.max(0, d.value)), zeroY));
    }
    ctx.lineTo(toX(visibleData[visibleData.length - 1].strike), zeroY);
    ctx.closePath();
    const posGrad = ctx.createLinearGradient(0, PADDING.top, 0, zeroY);
    posGrad.addColorStop(0, 'rgba(34, 197, 94, 0.35)');
    posGrad.addColorStop(1, 'rgba(34, 197, 94, 0.05)');
    ctx.fillStyle = posGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(toX(visibleData[0].strike), zeroY);
    for (const d of visibleData) {
      ctx.lineTo(toX(d.strike), Math.max(toY(Math.min(0, d.value)), zeroY));
    }
    ctx.lineTo(toX(visibleData[visibleData.length - 1].strike), zeroY);
    ctx.closePath();
    const negGrad = ctx.createLinearGradient(0, zeroY, 0, PADDING.top + ch);
    negGrad.addColorStop(0, 'rgba(239, 68, 68, 0.05)');
    negGrad.addColorStop(1, 'rgba(239, 68, 68, 0.35)');
    ctx.fillStyle = negGrad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(visibleData[0].strike), toY(visibleData[0].value));
    for (let i = 1; i < visibleData.length; i++) {
      ctx.lineTo(toX(visibleData[i].strike), toY(visibleData[i].value));
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Spot price
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const x = toX(spotPrice);
      ctx.strokeStyle = COLORS.spotPrice;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + ch);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COLORS.spotPrice;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`SPOT $${spotPrice.toFixed(0)}`, x, PADDING.top - 5);
    }

    // Key level markers
    const drawMarker = (strike: number, label: string, color: string) => {
      if (strike < minStrike || strike > maxStrike) return;
      const x = toX(strike);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, PADDING.top + ch + 24, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, PADDING.top + ch + 38);
    };

    drawMarker(zeroGammaLevel, 'Zero \u0393', COLORS.zeroGamma);
    drawMarker(callWall, 'Call Wall', COLORS.callWall);
    drawMarker(putWall, 'Put Wall', COLORS.putWall);

    // Hover crosshair
    if (hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < cumulativeData.length) {
      const d = cumulativeData[hoveredIdx];
      if (d.strike >= minStrike && d.strike <= maxStrike) {
        const x = toX(d.strike);
        const y = toY(d.value);

        // Full crosshair lines
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, PADDING.top);
        ctx.lineTo(x, PADDING.top + ch);
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(PADDING.left + cw, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Axis value labels
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 9px monospace';

        // Y-axis value label
        const yLabel = Math.abs(d.value) >= 1e6 ? `${(d.value / 1e6).toFixed(1)}M`
          : Math.abs(d.value) >= 1e3 ? `${(d.value / 1e3).toFixed(1)}K`
          : d.value.toFixed(0);
        ctx.textAlign = 'right';
        ctx.fillText(yLabel, PADDING.left - 4, y + 4);

        // X-axis strike label
        ctx.textAlign = 'center';
        ctx.fillText(`$${d.strike.toFixed(0)}`, x, PADDING.top + ch + 12);

        // Data point circle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = d.value >= 0 ? COLORS.positive : COLORS.negative;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Title
    const meta = GREEK_META[selectedGreek];
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} Cumulative ${meta.label} Profile`, PADDING.left, 24);

    ctx.fillStyle = COLORS.text;
    ctx.font = '10px system-ui';
    ctx.fillText('Zero crossing = Gamma Flip Level', PADDING.left + 280, 24);
  }, [cumulativeData, dimensions, spotPrice, hoveredIdx, selectedGreek, symbol, zeroGammaLevel, callWall, putWall, zoomRange]);

  useEffect(() => { draw(); }, [draw]);

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cumulativeData.length < 3) return;

    const strikes = cumulativeData.map(d => d.strike);
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
        const chartW = rect.width - PADDING.left - PADDING.right;
        const normalizedX = (e.clientX - rect.left - PADDING.left) / chartW;
        const cursorStrike = currentMin + normalizedX * range;

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
  }, [cumulativeData]);

  // Mouse: hover + pan
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || cumulativeData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Pan
    if (isPanning) {
      const chartW = dimensions.width - PADDING.left - PADDING.right;
      const range = panRef.current.startMax - panRef.current.startMin;
      const strikeDelta = -((e.clientX - panRef.current.startX) / chartW) * range;

      const allStrikes = cumulativeData.map(d => d.strike);
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
    const mouseX = e.clientX - rect.left;
    const chartW = dimensions.width - PADDING.left - PADDING.right;

    const allStrikes = cumulativeData.map(d => d.strike);
    const minStrike = zoomRange?.min ?? Math.min(...allStrikes);
    const maxStrike = zoomRange?.max ?? Math.max(...allStrikes);

    const normalizedX = (mouseX - PADDING.left) / chartW;
    const targetStrike = minStrike + normalizedX * (maxStrike - minStrike);

    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < cumulativeData.length; i++) {
      const dist = Math.abs(cumulativeData[i].strike - targetStrike);
      if (dist < minDist) { minDist = dist; closestIdx = i; }
    }

    setHoveredIdx(closestIdx);
  }, [cumulativeData, dimensions, zoomRange, isPanning]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const allStrikes = cumulativeData.map(d => d.strike);
    const dataMin = Math.min(...allStrikes);
    const dataMax = Math.max(...allStrikes);
    const dataRange = dataMax - dataMin;

    let startMin: number;
    let startMax: number;

    if (!zoomRange && dataRange > 0) {
      // No zoom yet → auto-zoom to 70% centered on cursor so pan has room to move
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const chartW = (rect?.width ?? dimensions.width) - PADDING.left - PADDING.right;
      const normalizedX = (e.clientX - (rect?.left ?? 0) - PADDING.left) / chartW;
      const cursorStrike = dataMin + normalizedX * dataRange;

      const newRange = dataRange * 0.7;
      let nMin = cursorStrike - newRange / 2;
      let nMax = cursorStrike + newRange / 2;
      if (nMin < dataMin) { nMax += dataMin - nMin; nMin = dataMin; }
      if (nMax > dataMax) { nMin -= nMax - dataMax; nMax = dataMax; }
      startMin = Math.max(dataMin, nMin);
      startMax = Math.min(dataMax, nMax);
      setZoomRange({ min: startMin, max: startMax });
    } else {
      startMin = zoomRange?.min ?? dataMin;
      startMax = zoomRange?.max ?? dataMax;
    }

    panRef.current = { startX: e.clientX, startMin, startMax };
    setIsPanning(true);
  }, [zoomRange, cumulativeData, dimensions]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setIsPanning(false);
  }, []);

  const hoveredData = hoveredIdx !== null ? cumulativeData[hoveredIdx] : null;
  const greekMeta = GREEK_META[selectedGreek];

  // Tooltip position (follow cursor, clamp to bounds)
  const tooltipOffset = 14;
  const tooltipW = 188;
  const tooltipH = 110;
  const rawTtX = mousePos.x + tooltipOffset;
  const rawTtY = mousePos.y + tooltipOffset;
  const ttX = Math.min(rawTtX, dimensions.width - tooltipW - 8);
  const ttY = Math.min(rawTtY, dimensions.height - tooltipH - 8);

  const isZoomed = !!zoomRange;
  const allStrikes = cumulativeData.map(d => d.strike);
  const dataMin = allStrikes.length ? Math.min(...allStrikes) : 0;
  const dataMax = allStrikes.length ? Math.max(...allStrikes) : 1;
  const zoomPct = isZoomed
    ? (((zoomRange!.max - zoomRange!.min) / (dataMax - dataMin)) * 100).toFixed(0)
    : '100';

  return (
    <div ref={containerRef} className="relative w-full h-full select-none" style={{ height: height === 'auto' ? '100%' : height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={() => setZoomRange(null)}
      />

      {/* Cursor-following tooltip */}
      {hoveredData && !isPanning && (
        <div
          className="pointer-events-none absolute rounded-xl text-xs backdrop-blur-xl overflow-hidden shadow-2xl z-10"
          style={{
            left: ttX,
            top: ttY,
            background: 'rgba(15,15,20,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: tooltipW,
          }}
        >
          <div className="px-3.5 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="font-bold text-white text-[13px]">Strike ${hoveredData.strike.toFixed(0)}</span>
            <span className="text-[9px] font-mono" style={{ color: hoveredData.raw >= 0 ? COLORS.positive : COLORS.negative }}>
              {hoveredData.raw >= 0 ? '+' : ''}{formatVal(hoveredData.raw)}
            </span>
          </div>
          <div className="px-3.5 py-2.5 space-y-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">{greekMeta.label}:</span>
              <span className={`font-mono ${hoveredData.raw >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatVal(hoveredData.raw)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t border-white/10 pt-1.5">
              <span className="text-zinc-400">Cumulative:</span>
              <span className={`font-mono font-bold ${hoveredData.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatVal(hoveredData.value)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-400">vs Spot:</span>
              <span className="text-zinc-300 font-mono">
                {((hoveredData.strike - spotPrice) / spotPrice * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom hint bar */}
      <div className="pointer-events-none absolute bottom-1 left-0 right-0 flex items-center justify-center gap-3"
        style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10 }}>
        <span>scroll · zoom</span>
        <span>·</span>
        <span>drag · pan</span>
        <span>·</span>
        <span>dbl-click · reset</span>
      </div>

      {/* Floating zoom indicator + reset */}
      {isZoomed && (
        <button
          onClick={() => setZoomRange(null)}
          className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-opacity hover:opacity-100 opacity-70"
          style={{
            background: 'rgba(20,20,28,0.9)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <span style={{ color: '#3b82f6' }}>{zoomPct}%</span>
          <span>× reset</span>
        </button>
      )}
    </div>
  );
}

function formatVal(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(1);
}
