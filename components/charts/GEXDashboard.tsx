'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useUIThemeStore, UI_THEMES } from '@/stores/useUIThemeStore';

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

function useGEXColors() {
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  const theme = UI_THEMES.find(t => t.id === activeTheme) || UI_THEMES[0];
  const c = theme.colors;
  return {
    bg: c.chartBg,
    border: c.chartGrid,
    text: c.textMuted,
    textMid: c.textSecondary,
    textBright: c.textPrimary,
    callGEX: c.candleUp,
    putGEX: c.candleDown,
    callWall: c.candleUp,
    putWall: c.candleDown,
    zeroGamma: '#fbbf24',
    spotPrice: c.primary,
    hvl: c.accent,
    gridLine: `${c.chartGrid}40`,
    gridBand: `${c.chartGrid}15`,
  };
}

const PADDING = { top: 44, right: 85, bottom: 56, left: 85 };

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Zoom & pan
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const panRef = useRef({ startY: 0, startMin: 0, startMax: 0 });

  // Reset zoom when data changes
  useEffect(() => { setZoomRange(null); }, [gexData.length]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const containerHeight = height === 'auto' ? el.clientHeight : height;
      setDimensions({ width: el.clientWidth, height: Math.max(400, typeof containerHeight === 'number' ? containerHeight : 500) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  const themeColors = useGEXColors();

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || gexData.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: h } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = themeColors.bg;
    ctx.fillRect(0, 0, width, h);

    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = h - PADDING.top - PADDING.bottom;

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

    // Alternating horizontal bands
    const numGridLines = 10;
    const strikeStep = strikeRange / numGridLines;
    for (let i = 0; i < numGridLines; i++) {
      if (i % 2 === 0) {
        const y1 = strikeToY(minStrike + (i + 1) * strikeStep);
        const y2 = strikeToY(minStrike + i * strikeStep);
        ctx.fillStyle = themeColors.gridBand;
        ctx.fillRect(PADDING.left, y1, chartWidth, y2 - y1);
      }
    }

    // Center line (zero GEX)
    ctx.strokeStyle = themeColors.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING.left + chartWidth / 2, PADDING.top);
    ctx.lineTo(PADDING.left + chartWidth / 2, PADDING.top + chartHeight);
    ctx.stroke();

    // Grid lines + strike labels
    ctx.strokeStyle = themeColors.gridLine;
    ctx.lineWidth = 0.5;
    ctx.font = '10px monospace';
    ctx.fillStyle = themeColors.text;

    for (let i = 0; i <= numGridLines; i++) {
      const strike = minStrike + i * strikeStep;
      const y = strikeToY(strike);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillStyle = themeColors.text;
      ctx.fillText(`$${strike.toFixed(0)}`, PADDING.left - 8, y + 3.5);
    }

    // X-axis GEX value labels
    ctx.font = '9px monospace';
    ctx.fillStyle = themeColors.text;
    ctx.textAlign = 'center';
    const xSteps = 4;
    for (let i = 0; i <= xSteps; i++) {
      const putVal = -maxGEX * (i / xSteps);
      const putX = PADDING.left + chartWidth / 2 - (chartWidth / 2) * (i / xSteps);
      if (i > 0) ctx.fillText(formatGEX(putVal), putX, PADDING.top + chartHeight + 14);
      const callVal = maxGEX * (i / xSteps);
      const callX = PADDING.left + chartWidth / 2 + (chartWidth / 2) * (i / xSteps);
      if (i > 0) ctx.fillText(formatGEX(callVal), callX, PADDING.top + chartHeight + 14);
    }
    ctx.fillText('0', PADDING.left + chartWidth / 2, PADDING.top + chartHeight + 14);

    // Bars
    const barHeight = Math.max(4, (chartHeight / visibleData.length) * 0.6);
    const barRadius = Math.min(barHeight / 2, 5);

    visibleData.forEach((level) => {
      const y = strikeToY(level.strike);
      const isHovered = hoveredStrike === level.strike;

      if (isHovered) {
        ctx.fillStyle = themeColors.gridBand;
        ctx.fillRect(PADDING.left, y - barHeight, chartWidth, barHeight * 2);
      }

      // Call GEX (right side, positive)
      if (level.callGEX > 0) {
        const barWidth = (level.callGEX / maxGEX) * (chartWidth / 2);
        const bx = PADDING.left + chartWidth / 2;
        const by = y - barHeight / 2;

        const grad = ctx.createLinearGradient(bx, 0, bx + barWidth, 0);
        grad.addColorStop(0, themeColors.callGEX + (isHovered ? 'ff' : 'cc'));
        grad.addColorStop(1, themeColors.callGEX + (isHovered ? 'ee' : '77'));
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + barWidth - barRadius, by);
        ctx.arcTo(bx + barWidth, by, bx + barWidth, by + barRadius, barRadius);
        ctx.lineTo(bx + barWidth, by + barHeight - barRadius);
        ctx.arcTo(bx + barWidth, by + barHeight, bx + barWidth - barRadius, by + barHeight, barRadius);
        ctx.lineTo(bx, by + barHeight);
        ctx.closePath();
        ctx.fill();

        if (barWidth > 35) {
          ctx.fillStyle = isHovered ? themeColors.textBright : themeColors.textMid;
          ctx.font = `${isHovered ? 'bold ' : ''}10px monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(formatGEX(level.callGEX), bx + barWidth + 6, y + 3.5);
        }
      }

      // Put GEX (left side, negative)
      if (level.putGEX < 0) {
        const barWidth = (Math.abs(level.putGEX) / maxGEX) * (chartWidth / 2);
        const bx = PADDING.left + chartWidth / 2 - barWidth;
        const by = y - barHeight / 2;

        const grad = ctx.createLinearGradient(bx, 0, bx + barWidth, 0);
        grad.addColorStop(0, themeColors.putGEX + (isHovered ? 'ee' : '77'));
        grad.addColorStop(1, themeColors.putGEX + (isHovered ? 'ff' : 'cc'));
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(bx + barRadius, by);
        ctx.lineTo(bx + barWidth, by);
        ctx.lineTo(bx + barWidth, by + barHeight);
        ctx.lineTo(bx + barRadius, by + barHeight);
        ctx.arcTo(bx, by + barHeight, bx, by + barHeight - barRadius, barRadius);
        ctx.lineTo(bx, by + barRadius);
        ctx.arcTo(bx, by, bx + barRadius, by, barRadius);
        ctx.closePath();
        ctx.fill();

        if (barWidth > 35) {
          ctx.fillStyle = isHovered ? themeColors.textBright : themeColors.textMid;
          ctx.font = `${isHovered ? 'bold ' : ''}10px monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(formatGEX(level.putGEX), bx - 6, y + 3.5);
        }
      }
    });

    // Key levels with pill-style labels
    const drawLevel = (price: number, color: string, label: string, side: 'left' | 'right') => {
      if (price < minStrike || price > maxStrike) return;
      const y = strikeToY(price);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      const text = `${label}: $${price.toFixed(0)}`;
      ctx.font = 'bold 10px system-ui';
      const textWidth = ctx.measureText(text).width;
      const pillPad = 6;
      const pillH = 16;
      const pillW = textWidth + pillPad * 2;
      const pillX = side === 'left' ? PADDING.left + 8 : PADDING.left + chartWidth - pillW - 8;
      const pillY = y - pillH - 3;

      ctx.fillStyle = color + '22';
      ctx.strokeStyle = color + '88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(text, pillX + pillPad, pillY + 11);
    };

    if (summary) {
      drawLevel(summary.callWall, themeColors.callWall, 'Call Wall', 'right');
      drawLevel(summary.putWall, themeColors.putWall, 'Put Wall', 'left');
      drawLevel(summary.zeroGamma, themeColors.zeroGamma, 'Zero Gamma', 'right');
    }

    // Spot price
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const y = strikeToY(spotPrice);
      ctx.strokeStyle = themeColors.spotPrice;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();

      const spotText = `SPOT $${spotPrice.toFixed(2)}`;
      ctx.font = 'bold 11px system-ui';
      const spotTextW = ctx.measureText(spotText).width;
      const spotPillW = spotTextW + 14;
      const spotPillX = PADDING.left + chartWidth / 2 - spotPillW / 2;
      const spotPillY = y - 20;

      ctx.fillStyle = themeColors.spotPrice + '33';
      ctx.strokeStyle = themeColors.spotPrice;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(spotPillX, spotPillY, spotPillW, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = themeColors.spotPrice;
      ctx.textAlign = 'center';
      ctx.fillText(spotText, PADDING.left + chartWidth / 2, spotPillY + 13);
    }

    // Axis labels
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = themeColors.putGEX + '99';
    ctx.fillText('\u2190 Put GEX (Negative)', PADDING.left + chartWidth / 4, h - 14);
    ctx.fillStyle = themeColors.callGEX + '99';
    ctx.fillText('Call GEX (Positive) \u2192', PADDING.left + 3 * chartWidth / 4, h - 14);

    // Title
    ctx.fillStyle = themeColors.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol}`, PADDING.left, 24);
    ctx.fillStyle = themeColors.textMid;
    ctx.font = '11px system-ui';
    ctx.fillText('Gamma Exposure by Strike', PADDING.left + ctx.measureText(`${symbol}`).width + 8, 24);

    if (summary) {
      const regimeColor = summary.regime === 'positive' ? themeColors.callGEX : themeColors.putGEX;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillStyle = regimeColor + 'cc';
      ctx.fillText(`${summary.regime.toUpperCase()} GAMMA`, width - PADDING.right, 24);
    }
  }, [gexData, dimensions, spotPrice, summary, hoveredStrike, zoomRange, symbol, themeColors]);

  useEffect(() => { draw(); }, [draw]);

  // Wheel zoom
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

    const rect = canvas.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    // Pan when dragging
    if (isPanning) {
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
  }, [gexData, dimensions, zoomRange, isPanning]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const allStrikes = gexData.map(d => d.strike);
    const dataMin = Math.min(...allStrikes);
    const dataMax = Math.max(...allStrikes);
    const dataRange = dataMax - dataMin;

    let startMin: number;
    let startMax: number;

    if (!zoomRange && dataRange > 0) {
      // No zoom yet → auto-zoom to 70% centered on cursor so pan has room to move
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const chartH = (rect?.height ?? dimensions.height) - PADDING.top - PADDING.bottom;
      const normalizedY = (e.clientY - (rect?.top ?? 0) - PADDING.top) / chartH;
      const cursorStrike = dataMax - normalizedY * dataRange;

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

    panRef.current = { startY: e.clientY, startMin, startMax };
    setIsPanning(true);
  }, [zoomRange, gexData, dimensions]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredStrike(null);
    setIsPanning(false);
  }, []);

  // Tooltip data
  const level = hoveredStrike ? gexData.find(d => d.strike === hoveredStrike) : null;

  // Clamp tooltip position
  const tooltipOffset = 14;
  const tooltipW = 188;
  const tooltipH = 130;
  const rawTtX = mousePos.x + tooltipOffset;
  const rawTtY = mousePos.y + tooltipOffset;
  const ttX = Math.min(rawTtX, dimensions.width - tooltipW - 8);
  const ttY = Math.min(rawTtY, dimensions.height - tooltipH - 8);

  const isZoomed = !!zoomRange;
  const allStrikes = gexData.map(d => d.strike);
  const dataMin = Math.min(...allStrikes);
  const dataMax = Math.max(...allStrikes);
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
      {level && !isPanning && (
        <div
          className="pointer-events-none absolute rounded-2xl p-0 text-xs backdrop-blur-xl overflow-hidden shadow-2xl z-10"
          style={{
            left: ttX,
            top: ttY,
            backgroundColor: 'color-mix(in srgb, var(--surface-elevated) 90%, var(--primary) 10%)',
            border: '1px solid color-mix(in srgb, var(--border-light) 70%, var(--primary) 30%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            minWidth: tooltipW,
          }}
        >
          <div className="px-3.5 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>Strike ${hoveredStrike}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold font-mono"
              style={{ color: level.netGEX >= 0 ? 'var(--bull)' : 'var(--bear)', backgroundColor: level.netGEX >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
              {level.netGEX >= 0 ? '+' : ''}{formatGEX(level.netGEX)}
            </span>
          </div>
          <div className="px-3.5 py-2.5 space-y-1.5">
            <div className="flex justify-between gap-6">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--bull)' }} />Call GEX
              </span>
              <span className="font-mono font-semibold" style={{ color: 'var(--bull)' }}>{formatGEX(level.callGEX)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--bear)' }} />Put GEX
              </span>
              <span className="font-mono font-semibold" style={{ color: 'var(--bear)' }}>{formatGEX(level.putGEX)}</span>
            </div>
            <div className="border-t pt-1.5 mt-1" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between gap-6">
                <span style={{ color: 'var(--text-muted)' }}>Call OI</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{level.callOI.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-6 mt-1">
                <span style={{ color: 'var(--text-muted)' }}>Put OI</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{level.putOI.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom hint bar */}
      <div className="pointer-events-none absolute bottom-1 left-0 right-0 flex items-center justify-center gap-3"
        style={{ color: 'var(--text-dimmed, rgba(255,255,255,0.2))', fontSize: 10 }}>
        <span>scroll · zoom</span>
        <span>·</span>
        <span>drag · pan</span>
        <span>·</span>
        <span>dbl-click · reset</span>
      </div>

      {/* Floating zoom indicator + reset button */}
      {isZoomed && (
        <button
          onClick={() => setZoomRange(null)}
          className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-opacity hover:opacity-100 opacity-70"
          style={{
            background: 'var(--surface-elevated, rgba(30,30,40,0.9))',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--primary)' }}>{zoomPct}%</span>
          <span>× reset</span>
        </button>
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
