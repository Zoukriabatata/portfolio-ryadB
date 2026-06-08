'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { AlertTriangle, Inbox, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { usePageActive } from '@/hooks/usePageActive';
import type { FlowItem } from '@/app/api/options-flow/route';
import { useTrackChartVisit } from '@/hooks/dashboard/useTrackChartVisit';
import { themeColor, themeAlpha } from '@/lib/ui/themeColors';
import { useUIThemeStore } from '@/stores/useUIThemeStore';
import Segment from '@/components/ui/Segment';
import { useValueFlash } from '@/lib/ui/useValueFlash';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Data-semantic colors resolved from the active SENZOUKRIA palette (theme-aware,
// zero hardcoded hex). These hex values feed `${COLOR}NN` alpha-suffix inline
// styles, so they must be resolved hex at render time — `useFlowColors()` reads
// them via themeColor() on the client and re-resolves when the theme changes.
interface FlowColors {
  teal: string;   // --accent (neutral / spot / structure)
  bull: string;   // --bull
  bear: string;   // --bear
  warn: string;   // --warning
  primary: string; // --primary (active / CTA / whale emphasis)
}

function useFlowColors(): FlowColors {
  // Subscribe to the active theme so colors re-resolve on theme change.
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  return useMemo<FlowColors>(() => ({
    teal:    themeColor('--accent'),
    bull:    themeColor('--bull'),
    bear:    themeColor('--bear'),
    warn:    themeColor('--warning'),
    primary: themeColor('--primary'),
  }), [activeTheme]);
}

// Canvas can't parse CSS var() in ctx.font — use the literal JetBrains family
// (loaded via next/font) with monospace fallbacks, per project canvas convention.
const CANVAS_MONO = 'JetBrains Mono, Consolas, monospace';

const SYMBOLS = ['QQQ', 'SPY', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

type TagMeta = Record<FlowItem['tag'], { label: string; color: string; bg: string }>;

function tagMeta(c: FlowColors): TagMeta {
  return {
    WHALE:   { label: 'Whale',   color: c.primary, bg: themeAlpha('--primary', 0.12) },
    UNUSUAL: { label: 'Unusual', color: c.warn,    bg: themeAlpha('--warning', 0.10) },
    BLOCK:   { label: 'Block',   color: c.teal,    bg: themeAlpha('--accent', 0.10) },
    SWEEP:   { label: 'Sweep',   color: c.teal,    bg: themeAlpha('--accent', 0.10) },
    FLOW:    { label: 'Flow',    color: 'var(--text-secondary)', bg: 'var(--surface)' },
  };
}

type TypeFilter = 'all' | 'calls' | 'puts';
type TagFilter  = 'all' | 'whale' | 'unusual' | 'block' | 'sweep';
type SortKey    = 'premium' | 'volume' | 'volOiRatio' | 'iv' | 'dte' | 'gamma' | 'vega' | 'theta';
type ViewTab    = 'table' | 'chart' | 'heatmap';

function fmtPremium(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(n: number, dec = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(dec);
}

// ─── Top Unusual Cards ─────────────────────────────────────────────────────────
function TopUnusualCards({ trades }: { trades: FlowItem[] }) {
  const c = useFlowColors();
  const tags = tagMeta(c);
  if (trades.length === 0) return null;
  return (
    <div className="flex gap-2 px-4 py-2.5 overflow-x-auto shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
      {trades.map((t, i) => {
        const isCall = t.type === 'CALL';
        const tag = tags[t.tag];
        return (
          <div key={t.id} className="flex-shrink-0 rounded-lg px-3 py-2 min-w-[180px]"
            style={{ background: isCall ? `${c.bull}08` : `${c.bear}08`, border: `1px solid ${isCall ? c.bull : c.bear}20` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: tag.bg, color: tag.color }}>
                {tag.label}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-dimmed)' }}>#{i + 1}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[11px] font-black" style={{ color: isCall ? c.bull : c.bear }}>{t.type}</span>
              <span className="text-[14px] font-black font-mono" style={{ color: 'var(--text-primary)' }}>${t.strike}</span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{t.expLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-black font-mono"
                style={{ color: t.premium >= 1_000_000 ? c.primary : c.warn }}>
                {fmtPremium(t.premium)}
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                {fmtNum(t.volume)} vol · {t.volOiRatio.toFixed(1)}x
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Premium Flow Chart (Call vs Put by Strike) — real <canvas> ────────────────
// Strike-bucketed diverging bars: Put premium grows left, Call premium grows
// right of a center axis, with a net-flow tick mark and dashed spot line. Ported
// from the OptionsFlowPanel `NetFlowChart` canvas pattern (zoom / pan / hover) so
// /flow's Chart view matches the rest of the app's rendering quality. Same source
// array (`premiumByStrike`) — `net` is derived (callPremium − putPremium), no
// extra fetch and no change to computation.

type PremStrike = { strike: number; callPremium: number; putPremium: number };
type PremStrikeNet = PremStrike & { net: number };

const PAD = { left: 64, right: 16, top: 8, bottom: 34 } as const;

// Theme-aware canvas palette (hex strings, so `col.bull + 'aa'` alpha concat is
// valid). Resolved from active SENZOUKRIA tokens — zero hardcoded hex.
function canvasClr(): Record<string, string> {
  return {
    bull:          themeColor('--bull'),
    bear:          themeColor('--bear'),
    border:        themeColor('--border'),
    textPrimary:   themeColor('--text-primary'),
    textSecondary: themeColor('--text-secondary'),
    textMuted:     themeColor('--text-muted'),
    accent:        themeColor('--accent'),
  };
}

function fmtStrike(v: number): string {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function useCanvasSize(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        setSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasRef, containerRef]);
  return size;
}

function ChartHint({ isZoomed, zoomPct, onReset }: { isZoomed: boolean; zoomPct: string; onReset(): void }) {
  return (
    <>
      <div
        className="pointer-events-none absolute bottom-0.5 left-0 right-0 flex items-center justify-center gap-2 text-[9px]"
        style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}
      >
        <span>scroll · zoom</span><span>·</span><span>drag · pan</span><span>·</span><span>dbl-click · reset</span>
      </div>
      {isZoomed && (
        <button
          onClick={onReset}
          className="press-fb absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] opacity-60 hover:opacity-100 transition-opacity"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
        >
          <span style={{ color: 'var(--accent)' }}>{zoomPct}%</span> × reset
        </button>
      )}
    </>
  );
}

function PremiumFlowChart({ data, spotPrice }: { data: PremStrike[]; spotPrice: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const panRef       = useRef({ startY: 0, startMin: 0, startMax: 0 });
  // Subscribe to the active theme so the canvas redraws on theme change.
  const activeTheme = useUIThemeStore((s) => s.activeTheme);

  const [isPanning, setIsPanning] = useState(false);
  const [mousePos, setMousePos]   = useState({ x: 0, y: 0 });
  const [hovered, setHovered]     = useState<PremStrikeNet | null>(null);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);

  // Global mouseup to stop panning even when cursor leaves canvas
  useEffect(() => {
    const stop = () => setIsPanning(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); };
  }, []);

  const size = useCanvasSize(canvasRef, containerRef);

  // Derive `net` (callPremium − putPremium) — same data, no extra fetch.
  const sorted = useMemo<PremStrikeNet[]>(
    () => [...data]
      .map(d => ({ ...d, net: d.callPremium - d.putPremium }))
      .sort((a, b) => a.strike - b.strike),
    [data],
  );

  const dataMin   = sorted.length ? sorted[0].strike : 0;
  const dataMax   = sorted.length ? sorted[sorted.length - 1].strike : 1;
  const dataRange = dataMax - dataMin;

  // Default zoom: ~25 strikes centered on spot — guarantees drag always works
  const defaultZoom = useMemo((): { min: number; max: number } | null => {
    if (sorted.length === 0 || spotPrice <= 0 || dataRange <= 0) return null;
    const step = dataRange / Math.max(1, sorted.length - 1);
    const half = Math.min(12, Math.ceil(sorted.length / 2)) * step;
    return {
      min: Math.max(dataMin, spotPrice - half),
      max: Math.min(dataMax, spotPrice + half),
    };
  }, [sorted.length, spotPrice, dataMin, dataMax, dataRange]);

  useEffect(() => { setZoomRange(defaultZoom); }, [sorted.length]);

  const visible = useMemo(() => {
    if (!zoomRange) return sorted;
    return sorted.filter(s => s.strike >= zoomRange.min && s.strike <= zoomRange.max);
  }, [sorted, zoomRange]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const s of visible) m = Math.max(m, s.callPremium, s.putPremium);
    return m || 1;
  }, [visible]);

  const visMin   = zoomRange?.min ?? dataMin;
  const visMax   = zoomRange?.max ?? dataMax;
  const visRange = visMax - visMin;
  const zoomPct  = dataRange > 0 ? ((visRange / dataRange) * 100).toFixed(0) : '100';

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length < 2 || dataRange <= 0) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoomRange(prev => {
        const cMin = prev?.min ?? dataMin;
        const cMax = prev?.max ?? dataMax;
        const range = cMax - cMin;
        const rect = canvas.getBoundingClientRect();
        const chartH = rect.height - PAD.top - PAD.bottom;
        const norm = (e.clientY - rect.top - PAD.top) / chartH;
        const cursorStrike = cMin + norm * range;
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        const newRange = Math.min(dataRange, Math.max(dataRange * 0.1, range * factor));
        const frac = Math.max(0, Math.min(1, (cursorStrike - cMin) / range));
        let nMin = cursorStrike - frac * newRange;
        let nMax = cursorStrike + (1 - frac) * newRange;
        if (nMin < dataMin) { nMax += dataMin - nMin; nMin = dataMin; }
        if (nMax > dataMax) { nMin -= nMax - dataMax; nMax = dataMax; }
        nMin = Math.max(dataMin, nMin);
        nMax = Math.min(dataMax, nMax);
        if (nMax - nMin >= dataRange * 0.98) return null;
        return { min: nMin, max: nMax };
      });
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [sorted, dataMin, dataMax, dataRange]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (visible.length === 0) return;

    const col = canvasClr();
    const chartW = w - PAD.left - PAD.right;
    const chartH = h - PAD.top - PAD.bottom;
    const midX = PAD.left + chartW / 2;
    const n = visible.length;

    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap  = Math.max(1, (chartH - barH * n) / (n + 1));
    const step = sorted.length > 1 ? (sorted[sorted.length - 1].strike - sorted[0].strike) / (sorted.length - 1) : 1;

    visible.forEach((s, i) => {
      const cy = PAD.top + gap + i * (barH + gap) + barH / 2;
      const isH = s === hovered;

      // Row band
      if (i % 2 === 0) {
        ctx.fillStyle = themeAlpha('--text-primary', 0.018);
        ctx.fillRect(PAD.left, cy - barH / 2, chartW, barH);
      }
      if (isH) {
        ctx.fillStyle = themeAlpha('--text-primary', 0.06);
        ctx.fillRect(PAD.left, cy - barH / 2 - 1, chartW, barH + 2);
      }

      const isSpot = Math.abs(s.strike - spotPrice) <= step * 0.6;

      // Strike label
      ctx.font = isH ? `bold 10px ${CANVAS_MONO}` : `10px ${CANVAS_MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isSpot ? col.accent : isH ? col.textPrimary : col.textMuted;
      ctx.fillText(fmtStrike(s.strike), PAD.left - 6, cy);

      // Call bar (right, gradient)
      if (s.callPremium > 0) {
        const bw = (s.callPremium / maxAbs) * (chartW / 2);
        const grad = ctx.createLinearGradient(midX, 0, midX + bw, 0);
        grad.addColorStop(0, col.bull + (isH ? 'ee' : 'aa'));
        grad.addColorStop(1, col.bull + (isH ? '66' : '33'));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(midX + 1, cy - barH / 2, Math.max(bw, 1), barH, Math.min(barH / 2, 4));
        ctx.fill();
        if (bw > 40 && isH) {
          ctx.fillStyle = col.bull;
          ctx.font = `bold 9px ${CANVAS_MONO}`;
          ctx.textAlign = 'left';
          ctx.fillText(`$${fmtNum(s.callPremium)}`, midX + bw + 4, cy);
        }
      }

      // Put bar (left, gradient)
      if (s.putPremium > 0) {
        const bw = (s.putPremium / maxAbs) * (chartW / 2);
        const grad = ctx.createLinearGradient(midX - bw, 0, midX, 0);
        grad.addColorStop(0, col.bear + (isH ? '33' : '22'));
        grad.addColorStop(1, col.bear + (isH ? 'ee' : 'aa'));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(midX - bw - 1, cy - barH / 2, Math.max(bw, 1), barH, Math.min(barH / 2, 4));
        ctx.fill();
        if (bw > 40 && isH) {
          ctx.fillStyle = col.bear;
          ctx.font = `bold 9px ${CANVAS_MONO}`;
          ctx.textAlign = 'right';
          ctx.fillText(`$${fmtNum(s.putPremium)}`, midX - bw - 4, cy);
        }
      }

      // Net tick mark
      const netW = (Math.abs(s.net) / maxAbs) * (chartW / 2);
      const tickH = Math.max(2, barH * 0.3);
      const tickX = s.net >= 0 ? midX + netW : midX - netW - 2;
      ctx.fillStyle = s.net >= 0 ? col.bull : col.bear;
      ctx.globalAlpha = isH ? 1 : 0.5;
      ctx.fillRect(tickX, cy - tickH / 2, 2, tickH);
      ctx.globalAlpha = 1;
    });

    // Center line
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, PAD.top);
    ctx.lineTo(midX, PAD.top + chartH);
    ctx.stroke();

    // Spot dashed line
    if (spotPrice > 0 && spotPrice >= visMin && spotPrice <= visMax) {
      const spotIdx = visible.findIndex(s => Math.abs(s.strike - spotPrice) <= step * 0.6);
      if (spotIdx >= 0) {
        const sy = PAD.top + gap + spotIdx * (barH + gap) + barH / 2;
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(PAD.left, sy);
        ctx.lineTo(PAD.left + chartW, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // X-axis
    const axisY = PAD.top + chartH + 5;
    ctx.fillStyle = col.textMuted;
    ctx.font = `9px ${CANVAS_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`-${fmtNum(maxAbs)}`, PAD.left, axisY);
    ctx.fillText('0', midX, axisY);
    ctx.fillText(fmtNum(maxAbs), PAD.left + chartW, axisY);

    // Legend
    const ly = axisY + 14;
    ctx.textAlign = 'left';
    ctx.fillStyle = col.bear;
    ctx.fillRect(PAD.left, ly, 8, 8);
    ctx.fillStyle = col.textSecondary;
    ctx.fillText('Put premium', PAD.left + 11, ly + 7);
    ctx.fillStyle = col.bull;
    ctx.fillRect(PAD.left + 90, ly, 8, 8);
    ctx.fillStyle = col.textSecondary;
    ctx.fillText('Call premium', PAD.left + 101, ly + 7);
  }, [visible, maxAbs, spotPrice, size, hovered, sorted, visMin, visMax, activeTheme]);

  // Mouse handlers
  const hitRow = useCallback((my: number, h: number): PremStrikeNet | null => {
    const n = visible.length;
    if (n === 0) return null;
    const chartH = h - PAD.top - PAD.bottom;
    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap = Math.max(1, (chartH - barH * n) / (n + 1));
    const idx = Math.floor((my - PAD.top - gap / 2) / (barH + gap));
    return idx >= 0 && idx < n ? visible[idx] : null;
  }, [visible]);

  const handleMouseMove = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: mx, y: my });

    if (isPanning) {
      const chartH = size.h - PAD.top - PAD.bottom;
      const range = panRef.current.startMax - panRef.current.startMin;
      const delta = ((e.clientY - panRef.current.startY) / chartH) * range;
      let nMin = panRef.current.startMin + delta;
      let nMax = panRef.current.startMax + delta;
      if (nMin < dataMin) { nMax += dataMin - nMin; nMin = dataMin; }
      if (nMax > dataMax) { nMin -= nMax - dataMax; nMax = dataMax; }
      setZoomRange({ min: Math.max(dataMin, nMin), max: Math.min(dataMax, nMax) });
      return;
    }

    setHovered(hitRow(my, size.h));
  }, [isPanning, size, dataMin, dataMax, hitRow]);

  const handleMouseDown = useCallback((e: { button?: number; clientY: number }) => {
    if (e.button !== undefined && e.button !== 0) return;
    panRef.current = { startY: e.clientY, startMin: visMin, startMax: visMax };
    setIsPanning(true);
  }, [visMin, visMax]);

  if (data.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>No data</div>;
  }

  // Clamp tooltip
  const ttW = 172;
  const ttH = 78;
  const ttX = Math.min(mousePos.x + 12, size.w - ttW - 8);
  const ttY = Math.min(Math.max(mousePos.y - ttH / 2, 4), size.h - ttH - 4);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-0 flex-1 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => { setHovered(null); setIsPanning(false); }}
        onDoubleClick={() => setZoomRange(defaultZoom)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          handleMouseDown({ clientY: t.clientY, button: 0 });
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          handleMouseMove({ clientX: t.clientX, clientY: t.clientY });
        }}
        onTouchEnd={() => setIsPanning(false)}
      />
      {hovered && !isPanning && (
        <div className="panel-glass absolute z-50 pointer-events-none rounded-xl overflow-hidden text-[11px] shadow-2xl"
          style={{ left: ttX, top: ttY, minWidth: ttW, fontFamily: 'var(--font-jetbrains-mono)' }}>
          <div className="px-3 py-1.5 border-b flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Strike</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>${fmtStrike(hovered.strike)}</span>
          </div>
          <div className="px-3 py-1.5 space-y-0.5">
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Call</span>
              <span style={{ color: 'var(--bull)' }}>${fmtNum(hovered.callPremium)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Put</span>
              <span style={{ color: 'var(--bear)' }}>${fmtNum(hovered.putPremium)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-0.5" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Net</span>
              <span className="font-bold" style={{ color: hovered.net >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {hovered.net >= 0 ? '+' : ''}${fmtNum(hovered.net)}
              </span>
            </div>
          </div>
        </div>
      )}
      <ChartHint isZoomed={!!zoomRange} zoomPct={zoomPct} onReset={() => setZoomRange(defaultZoom)} />
    </div>
  );
}

// ─── Strike × Expiry Heatmap ──────────────────────────────────────────────────
function StrikeExpiryHeatmap({ data }: { data: { strike: number; expLabel: string; dte: number; callPremium: number; putPremium: number; totalVolume: number }[] }) {
  const c = useFlowColors();
  if (data.length === 0) return <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>No data</div>;

  // Get unique strikes and expiries
  const strikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
  const expiries = [...new Set(data.map(d => d.expLabel))].sort((a, b) => {
    const ad = data.find(d => d.expLabel === a)?.dte ?? 0;
    const bd = data.find(d => d.expLabel === b)?.dte ?? 0;
    return ad - bd;
  });

  // Limit grid size
  const topStrikes = strikes.length > 20 ? strikes.slice(Math.floor((strikes.length - 20) / 2), Math.floor((strikes.length - 20) / 2) + 20) : strikes;
  const topExpiries = expiries.slice(0, 8);

  const maxPrem = Math.max(...data.map(d => d.callPremium + d.putPremium), 1);

  const getCell = (strike: number, expLabel: string) => {
    return data.find(d => d.strike === strike && d.expLabel === expLabel);
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>
        Strike × Expiry Heatmap (Premium Intensity)
      </h3>
      <div className="overflow-auto">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text-dimmed)' }}>Strike</th>
              {topExpiries.map(exp => (
                <th key={exp} className="px-2 py-1.5 text-center font-mono" style={{ color: 'var(--text-dimmed)' }}>{exp}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topStrikes.map(strike => (
              <tr key={strike}>
                <td className="px-2 py-0.5 text-right font-mono font-bold" style={{ color: 'var(--text-muted)' }}>${strike}</td>
                {topExpiries.map(exp => {
                  const cell = getCell(strike, exp);
                  if (!cell) return <td key={exp} className="px-1 py-0.5"><div className="w-full h-6 rounded" style={{ background: 'var(--surface)' }} /></td>;
                  const total = cell.callPremium + cell.putPremium;
                  const intensity = Math.pow(total / maxPrem, 0.5); // sqrt for better distribution
                  const isCallDominant = cell.callPremium > cell.putPremium;
                  const baseColor = isCallDominant ? c.bull : c.bear;
                  return (
                    <td key={exp} className="px-1 py-0.5">
                      <div className="h-6 rounded flex items-center justify-center" title={`$${strike} ${exp}: ${fmtPremium(total)}`}
                        style={{ background: `${baseColor}${Math.round(intensity * 200 + 10).toString(16).padStart(2, '0')}`, minWidth: 48 }}>
                        {total > maxPrem * 0.05 && (
                          <span className="font-mono font-bold" style={{ color: `${baseColor}`, fontSize: 8 }}>
                            {fmtPremium(total)}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────
interface FlowStats {
  totalCallPremium: number;
  totalPutPremium:  number;
  unusualCount:     number;
  total:            number;
  spotPrice:        number;
  avgSentiment:     number;
}

function StatsRow({ stats, symbol }: { stats: FlowStats; symbol: string }) {
  const c = useFlowColors();
  const totalFlow   = stats.totalCallPremium + stats.totalPutPremium;
  const callPct     = totalFlow > 0 ? (stats.totalCallPremium / totalFlow) * 100 : 50;

  // Multi-factor sentiment
  const s = stats.avgSentiment;
  const sentiment = s > 0.15 ? 'Bullish' : s < -0.15 ? 'Bearish' : 'Neutral';
  const sentColor = s > 0.15 ? c.bull : s < -0.15 ? c.bear : c.warn;

  // Motion P8 — flash the two headline readouts when they change.
  const sentFlash = useValueFlash(sentiment);
  const spotFlash = useValueFlash(stats.spotPrice);

  return (
    <div className="panel-glass panel-glass-hero flex flex-wrap items-stretch gap-0 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
      {/* Sentiment cell — now multi-factor */}
      <div className="flex flex-col justify-center items-center px-5 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 100 }}>
        <span className="text-[8.5px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>Sentiment</span>
        <span className={`font-display text-[15px] font-black ${sentFlash ? 'value-flash' : ''}`} style={{ color: sentColor }}>{sentiment}</span>
        <span className="text-[11px]" style={{ color: `${sentColor}88`, fontFamily: 'var(--font-jetbrains-mono)' }}>{(s * 100).toFixed(0)}%</span>
      </div>

      {/* Call/Put bar */}
      <div className="flex flex-col justify-center px-4 py-2.5 border-r flex-1 min-w-[160px]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex justify-between text-[8.5px] mb-1.5" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>
          <span style={{ color: `${c.bull}bb` }}>Calls {callPct.toFixed(0)}%</span>
          <span style={{ color: 'var(--text-muted)' }}>Premium Flow</span>
          <span style={{ color: `${c.bear}bb` }}>Puts {(100 - callPct).toFixed(0)}%</span>
        </div>
        <div className="h-2.5 rounded overflow-hidden flex">
          <div style={{ width: `${callPct}%`, background: `linear-gradient(90deg, ${c.bull}55, ${c.bull}99)`, transition: 'width 0.6s' }} />
          <div style={{ width: `${100 - callPct}%`, background: `linear-gradient(90deg, ${c.bear}99, ${c.bear}55)`, transition: 'width 0.6s' }} />
        </div>
      </div>

      {/* Metric cells */}
      {[
        { l: 'Call Flow',  v: fmtPremium(stats.totalCallPremium), c: `${c.bull}cc`, flash: false },
        { l: 'Put Flow',   v: fmtPremium(stats.totalPutPremium),  c: `${c.bear}cc`, flash: false },
        { l: 'Unusual',    v: `${stats.unusualCount}`,             c: c.warn,        flash: false },
        { l: 'Contracts',  v: `${stats.total}`,                    c: 'var(--text-muted)', flash: false },
        { l: `${symbol}`,  v: stats.spotPrice > 0 ? `$${stats.spotPrice.toFixed(2)}` : '—', c: c.teal, flash: spotFlash },
      ].map(m => (
        <div key={m.l} className="flex flex-col justify-center items-center px-4 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 72 }}>
          <span className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>{m.l}</span>
          <span className={`text-[13px] font-black ${m.flash ? 'value-flash' : ''}`} style={{ color: m.c, fontFamily: 'var(--font-jetbrains-mono)' }}>{m.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function FlowRow({ item, idx }: { item: FlowItem; idx: number }) {
  const c = useFlowColors();
  const isCall  = item.type === 'CALL';
  const rowColor = isCall ? `${c.bull}08` : `${c.bear}08`;
  const tag     = tagMeta(c)[item.tag];

  return (
    <tr className="border-b transition-colors hover:brightness-125"
      style={{ borderColor: 'var(--border)', background: idx % 2 === 0 ? rowColor : 'transparent' }}>
      <td className="px-3 py-2 text-[11px] font-mono text-center w-8 shrink-0" style={{ color: 'var(--text-dimmed)' }}>{idx + 1}</td>
      <td className="px-2 py-2 w-14">
        <span className="text-[10px] font-black px-2 py-0.5 rounded"
          style={isCall ? { background: `${c.bull}18`, color: c.bull, border: `1px solid ${c.bull}28` } : { background: `${c.bear}18`, color: c.bear, border: `1px solid ${c.bear}28` }}>
          {item.type}
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>${item.strike.toFixed(0)}</td>
      <td className="px-2 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{item.expLabel}</span>
          <span className="text-[11px] font-mono" style={{ color: item.dte <= 3 ? c.bear : item.dte <= 7 ? c.warn : 'var(--text-dimmed)' }}>{item.dte}d</span>
        </div>
      </td>
      <td className="px-2 py-2">
        <span className="font-mono text-[12px] font-black" style={{ color: item.premium >= 1_000_000 ? c.primary : item.premium >= 500_000 ? c.warn : 'var(--text-primary)' }}>
          {fmtPremium(item.premium)}
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{fmtNum(item.volume)}</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtNum(item.oi)}</td>
      <td className="px-2 py-2">
        <span className="font-mono text-[11px] font-bold" style={{ color: item.volOiRatio >= 2 ? c.warn : item.volOiRatio >= 1 ? c.teal : 'var(--text-muted)' }}>
          {item.volOiRatio.toFixed(2)}x
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: item.iv > 50 ? c.bear : item.iv > 30 ? c.warn : 'var(--text-secondary)' }}>{item.iv.toFixed(1)}%</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.delta.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{(item.gamma * 1000).toFixed(1)}</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.vega.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: item.theta < -0.5 ? `${c.bear}aa` : 'var(--text-muted)' }}>{item.theta.toFixed(2)}</td>
      <td className="px-2 py-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: tag.bg, color: tag.color, border: `1px solid ${tag.color}28` }}>
          {tag.label}
        </span>
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FlowPageContent() {
  const isActive = usePageActive();
  const c = useFlowColors();

  const [symbol,     setSymbol]     = useState('QQQ');
  useTrackChartVisit(symbol, '/flow');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tagFilter,  setTagFilter]  = useState<TagFilter>('all');
  const [sortKey,    setSortKey]    = useState<SortKey>('premium');
  const [sortDesc,   setSortDesc]   = useState(true);
  const [minPremium, setMinPremium] = useState(25_000);
  const [viewTab,    setViewTab]    = useState<ViewTab>('table');

  const [flows,     setFlows]     = useState<FlowItem[]>([]);
  const [stats,     setStats]     = useState<FlowStats | null>(null);
  const [premiumByStrike, setPremiumByStrike] = useState<{ strike: number; callPremium: number; putPremium: number }[]>([]);
  const [strikeExpiry,    setStrikeExpiry]    = useState<{ strike: number; expLabel: string; dte: number; callPremium: number; putPremium: number; totalVolume: number }[]>([]);
  const [topUnusual,      setTopUnusual]      = useState<FlowItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchFlow = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbol, type: typeFilter, tag: tagFilter, minPremium: String(minPremium), limit: '150' });
      const res = await fetch(`/api/options-flow?${params}`, { signal: ctrl.signal });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      setFlows(data.flows ?? []);
      setStats({
        totalCallPremium: data.totalCallPremium ?? 0,
        totalPutPremium:  data.totalPutPremium  ?? 0,
        unusualCount:     data.unusualCount     ?? 0,
        total:            data.total            ?? 0,
        spotPrice:        data.spotPrice        ?? 0,
        avgSentiment:     data.avgSentiment     ?? 0,
      });
      setPremiumByStrike(data.premiumByStrike ?? []);
      setStrikeExpiry(data.strikeExpiry ?? []);
      setTopUnusual(data.topUnusual ?? []);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError((err as Error)?.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, [symbol, typeFilter, tagFilter, minPremium]);

  useEffect(() => { fetchFlow(); }, [fetchFlow]);
  useEffect(() => { if (!isActive) return; const t = setInterval(fetchFlow, 90_000); return () => clearInterval(t); }, [isActive, fetchFlow]);

  const sorted = useMemo(() => [...flows].sort((a, b) => {
    const v = (x: FlowItem) => {
      if (sortKey === 'premium')    return x.premium;
      if (sortKey === 'volume')     return x.volume;
      if (sortKey === 'volOiRatio') return x.volOiRatio;
      if (sortKey === 'iv')         return x.iv;
      if (sortKey === 'dte')        return x.dte;
      if (sortKey === 'gamma')      return x.gamma;
      if (sortKey === 'vega')       return x.vega;
      if (sortKey === 'theta')      return x.theta;
      return x.premium;
    };
    return sortDesc ? v(b) - v(a) : v(a) - v(b);
  }), [flows, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDesc(d => !d); else { setSortKey(key); setSortDesc(true); } };

  const SortTh = ({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) => (
    <th className={`px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap ${className}`}
      style={{ color: sortKey === k ? c.teal : 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }} onClick={() => handleSort(k)}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === k && (sortDesc ? <ArrowDown size={10} strokeWidth={1.5} /> : <ArrowUp size={10} strokeWidth={1.5} />)}
      </span>
    </th>
  );

  const MIN_PREMIUM_OPTIONS = [
    { label: '$10K',  value: 10_000 },
    { label: '$25K',  value: 25_000 },
    { label: '$50K',  value: 50_000 },
    { label: '$100K', value: 100_000 },
    { label: '$250K', value: 250_000 },
    { label: '$500K', value: 500_000 },
  ];

  // Unified <Segment> option lists (mutually-exclusive selectors). Same state +
  // handlers as before — only the markup is the shared control. Min-premium uses
  // string ids since Segment is keyed on string; we map back to the numeric value.
  const SYMBOL_OPTIONS  = SYMBOLS.map(s => ({ id: s, label: s }));
  const TAG_OPTIONS: { id: TagFilter; label: string }[] = [
    { id: 'all', label: 'All Trades' }, { id: 'whale', label: 'Whale' }, { id: 'unusual', label: 'Unusual' },
    { id: 'block', label: 'Block' }, { id: 'sweep', label: 'Sweep' },
  ];
  const MIN_PREMIUM_SEG = MIN_PREMIUM_OPTIONS.map(o => ({ id: String(o.value), label: o.label }));
  const VIEW_OPTIONS: { id: ViewTab; label: string }[] = [
    { id: 'table', label: 'Table' }, { id: 'chart', label: 'Chart' }, { id: 'heatmap', label: 'Heatmap' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Header ── */}
      <header className="panel-glass flex flex-wrap items-center gap-2 px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* Symbol */}
        <Segment options={SYMBOL_OPTIONS} value={symbol} onChange={setSymbol} size="sm" />

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Type */}
        <div className="flex items-center gap-1">
          {(['all', 'calls', 'puts'] as TypeFilter[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className="px-3 py-1 rounded text-[10px] font-bold capitalize transition-all inline-flex items-center gap-1"
              style={typeFilter === t
                ? t === 'calls' ? { background: `${c.bull}18`, color: c.bull } : t === 'puts' ? { background: `${c.bear}18`, color: c.bear } : { background: `${c.teal}18`, color: c.teal }
                : { color: 'var(--text-dimmed)' }
              }>
              {t === 'calls' && <ArrowUp size={12} strokeWidth={1.5} />}
              {t === 'puts' && <ArrowDown size={12} strokeWidth={1.5} />}
              {t === 'all' ? 'All' : t === 'calls' ? 'Calls' : 'Puts'}
            </button>
          ))}
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Tag filter */}
        <Segment options={TAG_OPTIONS} value={tagFilter} onChange={setTagFilter} size="sm" />

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Min Premium */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>Min</span>
          <Segment options={MIN_PREMIUM_SEG} value={String(minPremium)} onChange={(v) => setMinPremium(Number(v))} size="sm" />
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* View tabs */}
        <Segment options={VIEW_OPTIONS} value={viewTab} onChange={setViewTab} size="sm" />

        {/* Right: status + refresh */}
        <div className="ml-auto flex items-center gap-2.5">
          {lastRefresh && (
            <span className="text-[11px] font-mono hidden md:block" style={{ color: 'var(--text-dimmed)' }}>
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]"
            style={flows.length > 0
              ? { background: `${c.teal}0e`, color: c.teal, border: `1px solid ${c.teal}22` }
              : { background: themeAlpha('--warning', 0.06), color: c.warn, border: `1px solid ${themeAlpha('--warning', 0.16)}` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: flows.length > 0 ? c.teal : c.warn }} />
            CBOE · Delayed
          </div>
          <button onClick={fetchFlow} disabled={loading}
            className="press-fb p-1.5 rounded-lg transition-all hover:scale-105 disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <RefreshCw size={13} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* ── Stats row ── */}
      {stats && <StatsRow stats={stats} symbol={symbol} />}

      {/* ── Top Unusual Cards ── */}
      {topUnusual.length > 0 && <TopUnusualCards trades={topUnusual} />}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] shrink-0"
          style={{ background: 'var(--bear-bg)', color: 'var(--bear)', borderBottom: '1px solid rgb(var(--bear-rgb) / 0.12)' }}>
          <AlertTriangle size={12} strokeWidth={2} /> {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && flows.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: `${c.teal}25`, borderTopColor: c.teal }} />
          <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Fetching {symbol} options flow from CBOE…</p>
        </div>
      )}

      {/* ── Content by tab ── */}
      {flows.length > 0 && viewTab === 'table' && (
        <div key={viewTab} className="flex-1 min-h-0 overflow-auto animate-fadeIn">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-3 py-2.5 text-[8.5px] uppercase tracking-wider font-semibold text-center w-8" style={{ color: 'var(--text-dimmed)' }}>#</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Type</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Strike</th>
                <SortTh label="Expiry" k="dte" />
                <SortTh label="Premium" k="premium" />
                <SortTh label="Volume" k="volume" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>OI</th>
                <SortTh label="Vol/OI" k="volOiRatio" />
                <SortTh label="IV" k="iv" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Δ</th>
                <SortTh label="Γ" k="gamma" />
                <SortTh label="V" k="vega" />
                <SortTh label="Θ" k="theta" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Tag</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => <FlowRow key={item.id} item={item} idx={i} />)}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2.5 border-t text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}>
            <span>{sorted.length} contracts displayed · min premium {fmtPremium(minPremium)}</span>
            <span>CBOE delayed data · not financial advice</span>
          </div>
        </div>
      )}

      {flows.length > 0 && viewTab === 'chart' && (
        <div key={viewTab} className="flex-1 min-h-0 flex flex-col animate-fadeIn">
          <PremiumFlowChart data={premiumByStrike} spotPrice={stats?.spotPrice ?? 0} />
        </div>
      )}

      {flows.length > 0 && viewTab === 'heatmap' && (
        <div key={viewTab} className="flex-1 min-h-0 flex flex-col animate-fadeIn">
          <StrikeExpiryHeatmap data={strikeExpiry} />
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && flows.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Inbox size={34} strokeWidth={1.25} style={{ color: 'var(--text-dimmed)', opacity: 0.5 }} />
          <p className="text-[12px]" style={{ color: 'var(--text-dimmed)' }}>No flow matching filters for {symbol}</p>
          <button onClick={fetchFlow} className="press-fb px-4 py-2 rounded-lg text-[11px] font-bold"
            style={{ background: `${c.teal}18`, color: c.teal, border: `1px solid ${c.teal}30` }}>Retry</button>
        </div>
      )}
    </div>
  );
}
