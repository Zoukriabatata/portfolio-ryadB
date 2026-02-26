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

  const themeColors = useGEXColors();

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

    ctx.fillStyle = themeColors.bg;
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

    // Grid lines
    ctx.strokeStyle = themeColors.gridLine;
    ctx.lineWidth = 1;

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
      // Strike price on left
      ctx.textAlign = 'right';
      ctx.fillStyle = themeColors.text;
      ctx.fillText(`$${strike.toFixed(0)}`, PADDING.left - 8, y + 3.5);
    }

    // X-axis GEX value labels (bottom, equally spaced)
    ctx.font = '9px monospace';
    ctx.fillStyle = themeColors.text;
    ctx.textAlign = 'center';
    const xSteps = 4;
    for (let i = 0; i <= xSteps; i++) {
      // Left (put) side
      const putVal = -maxGEX * (i / xSteps);
      const putX = PADDING.left + chartWidth / 2 - (chartWidth / 2) * (i / xSteps);
      if (i > 0) ctx.fillText(formatGEX(putVal), putX, PADDING.top + chartHeight + 14);
      // Right (call) side
      const callVal = maxGEX * (i / xSteps);
      const callX = PADDING.left + chartWidth / 2 + (chartWidth / 2) * (i / xSteps);
      if (i > 0) ctx.fillText(formatGEX(callVal), callX, PADDING.top + chartHeight + 14);
    }
    // Center zero label
    ctx.fillText('0', PADDING.left + chartWidth / 2, PADDING.top + chartHeight + 14);

    // Bars with rounded ends, gradient fills, and improved spacing
    const barHeight = Math.max(4, (chartHeight / visibleData.length) * 0.6);
    const barRadius = Math.min(barHeight / 2, 5);

    visibleData.forEach((level) => {
      const y = strikeToY(level.strike);
      const isHovered = hoveredStrike === level.strike;

      // Hovered bar highlight: subtle background band
      if (isHovered) {
        ctx.fillStyle = themeColors.gridBand;
        ctx.fillRect(PADDING.left, y - barHeight, chartWidth, barHeight * 2);
      }

      // Call GEX (right side, positive)
      if (level.callGEX > 0) {
        const barWidth = (level.callGEX / maxGEX) * (chartWidth / 2);
        const bx = PADDING.left + chartWidth / 2;
        const by = y - barHeight / 2;

        // Gradient fill — stronger opacity for better contrast
        const grad = ctx.createLinearGradient(bx, 0, bx + barWidth, 0);
        grad.addColorStop(0, themeColors.callGEX + (isHovered ? 'ff' : 'cc'));
        grad.addColorStop(1, themeColors.callGEX + (isHovered ? 'ee' : '77'));
        ctx.fillStyle = grad;

        // Rounded rect
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + barWidth - barRadius, by);
        ctx.arcTo(bx + barWidth, by, bx + barWidth, by + barRadius, barRadius);
        ctx.lineTo(bx + barWidth, by + barHeight - barRadius);
        ctx.arcTo(bx + barWidth, by + barHeight, bx + barWidth - barRadius, by + barHeight, barRadius);
        ctx.lineTo(bx, by + barHeight);
        ctx.closePath();
        ctx.fill();

        // Value label on significant bars — improved font
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

        // Gradient fill — stronger opacity for better contrast
        const grad = ctx.createLinearGradient(bx, 0, bx + barWidth, 0);
        grad.addColorStop(0, themeColors.putGEX + (isHovered ? 'ee' : '77'));
        grad.addColorStop(1, themeColors.putGEX + (isHovered ? 'ff' : 'cc'));
        ctx.fillStyle = grad;

        // Rounded rect
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

        // Value label on significant bars — improved font
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

      // Dashed line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pill label
      const text = `${label}: $${price.toFixed(0)}`;
      ctx.font = 'bold 10px system-ui';
      const textWidth = ctx.measureText(text).width;
      const pillPad = 6;
      const pillH = 16;
      const pillW = textWidth + pillPad * 2;
      const pillX = side === 'left' ? PADDING.left + 8 : PADDING.left + chartWidth - pillW - 8;
      const pillY = y - pillH - 3;

      // Pill background
      ctx.fillStyle = color + '22';
      ctx.strokeStyle = color + '88';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();
      ctx.stroke();

      // Pill text
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(text, pillX + pillPad, pillY + 11);
    };

    if (summary) {
      drawLevel(summary.callWall, themeColors.callWall, 'Call Wall', 'right');
      drawLevel(summary.putWall, themeColors.putWall, 'Put Wall', 'left');
      drawLevel(summary.zeroGamma, themeColors.zeroGamma, 'Zero Gamma', 'right');
    }

    // Spot price with pill label
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const y = strikeToY(spotPrice);
      ctx.strokeStyle = themeColors.spotPrice;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();

      // Spot pill centered
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

    // Axis labels with better contrast and sizing
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    // Put side label
    ctx.fillStyle = themeColors.putGEX + '99';
    ctx.fillText('\u2190 Put GEX (Negative)', PADDING.left + chartWidth / 4, height - 14);
    // Call side label
    ctx.fillStyle = themeColors.callGEX + '99';
    ctx.fillText('Call GEX (Positive) \u2192', PADDING.left + 3 * chartWidth / 4, height - 14);

    // Title — left aligned with subtle styling
    ctx.fillStyle = themeColors.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol}`, PADDING.left, 24);
    // Subtitle
    ctx.fillStyle = themeColors.textMid;
    ctx.font = '11px system-ui';
    ctx.fillText('Gamma Exposure by Strike', PADDING.left + ctx.measureText(`${symbol}`).width + 8, 24);

    // Regime indicator (top right)
    if (summary) {
      const regime = summary.regime;
      const regimeColor = regime === 'positive' ? themeColors.callGEX : themeColors.putGEX;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillStyle = regimeColor + 'cc';
      ctx.fillText(`${regime.toUpperCase()} GAMMA`, width - PADDING.right, 24);
    }

    // Zoom indicator
    if (zoomRange) {
      ctx.fillStyle = themeColors.text;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      const pct = ((strikeRange / (dataMax - dataMin)) * 100).toFixed(0);
      ctx.fillText(`${pct}% \u00b7 scroll to zoom \u00b7 double-click to reset`, width - PADDING.right, height - 4);
    }
  }, [gexData, dimensions, spotPrice, summary, hoveredStrike, zoomRange, symbol, themeColors]);

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
          <div className="absolute top-3 right-3 rounded-2xl p-0 text-xs animate-scaleIn backdrop-blur-xl overflow-hidden shadow-2xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--surface-elevated) 90%, var(--primary) 10%)',
              border: '1px solid color-mix(in srgb, var(--border-light) 70%, var(--primary) 30%)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1) inset',
              minWidth: 180,
            }}>
            {/* Header */}
            <div className="px-3.5 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'linear-gradient(135deg, var(--primary)08, transparent)' }}>
              <span className="font-bold text-[13px]" style={{ color: 'var(--text-primary)' }}>Strike ${hoveredStrike}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold font-mono"
                style={{ color: level.netGEX >= 0 ? 'var(--bull)' : 'var(--bear)', backgroundColor: level.netGEX >= 0 ? 'var(--bull-bg, rgba(34,197,94,0.1))' : 'var(--bear-bg, rgba(239,68,68,0.1))' }}>
                {level.netGEX >= 0 ? '+' : ''}{formatGEX(level.netGEX)}
              </span>
            </div>
            {/* Body */}
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
              <div className="border-t pt-1.5 mt-1.5" style={{ borderColor: 'var(--border)' }}>
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
