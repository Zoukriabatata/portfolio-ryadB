'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import { formatGEX } from '@/lib/calculations/gex';

interface GEXChartProps {
  className?: string;
  height?: number;
  showLabels?: boolean;
}

export default function GEXChart({
  className,
  height = 500,
  showLabels = true,
}: GEXChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { gexData, gexSummary, underlyingPrice } = useEquityOptionsStore();

  // Zoom state for Y-axis (price)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [showTickPrices, setShowTickPrices] = useState(false);

  // Calculate tick size based on underlying price
  const tickSize = underlyingPrice > 1000 ? 5 : underlyingPrice > 100 ? 1 : 0.25;

  // Calculate visible price range based on zoom
  const getVisibleRange = useCallback(() => {
    if (gexData.length === 0) return { min: 0, max: 0 };

    const strikes = gexData.map(d => d.strike);
    const fullMin = Math.min(...strikes);
    const fullMax = Math.max(...strikes);
    const fullRange = fullMax - fullMin;

    // Visible range based on zoom level
    const visibleRange = fullRange / zoomLevel;
    const center = (fullMin + fullMax) / 2 + panOffset;

    return {
      min: Math.max(fullMin, center - visibleRange / 2),
      max: Math.min(fullMax, center + visibleRange / 2),
    };
  }, [gexData, zoomLevel, panOffset]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    if (gexData.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No GEX data available', width / 2, height / 2);
      return;
    }

    // Chart dimensions
    const padding = { top: 30, right: 100, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Get visible range
    const { min: visibleMin, max: visibleMax } = getVisibleRange();
    const visibleRange = visibleMax - visibleMin;

    // Filter data to visible range
    const visibleData = gexData.filter(d => d.strike >= visibleMin && d.strike <= visibleMax);

    if (visibleData.length === 0) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Zoom out to see data', width / 2, height / 2);
      return;
    }

    // Find max absolute GEX for scaling
    let maxAbsGEX = 0;
    visibleData.forEach(d => {
      maxAbsGEX = Math.max(maxAbsGEX, Math.abs(d.callGEX), Math.abs(d.putGEX), Math.abs(d.netGEX));
    });
    if (maxAbsGEX === 0) maxAbsGEX = 1;

    // Bar height based on visible strikes
    const barHeight = Math.min(25, Math.max(8, chartHeight / visibleData.length * 0.7));
    const barGap = barHeight * 0.3;

    // Center line (zero GEX)
    const centerX = padding.left + chartWidth / 2;

    // Helper function to convert price to Y position
    const priceToY = (price: number) => {
      return padding.top + ((visibleMax - price) / visibleRange) * chartHeight;
    };

    // Draw grid lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    const gridSteps = 10;
    const priceStep = visibleRange / gridSteps;
    for (let i = 0; i <= gridSteps; i++) {
      const price = visibleMin + i * priceStep;
      const y = priceToY(price);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw center line
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, padding.top);
    ctx.lineTo(centerX, height - padding.bottom);
    ctx.stroke();

    // Draw zero gamma level line
    if (gexSummary?.zeroGammaLevel && gexSummary.zeroGammaLevel >= visibleMin && gexSummary.zeroGammaLevel <= visibleMax) {
      const yPos = priceToY(gexSummary.zeroGammaLevel);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Zero Gamma: $${gexSummary.zeroGammaLevel.toFixed(0)}`, width - padding.right + 5, yPos + 4);
    }

    // Draw spot price line
    if (underlyingPrice > 0 && underlyingPrice >= visibleMin && underlyingPrice <= visibleMax) {
      const yPos = priceToY(underlyingPrice);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Spot: $${underlyingPrice.toFixed(2)}`, width - padding.right + 5, yPos - 8);
    }

    // Draw bars for each strike
    visibleData.forEach(data => {
      const y = priceToY(data.strike);

      // Call GEX bar (green, right side for positive)
      if (data.callGEX !== 0) {
        const barWidth = (Math.abs(data.callGEX) / maxAbsGEX) * (chartWidth / 2);
        const x = data.callGEX >= 0 ? centerX : centerX - barWidth;

        const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.9)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.5)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y - barHeight / 2, barWidth, barHeight / 2 - 1);
      }

      // Put GEX bar (red, left side for negative)
      if (data.putGEX !== 0) {
        const barWidth = (Math.abs(data.putGEX) / maxAbsGEX) * (chartWidth / 2);
        const x = data.putGEX >= 0 ? centerX : centerX - barWidth;

        const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.9)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight / 2 - 1);
      }

      // Net GEX line marker
      if (data.netGEX !== 0) {
        const netX = centerX + (data.netGEX / maxAbsGEX) * (chartWidth / 2);
        ctx.strokeStyle = data.netGEX >= 0 ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(netX, y - barHeight / 2);
        ctx.lineTo(netX, y + barHeight / 2);
        ctx.stroke();
      }

      // Strike price label
      if (showLabels) {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';

        if (showTickPrices && underlyingPrice > 0) {
          const ticksFromSpot = Math.round((data.strike - underlyingPrice) / tickSize);
          const tickLabel = ticksFromSpot > 0 ? `+${ticksFromSpot}` : `${ticksFromSpot}`;
          ctx.fillText(tickLabel, padding.left - 8, y + 4);
        } else {
          ctx.fillText(`$${data.strike.toFixed(0)}`, padding.left - 8, y + 4);
        }
      }
    });

    // Draw X-axis labels (GEX values)
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`-${formatGEX(maxAbsGEX)}`, padding.left + 30, height - 15);
    ctx.fillText('0', centerX, height - 15);
    ctx.fillText(`+${formatGEX(maxAbsGEX)}`, width - padding.right - 30, height - 15);

    // Draw Y-axis price labels on right side
    ctx.textAlign = 'left';
    for (let i = 0; i <= 5; i++) {
      const price = visibleMin + (visibleRange / 5) * i;
      const y = priceToY(price);
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px monospace';

      if (showTickPrices && underlyingPrice > 0) {
        const ticksFromSpot = Math.round((price - underlyingPrice) / tickSize);
        const tickLabel = ticksFromSpot > 0 ? `+${ticksFromSpot}` : `${ticksFromSpot}`;
        ctx.fillText(tickLabel, width - padding.right + 5, y + 4);
      } else {
        ctx.fillText(`$${price.toFixed(0)}`, width - padding.right + 5, y + 4);
      }
    }

    // Legend
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
    ctx.fillRect(padding.left, height - 35, 12, 12);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Call GEX', padding.left + 16, height - 25);

    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.fillRect(padding.left + 80, height - 35, 12, 12);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Put GEX', padding.left + 96, height - 25);

    // Zoom level indicator
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`Zoom: ${zoomLevel.toFixed(1)}x`, width - padding.right, padding.top - 10);

  }, [gexData, gexSummary, underlyingPrice, height, showLabels, getVisibleRange, zoomLevel, showTickPrices, tickSize]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoomLevel(prev => Math.max(1, Math.min(10, prev + delta)));
  }, []);

  // Handle mouse drag for pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartOffset(panOffset);
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const strikes = gexData.map(d => d.strike);
    if (strikes.length === 0) return;

    const fullRange = Math.max(...strikes) - Math.min(...strikes);
    const dy = e.clientY - dragStartY;
    const priceChange = (dy / height) * (fullRange / zoomLevel);
    setPanOffset(dragStartOffset + priceChange);
  }, [isDragging, dragStartY, dragStartOffset, gexData, height, zoomLevel]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset(0);
  }, []);

  useEffect(() => {
    drawChart();

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }

    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);

    return () => {
      if (canvas) {
        canvas.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [drawChart, handleWheel]);

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={() => setShowTickPrices(!showTickPrices)}
          className={`px-2 h-8 text-xs rounded transition-colors ${
            showTickPrices
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
          }`}
        >
          Ticks
        </button>
        <button
          onClick={() => setZoomLevel(prev => Math.min(10, prev + 0.5))}
          className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded flex items-center justify-center text-lg"
        >
          +
        </button>
        <button
          onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))}
          className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded flex items-center justify-center text-lg"
        >
          -
        </button>
        <button
          onClick={resetZoom}
          className="px-2 h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded"
        >
          Reset
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ height: `${height}px`, cursor: isDragging ? 'grabbing' : 'grab' }}
        className="w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}
