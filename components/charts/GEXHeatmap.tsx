'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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

// Generate color based on value (red = negative, green = positive)
function getHeatmapColor(value: number, maxValue: number, alpha: number = 1): string {
  const normalized = Math.max(-1, Math.min(1, value / maxValue));

  if (normalized >= 0) {
    // Green gradient for positive
    const intensity = Math.floor(normalized * 255);
    return `rgba(34, ${150 + intensity * 0.4}, 94, ${alpha})`;
  } else {
    // Red gradient for negative
    const intensity = Math.floor(Math.abs(normalized) * 255);
    return `rgba(${150 + intensity * 0.4}, 68, 68, ${alpha})`;
  }
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [rotation, setRotation] = useState({ x: 25, y: -30 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredCell, setHoveredCell] = useState<{ strike: number; time: number; value: number } | null>(null);

  // Generate time series data (simulated historical GEX over time)
  const generateTimeSeriesData = useCallback(() => {
    const timeSteps = 20; // Number of time periods
    const data: { strike: number; time: number; value: number }[][] = [];

    for (let t = 0; t < timeSteps; t++) {
      const timeData: { strike: number; time: number; value: number }[] = [];
      gexData.forEach(level => {
        // Simulate GEX evolution over time with some randomness
        const timeFactor = 1 + Math.sin(t * 0.3) * 0.3 + (Math.random() - 0.5) * 0.2;
        const value = dataType === 'netGEX'
          ? level.netGEX * timeFactor
          : (level.callOI + level.putOI) * 0.001 * timeFactor; // Simulated IV based on OI

        timeData.push({
          strike: level.strike,
          time: t,
          value,
        });
      });
      data.push(timeData);
    }
    return data;
  }, [gexData, dataType]);

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

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 50, right: 100, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const timeSeriesData = generateTimeSeriesData();
    const timeSteps = timeSeriesData.length;
    const strikes = gexData.map(d => d.strike);

    // Find max value for color scaling
    let maxValue = 0;
    timeSeriesData.forEach(timeData => {
      timeData.forEach(d => {
        maxValue = Math.max(maxValue, Math.abs(d.value));
      });
    });

    const cellWidth = chartWidth / timeSteps;
    const cellHeight = chartHeight / strikes.length;

    // Draw heatmap cells
    for (let t = 0; t < timeSteps; t++) {
      const timeData = timeSeriesData[t];
      for (let i = 0; i < timeData.length; i++) {
        const { value } = timeData[i];
        const x = padding.left + t * cellWidth;
        const y = padding.top + (strikes.length - 1 - i) * cellHeight;

        ctx.fillStyle = getHeatmapColor(value, maxValue, 0.85);
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);
      }
    }

    // Draw spot price line
    const spotIndex = strikes.findIndex(s => s >= spotPrice);
    if (spotIndex >= 0) {
      const spotY = padding.top + (strikes.length - 1 - spotIndex) * cellHeight + cellHeight / 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, spotY);
      ctx.lineTo(padding.left + chartWidth, spotY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`SPOT $${spotPrice.toFixed(0)}`, padding.left - 5, spotY + 4);
    }

    // Y-axis labels (strikes)
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    const labelStep = Math.ceil(strikes.length / 15);
    for (let i = 0; i < strikes.length; i += labelStep) {
      const y = padding.top + (strikes.length - 1 - i) * cellHeight + cellHeight / 2;
      ctx.fillText(`$${strikes[i].toFixed(0)}`, padding.left - 10, y + 4);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    for (let t = 0; t < timeSteps; t += 4) {
      const x = padding.left + t * cellWidth + cellWidth / 2;
      ctx.fillText(`T-${timeSteps - t}`, x, height - padding.bottom + 20);
    }

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} ${dataType === 'netGEX' ? 'Net GEX' : 'Net IV'} Heatmap (2D)`, padding.left, 25);

    // Color legend
    const legendWidth = 20;
    const legendHeight = chartHeight;
    const legendX = width - padding.right + 30;
    const legendY = padding.top;

    const gradient = ctx.createLinearGradient(0, legendY + legendHeight, 0, legendY);
    gradient.addColorStop(0, 'rgb(239, 68, 68)');
    gradient.addColorStop(0.5, 'rgb(50, 50, 50)');
    gradient.addColorStop(1, 'rgb(34, 197, 94)');

    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

    ctx.fillStyle = '#888';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`+${formatValue(maxValue)}`, legendX + legendWidth + 5, legendY + 10);
    ctx.fillText('0', legendX + legendWidth + 5, legendY + legendHeight / 2 + 4);
    ctx.fillText(`-${formatValue(maxValue)}`, legendX + legendWidth + 5, legendY + legendHeight);

  }, [gexData, dimensions, spotPrice, symbol, dataType, generateTimeSeriesData]);

  const draw3D = useCallback(() => {
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

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const timeSeriesData = generateTimeSeriesData();
    const timeSteps = timeSeriesData.length;
    const strikes = gexData.map(d => d.strike);

    // Find max value
    let maxValue = 0;
    timeSeriesData.forEach(timeData => {
      timeData.forEach(d => {
        maxValue = Math.max(maxValue, Math.abs(d.value));
      });
    });

    // 3D projection parameters
    const centerX = width / 2;
    const centerY = height / 2 + 50;
    const scale = Math.min(width, height) * 0.35;

    const radX = (rotation.x * Math.PI) / 180;
    const radY = (rotation.y * Math.PI) / 180;

    // Project 3D point to 2D
    const project = (x: number, y: number, z: number) => {
      // Rotate around Y axis
      const x1 = x * Math.cos(radY) - z * Math.sin(radY);
      const z1 = x * Math.sin(radY) + z * Math.cos(radY);

      // Rotate around X axis
      const y1 = y * Math.cos(radX) - z1 * Math.sin(radX);
      const z2 = y * Math.sin(radX) + z1 * Math.cos(radX);

      // Perspective projection
      const perspective = 3;
      const factor = perspective / (perspective + z2);

      return {
        x: centerX + x1 * scale * factor,
        y: centerY - y1 * scale * factor,
        z: z2,
      };
    };

    // Draw 3D surface
    const gridX = timeSteps;
    const gridZ = Math.min(strikes.length, 30); // Limit for performance
    const strikeStep = Math.max(1, Math.floor(strikes.length / gridZ));

    // Collect all faces with depth for sorting
    const faces: { points: { x: number; y: number }[]; depth: number; value: number }[] = [];

    for (let t = 0; t < gridX - 1; t++) {
      for (let s = 0; s < strikes.length - strikeStep; s += strikeStep) {
        const timeData = timeSeriesData[t];
        const nextTimeData = timeSeriesData[t + 1];

        const v00 = timeData[s]?.value || 0;
        const v10 = nextTimeData[s]?.value || 0;
        const v01 = timeData[s + strikeStep]?.value || 0;
        const v11 = nextTimeData[s + strikeStep]?.value || 0;

        const x0 = (t / gridX - 0.5) * 2;
        const x1 = ((t + 1) / gridX - 0.5) * 2;
        const z0 = (s / strikes.length - 0.5) * 2;
        const z1 = ((s + strikeStep) / strikes.length - 0.5) * 2;

        const h00 = (v00 / maxValue) * 0.5;
        const h10 = (v10 / maxValue) * 0.5;
        const h01 = (v01 / maxValue) * 0.5;
        const h11 = (v11 / maxValue) * 0.5;

        const p00 = project(x0, h00, z0);
        const p10 = project(x1, h10, z0);
        const p01 = project(x0, h01, z1);
        const p11 = project(x1, h11, z1);

        const avgDepth = (p00.z + p10.z + p01.z + p11.z) / 4;
        const avgValue = (v00 + v10 + v01 + v11) / 4;

        faces.push({
          points: [p00, p10, p11, p01],
          depth: avgDepth,
          value: avgValue,
        });
      }
    }

    // Sort by depth (painter's algorithm)
    faces.sort((a, b) => b.depth - a.depth);

    // Draw faces
    faces.forEach(face => {
      ctx.beginPath();
      ctx.moveTo(face.points[0].x, face.points[0].y);
      face.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();

      ctx.fillStyle = getHeatmapColor(face.value, maxValue, 0.9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Draw axes
    const origin = project(-1, 0, -1);
    const xEnd = project(1, 0, -1);
    const yEnd = project(-1, 0.8, -1);
    const zEnd = project(-1, 0, 1);

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;

    // X axis (Time)
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xEnd.x, xEnd.y);
    ctx.stroke();

    // Y axis (Value)
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yEnd.x, yEnd.y);
    ctx.stroke();

    // Z axis (Strike)
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zEnd.x, zEnd.y);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#888';
    ctx.font = '11px system-ui';
    ctx.fillText('Time →', xEnd.x - 30, xEnd.y + 20);
    ctx.fillText('Strike →', zEnd.x + 10, zEnd.y);
    ctx.fillText(dataType === 'netGEX' ? 'GEX' : 'IV', yEnd.x - 20, yEnd.y - 10);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} ${dataType === 'netGEX' ? 'Net GEX' : 'Net IV'} Surface (3D)`, 20, 25);

    // Instructions
    ctx.fillStyle = '#666';
    ctx.font = '10px system-ui';
    ctx.fillText('Drag to rotate', 20, 45);

  }, [gexData, dimensions, rotation, dataType, symbol, generateTimeSeriesData]);

  useEffect(() => {
    if (mode === '2D') {
      draw2D();
    } else {
      draw3D();
    }
  }, [mode, draw2D, draw3D]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode === '3D') {
      setIsDragging(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && mode === '3D') {
      const deltaX = e.clientX - lastMouse.x;
      const deltaY = e.clientY - lastMouse.y;

      setRotation(prev => ({
        x: Math.max(-60, Math.min(60, prev.x + deltaY * 0.5)),
        y: prev.y + deltaX * 0.5,
      }));

      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
