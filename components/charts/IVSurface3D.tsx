'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface IVSurfaceData {
  strike: number;
  expiration: number;
  iv: number;
}

interface IVSurface3DProps {
  symbol: string;
  spotPrice: number;
  surfaceData?: IVSurfaceData[];
  height?: number;
}

// Generate simulated IV surface data
function generateSurfaceData(spotPrice: number): IVSurfaceData[] {
  const data: IVSurfaceData[] = [];
  const strikes = [];
  const expirations = [7, 14, 30, 60, 90, 180, 365];

  for (let i = -10; i <= 10; i++) {
    strikes.push(spotPrice * (1 + i * 0.02));
  }

  for (const exp of expirations) {
    for (const strike of strikes) {
      const moneyness = Math.log(strike / spotPrice);
      const atmIV = 0.20 + Math.random() * 0.05;
      const smileEffect = Math.abs(moneyness) * 0.3;
      const termStructure = Math.sqrt(exp / 365) * 0.1;
      const iv = atmIV + smileEffect + termStructure * (Math.random() - 0.5);

      data.push({
        strike,
        expiration: exp,
        iv: Math.max(0.05, Math.min(1.0, iv)),
      });
    }
  }

  return data;
}

export default function IVSurface3D({
  symbol,
  spotPrice,
  surfaceData,
  height = 450,
}: IVSurface3DProps) {
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<import('@/lib/heatmap-webgl/IVSurface3DRenderer').IVSurface3DRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  const [dimensions, setDimensions] = useState({ width: 800, height });

  const data = useMemo(() => surfaceData || generateSurfaceData(spotPrice || 450), [surfaceData, spotPrice]);

  // Precompute unique strikes and expirations
  const { strikes, expirations } = useMemo(() => {
    const s = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
    const e = [...new Set(data.map(d => d.expiration))].sort((a, b) => a - b);
    return { strikes: s, expirations: e };
  }, [data]);

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

  // Draw overlay (axis labels, title, legend)
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const { width, height: h } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} IV Surface (3D WebGL)`, 16, 24);

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '10px system-ui';
    ctx.fillText('Drag: rotate \u00b7 Scroll: zoom \u00b7 Right-drag: pan \u00b7 1-5: presets', 16, 42);

    // --- Axis labels projected from 3D ---

    const S = strikes.length;
    const E = expirations.length;

    // Strike labels along X (y=0 edge, z=0)
    ctx.font = '9px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const strikeStep = Math.max(1, Math.ceil(S / 8));
    for (let i = 0; i < S; i += strikeStep) {
      const nx = i / (S - 1);
      const pt = renderer.projectToScreen(nx, 0, 0);
      if (pt && pt.x > 30 && pt.x < width - 30 && pt.y > 10 && pt.y < h - 5) {
        ctx.fillText(`$${strikes[i].toFixed(0)}`, pt.x, pt.y + 14);
      }
    }

    // Expiration labels along Y (x=0 edge, z=0)
    ctx.textAlign = 'right';
    for (let j = 0; j < E; j++) {
      const ny = j / (E - 1);
      const pt = renderer.projectToScreen(0, ny, 0);
      if (pt && pt.x > 5 && pt.x < width - 5 && pt.y > 10 && pt.y < h - 5) {
        ctx.fillText(`${expirations[j]}d`, pt.x - 8, pt.y + 4);
      }
    }

    // IV scale labels along Z (x=0, y=0 edge)
    ctx.textAlign = 'right';
    const ivSteps = [0, 0.25, 0.5, 0.75, 1.0];
    for (const t of ivSteps) {
      const pt = renderer.projectToScreen(0, 0, t * 0.6); // heightScale = 0.6
      if (pt && pt.x > 5 && pt.y > 10 && pt.y < h - 5) {
        // Map back to actual IV range
        let minIV = Infinity, maxIV = -Infinity;
        for (const d of data) {
          if (d.iv < minIV) minIV = d.iv;
          if (d.iv > maxIV) maxIV = d.iv;
        }
        const ivVal = minIV + t * (maxIV - minIV);
        ctx.fillText(`${(ivVal * 100).toFixed(0)}%`, pt.x - 8, pt.y + 4);
      }
    }

    // Axis names
    ctx.font = '10px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';

    const strikeLabel = renderer.projectToScreen(0.5, 0, 0);
    if (strikeLabel) {
      ctx.textAlign = 'center';
      ctx.fillText('Strike', strikeLabel.x, strikeLabel.y + 28);
    }

    const expiryLabel = renderer.projectToScreen(0, 0.5, 0);
    if (expiryLabel) {
      ctx.textAlign = 'right';
      ctx.fillText('Expiry', expiryLabel.x - 16, expiryLabel.y + 4);
    }

    const ivLabel = renderer.projectToScreen(0, 0, 0.6 * 0.5);
    if (ivLabel) {
      ctx.save();
      ctx.translate(ivLabel.x - 24, ivLabel.y);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('IV', 0, 0);
      ctx.restore();
    }

    // Color legend (right side)
    const legendX = width - 50;
    const legendY = 60;
    const legendH = 150;

    const rampColors = [
      [0.1, 0.2, 0.6],    // blue (low)
      [0.05, 0.55, 0.55],
      [0.13, 0.77, 0.37],  // green
      [0.95, 0.75, 0.1],   // yellow
      [0.95, 0.2, 0.15],   // red (high)
    ];

    for (let i = 0; i < legendH; i++) {
      const t = 1 - i / legendH;
      // Interpolate through ramp
      const segIdx = Math.min(3, Math.floor(t * 4));
      const segT = (t * 4) - segIdx;
      const c1 = rampColors[segIdx];
      const c2 = rampColors[segIdx + 1];
      const r = Math.floor((c1[0] + (c2[0] - c1[0]) * segT) * 255);
      const g = Math.floor((c1[1] + (c2[1] - c1[1]) * segT) * 255);
      const b = Math.floor((c1[2] + (c2[2] - c1[2]) * segT) * 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(legendX, legendY + i, 16, 2);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('High IV', legendX + 20, legendY + 8);
    ctx.fillText('Low IV', legendX + 20, legendY + legendH);
  }, [dimensions, symbol, strikes, expirations, data]);

  // Initialize WebGL renderer
  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas || dimensions.width < 10) return;

    let cancelled = false;
    import('@/lib/heatmap-webgl/IVSurface3DRenderer').then(({ IVSurface3DRenderer }) => {
      if (cancelled) return;

      const renderer = new IVSurface3DRenderer({
        canvas,
        width: dimensions.width,
        height: dimensions.height,
        dpr: window.devicePixelRatio,
      });

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
  }, [dimensions.width, dimensions.height]);

  // Feed IV data to renderer
  useEffect(() => {
    if (!rendererRef.current || data.length === 0) return;

    const S = strikes.length;
    const E = expirations.length;

    let minIV = Infinity, maxIV = -Infinity;
    const values = new Float32Array(S * E);

    // Build lookup
    const ivMap = new Map<string, number>();
    for (const d of data) {
      ivMap.set(`${d.strike}_${d.expiration}`, d.iv);
      if (d.iv < minIV) minIV = d.iv;
      if (d.iv > maxIV) maxIV = d.iv;
    }

    for (let e = 0; e < E; e++) {
      for (let s = 0; s < S; s++) {
        const key = `${strikes[s]}_${expirations[e]}`;
        values[e * S + s] = ivMap.get(key) || 0;
      }
    }

    rendererRef.current.updateData({
      strikeLevels: S,
      expirySteps: E,
      values,
      minIV,
      maxIV,
    });
  }, [data, strikes, expirations]);

  // Keyboard presets
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!rendererRef.current) return;
      const presets: Record<string, string> = { '1': 'isometric', '2': 'top', '3': 'front', '4': 'side', '5': 'overview' };
      const preset = presets[e.key];
      if (preset) rendererRef.current.camera.goToPreset(preset);
      if (e.key.toLowerCase() === 'r') rendererRef.current.camera.reset();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={webglCanvasRef}
        className="w-full h-full"
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </div>
  );
}
