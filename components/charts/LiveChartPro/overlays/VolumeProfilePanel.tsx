'use client';

/**
 * VOLUME PROFILE PANEL — Right-side canvas overlay for /live
 *
 * Visual style matches FootprintCanvasRenderer.ts exactly:
 * - Left-aligned bid+ask split bars (bid left portion, ask right portion)
 * - VA-aware opacity (inside VA brighter, outside dimmer)
 * - POC arrow triangle marker on left edge
 * - Dashed VAH/VAL lines with pill labels
 * - POC glow background + outline
 * - Thin separator between bid/ask
 * - Colors: bid #ef5350 / ask #26a69a / POC #e2b93b / VA line #7c85f6
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
  side?: 'left' | 'right';
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

// Match FootprintCanvasRenderer colors exactly
const VP_COLORS = {
  bid: '#5c6bc0',    // ATAS-style blue/indigo for bid (sell) volume
  ask: '#42a5f5',    // Lighter blue for ask (buy) volume
  poc: '#e2b93b',
  vaFill: '#5e7ce2',
  vahValLine: '#7c85f6',
  separator: '#0a0a0a',
};

export default function VolumeProfilePanel({
  data,
  priceMin,
  priceMax,
  chartHeight,
  width = 200,
  side = 'right',
  theme = DEFAULT_THEME,
  vpColors,
  vpBackground,
}: VolumeProfilePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredBinRef = useRef<PriceBin | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  const renderProfile = useCallback((currentSide: 'left' | 'right' = 'right') => {
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
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const bidColor = vpColors?.bid || VP_COLORS.bid;
    const askColor = vpColors?.ask || VP_COLORS.ask;
    const vpOpacity = vpColors?.opacity ?? 0.7;

    // Background
    if (vpBackground?.show) {
      ctx.fillStyle = vpBackground.color;
      ctx.globalAlpha = vpBackground.opacity;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    const { bins, valueArea } = data;
    if (bins.length === 0) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No VP Data', w / 2, h / 2);
      return;
    }

    const priceRange = priceMax - priceMin;
    if (priceRange <= 0) return;

    // Determine tick size from bins
    let tickSize = 1;
    if (bins.length >= 2) {
      const prices = bins.map(b => b.price).sort((a, b) => a - b);
      for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) { tickSize = diff; break; }
      }
    }

    const barHeight = Math.max(1, Math.min((tickSize / priceRange) * chartHeight * 0.85, 10));

    // Filter to visible bins FIRST, then compute max from visible only
    const viewportPadding = tickSize * 2;
    const visibleBins = bins.filter(b =>
      b.price >= priceMin - viewportPadding && b.price <= priceMax + viewportPadding
    );

    // Max volume from visible bins only — prevents out-of-view POC from shrinking visible bars
    const maxVolume = visibleBins.reduce((max, b) => Math.max(max, b.totalVolume), 0);
    if (maxVolume === 0) {
      ctx.fillStyle = theme.textMuted;
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No VP Data', w / 2, h / 2);
      return;
    }

    const vahPrice = valueArea.vah;
    const valPrice = valueArea.val;
    const pocPrice = valueArea.poc;

    const isLeft = currentSide === 'left';
    const barMaxWidth = w - 16;

    // ── Value Area shading band (only if visible) ──
    if (vahPrice >= priceMin && valPrice <= priceMax) {
      const vahY = priceToY(Math.min(vahPrice, priceMax));
      const valY = priceToY(Math.max(valPrice, priceMin));
      const vaTop = Math.max(0, Math.min(vahY, valY));
      const vaBottom = Math.min(h, Math.max(vahY, valY));
      if (vaBottom > vaTop) {
        ctx.fillStyle = VP_COLORS.vaFill;
        ctx.globalAlpha = 0.04 * vpOpacity;
        ctx.fillRect(0, vaTop, w, vaBottom - vaTop);
        ctx.globalAlpha = 1;
      }
    }

    for (const bin of visibleBins) {
      const y = priceToY(bin.price);
      if (y < -barHeight || y > h + barHeight) continue;

      const isPOC = bin.price === pocPrice;
      const isValueArea = bin.price >= valPrice && bin.price <= vahPrice;
      // Sqrt scale — makes smaller bars more visible (ATAS-style)
      const rawIntensity = bin.totalVolume / maxVolume;
      const intensity = Math.pow(rawIntensity, 0.5); // sqrt for better distribution
      const totalBarW = Math.max(2, intensity * barMaxWidth);
      const barY = y - barHeight / 2;

      const bidW = bin.totalVolume > 0 ? (bin.bidVolume / bin.totalVolume) * totalBarW : 0;
      const askW = bin.totalVolume > 0 ? (bin.askVolume / bin.totalVolume) * totalBarW : 0;

      // Coordinates: left side grows right from edge; right side grows left from edge
      const barX = isLeft ? 4 : (w - 4) - totalBarW;
      const bidStartX = isLeft ? barX : barX;
      const askStartX = isLeft ? barX + bidW : (w - 4) - askW;

      // ── POC highlight glow background ──
      if (isPOC) {
        ctx.fillStyle = VP_COLORS.poc;
        ctx.globalAlpha = 0.12 * vpOpacity;
        ctx.fillRect(barX - (isLeft ? 1 : 5), barY - 2, totalBarW + 6, barHeight + 4);
        ctx.globalAlpha = 1;
      }

      // ── Bid bar ──
      if (bidW > 0.5) {
        if (isPOC) {
          ctx.fillStyle = VP_COLORS.poc;
          ctx.globalAlpha = 0.85 * vpOpacity;
        } else if (isValueArea) {
          ctx.fillStyle = bidColor;
          ctx.globalAlpha = (0.35 + intensity * 0.5) * vpOpacity;
        } else {
          ctx.fillStyle = bidColor;
          ctx.globalAlpha = (0.15 + intensity * 0.25) * vpOpacity;
        }
        ctx.fillRect(bidStartX, barY, bidW, barHeight);
      }

      // ── Ask bar ──
      if (askW > 0.5) {
        if (isPOC) {
          ctx.fillStyle = VP_COLORS.poc;
          ctx.globalAlpha = 0.7 * vpOpacity;
        } else if (isValueArea) {
          ctx.fillStyle = askColor;
          ctx.globalAlpha = (0.35 + intensity * 0.5) * vpOpacity;
        } else {
          ctx.fillStyle = askColor;
          ctx.globalAlpha = (0.15 + intensity * 0.25) * vpOpacity;
        }
        ctx.fillRect(askStartX, barY, askW, barHeight);
      }

      // ── Thin separator between bid/ask ──
      if (bidW > 1 && askW > 1) {
        ctx.fillStyle = VP_COLORS.separator;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(isLeft ? barX + bidW - 0.5 : askStartX - 0.5, barY, 1, barHeight);
      }

      // ── POC outline ──
      if (isPOC && totalBarW > 2) {
        ctx.strokeStyle = VP_COLORS.poc;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9 * vpOpacity;
        ctx.strokeRect(barX, barY, totalBarW, barHeight);
      }

      // ── Volume text ──
      if (barHeight >= 8 && totalBarW > 30 && intensity > 0.15) {
        ctx.globalAlpha = isPOC ? 0.95 : 0.7;
        ctx.fillStyle = isPOC ? '#ffffff' : theme.textMuted;
        ctx.font = `${isPOC ? 'bold ' : ''}${barHeight >= 12 ? 8 : 7}px "Consolas", monospace`;
        const volText = bin.totalVolume >= 1000
          ? `${(bin.totalVolume / 1000).toFixed(1)}K`
          : Math.round(bin.totalVolume).toString();
        if (isLeft) {
          ctx.textAlign = 'left';
          const textX = barX + totalBarW + 3;
          if (textX + 30 < w) ctx.fillText(volText, textX, y + 3);
        } else {
          ctx.textAlign = 'right';
          const textX = barX - 3;
          if (textX > 30) ctx.fillText(volText, textX, y + 3);
        }
      }

      ctx.globalAlpha = 1;
    }

    // ── POC arrow marker ──
    const pocY = priceToY(pocPrice);
    if (pocY >= 0 && pocY <= h) {
      ctx.save();
      ctx.fillStyle = VP_COLORS.poc;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      if (isLeft) {
        // Left edge, pointing right
        ctx.moveTo(0, pocY - 4);
        ctx.lineTo(5, pocY);
        ctx.lineTo(0, pocY + 4);
      } else {
        // Right edge, pointing left
        ctx.moveTo(w, pocY - 4);
        ctx.lineTo(w - 5, pocY);
        ctx.lineTo(w, pocY + 4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── VAH / VAL dashed lines ──
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = VP_COLORS.vahValLine;
    ctx.globalAlpha = 0.6 * vpOpacity;

    if (vahY >= 0 && vahY <= h) {
      ctx.beginPath();
      ctx.moveTo(0, vahY);
      ctx.lineTo(w, vahY);
      ctx.stroke();
    }
    if (valY >= 0 && valY <= h) {
      ctx.beginPath();
      ctx.moveTo(0, valY);
      ctx.lineTo(w, valY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // ── Pill labels (right-anchored) ──
    const c = ctx;
    function renderPillLabel(text: string, rightEdge: number, y: number, color: string) {
      c.font = 'bold 7px "Consolas", monospace';
      const tw = c.measureText(text).width;
      const pw = tw + 6;
      const ph = 10;
      const x = rightEdge - pw;
      c.fillStyle = color;
      c.globalAlpha = 0.18;
      roundRect(c, x, y, pw, ph, 2);
      c.fill();
      c.globalAlpha = 0.9;
      c.fillStyle = color;
      c.textAlign = 'left';
      c.fillText(text, x + 3, y + 7.5);
      c.globalAlpha = 1;
    }

    // For left side: pills align left (x = barLeft + offset); for right: pills align at barRight
    const pillRightEdge = isLeft ? 4 + barMaxWidth + 1 : w - 4 + 1;
    if (vahY >= 0 && vahY <= h) {
      renderPillLabel('VAH', isLeft ? pillRightEdge : pillRightEdge, vahY - 10, VP_COLORS.vahValLine);
    }
    if (valY >= 0 && valY <= h) {
      renderPillLabel('VAL', isLeft ? pillRightEdge : pillRightEdge, valY + 1, VP_COLORS.vahValLine);
    }
    if (pocY >= 0 && pocY <= h) {
      renderPillLabel('POC', isLeft ? pillRightEdge - 4 : pillRightEdge - 4, pocY - 5, VP_COLORS.poc);
    }

    // ── Stats: delta top, vol bottom ──
    const deltaStr = data.totalDelta >= 0
      ? `+${formatCompact(data.totalDelta)}`
      : formatCompact(data.totalDelta);
    ctx.fillStyle = data.totalDelta >= 0 ? askColor : bidColor;
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Δ ${deltaStr}`, w / 2, 12);

    const totalVol = data.totalVolume;
    const volStr = totalVol >= 1_000_000
      ? `${(totalVol / 1_000_000).toFixed(1)}M`
      : totalVol >= 1_000
        ? `${(totalVol / 1_000).toFixed(1)}K`
        : totalVol.toFixed(0);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(`Vol: ${volStr}`, w / 2, h - 8);

  }, [data, priceMin, priceMax, chartHeight, width, side, theme, priceToY, currentDpr, vpColors, vpBackground]);

  // Hover tooltip
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const price = priceMax - (mouseY / chartHeight) * (priceMax - priceMin);

      let closest: PriceBin | null = null;
      let minDist = Infinity;
      for (const bin of data.bins) {
        const dist = Math.abs(bin.price - price);
        if (dist < minDist) { minDist = dist; closest = bin; }
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
          <div style="color:${closest.delta >= 0 ? VP_COLORS.ask : VP_COLORS.bid}">Δ: ${closest.delta >= 0 ? '+' : ''}${formatCompact(closest.delta)}</div>
          <div style="color:#9ca3af">Trades: ${closest.tradeCount}</div>
        `;
      }
    };

    const handleMouseLeave = () => {
      hoveredBinRef.current = null;
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [data.bins, priceMin, priceMax, chartHeight]);

  useEffect(() => {
    renderProfile(side);
  }, [renderProfile, side]);

  return (
    <div className="relative flex-shrink-0" style={{ width, height: chartHeight }}>
      <canvas
        ref={canvasRef}
        style={{ width, height: chartHeight, cursor: 'crosshair' }}
      />
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
