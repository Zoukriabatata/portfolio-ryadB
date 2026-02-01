'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Candle } from '@/types/market';

interface VolumeProfileProps {
  candles: Candle[];
  height: number;
  width: number;
  tickSize: number;
  currentPrice: number;
  mode?: 'sidebar' | 'overlay';
  profileType?: 'session' | 'visible' | 'fixed';
  showLabels?: boolean;
}

interface VolumeLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
}

interface ProfileData {
  levels: VolumeLevel[];
  poc: VolumeLevel;
  vah: number; // Value Area High
  val: number; // Value Area Low
  hvnLevels: number[]; // High Volume Nodes
  lvnLevels: number[]; // Low Volume Nodes
  maxVolume: number;
  minPrice: number;
  maxPrice: number;
}

export default function VolumeProfile({
  candles,
  height,
  width,
  tickSize,
  currentPrice,
  mode = 'sidebar',
  profileType = 'visible',
  showLabels = true,
}: VolumeProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredLevel, setHoveredLevel] = useState<VolumeLevel | null>(null);

  const calculateProfile = useCallback((): ProfileData | null => {
    if (candles.length === 0) return null;

    // Find price range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of candles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice >= maxPrice) {
      return null;
    }

    // Calculate bucket size based on price range
    const priceRange = maxPrice - minPrice;
    const safeTick = Math.max(tickSize, 0.01);
    const targetBuckets = Math.min(100, Math.max(20, height / 8));
    const bucketSize = Math.max(safeTick, priceRange / targetBuckets);

    const buckets = new Map<number, VolumeLevel>();

    // Build volume profile from candles
    for (const candle of candles) {
      const rangeStart = Math.floor(candle.low / bucketSize) * bucketSize;
      const rangeEnd = Math.ceil(candle.high / bucketSize) * bucketSize;
      const numBuckets = Math.max(1, Math.round((rangeEnd - rangeStart) / bucketSize));
      const volumePerBucket = candle.volume / numBuckets;

      // Determine buy/sell distribution based on candle direction
      const isBullish = candle.close >= candle.open;
      const buyRatio = isBullish ? 0.65 : 0.35;

      let iterations = 0;
      for (let price = rangeStart; price <= rangeEnd && iterations < 200; price += bucketSize) {
        iterations++;
        const roundedPrice = Math.round(price / bucketSize) * bucketSize;
        const existing = buckets.get(roundedPrice) || {
          price: roundedPrice,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          delta: 0,
        };

        existing.volume += volumePerBucket;
        existing.buyVolume += volumePerBucket * buyRatio;
        existing.sellVolume += volumePerBucket * (1 - buyRatio);
        existing.delta = existing.buyVolume - existing.sellVolume;

        buckets.set(roundedPrice, existing);
      }
    }

    const levels = Array.from(buckets.values()).sort((a, b) => b.price - a.price);
    if (levels.length === 0) return null;

    // Find POC (Point of Control) - highest volume level
    let poc = levels[0];
    let maxVolume = 0;
    for (const level of levels) {
      if (level.volume > maxVolume) {
        maxVolume = level.volume;
        poc = level;
      }
    }

    // Calculate Value Area (70% of total volume)
    const totalVolume = levels.reduce((sum, l) => sum + l.volume, 0);
    const targetVA = totalVolume * 0.7;

    // Start from POC and expand outward
    const sortedByPrice = [...levels].sort((a, b) => a.price - b.price);
    const pocIndex = sortedByPrice.findIndex(l => l.price === poc.price);

    let vaVolume = poc.volume;
    let vahIndex = pocIndex;
    let valIndex = pocIndex;

    while (vaVolume < targetVA && (vahIndex < sortedByPrice.length - 1 || valIndex > 0)) {
      const upVol = vahIndex < sortedByPrice.length - 1 ? sortedByPrice[vahIndex + 1].volume : 0;
      const downVol = valIndex > 0 ? sortedByPrice[valIndex - 1].volume : 0;

      if (upVol >= downVol && vahIndex < sortedByPrice.length - 1) {
        vahIndex++;
        vaVolume += sortedByPrice[vahIndex].volume;
      } else if (valIndex > 0) {
        valIndex--;
        vaVolume += sortedByPrice[valIndex].volume;
      } else {
        break;
      }
    }

    const vah = sortedByPrice[vahIndex]?.price || maxPrice;
    const val = sortedByPrice[valIndex]?.price || minPrice;

    // Find High Volume Nodes (HVN) and Low Volume Nodes (LVN)
    const avgVolume = totalVolume / levels.length;
    const hvnThreshold = avgVolume * 1.5;
    const lvnThreshold = avgVolume * 0.5;

    const hvnLevels: number[] = [];
    const lvnLevels: number[] = [];

    for (const level of levels) {
      if (level.volume >= hvnThreshold) {
        hvnLevels.push(level.price);
      } else if (level.volume <= lvnThreshold) {
        lvnLevels.push(level.price);
      }
    }

    return {
      levels,
      poc,
      vah,
      val,
      hvnLevels,
      lvnLevels,
      maxVolume,
      minPrice,
      maxPrice,
    };
  }, [candles, tickSize, height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const profile = calculateProfile();
    if (!profile) {
      ctx.fillStyle = '#0f0f14';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const { levels, poc, vah, val, hvnLevels, maxVolume, minPrice, maxPrice } = profile;
    const priceRange = maxPrice - minPrice || 1;

    // Background
    ctx.fillStyle = mode === 'overlay' ? 'transparent' : '#0f0f14';
    ctx.fillRect(0, 0, width, height);

    const priceToY = (price: number) => {
      return ((maxPrice - price) / priceRange) * height;
    };

    const barHeight = Math.max(2, height / levels.length - 1);

    // Draw each volume level
    for (const level of levels) {
      const y = priceToY(level.price);
      const normalizedVol = level.volume / maxVolume;
      const totalBarWidth = normalizedVol * (width - (showLabels ? 35 : 10));

      const inValueArea = level.price >= val && level.price <= vah;
      const isPOC = level.price === poc.price;
      const isHVN = hvnLevels.includes(level.price);

      // Calculate buy/sell widths
      const buyRatio = level.volume > 0 ? level.buyVolume / level.volume : 0.5;
      const buyWidth = totalBarWidth * buyRatio;
      const sellWidth = totalBarWidth * (1 - buyRatio);

      // Determine colors based on position
      let buyAlpha = 0.4;
      let sellAlpha = 0.4;

      if (isPOC) {
        buyAlpha = 1;
        sellAlpha = 1;
      } else if (inValueArea) {
        buyAlpha = 0.7;
        sellAlpha = 0.7;
      } else if (isHVN) {
        buyAlpha = 0.6;
        sellAlpha = 0.6;
      }

      // Draw buy volume (from right, green)
      if (mode === 'sidebar') {
        ctx.fillStyle = `rgba(34, 197, 94, ${buyAlpha})`;
        ctx.fillRect(width - buyWidth - (showLabels ? 35 : 5), y, buyWidth, barHeight);

        // Draw sell volume (red, to the left of buy)
        ctx.fillStyle = `rgba(239, 68, 68, ${sellAlpha})`;
        ctx.fillRect(width - buyWidth - sellWidth - (showLabels ? 35 : 5), y, sellWidth, barHeight);
      } else {
        // Overlay mode - draw from right side like WH SelfInvest
        // Draw value area fill first (subtle)
        if (inValueArea && !isPOC) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
          ctx.fillRect(width - totalBarWidth, y, totalBarWidth, barHeight);
        }

        // Main volume bar
        if (isPOC) {
          // POC - prominent yellow/orange
          ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
        } else if (inValueArea) {
          // Value Area - blue
          ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
        } else {
          // Outside VA - lighter gray
          ctx.fillStyle = 'rgba(156, 163, 175, 0.35)';
        }
        ctx.fillRect(width - totalBarWidth, y, totalBarWidth, barHeight);

        // Draw delta indicator on left edge of bar
        const deltaWidth = Math.min(4, totalBarWidth * 0.15);
        if (level.delta >= 0) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
        } else {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        }
        ctx.fillRect(width - totalBarWidth, y, deltaWidth, barHeight);
      }

      // POC line
      if (isPOC) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = mode === 'overlay' ? 1.5 : 2;
        ctx.beginPath();
        if (mode === 'overlay') {
          // Draw POC line across the full width for overlay mode
          ctx.setLineDash([6, 3]);
          ctx.moveTo(0, y + barHeight / 2);
          ctx.lineTo(width, y + barHeight / 2);
          ctx.setLineDash([]);
        } else {
          ctx.moveTo(0, y + barHeight / 2);
          ctx.lineTo(8, y + barHeight / 2);
        }
        ctx.stroke();
      }
    }

    // Draw Value Area boundaries
    const vahY = priceToY(vah);
    const valY = priceToY(val);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // VAH line
    ctx.beginPath();
    ctx.moveTo(0, vahY);
    ctx.lineTo(width, vahY);
    ctx.stroke();

    // VAL line
    ctx.beginPath();
    ctx.moveTo(0, valY);
    ctx.lineTo(width, valY);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw overlay labels on right side of profile
    if (mode === 'overlay') {
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';

      // POC label
      const pocY = priceToY(poc.price);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`POC ${poc.price.toFixed(2)}`, 4, pocY - 2);

      // VAH label
      ctx.fillStyle = '#3b82f6';
      ctx.fillText(`VAH ${vah.toFixed(2)}`, 4, vahY - 2);

      // VAL label
      ctx.fillText(`VAL ${val.toFixed(2)}`, 4, valY + 12);
    }

    // Draw labels if sidebar mode
    if (showLabels && mode === 'sidebar') {
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';

      // POC label
      const pocY = priceToY(poc.price);
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('POC', width - 2, pocY + barHeight / 2 + 3);

      // VAH/VAL labels
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('VAH', width - 2, vahY + 10);
      ctx.fillText('VAL', width - 2, valY - 2);

      // Current price indicator
      if (currentPrice >= minPrice && currentPrice <= maxPrice) {
        const currentY = priceToY(currentPrice);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(0, currentY);
        ctx.lineTo(width - 35, currentY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw delta indicator (cumulative)
    if (mode === 'sidebar') {
      const totalDelta = levels.reduce((sum, l) => sum + l.delta, 0);
      const deltaColor = totalDelta >= 0 ? '#22c55e' : '#ef4444';
      ctx.fillStyle = deltaColor;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Δ ${totalDelta >= 0 ? '+' : ''}${(totalDelta / 1000).toFixed(1)}K`, 2, 12);
    }

  }, [calculateProfile, width, height, mode, showLabels, currentPrice]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const profile = calculateProfile();
    if (!profile) return;

    const { levels, minPrice, maxPrice } = profile;
    const priceRange = maxPrice - minPrice;
    const price = maxPrice - (y / height) * priceRange;

    // Find closest level
    let closest = levels[0];
    let minDist = Infinity;
    for (const level of levels) {
      const dist = Math.abs(level.price - price);
      if (dist < minDist) {
        minDist = dist;
        closest = level;
      }
    }

    setHoveredLevel(closest);
  }, [calculateProfile, height]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className={mode === 'overlay' ? 'absolute left-0 top-0 pointer-events-none' : ''}
        style={{ width: `${width}px`, height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredLevel(null)}
      />

      {/* Tooltip */}
      {hoveredLevel && mode === 'sidebar' && (
        <div className="absolute top-2 left-2 bg-zinc-900/95 border border-zinc-700 rounded px-2 py-1 text-xs z-10">
          <div className="text-zinc-400">Price: <span className="text-white">${hoveredLevel.price.toFixed(2)}</span></div>
          <div className="text-zinc-400">Volume: <span className="text-white">{(hoveredLevel.volume / 1000).toFixed(1)}K</span></div>
          <div className="text-zinc-400">Buy: <span className="text-green-400">{(hoveredLevel.buyVolume / 1000).toFixed(1)}K</span></div>
          <div className="text-zinc-400">Sell: <span className="text-red-400">{(hoveredLevel.sellVolume / 1000).toFixed(1)}K</span></div>
          <div className="text-zinc-400">Delta: <span className={hoveredLevel.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
            {hoveredLevel.delta >= 0 ? '+' : ''}{(hoveredLevel.delta / 1000).toFixed(1)}K
          </span></div>
        </div>
      )}
    </div>
  );
}
