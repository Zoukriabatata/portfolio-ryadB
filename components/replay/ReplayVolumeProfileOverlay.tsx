'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { VolumeProfileData, VolumeProfileLevel } from '@/lib/replay/indicators/ReplayVolumeProfile';

interface ReplayVolumeProfileOverlayProps {
  visible?: boolean;
}

export default function ReplayVolumeProfileOverlay({ visible = true }: ReplayVolumeProfileOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showDelta, setShowDelta] = useState(false);
  const rafRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || collapsed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = getReplayEngine();
    const profile = engine.getVolumeProfile();

    // Size canvas to container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    if (profile.levels.length === 0) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Layout: bars fill the width with padding
    const padding = 4;
    const barMaxWidth = w - padding * 2;
    const levelHeight = Math.max(1, Math.min(4, (h - 20) / profile.levels.length));
    const totalHeight = profile.levels.length * levelHeight;
    const yOffset = (h - totalHeight) / 2;

    // Find max volume for normalization
    const maxVol = Math.max(...profile.levels.map(l => l.totalVolume));

    for (let i = 0; i < profile.levels.length; i++) {
      const level = profile.levels[i];
      const y = yOffset + i * levelHeight;
      const barW = maxVol > 0 ? (level.totalVolume / maxVol) * barMaxWidth : 0;

      if (showDelta) {
        // Delta mode: buy left (green), sell right (red)
        const buyW = maxVol > 0 ? (level.buyVolume / maxVol) * barMaxWidth : 0;
        const sellW = maxVol > 0 ? (level.sellVolume / maxVol) * barMaxWidth : 0;

        // Buy bar (from right edge going left)
        ctx.fillStyle = level.isPOC
          ? 'rgba(16, 185, 129, 0.7)'
          : level.isValueArea
            ? 'rgba(16, 185, 129, 0.4)'
            : 'rgba(16, 185, 129, 0.2)';
        ctx.fillRect(padding, y, buyW, Math.max(1, levelHeight - 0.5));

        // Sell bar stacked after buy
        ctx.fillStyle = level.isPOC
          ? 'rgba(239, 68, 68, 0.7)'
          : level.isValueArea
            ? 'rgba(239, 68, 68, 0.4)'
            : 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(padding + buyW, y, sellW, Math.max(1, levelHeight - 0.5));
      } else {
        // Total volume mode
        let alpha = 0.2;
        let color = '255,255,255';
        if (level.isPOC) {
          alpha = 0.8;
          color = '16,185,129'; // green
        } else if (level.isValueArea) {
          alpha = 0.35;
          color = '96,165,250'; // blue
        }
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fillRect(padding, y, barW, Math.max(1, levelHeight - 0.5));
      }
    }

    // Draw POC line
    const pocIdx = profile.levels.findIndex(l => l.isPOC);
    if (pocIdx >= 0) {
      const pocY = yOffset + pocIdx * levelHeight + levelHeight / 2;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, pocY);
      ctx.lineTo(w, pocY);
      ctx.stroke();
      ctx.setLineDash([]);

      // POC label
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.font = '9px monospace';
      ctx.fillText(`POC ${profile.poc.toFixed(2)}`, padding + 2, pocY - 3);
    }

    // VAH / VAL labels
    const vahIdx = profile.levels.findIndex(l => l.price === profile.vah);
    const valIdx = profile.levels.findIndex(l => l.price === profile.val);
    if (vahIdx >= 0 && vahIdx !== pocIdx) {
      const vahY = yOffset + vahIdx * levelHeight;
      ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
      ctx.font = '8px monospace';
      ctx.fillText(`VAH ${profile.vah.toFixed(2)}`, padding + 2, vahY - 2);
    }
    if (valIdx >= 0 && valIdx !== pocIdx) {
      const valY = yOffset + valIdx * levelHeight + levelHeight;
      ctx.fillStyle = 'rgba(96, 165, 250, 0.7)';
      ctx.font = '8px monospace';
      ctx.fillText(`VAL ${profile.val.toFixed(2)}`, padding + 2, valY + 9);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [collapsed, showDelta]);

  useEffect(() => {
    if (!visible || collapsed) return;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, collapsed, draw]);

  if (!visible) return null;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute bottom-20 left-3 z-20 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:brightness-110"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        VP ▸
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-20 left-3 z-20 rounded-xl overflow-hidden animate-slideInLeft"
      style={{
        background: 'rgba(10, 10, 15, 0.85)',
        border: '1px solid var(--border)',
        width: 160,
        height: 'calc(100% - 120px)',
        maxHeight: 500,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-[9px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Volume Profile
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDelta(d => !d)}
            className="px-1.5 py-0.5 rounded text-[8px] transition-all"
            style={{
              background: showDelta ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: showDelta ? 'var(--primary)' : 'var(--text-dimmed)',
            }}
            title="Toggle delta view"
          >
            Delta
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[10px] hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            ◂
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full" style={{ height: 'calc(100% - 24px)' }}>
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
