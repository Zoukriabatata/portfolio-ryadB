'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIThemeStore, UI_THEMES } from '@/stores/useUIThemeStore';

interface SkewPoint {
  strike: number;
  callIV: number | null;
  putIV: number | null;
  moneyness: number;
}

interface IVSmileChartProps {
  data: SkewPoint[];
  spotPrice: number;
  symbol: string;
  dte?: number;
  height?: number;
}

/** Derive chart colors from the active UI theme */
function useSmileColors() {
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  const theme = UI_THEMES.find(t => t.id === activeTheme) || UI_THEMES[0];
  const c = theme.colors;
  return {
    bg: c.chartBg,
    gridLine: `${c.chartGrid}30`,
    gridBand: `${c.chartGrid}10`,
    text: c.textMuted,
    textMid: c.textSecondary,
    textBright: c.textPrimary,
    callIV: c.candleUp,
    callGlow: `${c.candleUp}40`,
    putIV: c.candleDown,
    putGlow: `${c.candleDown}40`,
    spot: c.primary,
    spotGlow: `${c.primary}25`,
    atmZone: `${c.primary}0a`,
    atmBorder: `${c.primary}25`,
    skewFill: `${c.accent}14`,
    crosshair: `${c.textPrimary}25`,
  };
}

// Fallback static colors (unused but kept for reference)
const COLORS = {
  bg: '#08090a',
  gridLine: 'rgba(255,255,255,0.04)',
  gridBand: 'rgba(255,255,255,0.015)',
  text: '#555',
  textMid: '#888',
  textBright: '#e0e0e0',
  callIV: '#34d399',
  callGlow: 'rgba(52, 211, 153, 0.25)',
  putIV: '#f87171',
  putGlow: 'rgba(248, 113, 113, 0.25)',
  spot: '#60a5fa',
  spotGlow: 'rgba(96, 165, 250, 0.15)',
  atmZone: 'rgba(96, 165, 250, 0.06)',
  atmBorder: 'rgba(96, 165, 250, 0.15)',
  skewFill: 'rgba(139, 92, 246, 0.08)',
  crosshair: 'rgba(255,255,255,0.15)',
};

const PADDING = { top: 52, right: 16, bottom: 56, left: 64 };

// Catmull-Rom to Bézier helper for smooth curves
function catmullRomToBezier(
  points: { x: number; y: number }[],
  tension = 0.3
): { x: number; y: number }[][] {
  if (points.length < 2) return [];
  const segments: { x: number; y: number }[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    segments.push([
      { x: p1.x, y: p1.y },
      { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension },
      { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension },
      { x: p2.x, y: p2.y },
    ]);
  }
  return segments;
}

function drawSmoothLine(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  tension = 0.3
) {
  if (points.length < 2) return;
  if (points.length === 2) {
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  const segments = catmullRomToBezier(points, tension);
  ctx.moveTo(segments[0][0].x, segments[0][0].y);
  for (const [, cp1, cp2, end] of segments) {
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
  }
}

export default function IVSmileChart({
  data,
  spotPrice,
  symbol,
  dte,
  height = 450,
}: IVSmileChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const themeColors = useSmileColors();
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<SkewPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // X zoom (strikes)
  const [xZoom, setXZoom] = useState<{ min: number; max: number } | null>(null);
  // Y zoom (IV) — null = default range (0 to max*1.15)
  const [yZoom, setYZoom] = useState<{ min: number; max: number } | null>(null);
  // Pan ref — supports both axes
  const panRef = useRef({ active: false, startX: 0, startY: 0, xMin: 0, xMax: 0, yMin: 0, yMax: 0 });

  // Reset zoom when data changes
  useEffect(() => { setXZoom(null); setYZoom(null); }, [data.length, symbol]);

  const validData = data.filter(d => (d.callIV && d.callIV > 0) || (d.putIV && d.putIV > 0));

  // Compute full data bounds (stable reference for zoom limits)
  const boundsRef = useRef({ xMin: 0, xMax: 0, yMin: 0, yMax: 0 });
  if (validData.length >= 2) {
    const strikes = validData.map(d => d.strike);
    const allIVs: number[] = [];
    validData.forEach(d => {
      if (d.callIV && d.callIV > 0) allIVs.push(d.callIV);
      if (d.putIV && d.putIV > 0) allIVs.push(d.putIV);
    });
    boundsRef.current = {
      xMin: Math.min(...strikes),
      xMax: Math.max(...strikes),
      yMin: 0,
      yMax: allIVs.length > 0 ? Math.max(...allIVs) * 1.15 : 1,
    };
  }

  // Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || validData.length < 2) return;
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

    const cw = width - PADDING.left - PADDING.right;
    const ch = h - PADDING.top - PADDING.bottom;

    const bounds = boundsRef.current;

    // X range (strikes)
    const minStrike = xZoom?.min ?? bounds.xMin;
    const maxStrike = xZoom?.max ?? bounds.xMax;
    const strikeRange = maxStrike - minStrike;
    if (strikeRange <= 0) return;

    // Y range (IV) — default starts from 0
    const minIV = yZoom?.min ?? bounds.yMin;
    const maxIV = yZoom?.max ?? bounds.yMax;
    const ivRange = maxIV - minIV;
    if (ivRange <= 0) return;

    const visible = validData.filter(d => d.strike >= minStrike && d.strike <= maxStrike);
    if (visible.length < 2) return;

    const toX = (strike: number) => PADDING.left + ((strike - minStrike) / strikeRange) * cw;
    const toY = (iv: number) => PADDING.top + ((maxIV - iv) / ivRange) * ch;

    // ─── Clip to chart area so nothing overflows ───
    ctx.save();
    ctx.beginPath();
    ctx.rect(PADDING.left, PADDING.top, cw, ch);
    ctx.clip();

    // ─── Grid bands (alternating) ───
    const numHLines = 6;
    for (let i = 0; i < numHLines; i++) {
      if (i % 2 === 0) {
        const y1 = toY(minIV + (ivRange * (i + 1)) / numHLines);
        const y2 = toY(minIV + (ivRange * i) / numHLines);
        ctx.fillStyle = themeColors.gridBand;
        ctx.fillRect(PADDING.left, y1, cw, y2 - y1);
      }
    }

    // Horizontal grid lines + Y axis labels
    ctx.font = '10px "SF Mono", Menlo, monospace';
    for (let i = 0; i <= numHLines; i++) {
      const iv = minIV + (ivRange * i) / numHLines;
      const y = toY(iv);
      ctx.strokeStyle = themeColors.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + cw, y);
      ctx.stroke();
      ctx.fillStyle = themeColors.text;
      ctx.textAlign = 'right';
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, PADDING.left - 10, y + 3.5);
    }

    // Vertical grid + X axis labels
    const numVLines = Math.min(10, visible.length);
    const vStep = Math.max(1, Math.floor(visible.length / numVLines));
    ctx.textAlign = 'center';
    for (let i = 0; i < visible.length; i += vStep) {
      const x = toX(visible[i].strike);
      ctx.strokeStyle = themeColors.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + ch);
      ctx.stroke();
      ctx.fillStyle = themeColors.text;
      ctx.fillText(`$${visible[i].strike.toFixed(0)}`, x, h - PADDING.bottom + 16);
      if (spotPrice > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillText((visible[i].strike / spotPrice).toFixed(2), x, PADDING.top - 8);
      }
    }

    // Top axis label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MONEYNESS', PADDING.left, PADDING.top - 8);

    // ─── ATM zone highlight ───
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const zoneWidth = strikeRange * 0.04;
      const zoneLeft = toX(Math.max(minStrike, spotPrice - zoneWidth));
      const zoneRight = toX(Math.min(maxStrike, spotPrice + zoneWidth));
      ctx.fillStyle = themeColors.atmZone;
      ctx.fillRect(zoneLeft, PADDING.top, zoneRight - zoneLeft, ch);
      ctx.strokeStyle = themeColors.atmBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(zoneLeft, PADDING.top);
      ctx.lineTo(zoneLeft, PADDING.top + ch);
      ctx.moveTo(zoneRight, PADDING.top);
      ctx.lineTo(zoneRight, PADDING.top + ch);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── Spot price line ───
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const spotX = toX(spotPrice);
      const spotGrad = ctx.createLinearGradient(spotX - 8, 0, spotX + 8, 0);
      spotGrad.addColorStop(0, 'transparent');
      spotGrad.addColorStop(0.5, themeColors.spotGlow);
      spotGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(spotX - 8, PADDING.top, 16, ch);
      ctx.strokeStyle = themeColors.spot;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(spotX, PADDING.top);
      ctx.lineTo(spotX, PADDING.top + ch);
      ctx.stroke();
      ctx.setLineDash([]);
      const labelText = `SPOT $${spotPrice.toFixed(0)}`;
      ctx.font = 'bold 9px system-ui, sans-serif';
      const tw = ctx.measureText(labelText).width + 12;
      const lx = spotX - tw / 2;
      const ly = PADDING.top + ch + 2;
      ctx.fillStyle = themeColors.spot;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, 16, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(labelText, spotX, ly + 11.5);
    }

    // ─── Skew spread fill ───
    const bothPoints = visible.filter(d => d.callIV && d.callIV > 0 && d.putIV && d.putIV > 0);
    if (bothPoints.length >= 2) {
      const callPts = bothPoints.map(d => ({ x: toX(d.strike), y: toY(d.callIV!) }));
      const putPts = bothPoints.map(d => ({ x: toX(d.strike), y: toY(d.putIV!) }));
      ctx.save();
      ctx.beginPath();
      drawSmoothLine(ctx, callPts);
      const putReverse = [...putPts].reverse();
      ctx.lineTo(putReverse[0].x, putReverse[0].y);
      drawSmoothLine(ctx, putReverse);
      ctx.closePath();
      const skewGrad = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + ch);
      skewGrad.addColorStop(0, 'rgba(139, 92, 246, 0.1)');
      skewGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.05)');
      skewGrad.addColorStop(1, 'rgba(139, 92, 246, 0.02)');
      ctx.fillStyle = skewGrad;
      ctx.fill();
      ctx.restore();
    }

    // ─── Call IV curve ───
    const callPoints = visible.filter(d => d.callIV && d.callIV > 0);
    if (callPoints.length >= 2) {
      const pts = callPoints.map(d => ({ x: toX(d.strike), y: toY(d.callIV!) }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, PADDING.top + ch);
      drawSmoothLine(ctx, pts);
      ctx.lineTo(pts[pts.length - 1].x, PADDING.top + ch);
      ctx.closePath();
      const callGrad = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + ch);
      callGrad.addColorStop(0, 'rgba(52, 211, 153, 0.12)');
      callGrad.addColorStop(0.6, 'rgba(52, 211, 153, 0.03)');
      callGrad.addColorStop(1, 'rgba(52, 211, 153, 0)');
      ctx.fillStyle = callGrad;
      ctx.fill();
      ctx.save();
      ctx.shadowColor = themeColors.callGlow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      drawSmoothLine(ctx, pts);
      ctx.strokeStyle = themeColors.callIV;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      callPoints.forEach(d => {
        ctx.beginPath();
        ctx.arc(toX(d.strike), toY(d.callIV!), 2, 0, Math.PI * 2);
        ctx.fillStyle = themeColors.callIV;
        ctx.fill();
      });
    }

    // ─── Put IV curve ───
    const putPoints = visible.filter(d => d.putIV && d.putIV > 0);
    if (putPoints.length >= 2) {
      const pts = putPoints.map(d => ({ x: toX(d.strike), y: toY(d.putIV!) }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, PADDING.top + ch);
      drawSmoothLine(ctx, pts);
      ctx.lineTo(pts[pts.length - 1].x, PADDING.top + ch);
      ctx.closePath();
      const putGrad = ctx.createLinearGradient(0, PADDING.top, 0, PADDING.top + ch);
      putGrad.addColorStop(0, 'rgba(248, 113, 113, 0.12)');
      putGrad.addColorStop(0.6, 'rgba(248, 113, 113, 0.03)');
      putGrad.addColorStop(1, 'rgba(248, 113, 113, 0)');
      ctx.fillStyle = putGrad;
      ctx.fill();
      ctx.save();
      ctx.shadowColor = themeColors.putGlow;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      drawSmoothLine(ctx, pts);
      ctx.strokeStyle = themeColors.putIV;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      putPoints.forEach(d => {
        ctx.beginPath();
        ctx.arc(toX(d.strike), toY(d.putIV!), 2, 0, Math.PI * 2);
        ctx.fillStyle = themeColors.putIV;
        ctx.fill();
      });
    }

    // ─── Skew direction annotation ───
    if (bothPoints.length >= 4) {
      const leftPoint = bothPoints[0];
      const rightPoint = bothPoints[bothPoints.length - 1];
      const leftSkew = (leftPoint.putIV || 0) - (leftPoint.callIV || 0);
      const rightSkew = (rightPoint.putIV || 0) - (rightPoint.callIV || 0);
      const avgSkew = (leftSkew + rightSkew) / 2;
      let skewLabel = '';
      let skewColor = '';
      if (leftSkew > rightSkew + 0.005) { skewLabel = 'PUT SKEW'; skewColor = themeColors.putIV; }
      else if (rightSkew > leftSkew + 0.005) { skewLabel = 'CALL SKEW'; skewColor = themeColors.callIV; }
      else if (Math.abs(avgSkew) < 0.005) { skewLabel = 'FLAT SKEW'; skewColor = themeColors.textMid; }
      if (skewLabel) {
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = skewColor;
        ctx.globalAlpha = 0.7;
        ctx.fillText(skewLabel, PADDING.left + cw - 6, PADDING.top + 16);
        ctx.globalAlpha = 1;
      }
    }

    // ─── Crosshair (inside clipped area) ───
    const mouse = mouseRef.current;
    if (mouse && hoveredPoint && hoveredPoint.strike >= minStrike && hoveredPoint.strike <= maxStrike) {
      const hx = toX(hoveredPoint.strike);
      ctx.strokeStyle = themeColors.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, PADDING.top);
      ctx.lineTo(hx, PADDING.top + ch);
      ctx.stroke();
      if (hoveredPoint.callIV && hoveredPoint.callIV > 0) {
        const cy = toY(hoveredPoint.callIV);
        ctx.beginPath(); ctx.moveTo(PADDING.left, cy); ctx.lineTo(PADDING.left + cw, cy); ctx.stroke();
      }
      if (hoveredPoint.putIV && hoveredPoint.putIV > 0) {
        const py = toY(hoveredPoint.putIV);
        ctx.beginPath(); ctx.moveTo(PADDING.left, py); ctx.lineTo(PADDING.left + cw, py); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Highlight circles (clipped)
      if (hoveredPoint.callIV && hoveredPoint.callIV > 0) {
        const cy = toY(hoveredPoint.callIV);
        ctx.beginPath(); ctx.arc(hx, cy, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(52,211,153,0.15)'; ctx.fill();
        ctx.beginPath(); ctx.arc(hx, cy, 5, 0, Math.PI * 2); ctx.strokeStyle = themeColors.callIV; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = themeColors.callIV; ctx.fill();
      }
      if (hoveredPoint.putIV && hoveredPoint.putIV > 0) {
        const py = toY(hoveredPoint.putIV);
        ctx.beginPath(); ctx.arc(hx, py, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(248,113,113,0.15)'; ctx.fill();
        ctx.beginPath(); ctx.arc(hx, py, 5, 0, Math.PI * 2); ctx.strokeStyle = themeColors.putIV; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, py, 2.5, 0, Math.PI * 2); ctx.fillStyle = themeColors.putIV; ctx.fill();
      }
    }

    // ─── Restore from clip — everything below draws outside chart area ───
    ctx.restore();

    // ─── Hover labels (outside clip, on axes) ───
    if (mouse && hoveredPoint && hoveredPoint.strike >= minStrike && hoveredPoint.strike <= maxStrike) {
      const hx = toX(hoveredPoint.strike);

      // Y-axis labels
      if (hoveredPoint.callIV && hoveredPoint.callIV > 0) {
        const cy = toY(hoveredPoint.callIV);
        const lt = `${(hoveredPoint.callIV * 100).toFixed(1)}%`;
        ctx.font = 'bold 9px "SF Mono", Menlo, monospace';
        const tw2 = ctx.measureText(lt).width + 8;
        ctx.fillStyle = themeColors.callIV;
        ctx.beginPath(); ctx.roundRect(PADDING.left - tw2 - 4, cy - 8, tw2, 16, 3); ctx.fill();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center';
        ctx.fillText(lt, PADDING.left - tw2 / 2 - 4, cy + 3.5);
      }
      if (hoveredPoint.putIV && hoveredPoint.putIV > 0) {
        const py = toY(hoveredPoint.putIV);
        const lt = `${(hoveredPoint.putIV * 100).toFixed(1)}%`;
        ctx.font = 'bold 9px "SF Mono", Menlo, monospace';
        const tw2 = ctx.measureText(lt).width + 8;
        ctx.fillStyle = themeColors.putIV;
        ctx.beginPath(); ctx.roundRect(PADDING.left - tw2 - 4, py - 8, tw2, 16, 3); ctx.fill();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center';
        ctx.fillText(lt, PADDING.left - tw2 / 2 - 4, py + 3.5);
      }

      // X-axis label
      const strikeTxt = `$${hoveredPoint.strike.toFixed(0)}`;
      ctx.font = 'bold 9px "SF Mono", Menlo, monospace';
      const stw = ctx.measureText(strikeTxt).width + 10;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(hx - stw / 2, PADDING.top + ch + 2, stw, 16, 3); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center';
      ctx.fillText(strikeTxt, hx, PADDING.top + ch + 13.5);
    }

    // ─── Title + Legend ───
    ctx.fillStyle = themeColors.textBright;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const dteLabel = dte ? ` · ${dte}d` : '';
    ctx.fillText(`${symbol} IV Smile${dteLabel}`, PADDING.left, 28);
    const titleW = ctx.measureText(`${symbol} IV Smile${dteLabel}`).width;
    let legX = PADDING.left + titleW + 20;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = themeColors.callIV;
    ctx.beginPath(); ctx.arc(legX, 24, 3.5, 0, Math.PI * 2); ctx.fill();
    legX += 8; ctx.fillText('Call IV', legX, 28);
    legX += ctx.measureText('Call IV').width + 14;
    ctx.fillStyle = themeColors.putIV;
    ctx.beginPath(); ctx.arc(legX, 24, 3.5, 0, Math.PI * 2); ctx.fill();
    legX += 8; ctx.fillText('Put IV', legX, 28);
    legX += ctx.measureText('Put IV').width + 14;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.5)';
    ctx.fillRect(legX, 20, 14, 8);
    legX += 18; ctx.fillStyle = themeColors.textMid; ctx.fillText('Skew', legX, 28);

    // Axis labels
    ctx.fillStyle = themeColors.text;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Strike Price', PADDING.left + cw / 2, h - 6);
    ctx.save();
    ctx.translate(12, PADDING.top + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Implied Volatility', 0, 0);
    ctx.restore();

    // Zoom hint
    const isZoomed = xZoom || yZoom;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    if (isZoomed) {
      ctx.fillText('scroll=X zoom · ctrl+scroll=Y zoom · double-click=reset', PADDING.left + cw, h - 6);
    } else {
      ctx.fillText('scroll=X zoom · ctrl+scroll=Y zoom', PADDING.left + cw, h - 6);
    }
  }, [validData, dimensions, spotPrice, hoveredPoint, symbol, dte, xZoom, yZoom, themeColors]);

  useEffect(() => { draw(); }, [draw]);

  // ─── Wheel zoom: scroll=X, ctrl+scroll=Y ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || validData.length < 3) return;

    const bounds = boundsRef.current;
    const xDataRange = bounds.xMax - bounds.xMin;
    const yDataRange = bounds.yMax - bounds.yMin;
    if (xDataRange <= 0 || yDataRange <= 0) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const chartW = rect.width - PADDING.left - PADDING.right;
      const chartH = rect.height - PADDING.top - PADDING.bottom;
      const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;

      if (e.ctrlKey || e.metaKey) {
        // ─── Y zoom (IV axis) ───
        setYZoom(prev => {
          const curMin = prev?.min ?? bounds.yMin;
          const curMax = prev?.max ?? bounds.yMax;
          const range = curMax - curMin;

          const normalizedY = (e.clientY - rect.top - PADDING.top) / chartH;
          const cursorIV = curMax - normalizedY * range; // Y is inverted

          const newRange = Math.min(yDataRange * 2, Math.max(yDataRange * 0.05, range * zoomFactor));
          const fraction = Math.max(0, Math.min(1, (cursorIV - curMin) / range));
          let newMin = cursorIV - fraction * newRange;
          let newMax = cursorIV + (1 - fraction) * newRange;

          // Allow zooming out beyond data (up to 2x), but floor at 0
          newMin = Math.max(0, newMin);
          newMax = Math.min(bounds.yMax * 2, newMax);
          if (newMax - newMin < yDataRange * 0.05) return prev;

          // If back to roughly default range, reset
          if (newMin <= bounds.yMin + 0.001 && newMax >= bounds.yMax - 0.001) return null;
          return { min: newMin, max: newMax };
        });
      } else {
        // ─── X zoom (strike axis) ───
        setXZoom(prev => {
          const curMin = prev?.min ?? bounds.xMin;
          const curMax = prev?.max ?? bounds.xMax;
          const range = curMax - curMin;

          const normalizedX = (e.clientX - rect.left - PADDING.left) / chartW;
          const cursorStrike = curMin + normalizedX * range;

          const newRange = Math.min(xDataRange, Math.max(xDataRange * 0.05, range * zoomFactor));
          const fraction = Math.max(0, Math.min(1, (cursorStrike - curMin) / range));
          let newMin = cursorStrike - fraction * newRange;
          let newMax = cursorStrike + (1 - fraction) * newRange;

          if (newMin < bounds.xMin) { newMax += bounds.xMin - newMin; newMin = bounds.xMin; }
          if (newMax > bounds.xMax) { newMin -= newMax - bounds.xMax; newMax = bounds.xMax; }
          newMin = Math.max(bounds.xMin, newMin);
          newMax = Math.min(bounds.xMax, newMax);

          if (newMax - newMin >= xDataRange * 0.98) return null;
          return { min: newMin, max: newMax };
        });
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [validData]);

  // ─── Mouse: hover + pan (both axes) ───
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || validData.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const bounds = boundsRef.current;

    if (panRef.current.active) {
      const chartW = dimensions.width - PADDING.left - PADDING.right;
      const chartH = dimensions.height - PADDING.top - PADDING.bottom;
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;

      // Pan X
      const xRange = panRef.current.xMax - panRef.current.xMin;
      const strikeDelta = -(dx / chartW) * xRange;
      let newXMin = panRef.current.xMin + strikeDelta;
      let newXMax = panRef.current.xMax + strikeDelta;
      if (newXMin < bounds.xMin) { newXMax += bounds.xMin - newXMin; newXMin = bounds.xMin; }
      if (newXMax > bounds.xMax) { newXMin -= newXMax - bounds.xMax; newXMax = bounds.xMax; }
      setXZoom({ min: Math.max(bounds.xMin, newXMin), max: Math.min(bounds.xMax, newXMax) });

      // Pan Y
      const yRange = panRef.current.yMax - panRef.current.yMin;
      const ivDelta = (dy / chartH) * yRange; // inverted Y
      let newYMin = panRef.current.yMin + ivDelta;
      let newYMax = panRef.current.yMax + ivDelta;
      newYMin = Math.max(0, newYMin);
      newYMax = Math.min(bounds.yMax * 2, newYMax);
      setYZoom({ min: newYMin, max: newYMax });
      return;
    }

    // Hover
    const mouseX = e.clientX - rect.left;
    const chartW = dimensions.width - PADDING.left - PADDING.right;
    const minStrike = xZoom?.min ?? bounds.xMin;
    const maxStrike = xZoom?.max ?? bounds.xMax;
    const normalizedX = (mouseX - PADDING.left) / chartW;
    const targetStrike = minStrike + normalizedX * (maxStrike - minStrike);

    let closest: SkewPoint | null = null;
    let minDist = Infinity;
    for (const d of validData) {
      const dist = Math.abs(d.strike - targetStrike);
      if (dist < minDist) { minDist = dist; closest = d; }
    }
    setHoveredPoint(closest);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [validData, dimensions, xZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!xZoom && !yZoom) return;
    const bounds = boundsRef.current;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      xMin: xZoom?.min ?? bounds.xMin,
      xMax: xZoom?.max ?? bounds.xMax,
      yMin: yZoom?.min ?? bounds.yMin,
      yMax: yZoom?.max ?? bounds.yMax,
    };
  }, [xZoom, yZoom]);

  const handleMouseUp = useCallback(() => { panRef.current.active = false; }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    setTooltipPos(null);
    mouseRef.current = null;
    panRef.current.active = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setXZoom(null);
    setYZoom(null);
  }, []);

  const spread = hoveredPoint?.callIV && hoveredPoint?.putIV
    ? ((hoveredPoint.putIV - hoveredPoint.callIV) * 100).toFixed(2)
    : null;

  const isZoomed = !!(xZoom || yZoom);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: panRef.current.active ? 'grabbing' : isZoomed ? 'grab' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />

      {/* Floating tooltip */}
      {hoveredPoint && tooltipPos && !panRef.current.active && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: Math.min(tooltipPos.x + 16, dimensions.width - 200),
            top: Math.max(PADDING.top, Math.min(tooltipPos.y - 40, dimensions.height - 160)),
          }}
        >
          <div className="backdrop-blur-md rounded-xl px-3.5 py-2.5 text-[11px] shadow-2xl shadow-black/40 min-w-[185px] animate-fadeIn"
            style={{ background: `${themeColors.bg}f2`, border: `1px solid ${themeColors.crosshair}` }}>
            <div className="flex items-center justify-between gap-4 mb-2">
              <span className="font-bold" style={{ color: themeColors.textBright }}>${hoveredPoint.strike.toFixed(0)}</span>
              <span className="text-[9px] font-mono" style={{ color: themeColors.text }}>
                {spotPrice > 0 ? `${((hoveredPoint.strike - spotPrice) / spotPrice * 100).toFixed(1)}% from spot` : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: themeColors.callIV }} />
                  <span style={{ color: themeColors.textMid }}>Call IV</span>
                </span>
                <span className="font-mono font-semibold" style={{ color: themeColors.callIV }}>
                  {hoveredPoint.callIV ? `${(hoveredPoint.callIV * 100).toFixed(2)}%` : '---'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: themeColors.putIV }} />
                  <span style={{ color: themeColors.textMid }}>Put IV</span>
                </span>
                <span className="font-mono font-semibold" style={{ color: themeColors.putIV }}>
                  {hoveredPoint.putIV ? `${(hoveredPoint.putIV * 100).toFixed(2)}%` : '---'}
                </span>
              </div>
            </div>
            {spread !== null && (
              <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${themeColors.crosshair}` }}>
                <span style={{ color: themeColors.text }}>Spread</span>
                <span className="font-mono font-semibold" style={{ color: parseFloat(spread) > 0 ? themeColors.putIV : themeColors.callIV }}>
                  {parseFloat(spread) > 0 ? '+' : ''}{spread}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 mt-0.5">
              <span style={{ color: themeColors.text }}>Moneyness</span>
              <span className="font-mono" style={{ color: themeColors.textMid }}>{hoveredPoint.moneyness.toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
