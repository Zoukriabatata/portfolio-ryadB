'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useUIThemeStore, UI_THEMES } from '@/stores/useUIThemeStore';

interface GEXLevel {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
}

interface GEXHeatmapProps {
  gexData: GEXLevel[];
  spotPrice: number;
  symbol: string;
  mode: '2D' | '3D';
  dataType: 'netGEX' | 'netIV';
  height?: number;
}

function useHeatmapColors() {
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  const theme = UI_THEMES.find(t => t.id === activeTheme) || UI_THEMES[0];
  const c = theme.colors;
  return {
    bg: c.chartBg,
    text: c.textMuted,
    textBright: c.textPrimary,
    callColor: c.candleUp,
    putColor: c.candleDown,
    spotColor: c.primary,
    grid: c.chartGrid,
    border: c.border,
  };
}

/** Parse hex color to [r,g,b] in 0-1 range */
function hexToGL(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

/** Generate color based on value (theme-aware) */
function getHeatmapColor(value: number, maxValue: number, callColor: string, putColor: string, alpha: number = 1): string {
  const normalized = Math.max(-1, Math.min(1, value / maxValue));
  const [cr, cg, cb] = hexToGL(normalized >= 0 ? callColor : putColor);
  const intensity = Math.abs(normalized);
  const r = Math.floor((0.15 + cr * intensity * 0.85) * 255);
  const g = Math.floor((0.15 + cg * intensity * 0.85) * 255);
  const b = Math.floor((0.15 + cb * intensity * 0.85) * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function GEXHeatmap({
  gexData,
  spotPrice,
  symbol,
  mode,
  dataType,
  height = 500,
}: GEXHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<import('@/lib/heatmap-webgl/GEX3DRenderer').GEX3DRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [tooltip3D, setTooltip3D] = useState<{ x: number; y: number; strike: number; time: number; value: number } | null>(null);
  const themeColors = useHeatmapColors();

  // Generate time series data from GEX per strike (time-axis is synthetic variation)
  const timeSeriesData = useMemo(() => {
    const timeSteps = 20;
    const data: { strike: number; time: number; value: number }[][] = [];
    for (let t = 0; t < timeSteps; t++) {
      const timeData: { strike: number; time: number; value: number }[] = [];
      gexData.forEach(level => {
        const timeFactor = 1 + Math.sin(t * 0.3) * 0.3;
        const value = dataType === 'netGEX'
          ? level.netGEX * timeFactor
          : (level.callOI + level.putOI) * 0.001 * timeFactor;
        timeData.push({ strike: level.strike, time: t, value });
      });
      data.push(timeData);
    }
    return data;
  }, [gexData, dataType]);

  // Resize
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

  // ═══ 2D CANVAS MODE ═══
  const draw2D = useCallback(() => {
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

    const padding = { top: 50, right: 100, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const timeSteps = timeSeriesData.length;
    const strikes = gexData.map(d => d.strike);

    let maxValue = 0;
    timeSeriesData.forEach(timeData => {
      timeData.forEach(d => { maxValue = Math.max(maxValue, Math.abs(d.value)); });
    });

    const cellWidth = chartWidth / timeSteps;
    const cellHeight = chartHeight / strikes.length;

    // Heatmap cells
    for (let t = 0; t < timeSteps; t++) {
      const timeData = timeSeriesData[t];
      for (let i = 0; i < timeData.length; i++) {
        const { value } = timeData[i];
        const x = padding.left + t * cellWidth;
        const y = padding.top + (strikes.length - 1 - i) * cellHeight;
        ctx.fillStyle = getHeatmapColor(value, maxValue, themeColors.callColor, themeColors.putColor, 0.85);
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);
      }
    }

    // Spot price line
    const spotIndex = strikes.findIndex(s => s >= spotPrice);
    if (spotIndex >= 0) {
      const spotY = padding.top + (strikes.length - 1 - spotIndex) * cellHeight + cellHeight / 2;
      ctx.strokeStyle = themeColors.spotColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, spotY);
      ctx.lineTo(padding.left + chartWidth, spotY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = themeColors.spotColor;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`SPOT $${spotPrice.toFixed(0)}`, padding.left - 5, spotY + 4);
    }

    // Y-axis labels
    ctx.fillStyle = themeColors.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const labelStep = Math.ceil(strikes.length / 15);
    for (let i = 0; i < strikes.length; i += labelStep) {
      const y = padding.top + (strikes.length - 1 - i) * cellHeight + cellHeight / 2;
      ctx.fillText(`$${strikes[i].toFixed(0)}`, padding.left - 10, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    for (let t = 0; t < timeSteps; t += 4) {
      const x = padding.left + t * cellWidth + cellWidth / 2;
      ctx.fillText(`T-${timeSteps - t}`, x, height - padding.bottom + 20);
    }

    // Title
    ctx.fillStyle = themeColors.textBright;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} ${dataType === 'netGEX' ? 'Net GEX' : 'Net IV'} Heatmap`, padding.left, 25);

    // Color legend
    const legendWidth = 20;
    const legendHeight = chartHeight;
    const legendX = width - padding.right + 30;
    const legendY = padding.top;

    const gradient = ctx.createLinearGradient(0, legendY + legendHeight, 0, legendY);
    gradient.addColorStop(0, themeColors.putColor);
    gradient.addColorStop(0.5, themeColors.bg);
    gradient.addColorStop(1, themeColors.callColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

    ctx.fillStyle = themeColors.text;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`+${formatValue(maxValue)}`, legendX + legendWidth + 5, legendY + 10);
    ctx.fillText('0', legendX + legendWidth + 5, legendY + legendHeight / 2 + 4);
    ctx.fillText(`-${formatValue(maxValue)}`, legendX + legendWidth + 5, legendY + legendHeight);
  }, [gexData, dimensions, spotPrice, symbol, dataType, timeSeriesData, themeColors]);

  // ═══ 3D WebGL MODE ═══

  // Initialize / destroy WebGL renderer
  useEffect(() => {
    if (mode !== '3D') {
      // Clean up renderer when switching away from 3D
      if (rendererRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      return;
    }

    const canvas = webglCanvasRef.current;
    if (!canvas || dimensions.width < 10) return;

    // Dynamic import to avoid SSR issues with regl
    let cancelled = false;
    import('@/lib/heatmap-webgl/GEX3DRenderer').then(({ GEX3DRenderer }) => {
      if (cancelled) return;

      const renderer = new GEX3DRenderer({
        canvas,
        width: dimensions.width,
        height: dimensions.height,
        dpr: window.devicePixelRatio,
      });

      // Attach camera controls
      const detach = renderer.camera.attachToCanvas(canvas);

      rendererRef.current = renderer;

      // Animation loop
      const loop = () => {
        if (!rendererRef.current) return;
        rendererRef.current.tick();
        rendererRef.current.render();
        drawOverlay();
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);

      return () => {
        detach();
      };
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [mode, dimensions.width, dimensions.height]);

  // Update renderer colors when theme changes
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setColors({
      callColor: hexToGL(themeColors.callColor),
      putColor: hexToGL(themeColors.putColor),
      zeroColor: [0.12, 0.12, 0.15],
    });
  }, [themeColors]);

  // Feed data to 3D renderer
  useEffect(() => {
    if (mode !== '3D' || !rendererRef.current || gexData.length === 0) return;

    const strikes = gexData.map(d => d.strike);
    const S = strikes.length;
    const T = timeSeriesData.length;

    let maxAbs = 0;
    const values = new Float32Array(S * T);

    for (let t = 0; t < T; t++) {
      const td = timeSeriesData[t];
      for (let s = 0; s < S; s++) {
        const v = td[s]?.value || 0;
        values[t * S + s] = v;
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
    }

    rendererRef.current.updateData({
      strikeLevels: S,
      timeSteps: T,
      values,
      maxAbsValue: maxAbs,
    });
  }, [mode, gexData, timeSeriesData]);

  // Canvas 2D overlay for axis labels in 3D mode
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Title
    ctx.fillStyle = themeColors.textBright;
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} ${dataType === 'netGEX' ? 'Net GEX' : 'Net IV'} Surface (3D WebGL)`, 16, 24);

    // Instructions
    ctx.fillStyle = themeColors.text;
    ctx.font = '10px system-ui';
    ctx.fillText('Drag: rotate \u00b7 Scroll: zoom \u00b7 Right-drag: pan \u00b7 1-5: presets', 16, 42);

    // --- Projected axis labels ---
    if (renderer) {
      const strikes = gexData.map(d => d.strike);
      const S = strikes.length;
      const T = renderer.timeSteps || timeSeriesData.length;

      // Strike labels along X axis (y=0 edge, z=0)
      ctx.font = '9px "Consolas", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      const strikeStep = Math.max(1, Math.ceil(S / 8));
      for (let i = 0; i < S; i += strikeStep) {
        const nx = S > 1 ? i / (S - 1) : 0.5;
        const pt = renderer.projectToScreen(nx, 0, 0);
        if (pt && pt.x > 30 && pt.x < width - 30 && pt.y > 10 && pt.y < height - 5) {
          ctx.fillText(`$${strikes[i].toFixed(0)}`, pt.x, pt.y + 14);
        }
      }

      // Time labels along Y axis (x=0 edge, z=0)
      ctx.textAlign = 'right';
      const timeStep = Math.max(1, Math.ceil(T / 6));
      for (let t = 0; t < T; t += timeStep) {
        const ny = T > 1 ? t / (T - 1) : 0.5;
        const pt = renderer.projectToScreen(0, ny, 0);
        if (pt && pt.x > 5 && pt.x < width - 5 && pt.y > 10 && pt.y < height - 5) {
          ctx.fillText(`T-${T - t}`, pt.x - 8, pt.y + 4);
        }
      }

      // GEX scale labels along Z axis (x=0, y=0)
      // Calculate max absolute GEX for value labels
      let maxAbsGEX = 0;
      for (let t = 0; t < T; t++) {
        const td = timeSeriesData[t];
        for (let s = 0; s < S; s++) {
          maxAbsGEX = Math.max(maxAbsGEX, Math.abs(td[s]?.value || 0));
        }
      }
      ctx.textAlign = 'right';
      const zLabels = [0, 0.15, 0.3, 0.45, 0.6];
      for (const z of zLabels) {
        const pt = renderer.projectToScreen(0, 0, z);
        if (pt && pt.x > 5 && pt.y > 10 && pt.y < height - 5) {
          const gexVal = (z / 0.6) * maxAbsGEX;
          ctx.fillText(formatValue(gexVal), pt.x - 8, pt.y + 4);
        }
      }

      // Axis names
      ctx.font = '10px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';

      const strikeName = renderer.projectToScreen(0.5, 0, 0);
      if (strikeName) {
        ctx.textAlign = 'center';
        ctx.fillText('Strike', strikeName.x, strikeName.y + 28);
      }

      const timeName = renderer.projectToScreen(0, 0.5, 0);
      if (timeName) {
        ctx.textAlign = 'right';
        ctx.fillText('Time', timeName.x - 16, timeName.y + 4);
      }

      const gexName = renderer.projectToScreen(0, 0, 0.3);
      if (gexName) {
        ctx.save();
        ctx.translate(gexName.x - 24, gexName.y);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(dataType === 'netGEX' ? 'GEX' : 'IV', 0, 0);
        ctx.restore();
      }
    }

    // Color legend (bottom)
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = themeColors.callColor;
    ctx.fillText('\u25a0 Positive GEX (Calls)', width / 2 - 80, height - 10);
    ctx.fillStyle = themeColors.putColor;
    ctx.fillText('\u25a0 Negative GEX (Puts)', width / 2 + 80, height - 10);

    // Camera preset buttons (top right)
    ctx.font = '9px system-ui';
    const presets = ['1:Iso', '2:Top', '3:Front', '4:Side', '5:3/4'];
    const btnW = 40, btnH = 18, gap = 4;
    const startX = width - (btnW + gap) * presets.length - 8;
    const startY = 14;
    for (let i = 0; i < presets.length; i++) {
      const x = startX + i * (btnW + gap);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, startY, btnW, btnH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(presets[i], x + btnW / 2, startY + 13);
    }
  }, [dimensions, symbol, dataType, themeColors, gexData, timeSeriesData]);

  // 3D hover tooltip — find nearest grid point
  const handleMouseMove3D = useCallback((e: React.MouseEvent) => {
    const renderer = rendererRef.current;
    if (!renderer || mode !== '3D') { setTooltip3D(null); return; }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const strikes = gexData.map(d => d.strike);
    const S = strikes.length;
    const T = timeSeriesData.length;

    if (S === 0 || T === 0) { setTooltip3D(null); return; }

    // Find max GEX for normalization
    let maxAbs = 0;
    for (let t = 0; t < T; t++) {
      for (let s = 0; s < S; s++) {
        maxAbs = Math.max(maxAbs, Math.abs(timeSeriesData[t][s]?.value || 0));
      }
    }

    let bestDist = Infinity;
    let bestStrike = 0;
    let bestTime = 0;
    let bestValue = 0;
    let bestSx = 0;
    let bestSy = 0;

    for (let t = 0; t < T; t++) {
      for (let s = 0; s < S; s++) {
        const nx = S > 1 ? s / (S - 1) : 0.5;
        const ny = T > 1 ? t / (T - 1) : 0.5;
        const value = timeSeriesData[t][s]?.value || 0;
        const nz = maxAbs > 0 ? (Math.abs(value) / maxAbs) * 0.6 : 0;

        const pt = renderer.projectToScreen(nx, ny, nz);
        if (!pt) continue;

        const dx = pt.x - mx;
        const dy = pt.y - my;
        const dist = dx * dx + dy * dy;

        if (dist < bestDist) {
          bestDist = dist;
          bestStrike = strikes[s];
          bestTime = T - t;
          bestValue = value;
          bestSx = pt.x;
          bestSy = pt.y;
        }
      }
    }

    if (bestDist < 2500) {
      setTooltip3D({ x: bestSx, y: bestSy, strike: bestStrike, time: bestTime, value: bestValue });
    } else {
      setTooltip3D(null);
    }
  }, [mode, gexData, timeSeriesData]);

  const handleMouseLeave3D = useCallback(() => setTooltip3D(null), []);

  // Draw 2D mode
  useEffect(() => {
    if (mode === '2D') draw2D();
  }, [mode, draw2D]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}
      onMouseMove={mode === '3D' ? handleMouseMove3D : undefined}
      onMouseLeave={mode === '3D' ? handleMouseLeave3D : undefined}>
      {/* 2D Canvas (visible when mode=2D) */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: mode === '2D' ? 'block' : 'none' }}
      />

      {/* 3D WebGL canvas (visible when mode=3D) */}
      <canvas
        ref={webglCanvasRef}
        className="w-full h-full"
        style={{ display: mode === '3D' ? 'block' : 'none' }}
      />

      {/* 3D overlay for labels (visible when mode=3D) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: mode === '3D' ? 'block' : 'none' }}
      />

      {/* 3D hover tooltip */}
      {mode === '3D' && tooltip3D && (
        <div
          className="absolute z-30 pointer-events-none animate-fadeIn"
          style={{
            left: tooltip3D.x + 14,
            top: tooltip3D.y - 54,
            background: 'rgba(10,10,20,0.92)',
            border: `1px solid ${tooltip3D.value >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 8,
            padding: '6px 10px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="text-[10px] font-mono space-y-0.5">
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>
              Strike: <span style={{ color: themeColors.spotColor }}>${tooltip3D.strike.toFixed(0)}</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>
              Time: <span style={{ color: '#a78bfa' }}>T-{tooltip3D.time}</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)' }}>
              {dataType === 'netGEX' ? 'GEX' : 'IV'}:{' '}
              <span style={{ color: tooltip3D.value >= 0 ? themeColors.callColor : themeColors.putColor, fontWeight: 600 }}>
                {tooltip3D.value >= 0 ? '+' : ''}{formatValue(tooltip3D.value)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(1);
}
