'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { ClusterMapData } from '@/lib/replay/indicators/ReplayClusterMap';

interface ReplayClusterOverlayProps {
  visible?: boolean;
}

export default function ReplayClusterOverlay({ visible = true }: ReplayClusterOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [collapsed, setCollapsed] = useState(true); // Start collapsed (opt-in feature)
  const rafRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || collapsed) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const engine = getReplayEngine();
    const data = engine.getClusterMap(20);

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

    if (data.columns.length === 0 || data.maxCellVolume === 0) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Find global price range across all visible columns
    let globalHigh = -Infinity;
    let globalLow = Infinity;
    for (const col of data.columns) {
      if (col.high > globalHigh) globalHigh = col.high;
      if (col.low < globalLow) globalLow = col.low;
    }
    if (globalHigh === globalLow) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const priceRange = globalHigh - globalLow;
    const colCount = data.columns.length;
    const colWidth = Math.max(1, (w - 8) / colCount);
    const headerH = 16;
    const chartH = h - headerH - 4;

    // Header: time labels
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '8px monospace';
    for (let i = 0; i < colCount; i++) {
      const col = data.columns[i];
      const x = 4 + i * colWidth;
      // Show time label every few columns
      if (i % Math.max(1, Math.floor(colCount / 5)) === 0) {
        const d = new Date(col.startTime);
        const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        ctx.fillText(label, x, 10);
      }
    }

    // Draw cluster cells
    for (let i = 0; i < colCount; i++) {
      const col = data.columns[i];
      const x = 4 + i * colWidth;

      for (const cell of col.cells) {
        const yPct = 1 - (cell.price - globalLow) / priceRange;
        const y = headerH + yPct * chartH;
        const cellH = Math.max(2, chartH / (priceRange / (data.columns[0]?.cells[0]?.price !== data.columns[0]?.cells[1]?.price ? Math.abs((data.columns[0]?.cells[0]?.price || 1) - (data.columns[0]?.cells[1]?.price || 0)) : 1) || 50));

        const intensity = Math.min(1, cell.totalVolume / data.maxCellVolume);

        if (cell.delta > 0) {
          // Positive delta (more buys) — green
          const alpha = 0.15 + intensity * 0.6;
          ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
        } else if (cell.delta < 0) {
          // Negative delta (more sells) — red
          const alpha = 0.15 + intensity * 0.6;
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + intensity * 0.3})`;
        }

        ctx.fillRect(x + 0.5, y - cellH / 2, colWidth - 1, Math.max(1, cellH - 1));

        // Show volume text for high-intensity cells
        if (intensity > 0.5 && colWidth > 20 && cellH > 8) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + intensity * 0.4})`;
          ctx.font = `${Math.min(9, cellH - 2)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(
            cell.totalVolume >= 1000 ? `${(cell.totalVolume / 1000).toFixed(1)}k` : cell.totalVolume.toFixed(0),
            x + colWidth / 2,
            y + 3,
          );
          ctx.textAlign = 'left';
        }
      }

      // Column bottom: total delta
      const deltaColor = col.totalDelta > 0 ? 'rgba(16,185,129,0.6)' : col.totalDelta < 0 ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.fillStyle = deltaColor;
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      const deltaStr = col.totalDelta >= 0 ? `+${col.totalDelta.toFixed(0)}` : col.totalDelta.toFixed(0);
      ctx.fillText(deltaStr, x + colWidth / 2, h - 2);
      ctx.textAlign = 'left';
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [collapsed]);

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
        className="absolute top-12 left-[45px] z-20 px-2 py-1 rounded-lg text-[9px] font-medium transition-all hover:brightness-110"
        style={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
      >
        Clusters
      </button>
    );
  }

  return (
    <div
      className="absolute top-12 left-[45px] z-15 rounded-xl overflow-hidden animate-fadeIn"
      style={{
        background: 'rgba(10, 10, 15, 0.75)',
        border: '1px solid var(--border)',
        width: 'calc(100% - 230px)',
        height: 'calc(100% - 100px)',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1 border-b"
        style={{ borderColor: 'var(--border)', pointerEvents: 'auto' }}
      >
        <span className="text-[9px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cluster Static
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[10px] hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          ×
        </button>
      </div>

      {/* Canvas */}
      <div className="relative w-full" style={{ height: 'calc(100% - 22px)' }}>
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
