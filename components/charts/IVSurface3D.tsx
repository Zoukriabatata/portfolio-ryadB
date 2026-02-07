'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
  const expirations = [7, 14, 30, 60, 90, 180, 365]; // Days to expiration

  // Generate strikes around spot price
  for (let i = -10; i <= 10; i++) {
    strikes.push(spotPrice * (1 + i * 0.02));
  }

  // Generate IV surface with smile effect
  for (const exp of expirations) {
    for (const strike of strikes) {
      const moneyness = Math.log(strike / spotPrice);
      // IV smile: higher IV for OTM options, lower for ATM
      const atmIV = 0.20 + Math.random() * 0.05; // Base ATM IV
      const smileEffect = Math.abs(moneyness) * 0.3; // Smile curvature
      const termStructure = Math.sqrt(exp / 365) * 0.1; // Term structure
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [rotation, setRotation] = useState({ x: -25, y: 35 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>(0);

  // Generate data if not provided
  const data = surfaceData || generateSurfaceData(spotPrice || 450);

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

  // 3D projection
  const project = useCallback((x: number, y: number, z: number) => {
    const { width, height: h } = dimensions;
    const rotX = (rotation.x * Math.PI) / 180;
    const rotY = (rotation.y * Math.PI) / 180;

    // Rotate around X axis
    const y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
    const z1 = y * Math.sin(rotX) + z * Math.cos(rotX);

    // Rotate around Y axis
    const x2 = x * Math.cos(rotY) + z1 * Math.sin(rotY);
    const z2 = -x * Math.sin(rotY) + z1 * Math.cos(rotY);

    // Perspective projection
    const perspective = 800;
    const scale = perspective / (perspective + z2 + 200);

    return {
      x: width / 2 + x2 * scale * 150,
      y: h / 2 - y1 * scale * 150,
      z: z2,
      scale,
    };
  }, [dimensions, rotation]);

  // Get color based on IV value
  const getIVColor = (iv: number) => {
    const normalized = (iv - 0.1) / 0.5; // Normalize between 0.1 and 0.6
    const r = Math.round(255 * Math.min(1, normalized * 2));
    const g = Math.round(255 * Math.min(1, (1 - normalized) * 2));
    const b = Math.round(100 * (1 - normalized));
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Draw surface
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: h } = dimensions;
    ctx.clearRect(0, 0, width, h);

    // Background
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, width, h);

    // Get unique strikes and expirations
    const strikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
    const expirations = [...new Set(data.map(d => d.expiration))].sort((a, b) => a - b);

    // Normalize ranges
    const minStrike = strikes[0];
    const maxStrike = strikes[strikes.length - 1];
    const minExp = expirations[0];
    const maxExp = expirations[expirations.length - 1];

    // Create grid of points
    const points: { x: number; y: number; z: number; iv: number; projX: number; projY: number; projZ: number }[] = [];

    for (const d of data) {
      const x = ((d.strike - minStrike) / (maxStrike - minStrike) - 0.5) * 2;
      const z = ((d.expiration - minExp) / (maxExp - minExp) - 0.5) * 2;
      const y = d.iv * 3; // Scale IV for visibility

      const proj = project(x, y, z);
      points.push({
        x, y, z, iv: d.iv,
        projX: proj.x, projY: proj.y, projZ: proj.z,
      });
    }

    // Sort by z for proper rendering order
    points.sort((a, b) => b.projZ - a.projZ);

    // Draw surface as quads
    for (let i = 0; i < strikes.length - 1; i++) {
      for (let j = 0; j < expirations.length - 1; j++) {
        const idx = i * expirations.length + j;
        const p1 = points.find(p =>
          Math.abs(p.x - ((strikes[i] - minStrike) / (maxStrike - minStrike) - 0.5) * 2) < 0.001 &&
          Math.abs(p.z - ((expirations[j] - minExp) / (maxExp - minExp) - 0.5) * 2) < 0.001
        );
        const p2 = points.find(p =>
          Math.abs(p.x - ((strikes[i + 1] - minStrike) / (maxStrike - minStrike) - 0.5) * 2) < 0.001 &&
          Math.abs(p.z - ((expirations[j] - minExp) / (maxExp - minExp) - 0.5) * 2) < 0.001
        );
        const p3 = points.find(p =>
          Math.abs(p.x - ((strikes[i + 1] - minStrike) / (maxStrike - minStrike) - 0.5) * 2) < 0.001 &&
          Math.abs(p.z - ((expirations[j + 1] - minExp) / (maxExp - minExp) - 0.5) * 2) < 0.001
        );
        const p4 = points.find(p =>
          Math.abs(p.x - ((strikes[i] - minStrike) / (maxStrike - minStrike) - 0.5) * 2) < 0.001 &&
          Math.abs(p.z - ((expirations[j + 1] - minExp) / (maxExp - minExp) - 0.5) * 2) < 0.001
        );

        if (p1 && p2 && p3 && p4) {
          const avgIV = (p1.iv + p2.iv + p3.iv + p4.iv) / 4;

          ctx.beginPath();
          ctx.moveTo(p1.projX, p1.projY);
          ctx.lineTo(p2.projX, p2.projY);
          ctx.lineTo(p3.projX, p3.projY);
          ctx.lineTo(p4.projX, p4.projY);
          ctx.closePath();

          ctx.fillStyle = getIVColor(avgIV);
          ctx.globalAlpha = 0.8;
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Draw axes
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;

    // X axis (Strike)
    const xStart = project(-1, 0, 1);
    const xEnd = project(1, 0, 1);
    ctx.beginPath();
    ctx.moveTo(xStart.x, xStart.y);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();

    // Z axis (Expiration)
    const zStart = project(-1, 0, -1);
    const zEnd = project(-1, 0, 1);
    ctx.beginPath();
    ctx.moveTo(zStart.x, zStart.y);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();

    // Y axis (IV)
    const yStart = project(-1, 0, 1);
    const yEnd = project(-1, 1.5, 1);
    ctx.beginPath();
    ctx.moveTo(yStart.x, yStart.y);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // Labels
    ctx.fillStyle = '#22c55e';
    ctx.font = '11px "Consolas", monospace';
    ctx.textAlign = 'center';

    ctx.fillText('Strike', (xStart.x + xEnd.x) / 2, Math.max(xStart.y, xEnd.y) + 20);
    ctx.fillText('Expiry', (zStart.x + zEnd.x) / 2 - 40, (zStart.y + zEnd.y) / 2);
    ctx.save();
    ctx.translate(yEnd.x - 30, yEnd.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('IV', 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} IV Surface`, 20, 30);

    // Legend
    const legendX = width - 100;
    const legendY = 30;
    const legendHeight = 150;

    ctx.font = '10px "Consolas", monospace';
    for (let i = 0; i <= 10; i++) {
      const iv = 0.1 + (0.5 * i) / 10;
      const y = legendY + legendHeight - (i / 10) * legendHeight;
      ctx.fillStyle = getIVColor(iv);
      ctx.fillRect(legendX, y, 20, legendHeight / 10 + 1);
    }
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('60%', legendX + 25, legendY + 10);
    ctx.fillText('10%', legendX + 25, legendY + legendHeight);

  }, [data, dimensions, project, symbol]);

  // Animate
  useEffect(() => {
    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  // Mouse handlers for rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;

    setRotation(prev => ({
      x: Math.max(-90, Math.min(90, prev.x + dy * 0.5)),
      y: prev.y + dx * 0.5,
    }));

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="absolute bottom-4 left-4 text-xs text-green-500/60">
        Drag to rotate
      </div>
    </div>
  );
}
