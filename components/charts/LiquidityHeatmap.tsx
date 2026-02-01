'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import { SYMBOLS } from '@/types/market';
import AlertZoneManager from './heatmap/AlertZoneManager';

interface LiquidityHeatmapProps {
  className?: string;
  height?: number;
  priceRange?: number;
  showOrderBubbles?: boolean;
  showTickPrices?: boolean;
}

// ATAS-style color gradient: dark blue -> cyan -> yellow -> orange -> white
const getATASColor = (intensity: number): string => {
  const i = Math.min(1, Math.max(0, intensity));

  if (i < 0.1) {
    // Very low: transparent dark blue
    return `rgba(10, 20, 60, ${i * 5})`;
  } else if (i < 0.25) {
    // Low: dark blue
    const t = (i - 0.1) / 0.15;
    return `rgba(${Math.round(10 + t * 20)}, ${Math.round(40 + t * 60)}, ${Math.round(100 + t * 50)}, ${0.5 + t * 0.3})`;
  } else if (i < 0.4) {
    // Medium-low: blue to cyan
    const t = (i - 0.25) / 0.15;
    return `rgba(${Math.round(30 - t * 20)}, ${Math.round(100 + t * 100)}, ${Math.round(150 + t * 50)}, ${0.8})`;
  } else if (i < 0.55) {
    // Medium: cyan to green
    const t = (i - 0.4) / 0.15;
    return `rgba(${Math.round(10 + t * 100)}, ${Math.round(200 - t * 20)}, ${Math.round(200 - t * 100)}, ${0.85})`;
  } else if (i < 0.7) {
    // Medium-high: green to yellow
    const t = (i - 0.55) / 0.15;
    return `rgba(${Math.round(110 + t * 145)}, ${Math.round(180 + t * 75)}, ${Math.round(100 - t * 100)}, ${0.9})`;
  } else if (i < 0.85) {
    // High: yellow to orange
    const t = (i - 0.7) / 0.15;
    return `rgba(255, ${Math.round(255 - t * 100)}, ${Math.round(t * 50)}, ${0.95})`;
  } else {
    // Very high: orange to white/bright
    const t = (i - 0.85) / 0.15;
    return `rgba(255, ${Math.round(155 + t * 100)}, ${Math.round(50 + t * 150)}, 1)`;
  }
};

export default function LiquidityHeatmap({
  className,
  height = 600,
  priceRange = 100,
  showOrderBubbles = true,
  showTickPrices = true,
}: LiquidityHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [smoothing, setSmoothing] = useState<'low' | 'medium' | 'high'>('medium');
  const [contrast, setContrast] = useState(1.5);
  const [showAlertManager, setShowAlertManager] = useState(false);
  const [showBubbles, setShowBubbles] = useState(showOrderBubbles);
  const [useTickDisplay, setUseTickDisplay] = useState(showTickPrices);

  const { heatmapHistory, midPrice, bids, asks, liquidityDeltas, whaleOrders } = useOrderbookStore();
  const { currentPrice, symbol } = useMarketStore();

  // Get tick size for current symbol
  const symbolInfo = SYMBOLS[symbol];
  const tickSize = symbolInfo?.tickSize || 0.25;
  const {
    showLiquidityDelta,
    showWhaleHighlights,
    showAlertZones,
    alertZones,
    deltaColorPositive,
    deltaColorNegative,
    whaleColor,
  } = useHeatmapSettingsStore();

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth;
    const priceColumnWidth = 80;
    const chartWidth = width - priceColumnWidth;

    canvas.width = width;
    canvas.height = height;

    // Dark background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, width, height);

    const centerPrice = midPrice || currentPrice || 0;
    if (centerPrice === 0) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for orderbook data...', chartWidth / 2, height / 2);
      return;
    }

    // Use symbol tick size
    const minPrice = centerPrice - priceRange * tickSize;
    const maxPrice = centerPrice + priceRange * tickSize;
    const pricePerPixel = (maxPrice - minPrice) / height;

    // Find max quantity for normalization with contrast
    let maxQty = 0;
    bids.forEach((qty) => { if (qty > maxQty) maxQty = qty; });
    asks.forEach((qty) => { if (qty > maxQty) maxQty = qty; });
    heatmapHistory.forEach((snapshot) => {
      snapshot.bids.forEach(([, qty]) => { if (qty > maxQty) maxQty = qty; });
      snapshot.asks.forEach(([, qty]) => { if (qty > maxQty) maxQty = qty; });
    });

    if (maxQty === 0) maxQty = 1;

    // Smoothing factor
    const smoothFactor = smoothing === 'low' ? 1 : smoothing === 'medium' ? 2 : 3;
    const pixelHeight = Math.max(1, Math.ceil(tickSize / pricePerPixel) * smoothFactor);

    // Calculate column width
    const historyLength = heatmapHistory.length;
    const totalColumns = historyLength + 1;
    const colWidth = Math.max(2, chartWidth / Math.max(totalColumns, 60));

    // Draw historical heatmap (scrolling from right to left)
    heatmapHistory.forEach((snapshot, i) => {
      const x = (i / totalColumns) * chartWidth;

      // Draw bids
      snapshot.bids.forEach(([price, qty]) => {
        if (price < minPrice || price > maxPrice) return;
        const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
        const rawIntensity = qty / maxQty;
        const intensity = Math.pow(rawIntensity, 1 / contrast);
        ctx.fillStyle = getATASColor(intensity);
        ctx.fillRect(x, y - pixelHeight / 2, colWidth + 1, pixelHeight);
      });

      // Draw asks
      snapshot.asks.forEach(([price, qty]) => {
        if (price < minPrice || price > maxPrice) return;
        const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
        const rawIntensity = qty / maxQty;
        const intensity = Math.pow(rawIntensity, 1 / contrast);
        ctx.fillStyle = getATASColor(intensity);
        ctx.fillRect(x, y - pixelHeight / 2, colWidth + 1, pixelHeight);
      });
    });

    // Draw current orderbook as rightmost column (brighter)
    const currentX = chartWidth - colWidth;

    bids.forEach((qty, price) => {
      if (price < minPrice || price > maxPrice) return;
      const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
      const rawIntensity = qty / maxQty;
      const intensity = Math.pow(rawIntensity, 1 / contrast);
      ctx.fillStyle = getATASColor(Math.min(1, intensity * 1.2));
      ctx.fillRect(currentX, y - pixelHeight / 2, colWidth, pixelHeight);
    });

    asks.forEach((qty, price) => {
      if (price < minPrice || price > maxPrice) return;
      const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
      const rawIntensity = qty / maxQty;
      const intensity = Math.pow(rawIntensity, 1 / contrast);
      ctx.fillStyle = getATASColor(Math.min(1, intensity * 1.2));
      ctx.fillRect(currentX, y - pixelHeight / 2, colWidth, pixelHeight);
    });

    // Draw price ladder background
    ctx.fillStyle = '#12121a';
    ctx.fillRect(chartWidth, 0, priceColumnWidth, height);

    // Draw price ladder border
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, height);
    ctx.stroke();

    // Draw current price marker on price ladder
    const currentPriceY = height - ((centerPrice - minPrice) / (maxPrice - minPrice)) * height;

    // Current price highlight
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(chartWidth, currentPriceY - 12, priceColumnWidth, 24);

    // Current price text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      centerPrice.toFixed(tickSize < 1 ? 2 : 0),
      chartWidth + priceColumnWidth / 2,
      currentPriceY + 4
    );

    // Draw price ladder labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';

    const labelStep = Math.ceil((priceRange * 2) / 20) * tickSize;
    for (let price = Math.ceil(minPrice / labelStep) * labelStep; price <= maxPrice; price += labelStep) {
      if (Math.abs(price - centerPrice) < labelStep * 0.5) continue; // Skip if too close to current price

      const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;

      // Price level line
      ctx.strokeStyle = '#1f1f2e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price label - show in ticks or absolute price
      ctx.fillStyle = '#6b7280';
      if (useTickDisplay) {
        const ticksFromCenter = Math.round((price - centerPrice) / tickSize);
        const tickLabel = ticksFromCenter > 0 ? `+${ticksFromCenter}` : `${ticksFromCenter}`;
        ctx.fillText(tickLabel, chartWidth + priceColumnWidth / 2, y + 4);
      } else {
        ctx.fillText(
          price.toFixed(tickSize < 1 ? 2 : 0),
          chartWidth + priceColumnWidth / 2,
          y + 4
        );
      }
    }

    // Draw mid price line (horizontal dashed line across chart)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, currentPriceY);
    ctx.lineTo(chartWidth, currentPriceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw whale orders (large circles at price levels)
    if (showWhaleHighlights && whaleOrders.length > 0) {
      whaleOrders.forEach(whale => {
        if (whale.price < minPrice || whale.price > maxPrice) return;

        const y = height - ((whale.price - minPrice) / (maxPrice - minPrice)) * height;
        const radius = Math.min(15, 5 + whale.standardDeviations * 2);

        // Pulsing glow effect
        const gradient = ctx.createRadialGradient(
          chartWidth - 30, y, radius * 0.5,
          chartWidth - 30, y, radius * 1.5
        );
        gradient.addColorStop(0, whale.side === 'bid' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(chartWidth - 30, y, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner circle
        ctx.fillStyle = whaleColor;
        ctx.beginPath();
        ctx.arc(chartWidth - 30, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Whale icon
        ctx.fillStyle = '#000';
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('W', chartWidth - 30, y + 3);
      });
    }

    // Draw liquidity deltas (bars on the side showing additions/removals)
    if (showLiquidityDelta && liquidityDeltas.length > 0) {
      const recentDeltas = liquidityDeltas.slice(-20);
      const deltaMaxWidth = 20;

      recentDeltas.forEach(delta => {
        if (delta.price < minPrice || delta.price > maxPrice) return;

        const y = height - ((delta.price - minPrice) / (maxPrice - minPrice)) * height;
        const normalizedDelta = Math.min(1, Math.abs(delta.delta) / (maxQty * 0.1));
        const barWidth = normalizedDelta * deltaMaxWidth;

        ctx.fillStyle = delta.isAddition ? deltaColorPositive : deltaColorNegative;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(chartWidth - 55 - barWidth, y - 2, barWidth, 4);
        ctx.globalAlpha = 1;
      });
    }

    // Draw alert zones
    if (showAlertZones && alertZones.length > 0) {
      alertZones.forEach(zone => {
        if (!zone.enabled) return;
        if (zone.priceMax < minPrice || zone.priceMin > maxPrice) return;

        const y1 = height - ((zone.priceMax - minPrice) / (maxPrice - minPrice)) * height;
        const y2 = height - ((zone.priceMin - minPrice) / (maxPrice - minPrice)) * height;

        // Zone background
        ctx.fillStyle = zone.triggered
          ? 'rgba(239, 68, 68, 0.15)'
          : zone.type === 'support'
            ? 'rgba(34, 197, 94, 0.1)'
            : zone.type === 'resistance'
              ? 'rgba(239, 68, 68, 0.1)'
              : 'rgba(59, 130, 246, 0.1)';
        ctx.fillRect(0, y1, chartWidth, y2 - y1);

        // Zone borders
        ctx.strokeStyle = zone.type === 'support'
          ? '#22c55e'
          : zone.type === 'resistance'
            ? '#ef4444'
            : '#3b82f6';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y1);
        ctx.lineTo(chartWidth, y1);
        ctx.moveTo(0, y2);
        ctx.lineTo(chartWidth, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zone label
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '9px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(zone.type.toUpperCase(), 5, y1 + 12);
      });
    }

    // Draw passive order bubbles
    if (showBubbles && (bids.size > 0 || asks.size > 0)) {
      // Calculate bubble sizes based on order quantities
      const allQtys: number[] = [];
      bids.forEach(qty => allQtys.push(qty));
      asks.forEach(qty => allQtys.push(qty));

      const avgQty = allQtys.reduce((a, b) => a + b, 0) / allQtys.length;
      const maxBubbleRadius = 20;
      const minBubbleRadius = 4;

      // Draw bid bubbles (green, on left side of price ladder)
      bids.forEach((qty, price) => {
        if (price < minPrice || price > maxPrice) return;

        const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
        const normalizedQty = qty / (avgQty * 3); // Normalize against 3x average
        const radius = Math.min(maxBubbleRadius, Math.max(minBubbleRadius, normalizedQty * maxBubbleRadius));

        // Only show significant orders (> 0.5x average)
        if (qty < avgQty * 0.5) return;

        // Bubble glow
        const gradient = ctx.createRadialGradient(
          chartWidth - 60, y, radius * 0.3,
          chartWidth - 60, y, radius * 1.2
        );
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
        gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.4)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(chartWidth - 60, y, radius * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Inner bubble
        ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
        ctx.beginPath();
        ctx.arc(chartWidth - 60, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Quantity text for large orders
        if (qty > avgQty * 2) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          const qtyText = qty >= 1000 ? `${(qty / 1000).toFixed(1)}K` : qty.toFixed(0);
          ctx.fillText(qtyText, chartWidth - 60, y + 3);
        }
      });

      // Draw ask bubbles (red, on right side of price ladder)
      asks.forEach((qty, price) => {
        if (price < minPrice || price > maxPrice) return;

        const y = height - ((price - minPrice) / (maxPrice - minPrice)) * height;
        const normalizedQty = qty / (avgQty * 3);
        const radius = Math.min(maxBubbleRadius, Math.max(minBubbleRadius, normalizedQty * maxBubbleRadius));

        if (qty < avgQty * 0.5) return;

        // Bubble glow
        const gradient = ctx.createRadialGradient(
          chartWidth - 25, y, radius * 0.3,
          chartWidth - 25, y, radius * 1.2
        );
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.4)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(chartWidth - 25, y, radius * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Inner bubble
        ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.beginPath();
        ctx.arc(chartWidth - 25, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Quantity text for large orders
        if (qty > avgQty * 2) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          const qtyText = qty >= 1000 ? `${(qty / 1000).toFixed(1)}K` : qty.toFixed(0);
          ctx.fillText(qtyText, chartWidth - 25, y + 3);
        }
      });
    }

  }, [heatmapHistory, midPrice, currentPrice, bids, asks, height, priceRange, smoothing, contrast, symbol,
      showWhaleHighlights, showLiquidityDelta, showAlertZones, whaleOrders, liquidityDeltas, alertZones,
      deltaColorPositive, deltaColorNegative, whaleColor, showBubbles, useTickDisplay, tickSize]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      drawHeatmap();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawHeatmap]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => drawHeatmap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawHeatmap]);

  const {
    setShowLiquidityDelta,
    setShowWhaleHighlights,
    setShowAlertZones,
  } = useHeatmapSettingsStore();

  return (
    <div className={`relative ${className || ''}`}>
      {/* Controls */}
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-zinc-900/90 rounded px-2 py-1">
          <span className="text-xs text-zinc-400">Smoothing:</span>
          {(['low', 'medium', 'high'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSmoothing(s)}
              className={`text-xs px-2 py-0.5 rounded ${
                smoothing === s
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-zinc-900/90 rounded px-2 py-1">
          <span className="text-xs text-zinc-400">Contrast:</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={contrast}
            onChange={(e) => setContrast(parseFloat(e.target.value))}
            className="w-16 h-1"
          />
        </div>
        <div className="flex items-center gap-2 bg-zinc-900/90 rounded px-2 py-1">
          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showBubbles}
              onChange={(e) => setShowBubbles(e.target.checked)}
              className="w-3 h-3"
            />
            Bubbles
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useTickDisplay}
              onChange={(e) => setUseTickDisplay(e.target.checked)}
              className="w-3 h-3"
            />
            Ticks
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showWhaleHighlights}
              onChange={(e) => setShowWhaleHighlights(e.target.checked)}
              className="w-3 h-3"
            />
            Whales
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showLiquidityDelta}
              onChange={(e) => setShowLiquidityDelta(e.target.checked)}
              className="w-3 h-3"
            />
            Delta
          </label>
          <label className="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showAlertZones}
              onChange={(e) => setShowAlertZones(e.target.checked)}
              className="w-3 h-3"
            />
            Alerts
          </label>
          <button
            onClick={() => setShowAlertManager(!showAlertManager)}
            className={`text-xs px-2 py-0.5 rounded ${
              showAlertManager
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Manage
          </button>
        </div>
      </div>

      {/* Alert Zone Manager */}
      <AlertZoneManager
        isOpen={showAlertManager}
        onClose={() => setShowAlertManager(false)}
        currentPrice={currentPrice || midPrice || 0}
      />

      <div ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: `${height}px` }}
        />
      </div>

      {/* Color Legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-zinc-900/90 rounded px-3 py-2">
        <span className="text-xs text-zinc-400">Volume:</span>
        <div className="flex h-3 w-32 rounded overflow-hidden">
          {[0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((i, idx) => (
            <div
              key={idx}
              className="flex-1"
              style={{ backgroundColor: getATASColor(i) }}
            />
          ))}
        </div>
        <span className="text-xs text-zinc-500">Low</span>
        <span className="text-xs text-zinc-400 mx-1">→</span>
        <span className="text-xs text-orange-400">High</span>
      </div>
    </div>
  );
}
