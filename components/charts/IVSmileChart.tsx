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

function useSmileColors() {
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  const theme = UI_THEMES.find(t => t.id === activeTheme) || UI_THEMES[0];
  const c = theme.colors;
  return {
    bg: c.chartBg,
    gridLine: `${c.chartGrid}28`,
    gridBand: `${c.chartGrid}0c`,
    text: c.textMuted,
    textMid: c.textSecondary,
    textBright: c.textPrimary,
    callIV: '#34d399',          // emerald green — calls
    putIV: '#f87171',           // rose red — puts
    atm: '#26beaf',             // teal — ATM / tradytics accent
    spot: '#26beaf',
    crosshair: `${c.textPrimary}22`,
    panelSep: 'rgba(255,255,255,0.07)',
  };
}

// Chart layout constants
const PAD = { top: 48, right: 20, bottom: 40, left: 60 };
const SPREAD_H = 68;   // height of the skew-spread sub-panel
const PANEL_GAP = 24;  // gap between main bars and spread panel

export default function IVSmileChart({
  data, spotPrice, symbol, dte, height = 420,
}: IVSmileChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const C = useSmileColors();
  const [dimensions, setDimensions] = useState({ width: 900, height });
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<SkewPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [xZoom, setXZoom] = useState<{ min: number; max: number } | null>(null);
  const panRef = useRef({ active: false, startX: 0, xMin: 0, xMax: 0 });

  useEffect(() => { setXZoom(null); }, [data.length, symbol]);

  const validData = data.filter(d => (d.callIV && d.callIV > 0) || (d.putIV && d.putIV > 0));

  const boundsRef = useRef({ xMin: 0, xMax: 0, yMax: 0 });
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
      yMax: allIVs.length > 0 ? Math.max(...allIVs) * 1.22 : 1,
    };
  }

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || validData.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: H } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const cw = width - PAD.left - PAD.right;
    const totalInner = H - PAD.top - PAD.bottom;
    // Main chart takes top portion, spread panel takes bottom
    const mainH = totalInner - SPREAD_H - PANEL_GAP;
    const spreadTop = PAD.top + mainH + PANEL_GAP;

    const bounds = boundsRef.current;
    const minStrike = xZoom?.min ?? bounds.xMin;
    const maxStrike = xZoom?.max ?? bounds.xMax;
    const strikeRange = maxStrike - minStrike;
    if (strikeRange <= 0) return;

    const ivMax = bounds.yMax;
    const toX = (s: number) => PAD.left + ((s - minStrike) / strikeRange) * cw;
    const toY = (iv: number) => PAD.top + (1 - iv / ivMax) * mainH;   // main chart Y
    const baselineY = PAD.top + mainH;

    const visible = validData.filter(d => d.strike >= minStrike && d.strike <= maxStrike);
    if (visible.length < 2) return;

    // Bar geometry
    const strideX = visible.length > 1 ? cw / (visible.length - 1) : cw;
    const halfW = Math.max(3, Math.min(28, strideX * 0.48));
    const G = 1.5; // gap between call and put bar

    // Spread data
    const spreadVals = visible.map(d => {
      if (d.callIV && d.putIV) return d.putIV - d.callIV;
      return null;
    });
    const spreadAbsMax = Math.max(0.001, ...spreadVals.filter(Boolean).map(v => Math.abs(v!)));

    // ─── Background ───
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, width, H);

    // ─── MAIN CHART ───
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, cw, mainH);
    ctx.clip();

    // Grid bands
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        const y0 = PAD.top + (mainH * i) / 5;
        const y1 = PAD.top + (mainH * (i + 1)) / 5;
        ctx.fillStyle = C.gridBand;
        ctx.fillRect(PAD.left, y0, cw, y1 - y0);
      }
    }

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = PAD.top + (mainH * i) / 5;
      ctx.strokeStyle = C.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cw, y); ctx.stroke();
    }

    // ATM strike: find closest strike to spot
    const atmStrikeInView = spotPrice > 0
      ? visible.reduce((c, d) => Math.abs(d.strike - spotPrice) < Math.abs(c.strike - spotPrice) ? d : c, visible[0])
      : null;

    // ATM column highlight
    if (atmStrikeInView) {
      const ax = toX(atmStrikeInView.strike);
      const atmW = Math.max(halfW * 2 + G + 12, 32);
      ctx.fillStyle = `${C.atm}18`;
      ctx.fillRect(ax - atmW / 2, PAD.top, atmW, mainH);
    }

    // Spot vertical line
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const sx = toX(spotPrice);
      ctx.strokeStyle = C.spot;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(sx, PAD.top); ctx.lineTo(sx, PAD.top + mainH); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Smile connector (dashed line over bar tops)
    const callPts = visible.filter(d => d.callIV && d.callIV > 0);
    const putPts = visible.filter(d => d.putIV && d.putIV > 0);
    if (callPts.length >= 2) {
      ctx.beginPath();
      callPts.forEach((d, i) => {
        const x = toX(d.strike) - G / 2 - halfW * 0.5;
        const y = toY(d.callIV!);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = `${C.callIV}55`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (putPts.length >= 2) {
      ctx.beginPath();
      putPts.forEach((d, i) => {
        const x = toX(d.strike) + G / 2 + halfW * 0.5;
        const y = toY(d.putIV!);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = `${C.putIV}55`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── Bars ───
    visible.forEach(d => {
      const cx = toX(d.strike);
      const isHov = hoveredPoint?.strike === d.strike;
      const isATM = atmStrikeInView?.strike === d.strike;

      // Call bar (left)
      if (d.callIV && d.callIV > 0) {
        const ty = toY(d.callIV);
        const bh = baselineY - ty;
        if (bh > 0) {
          const x = cx - halfW - G / 2;
          const g = ctx.createLinearGradient(0, ty, 0, baselineY);
          g.addColorStop(0, isHov || isATM ? C.callIV : `${C.callIV}dd`);
          g.addColorStop(1, `${C.callIV}22`);
          ctx.fillStyle = g;
          ctx.fillRect(x, ty, halfW, bh);
          if (isHov) {
            ctx.strokeStyle = C.callIV;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, ty, halfW, bh);
          }
        }
      }

      // Put bar (right)
      if (d.putIV && d.putIV > 0) {
        const ty = toY(d.putIV);
        const bh = baselineY - ty;
        if (bh > 0) {
          const x = cx + G / 2;
          const g = ctx.createLinearGradient(0, ty, 0, baselineY);
          g.addColorStop(0, isHov || isATM ? C.putIV : `${C.putIV}dd`);
          g.addColorStop(1, `${C.putIV}22`);
          ctx.fillStyle = g;
          ctx.fillRect(x, ty, halfW, bh);
          if (isHov) {
            ctx.strokeStyle = C.putIV;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, ty, halfW, bh);
          }
        }
      }
    });

    // Crosshair
    const mouse = mouseRef.current;
    if (mouse && hoveredPoint && hoveredPoint.strike >= minStrike && hoveredPoint.strike <= maxStrike) {
      const hx = toX(hoveredPoint.strike);
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, PAD.top); ctx.lineTo(hx, PAD.top + mainH); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // end main clip

    // ─── Y AXIS LABELS (outside clip) ───
    ctx.font = '9.5px "SF Mono", Menlo, monospace';
    for (let i = 0; i <= 5; i++) {
      const iv = (ivMax * i) / 5;
      const y = PAD.top + (1 - i / 5) * mainH;
      ctx.fillStyle = C.text;
      ctx.textAlign = 'right';
      ctx.fillText(`${(iv * 100).toFixed(0)}%`, PAD.left - 7, y + 3.5);
    }

    // ─── X AXIS LABELS ───
    const numVLines = Math.min(12, visible.length);
    const vStep = Math.max(1, Math.floor(visible.length / numVLines));
    ctx.textAlign = 'center';
    for (let i = 0; i < visible.length; i += vStep) {
      const d = visible[i];
      const x = toX(d.strike);
      const pct = spotPrice > 0 ? ((d.strike - spotPrice) / spotPrice * 100) : null;
      const isZero = pct !== null && Math.abs(pct) < 0.3;
      ctx.font = isZero ? 'bold 9px system-ui' : '9px system-ui';
      ctx.fillStyle = isZero ? C.atm : C.text;
      ctx.fillText(`$${d.strike.toFixed(0)}`, x, spreadTop + SPREAD_H + 16);
      if (pct !== null) {
        ctx.fillStyle = pct > 0 ? `${C.callIV}99` : pct < 0 ? `${C.putIV}99` : C.atm;
        ctx.font = '8px system-ui';
        ctx.fillText(isZero ? 'ATM' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, x, PAD.top - 10);
      }
    }

    // ─── Spot label on top ───
    if (spotPrice >= minStrike && spotPrice <= maxStrike) {
      const sx = toX(spotPrice);
      const lt = `SPOT $${spotPrice.toFixed(0)}`;
      ctx.font = 'bold 8.5px system-ui';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(lt).width + 10;
      ctx.fillStyle = C.atm;
      ctx.beginPath(); ctx.roundRect(sx - tw / 2, PAD.top - 2, tw, 14, 3); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.fillText(lt, sx, PAD.top + 9.5);
    }

    // ─── ATM label ───
    if (atmStrikeInView) {
      const ax = toX(atmStrikeInView.strike);
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = `${C.atm}cc`;
      ctx.fillText('▼', ax, PAD.top + mainH + 8);
    }

    // ─── SPREAD PANEL ───
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, spreadTop, cw, SPREAD_H);
    ctx.clip();

    // Panel background: neutral dark overlay, no color tint
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(PAD.left, spreadTop, cw, SPREAD_H);

    // Zero line
    const zeroY = spreadTop + SPREAD_H / 2;
    ctx.strokeStyle = C.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(PAD.left + cw, zeroY); ctx.stroke();

    // Spread bars
    const spreadBarW = Math.max(3, Math.min(30, strideX * 0.6));
    visible.forEach((d, i) => {
      const sv = spreadVals[i];
      if (sv === null) return;
      const cx = toX(d.strike);
      const barH = Math.abs(sv) / spreadAbsMax * (SPREAD_H / 2 - 6);
      const isPos = sv > 0; // put premium
      const y = isPos ? zeroY - barH : zeroY;
      const g = ctx.createLinearGradient(0, y, 0, y + barH);
      if (isPos) {
        g.addColorStop(0, `${C.putIV}cc`);
        g.addColorStop(1, `${C.putIV}22`);
      } else {
        g.addColorStop(0, `${C.callIV}cc`);
        g.addColorStop(1, `${C.callIV}22`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(cx - spreadBarW / 2, y, spreadBarW, barH);
    });

    ctx.restore(); // end spread clip

    // Separator line between main and spread
    ctx.strokeStyle = C.panelSep;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, spreadTop - 1); ctx.lineTo(PAD.left + cw, spreadTop - 1); ctx.stroke();

    // Spread panel label
    ctx.fillStyle = C.text;
    ctx.font = '8.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SKEW SPREAD  (put IV − call IV)', PAD.left + 2, spreadTop + 11);

    // Spread Y labels
    ctx.font = '8px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = `${C.putIV}99`;
    ctx.fillText(`+${(spreadAbsMax * 100).toFixed(1)}%`, PAD.left - 5, spreadTop + 10);
    ctx.fillStyle = `${C.callIV}99`;
    ctx.fillText(`−${(spreadAbsMax * 100).toFixed(1)}%`, PAD.left - 5, spreadTop + SPREAD_H - 4);
    ctx.fillStyle = C.text;
    ctx.fillText('0', PAD.left - 5, zeroY + 3);

    // ─── Hover Y-axis labels ───
    if (mouse && hoveredPoint && hoveredPoint.strike >= minStrike && hoveredPoint.strike <= maxStrike) {
      const hx = toX(hoveredPoint.strike);
      if (hoveredPoint.callIV && hoveredPoint.callIV > 0) {
        const cy = toY(hoveredPoint.callIV);
        const lt = `${(hoveredPoint.callIV * 100).toFixed(1)}%`;
        ctx.font = 'bold 8.5px "SF Mono", Menlo, monospace';
        const tw = ctx.measureText(lt).width + 8;
        ctx.fillStyle = C.callIV;
        ctx.beginPath(); ctx.roundRect(PAD.left - tw - 4, cy - 8, tw, 16, 3); ctx.fill();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center';
        ctx.fillText(lt, PAD.left - tw / 2 - 4, cy + 4);
      }
      if (hoveredPoint.putIV && hoveredPoint.putIV > 0) {
        const py = toY(hoveredPoint.putIV);
        const lt = `${(hoveredPoint.putIV * 100).toFixed(1)}%`;
        ctx.font = 'bold 8.5px "SF Mono", Menlo, monospace';
        const tw = ctx.measureText(lt).width + 8;
        ctx.fillStyle = C.putIV;
        ctx.beginPath(); ctx.roundRect(PAD.left - tw - 4, py - 8, tw, 16, 3); ctx.fill();
        ctx.fillStyle = '#000'; ctx.textAlign = 'center';
        ctx.fillText(lt, PAD.left - tw / 2 - 4, py + 4);
      }
      // X label below spread panel
      const lt = `$${hoveredPoint.strike.toFixed(0)}`;
      ctx.font = 'bold 9px "SF Mono"';
      const tw = ctx.measureText(lt).width + 10;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(hx - tw / 2, spreadTop + SPREAD_H + 2, tw, 14, 3); ctx.fill();
      ctx.fillStyle = '#000'; ctx.textAlign = 'center';
      ctx.fillText(lt, hx, spreadTop + SPREAD_H + 13);
    }

    // ─── Title + Legend ───
    ctx.fillStyle = C.textBright;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    const dteStr = dte ? `  ·  ${dte}d` : '';
    const title = `${symbol}  IV Skew${dteStr}`;
    ctx.fillText(title, PAD.left, 30);
    // legend
    let lx = PAD.left + ctx.measureText(title).width + 22;
    ctx.font = '10px system-ui';
    ctx.fillStyle = `${C.callIV}cc`;
    ctx.fillRect(lx, 20, 10, 12);
    lx += 13; ctx.fillStyle = C.textMid; ctx.fillText('Call IV', lx, 30);
    lx += ctx.measureText('Call IV').width + 14;
    ctx.fillStyle = `${C.putIV}cc`;
    ctx.fillRect(lx, 20, 10, 12);
    lx += 13; ctx.fillStyle = C.textMid; ctx.fillText('Put IV', lx, 30);

    // Zoom hint
    if (xZoom) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('scroll=zoom · drag=pan · dbl-click=reset', PAD.left + cw, 30);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('scroll=zoom · drag=pan', PAD.left + cw, 30);
    }
  }, [validData, dimensions, spotPrice, hoveredPoint, symbol, dte, xZoom, C]);

  useEffect(() => { draw(); }, [draw]);

  // ─── Wheel zoom (X only) ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || validData.length < 3) return;
    const bounds = boundsRef.current;
    const xRange = bounds.xMax - bounds.xMin;
    if (xRange <= 0) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const chartW = rect.width - PAD.left - PAD.right;
      const zf = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setXZoom(prev => {
        const curMin = prev?.min ?? bounds.xMin;
        const curMax = prev?.max ?? bounds.xMax;
        const range = curMax - curMin;
        const nx = (e.clientX - rect.left - PAD.left) / chartW;
        const cursor = curMin + nx * range;
        const nr = Math.min(xRange, Math.max(xRange * 0.05, range * zf));
        const frac = Math.max(0, Math.min(1, (cursor - curMin) / range));
        let nMin = cursor - frac * nr;
        let nMax = cursor + (1 - frac) * nr;
        if (nMin < bounds.xMin) { nMax += bounds.xMin - nMin; nMin = bounds.xMin; }
        if (nMax > bounds.xMax) { nMin -= nMax - bounds.xMax; nMax = bounds.xMax; }
        nMin = Math.max(bounds.xMin, nMin);
        nMax = Math.min(bounds.xMax, nMax);
        if (nMax - nMin >= xRange * 0.98) return null;
        return { min: nMin, max: nMax };
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [validData]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const bounds = boundsRef.current;

    if (panRef.current.active) {
      const chartW = dimensions.width - PAD.left - PAD.right;
      const dx = e.clientX - panRef.current.startX;
      const range = panRef.current.xMax - panRef.current.xMin;
      const delta = -(dx / chartW) * range;
      let nMin = panRef.current.xMin + delta;
      let nMax = panRef.current.xMax + delta;
      if (nMin < bounds.xMin) { nMax += bounds.xMin - nMin; nMin = bounds.xMin; }
      if (nMax > bounds.xMax) { nMin -= nMax - bounds.xMax; nMax = bounds.xMax; }
      setXZoom({ min: Math.max(bounds.xMin, nMin), max: Math.min(bounds.xMax, nMax) });
      return;
    }

    const mx = e.clientX - rect.left;
    const chartW = dimensions.width - PAD.left - PAD.right;
    const minS = xZoom?.min ?? bounds.xMin;
    const maxS = xZoom?.max ?? bounds.xMax;
    const target = minS + ((mx - PAD.left) / chartW) * (maxS - minS);
    let closest: SkewPoint | null = null;
    let minDist = Infinity;
    for (const d of validData) {
      const dist = Math.abs(d.strike - target);
      if (dist < minDist) { minDist = dist; closest = d; }
    }
    setHoveredPoint(closest);
    setTooltipPos({ x: mx, y: e.clientY - rect.top });
  }, [validData, dimensions, xZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const bounds = boundsRef.current;
    panRef.current = {
      active: true,
      startX: e.clientX,
      xMin: xZoom?.min ?? bounds.xMin,
      xMax: xZoom?.max ?? bounds.xMax,
    };
    setIsPanning(true);
  }, [xZoom]);

  const handleMouseUp = useCallback(() => { panRef.current.active = false; setIsPanning(false); }, []);
  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null); setTooltipPos(null); mouseRef.current = null;
    panRef.current.active = false; setIsPanning(false);
  }, []);
  const handleDoubleClick = useCallback(() => setXZoom(null), []);

  const spread = hoveredPoint?.callIV && hoveredPoint?.putIV
    ? ((hoveredPoint.putIV - hoveredPoint.callIV) * 100).toFixed(2)
    : null;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: isPanning ? 'grabbing' : xZoom ? 'grab' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />

      {/* Tooltip */}
      {hoveredPoint && tooltipPos && !isPanning && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: Math.min(tooltipPos.x + 16, dimensions.width - 210),
            top: Math.max(PAD.top, Math.min(tooltipPos.y - 40, dimensions.height - 180)),
          }}
        >
          <div
            className="rounded-xl px-4 py-3 text-[11px] shadow-2xl min-w-[195px]"
            style={{
              background: `${C.bg}f8`,
              border: `1px solid ${C.crosshair}`,
              backdropFilter: 'blur(16px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-bold text-[13px]" style={{ color: C.textBright }}>
                ${hoveredPoint.strike.toFixed(0)}
              </span>
              {spotPrice > 0 && (
                <span
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: C.text,
                    border: `1px solid ${C.crosshair}`,
                  }}
                >
                  {hoveredPoint.strike > spotPrice ? '+' : ''}
                  {((hoveredPoint.strike - spotPrice) / spotPrice * 100).toFixed(1)}%
                </span>
              )}
            </div>

            {/* Call / Put rows */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: C.textMid }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${C.callIV}cc` }} />
                  Call IV
                </span>
                <span className="font-mono font-bold" style={{ color: C.callIV }}>
                  {hoveredPoint.callIV ? `${(hoveredPoint.callIV * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ color: C.textMid }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${C.putIV}cc` }} />
                  Put IV
                </span>
                <span className="font-mono font-bold" style={{ color: C.putIV }}>
                  {hoveredPoint.putIV ? `${(hoveredPoint.putIV * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
            </div>

            {/* Spread */}
            {spread !== null && (
              <div
                className="flex items-center justify-between mt-2 pt-2"
                style={{ borderTop: `1px solid ${C.crosshair}` }}
              >
                <span style={{ color: C.text }}>Put−Call Spread</span>
                <span
                  className="font-mono font-semibold"
                  style={{ color: parseFloat(spread) > 0 ? C.putIV : C.callIV }}
                >
                  {parseFloat(spread) > 0 ? '+' : ''}{spread}%
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: C.text }}>Moneyness</span>
              <span className="font-mono text-[10px]" style={{ color: C.textMid }}>
                {hoveredPoint.moneyness.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Reset zoom */}
      {xZoom && (
        <button
          onClick={handleDoubleClick}
          className="absolute bottom-16 right-4 px-2.5 py-1 text-[10px] rounded-lg transition-all hover:scale-105 active:scale-95"
          style={{ background: 'rgba(38,190,175,0.15)', border: '1px solid rgba(38,190,175,0.35)', color: '#26beaf' }}
        >
          Reset zoom
        </button>
      )}
    </div>
  );
}
