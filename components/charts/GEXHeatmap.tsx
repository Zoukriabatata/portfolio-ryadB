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
  const themeColors = useHeatmapColors();

  // Generate time series data (simulated historical GEX over time)
  const timeSeriesData = useMemo(() => {
    const timeSteps = 20;
    const data: { strike: number; time: number; value: number }[][] = [];
    for (let t = 0; t < timeSteps; t++) {
      const timeData: { strike: number; time: number; value: number }[] = [];
      gexData.forEach(level => {
        const timeFactor = 1 + Math.sin(t * 0.3) * 0.3 + (Math.random() - 0.5) * 0.2;
        const value = dataType === 'netGEX'
          ? level.netGEX * timeFactor
          : (level.callOI + level.putOI) * 0.001 * timeFactor;
        timeData.push({ strike: level.strike, time: t, value });
      });
      data.push(timeData);
    }
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gexData.length, dataType]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    ctx.fillText('Drag: rotate · Scroll: zoom · Right-drag: pan · 1-5: presets', 16, 42);

    // Axis legend (bottom)
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = themeColors.callColor;
    ctx.fillText('■ Positive GEX (Calls)', width / 2 - 80, height - 10);
    ctx.fillStyle = themeColors.putColor;
    ctx.fillText('■ Negative GEX (Puts)', width / 2 + 80, height - 10);
  }, [dimensions, symbol, dataType, themeColors]);

  // Draw 2D mode
  useEffect(() => {
    if (mode === '2D') draw2D();
  }, [mode, draw2D]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
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
