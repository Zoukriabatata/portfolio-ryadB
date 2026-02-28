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

import { useRef, useEffect, useCallback } from 'react';
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
}: VolumeProfilePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredBinRef = useRef<PriceBin | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const priceToY = useCallback((price: number): number => {
    if (priceMax <= priceMin) return 0;
    return ((priceMax - price) / (priceMax - priceMin)) * chartHeight;
  }, [priceMin, priceMax, chartHeight]);

  // Render the volume profile on canvas
  const renderProfile = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
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

    // Background (opaque to cleanly separate from chart)
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    // Left border (subtle separator)
    ctx.strokeStyle = theme.border;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, h);
    ctx.stroke();
    ctx.globalAlpha = 1;

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

    // Draw bars
    for (const bin of bins) {
      const y = priceToY(bin.price);

      // Skip bins outside viewport
      if (y < -barHeight || y > h + barHeight) continue;

      const bidRatio = bin.bidVolume / maxBinVolume;
      const askRatio = bin.askVolume / maxBinVolume;

      const bidBarWidth = (bidRatio * barMaxWidth) / 2;
      const askBarWidth = (askRatio * barMaxWidth) / 2;

      // Bid bar (left from center, red)
      if (bidBarWidth > 0.5) {
        ctx.fillStyle = VP_COLORS.bidAlpha;
        ctx.fillRect(centerX - bidBarWidth, y - barHeight / 2, bidBarWidth, Math.max(1, barHeight));
      }

      // Ask bar (right from center, green)
      if (askBarWidth > 0.5) {
        ctx.fillStyle = VP_COLORS.askAlpha;
        ctx.fillRect(centerX, y - barHeight / 2, askBarWidth, Math.max(1, barHeight));
      }

      // Delta border indicator
      if (bin.delta !== 0 && barHeight >= 2) {
        const deltaColor = bin.delta > 0 ? VP_COLORS.deltaPositive : VP_COLORS.deltaNegative;
        ctx.fillStyle = deltaColor;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(centerX - 0.5, y - barHeight / 2, 1, Math.max(1, barHeight));
        ctx.globalAlpha = 1;
      }
    }

    // Draw POC line
    const pocY = priceToY(valueArea.poc);
    if (pocY >= 0 && pocY <= h) {
      // POC highlight bar
      ctx.fillStyle = VP_COLORS.pocFill;
      ctx.fillRect(1, pocY - Math.max(barHeight / 2, 2), w - 1, Math.max(barHeight, 4));

      // POC line
      ctx.strokeStyle = VP_COLORS.poc;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(1, pocY);
      ctx.lineTo(w, pocY);
      ctx.stroke();

      // POC label
      ctx.fillStyle = VP_COLORS.poc;
      ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('POC', 4, pocY - 4);
    }

    // Draw VAH line
    if (vahY >= 0 && vahY <= h) {
      ctx.strokeStyle = VP_COLORS.vah;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(1, vahY);
      ctx.lineTo(w, vahY);
      ctx.stroke();
      ctx.setLineDash([]);

      // VAH label
      ctx.fillStyle = VP_COLORS.vah;
      ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('VAH', 4, vahY - 3);
    }

    // Draw VAL line
    if (valY >= 0 && valY <= h) {
      ctx.strokeStyle = VP_COLORS.val;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(1, valY);
      ctx.lineTo(w, valY);
      ctx.stroke();
      ctx.setLineDash([]);

      // VAL label
      ctx.fillStyle = VP_COLORS.val;
      ctx.font = '8px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('VAL', 4, valY + 10);
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
    ctx.fillStyle = data.totalDelta >= 0 ? VP_COLORS.deltaPositive : VP_COLORS.deltaNegative;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Δ ${deltaStr}`, w / 2, 12);
  }, [data, priceMin, priceMax, chartHeight, width, theme, priceToY]);

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
