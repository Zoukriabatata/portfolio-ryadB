'use client';

/**
 * VOLUME PROFILE PANEL — Right-side canvas overlay for /live
 *
 * Renders a professional Volume Profile directly on the chart:
 * - Bid/Ask separated horizontal bars (red left / green right)
 * - Delta color coding per level
 * - POC (Point of Control) highlighted line
 * - Value Area (VAH/VAL) zone with subtle highlight
 * - Synced with chart viewport (priceMin/priceMax)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { LiveVolumeProfileData } from '@/hooks/useLiveVolumeProfile';
import type { PriceBin } from '@/lib/orderflow/VolumeProfileEngine';

interface VolumeProfilePanelProps {
  data: LiveVolumeProfileData;
  priceMin: number;
  priceMax: number;
  chartHeight: number;
  width?: number;
  theme?: {
    background: string;
    border: string;
    text: string;
    textMuted: string;
  };
  vpColors?: { bid: string; ask: string; opacity: number };
  vpBackground?: { show: boolean; color: string; opacity: number };
  vpGradient?: { enabled: boolean; askEnd: string; bidEnd: string };
}

const DEFAULT_THEME = {
  background: '#0a0a0a',
  border: '#1a1a1a',
  text: '#888888',
  textMuted: '#555555',
};

const VP_COLORS = {
  bid: '#ef4444',        // Red — sell aggressor (hit bid)
  ask: '#22c55e',        // Green — buy aggressor (lifted ask)
  bidAlpha: 'rgba(239, 68, 68, 0.6)',
  askAlpha: 'rgba(34, 197, 94, 0.6)',
  poc: '#f59e0b',        // Amber — POC line
  pocFill: 'rgba(245, 158, 11, 0.15)',
  vah: '#3b82f6',        // Blue — VAH
  val: '#3b82f6',        // Blue — VAL
  vaFill: 'rgba(59, 130, 246, 0.06)',
  deltaPositive: '#22c55e',
  deltaNegative: '#ef4444',
  hoverBg: 'rgba(255, 255, 255, 0.04)',
};

export default function VolumeProfilePanel({
  data,
  priceMin,
  priceMax,
  chartHeight,
  width = 140,
  theme = DEFAULT_THEME,
  vpColors,
  vpBackground,
  vpGradient,
}: VolumeProfilePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredBinRef = useRef<PriceBin | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Track DPR for sharp rendering at all zoom levels
  const [currentDpr, setCurrentDpr] = useState(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  );

  useEffect(() => {
    let dpr = window.devicePixelRatio || 1;
    let query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const handler = () => {
      const newDpr = window.devicePixelRatio || 1;
      if (newDpr !== dpr) {
        dpr = newDpr;
        setCurrentDpr(newDpr);
      }
      query = window.matchMedia(`(resolution: ${newDpr}dppx)`);
      query.addEventListener('change', handler, { once: true });
    };
    query.addEventListener('change', handler, { once: true });
    return () => query.removeEventListener('change', handler);
  }, []);

  const priceToY = useCallback((price: number): number => {
    if (priceMax <= priceMin) return 0;
    return ((priceMax - price) / (priceMax - priceMin)) * chartHeight;
  }, [priceMin, priceMax, chartHeight]);

  // Render the volume profile on canvas
  const renderProfile = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = currentDpr;
    const w = width;
    const h = chartHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Safety: ensure compositing is correct
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Dynamic colors from props (fallback to hardcoded defaults)
    const bidColor = vpColors?.bid || VP_COLORS.bid;
    const askColor = vpColors?.ask || VP_COLORS.ask;
    const barOpacity = vpColors?.opacity ?? 0.6;

    // Background
    if (vpBackground?.show) {
      ctx.fillStyle = vpBackground.color;
      ctx.globalAlpha = vpBackground.opacity;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    const { bins, valueArea, maxBinVolume } = data;
    if (bins.length === 0 || maxBinVolume === 0) {
      // "No data" label
      ctx.fillStyle = theme.textMuted;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No VP Data', w / 2, h / 2);
      return;
    }

    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) return;

    // Draw Value Area zone
    const vahY = priceToY(valueArea.vah);
    const valY = priceToY(valueArea.val);
    ctx.fillStyle = VP_COLORS.vaFill;
    ctx.fillRect(1, vahY, w - 1, valY - vahY);

    // Calculate bar metrics
    const barMaxWidth = w - 12; // 6px margin each side
    const centerX = w / 2;

    // Determine tick size from bins for bar height
    let tickSize = 1;
    if (bins.length >= 2) {
      const prices = bins.map(b => b.price).sort((a, b) => a - b);
      for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) {
          tickSize = diff;
          break;
        }
      }
    }

    const barHeight = Math.max(1, (tickSize / priceRange) * chartHeight - 1);

    // Gradient settings
    const gradEnabled = vpGradient?.enabled ?? false;
    const gradAskEnd = vpGradient?.askEnd || '#0a3d1a';
    const gradBidEnd = vpGradient?.bidEnd || '#3d0a0a';

    // Draw bars — each bar uses per-bar opacity, never CSS/container opacity
    for (const bin of bins) {
      const y = priceToY(bin.price);

      // Skip bins outside viewport
      if (y < -barHeight || y > h + barHeight) continue;

      const bidRatio = bin.bidVolume / maxBinVolume;
      const askRatio = bin.askVolume / maxBinVolume;
      const totalIntensity = bin.totalVolume / maxBinVolume;

      const bidBarWidth = (bidRatio * barMaxWidth) / 2;
      const askBarWidth = (askRatio * barMaxWidth) / 2;

      // Bar opacity: volume-based, never distance-from-price-based
      // Each bar uses same base opacity — intensity comes from color gradient only
      const binBarOpacity = barOpacity;

      // Bid bar (left from center, red)
      if (bidBarWidth > 0.5) {
        ctx.fillStyle = gradEnabled ? interpolateHex(gradBidEnd, bidColor, totalIntensity) : bidColor;
        ctx.globalAlpha = binBarOpacity;
        ctx.fillRect(centerX - bidBarWidth, y - barHeight / 2, bidBarWidth, Math.max(1, barHeight));
      }

      // Ask bar (right from center, green)
      if (askBarWidth > 0.5) {
        ctx.fillStyle = gradEnabled ? interpolateHex(gradAskEnd, askColor, totalIntensity) : askColor;
        ctx.globalAlpha = binBarOpacity;
        ctx.fillRect(centerX, y - barHeight / 2, askBarWidth, Math.max(1, barHeight));
      }

      // Delta border indicator
      if (bin.delta !== 0 && barHeight >= 2) {
        const deltaColor = bin.delta > 0 ? askColor : bidColor;
        ctx.fillStyle = deltaColor;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(centerX - 0.5, y - barHeight / 2, 1, Math.max(1, barHeight));
      }
    }

    // Reset alpha after bar loop
    ctx.globalAlpha = 1;

    // POC highlight bar (subtle indicator within VP bars)
    const pocY = priceToY(valueArea.poc);
    if (pocY >= 0 && pocY <= h) {
      ctx.fillStyle = VP_COLORS.pocFill;
      ctx.fillRect(1, pocY - Math.max(barHeight / 2, 2), w - 1, Math.max(barHeight, 4));
    }

    // Stats summary at bottom
    const statsY = h - 8;
    ctx.fillStyle = theme.textMuted;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';

    const totalVol = data.totalVolume;
    const volStr = totalVol >= 1_000_000
      ? `${(totalVol / 1_000_000).toFixed(1)}M`
      : totalVol >= 1_000
        ? `${(totalVol / 1_000).toFixed(1)}K`
        : totalVol.toFixed(0);
    ctx.fillText(`Vol: ${volStr}`, w / 2, statsY);

    // Delta at top
    const deltaStr = data.totalDelta >= 0
      ? `+${formatCompact(data.totalDelta)}`
      : formatCompact(data.totalDelta);
    ctx.fillStyle = data.totalDelta >= 0 ? askColor : bidColor;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Δ ${deltaStr}`, w / 2, 12);
  }, [data, priceMin, priceMax, chartHeight, width, theme, priceToY, currentDpr, vpColors, vpBackground, vpGradient]);

  // Handle mouse hover for tooltip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const price = priceMax - (mouseY / chartHeight) * (priceMax - priceMin);

      // Find closest bin
      let closest: PriceBin | null = null;
      let minDist = Infinity;
      for (const bin of data.bins) {
        const dist = Math.abs(bin.price - price);
        if (dist < minDist) {
          minDist = dist;
          closest = bin;
        }
      }

      hoveredBinRef.current = closest;

      if (closest && tooltipRef.current) {
        const binY = ((priceMax - closest.price) / (priceMax - priceMin)) * chartHeight;
        tooltipRef.current.style.display = 'block';
        tooltipRef.current.style.top = `${Math.max(0, Math.min(chartHeight - 80, binY - 40))}px`;
        tooltipRef.current.innerHTML = `
          <div style="font-weight:600;color:#e5e7eb;margin-bottom:2px">${closest.price.toFixed(2)}</div>
          <div style="color:${VP_COLORS.ask}">Ask: ${formatCompact(closest.askVolume)}</div>
          <div style="color:${VP_COLORS.bid}">Bid: ${formatCompact(closest.bidVolume)}</div>
          <div style="color:${closest.delta >= 0 ? VP_COLORS.deltaPositive : VP_COLORS.deltaNegative}">Δ: ${closest.delta >= 0 ? '+' : ''}${formatCompact(closest.delta)}</div>
          <div style="color:#9ca3af">Trades: ${closest.tradeCount}</div>
        `;
      }
    };

    const handleMouseLeave = () => {
      hoveredBinRef.current = null;
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [data.bins, priceMin, priceMax, chartHeight]);

  // Re-render when data or viewport changes
  useEffect(() => {
    renderProfile();
  }, [renderProfile]);

  return (
    <div className="relative flex-shrink-0" style={{ width, height: chartHeight }}>
      <canvas
        ref={canvasRef}
        style={{ width, height: chartHeight, cursor: 'crosshair' }}
      />
      {/* Hover tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none z-10 hidden"
        style={{
          right: width + 4,
          padding: '6px 8px',
          borderRadius: 6,
          backgroundColor: 'rgba(15, 15, 15, 0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: 10,
          lineHeight: '14px',
          color: '#9ca3af',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
        }}
      />
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function interpolateHex(startHex: string, endHex: string, t: number): string {
  const r1 = parseInt(startHex.slice(1, 3), 16);
  const g1 = parseInt(startHex.slice(3, 5), 16);
  const b1 = parseInt(startHex.slice(5, 7), 16);
  const r2 = parseInt(endHex.slice(1, 3), 16);
  const g2 = parseInt(endHex.slice(3, 5), 16);
  const b2 = parseInt(endHex.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
