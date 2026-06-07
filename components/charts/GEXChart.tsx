'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import { formatGEX } from '@/lib/calculations/gex';
import { themeColor, themeAlpha } from '@/lib/ui/themeColors';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const MONO = 'var(--font-jetbrains-mono)';
// Canvas ctx.font can't resolve CSS var() — use the literal family name.
const CANVAS_MONO = 'JetBrains Mono, Consolas, monospace';

const CHART_PADDING = { top: 30, right: 100, bottom: 50, left: 80 } as const;

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

  const gexData = useEquityOptionsStore((s) => s.gexData);
  const gexSummary = useEquityOptionsStore((s) => s.gexSummary);
  const underlyingPrice = useEquityOptionsStore((s) => s.underlyingPrice);

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

    let fullMin = Infinity, fullMax = -Infinity;
    for (const d of gexData) {
      if (d.strike < fullMin) fullMin = d.strike;
      if (d.strike > fullMax) fullMax = d.strike;
    }
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
    ctx.fillStyle = themeColor('--background');
    ctx.fillRect(0, 0, width, height);

    if (gexData.length === 0) {
      ctx.fillStyle = themeColor('--text-muted');
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No GEX data available', width / 2, height / 2);
      return;
    }

    // Chart dimensions
    const padding = CHART_PADDING;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Get visible range
    const { min: visibleMin, max: visibleMax } = getVisibleRange();
    const visibleRange = visibleMax - visibleMin;

    // Filter data to visible range
    const visibleData = gexData.filter(d => d.strike >= visibleMin && d.strike <= visibleMax);

    if (visibleData.length === 0) {
      ctx.fillStyle = themeColor('--text-muted');
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Zoom out to see data', width / 2, height / 2);
      return;
    }

    // Find max absolute GEX for scaling
    let maxAbsGEX = 0;
    for (const d of visibleData) {
      const absCall = Math.abs(d.callGEX);
      const absPut = Math.abs(d.putGEX);
      const absNet = Math.abs(d.netGEX);
      if (absCall > maxAbsGEX) maxAbsGEX = absCall;
      if (absPut > maxAbsGEX) maxAbsGEX = absPut;
      if (absNet > maxAbsGEX) maxAbsGEX = absNet;
    }
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
    ctx.strokeStyle = themeColor('--border');
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
    ctx.strokeStyle = themeColor('--text-dimmed');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, padding.top);
    ctx.lineTo(centerX, height - padding.bottom);
    ctx.stroke();

    // Draw zero gamma level line
    if (gexSummary?.zeroGammaLevel && gexSummary.zeroGammaLevel >= visibleMin && gexSummary.zeroGammaLevel <= visibleMax) {
      const yPos = priceToY(gexSummary.zeroGammaLevel);
      ctx.strokeStyle = themeColor('--warning');
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = themeColor('--warning');
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`Zero Gamma: $${gexSummary.zeroGammaLevel.toFixed(0)}`, width - padding.right + 5, yPos + 4);
    }

    // Draw spot price line
    if (underlyingPrice > 0 && underlyingPrice >= visibleMin && underlyingPrice <= visibleMax) {
      const yPos = priceToY(underlyingPrice);
      ctx.strokeStyle = themeColor('--accent');
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = themeColor('--accent');
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
        gradient.addColorStop(0, themeAlpha('--bull', 0.9));
        gradient.addColorStop(1, themeAlpha('--bull', 0.5));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y - barHeight / 2, barWidth, barHeight / 2 - 1);
      }

      // Put GEX bar (red, left side for negative)
      if (data.putGEX !== 0) {
        const barWidth = (Math.abs(data.putGEX) / maxAbsGEX) * (chartWidth / 2);
        const x = data.putGEX >= 0 ? centerX : centerX - barWidth;

        const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
        gradient.addColorStop(0, themeAlpha('--bear', 0.5));
        gradient.addColorStop(1, themeAlpha('--bear', 0.9));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight / 2 - 1);
      }

      // Net GEX line marker
      if (data.netGEX !== 0) {
        const netX = centerX + (data.netGEX / maxAbsGEX) * (chartWidth / 2);
        ctx.strokeStyle = data.netGEX >= 0 ? themeColor('--bull') : themeColor('--bear');
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(netX, y - barHeight / 2);
        ctx.lineTo(netX, y + barHeight / 2);
        ctx.stroke();
      }

      // Strike price label
      if (showLabels) {
        ctx.fillStyle = themeColor('--text-primary');
        ctx.font = `bold 11px ${CANVAS_MONO}`;
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
    ctx.fillStyle = themeColor('--text-secondary');
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
      ctx.fillStyle = themeColor('--text-muted');
      ctx.font = `10px ${CANVAS_MONO}`;

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

    ctx.fillStyle = themeAlpha('--bull', 0.8);
    ctx.fillRect(padding.left, height - 35, 12, 12);
    ctx.fillStyle = themeColor('--text-secondary');
    ctx.fillText('Call GEX', padding.left + 16, height - 25);

    ctx.fillStyle = themeAlpha('--bear', 0.8);
    ctx.fillRect(padding.left + 80, height - 35, 12, 12);
    ctx.fillStyle = themeColor('--text-secondary');
    ctx.fillText('Put GEX', padding.left + 96, height - 25);

    // Zoom level indicator
    ctx.fillStyle = themeColor('--text-muted');
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

    if (gexData.length === 0) return;

    let sMin = Infinity, sMax = -Infinity;
    for (const d of gexData) {
      if (d.strike < sMin) sMin = d.strike;
      if (d.strike > sMax) sMax = d.strike;
    }
    const fullRange = sMax - sMin;
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
          className="px-2 h-8 text-xs rounded-lg transition-colors press-fb"
          style={{
            fontFamily: MONO,
            background: showTickPrices ? 'rgb(var(--primary-rgb) / 0.18)' : 'var(--surface-elevated)',
            border: `1px solid ${showTickPrices ? 'rgb(var(--primary-rgb) / 0.4)' : 'var(--border)'}`,
            color: showTickPrices ? 'var(--primary)' : 'var(--text-muted)',
          }}
        >
          Ticks
        </button>
        <button
          onClick={() => setZoomLevel(prev => Math.min(10, prev + 0.5))}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors press-fb"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          aria-label="Zoom in"
        >
          <ZoomIn size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors press-fb"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          aria-label="Zoom out"
        >
          <ZoomOut size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={resetZoom}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors press-fb"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          aria-label="Reset zoom"
        >
          <RotateCcw size={15} strokeWidth={1.5} />
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
