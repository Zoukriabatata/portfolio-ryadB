'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { themeColor, themeAlpha } from '@/lib/ui/themeColors';
import Segment from '@/components/ui/Segment';
import { useValueFlash } from '@/lib/ui/useValueFlash';

// Canvas can't parse CSS var() in ctx.font — use the literal JetBrains family
// (loaded via next/font) with monospace fallbacks, per project canvas convention.
const CANVAS_MONO = 'JetBrains Mono, Consolas, monospace';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NetFlowStrike {
  strike: number;
  callPremium: number;
  putPremium: number;
  net: number;
}

interface OIStrike {
  strike: number;
  callOI: number;
  putOI: number;
}

interface TopContract {
  strike: number;
  type: 'C' | 'P';
  expiration: string;
  volume: number;
  oi: number;
  premium: number;
  iv: number;
  delta: number;
  voiRatio: number;
}

interface GEXExpiry {
  label: string;
  daysToExp: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
}

interface OptionsFlowPanelProps {
  netFlowByStrike: NetFlowStrike[];
  oiByStrike: OIStrike[];
  topContracts: TopContract[];
  gexByExpiry: GEXExpiry[];
  spotPrice: number;
  symbol: string;
  liveSpot?: { price: number; ts: number; loading: boolean };
}

type Tab = 'flow' | 'oi' | 'contracts' | 'gex';

const TABS: { key: Tab; label: string }[] = [
  { key: 'flow',      label: 'Net Flow'      },
  { key: 'oi',        label: 'OI Distrib'    },
  { key: 'contracts', label: 'Contracts'     },
  { key: 'gex',       label: 'GEX / Expiry'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Theme-aware canvas palette. Resolved from the active SENZOUKRIA tokens via
// themeColor() (hex strings, so `col.bull + 'aa'` alpha-suffix concat stays
// valid). `accent` maps to --accent (teal: neutral / structure — spot lines,
// net-GEX line), never a hardcoded blue.
function clr(): Record<string, string> {
  return {
    bull:          themeColor('--bull'),
    bear:          themeColor('--bear'),
    surface:       themeColor('--surface'),
    border:        themeColor('--border'),
    textPrimary:   themeColor('--text-primary'),
    textSecondary: themeColor('--text-secondary'),
    textMuted:     themeColor('--text-muted'),
    accent:        themeColor('--accent'),
  };
}

const PAD = { left: 64, right: 16, top: 8, bottom: 34 } as const;

// ─── Canvas size hook ─────────────────────────────────────────────────────────

function useCanvasSize(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
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

// ─── Hint + Reset UI ──────────────────────────────────────────────────────────

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
          className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] opacity-60 hover:opacity-100 transition-opacity"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}
        >
          <span style={{ color: 'var(--accent)' }}>{zoomPct}%</span> × reset
        </button>
      )}
    </>
  );
}

// ─── NetFlowChart ─────────────────────────────────────────────────────────────

function NetFlowChart({ data, spotPrice }: { data: NetFlowStrike[]; spotPrice: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const panRef       = useRef({ startY: 0, startMin: 0, startMax: 0 });

  const [isPanning, setIsPanning]   = useState(false);
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 });
  const [hovered, setHovered]       = useState<NetFlowStrike | null>(null);
  const [zoomRange, setZoomRange]   = useState<{ min: number; max: number } | null>(null);

  // Global mouseup to stop panning even when cursor leaves canvas
  useEffect(() => {
    const stop = () => setIsPanning(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); };
  }, []);

  const size = useCanvasSize(canvasRef, containerRef);

  const sorted = useMemo(() => [...data].sort((a, b) => a.strike - b.strike), [data]);

  const dataMin   = sorted.length ? sorted[0].strike : 0;
  const dataMax   = sorted.length ? sorted[sorted.length - 1].strike : 1;
  const dataRange = dataMax - dataMin;

  // Default zoom: always ~25 strikes centered on spot — guarantees drag always works
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
    if (!canvas || visible.length === 0 || size.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const col = clr();
    const chartW = w - PAD.left - PAD.right;
    const chartH = h - PAD.top - PAD.bottom;
    const midX = PAD.left + chartW / 2;
    const n = visible.length;
    if (n === 0) return;

    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap  = Math.max(1, (chartH - barH * n) / (n + 1));

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

      // Near-spot check
      const step = sorted.length > 1 ? (sorted[sorted.length-1].strike - sorted[0].strike) / (sorted.length-1) : 1;
      const isSpot = Math.abs(s.strike - spotPrice) <= step * 0.6;

      // Strike label
      ctx.font = isH ? `bold 10px ${CANVAS_MONO}` : `10px ${CANVAS_MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isSpot ? col.accent : isH ? col.textPrimary : col.textMuted;
      ctx.fillText(fmtPrice(s.strike), PAD.left - 6, cy);

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
      const spotIdx = visible.findIndex((s, i) => {
        const step = sorted.length > 1 ? (sorted[sorted.length-1].strike - sorted[0].strike) / (sorted.length-1) : 1;
        return Math.abs(s.strike - spotPrice) <= step * 0.6;
      });
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
    ctx.fillStyle = col.bull;
    ctx.fillRect(PAD.left, ly, 8, 8);
    ctx.fillStyle = col.textSecondary;
    ctx.fillText('Call premium', PAD.left + 11, ly + 7);
    ctx.fillStyle = col.bear;
    ctx.fillRect(PAD.left + 90, ly, 8, 8);
    ctx.fillStyle = col.textSecondary;
    ctx.fillText('Put premium', PAD.left + 101, ly + 7);

  }, [visible, maxAbs, spotPrice, size, hovered, sorted, visMin, visMax]);

  // Mouse handlers
  const hitRow = useCallback((my: number, h: number): NetFlowStrike | null => {
    const n = visible.length;
    if (n === 0) return null;
    const chartH = h - PAD.top - PAD.bottom;
    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap = Math.max(1, (chartH - barH * n) / (n + 1));
    const idx = Math.floor((my - PAD.top - gap / 2) / (barH + gap));
    return idx >= 0 && idx < n ? visible[idx] : null;
  }, [visible]);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
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

  const handleMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    panRef.current = { startY: e.clientY, startMin: visMin, startMax: visMax };
    setIsPanning(true);
  }, [visMin, visMax]);

  // Clamp tooltip
  const ttW = 172;
  const ttH = 78;
  const ttX = Math.min(mousePos.x + 12, size.w - ttW - 8);
  const ttY = Math.min(Math.max(mousePos.y - ttH / 2, 4), size.h - ttH - 4);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-0 select-none">
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
          handleMouseDown({ clientX: t.clientX, clientY: t.clientY, button: 0 } as any);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          handleMouseMove({ clientX: t.clientX, clientY: t.clientY } as any);
        }}
        onTouchEnd={() => setIsPanning(false)}
      />
      {hovered && !isPanning && (
        <div className="panel-glass absolute z-50 pointer-events-none rounded-xl overflow-hidden text-[11px] shadow-2xl"
          style={{ left: ttX, top: ttY, minWidth: ttW, fontFamily: 'var(--font-jetbrains-mono)' }}>
          <div className="px-3 py-1.5 border-b flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Strike</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>${fmtPrice(hovered.strike)}</span>
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

// ─── OIChart ──────────────────────────────────────────────────────────────────

function OIChart({ data, spotPrice }: { data: OIStrike[]; spotPrice: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const panRef       = useRef({ startY: 0, startMin: 0, startMax: 0 });

  const [isPanning, setIsPanning]   = useState(false);
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 });

  // Global mouseup to stop panning even when cursor leaves canvas
  useEffect(() => {
    const stop = () => setIsPanning(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); };
  }, []);
  const [hovered, setHovered]       = useState<OIStrike | null>(null);
  const [zoomRange, setZoomRange]   = useState<{ min: number; max: number } | null>(null);

  const size = useCanvasSize(canvasRef, containerRef);

  const sorted = useMemo(() => [...data].sort((a, b) => a.strike - b.strike), [data]);

  const dataMin   = sorted.length ? sorted[0].strike : 0;
  const dataMax   = sorted.length ? sorted[sorted.length - 1].strike : 1;
  const dataRange = dataMax - dataMin;

  const defaultZoom = useMemo((): { min: number; max: number } | null => {
    if (sorted.length === 0 || spotPrice <= 0 || dataRange <= 0) return null;
    const step = dataRange / Math.max(1, sorted.length - 1);
    const half = Math.min(12, Math.ceil(sorted.length / 2)) * step;
    return { min: Math.max(dataMin, spotPrice - half), max: Math.min(dataMax, spotPrice + half) };
  }, [sorted.length, spotPrice, dataMin, dataMax, dataRange]);

  useEffect(() => { setZoomRange(defaultZoom); }, [sorted.length]);

  const visible = useMemo(() => {
    if (!zoomRange) return sorted;
    return sorted.filter(s => s.strike >= zoomRange.min && s.strike <= zoomRange.max);
  }, [sorted, zoomRange]);

  const { maxOI, totalCall, totalPut, callWalls, putWalls } = useMemo(() => {
    let m = 0, tc = 0, tp = 0;
    for (const s of sorted) { m = Math.max(m, s.callOI, s.putOI); tc += s.callOI; tp += s.putOI; }
    const byCalls = [...sorted].sort((a, b) => b.callOI - a.callOI);
    const byPuts  = [...sorted].sort((a, b) => b.putOI  - a.putOI);
    return {
      maxOI: m || 1, totalCall: tc, totalPut: tp,
      callWalls: new Set(byCalls.slice(0, 3).map(s => s.strike)),
      putWalls:  new Set(byPuts.slice(0, 3).map(s => s.strike)),
    };
  }, [sorted]);

  const visMin   = zoomRange?.min ?? dataMin;
  const visMax   = zoomRange?.max ?? dataMax;
  const zoomPct  = dataRange > 0 ? (((visMax - visMin) / dataRange) * 100).toFixed(0) : '100';

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
        nMin = Math.max(dataMin, nMin); nMax = Math.min(dataMax, nMax);
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
    if (!canvas || visible.length === 0 || size.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const col = clr();
    // Header strip
    const headerH = 22;
    ctx.fillStyle = themeAlpha('--text-primary', 0.03);
    ctx.fillRect(0, 0, w, headerH);
    ctx.font = `bold 10px ${CANVAS_MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = col.bull;
    ctx.fillText(`Call OI: ${fmtNum(totalCall)}`, PAD.left, headerH / 2);
    ctx.fillStyle = col.bear;
    ctx.fillText(`Put OI: ${fmtNum(totalPut)}`, PAD.left + 110, headerH / 2);
    const pcr = totalCall > 0 ? totalPut / totalCall : 0;
    ctx.fillStyle = pcr > 1 ? col.bear : col.bull;
    ctx.fillText(`P/C ${pcr.toFixed(2)}`, PAD.left + 215, headerH / 2);

    const padTop2 = headerH + 4;
    const chartW = w - PAD.left - PAD.right;
    const chartH = h - padTop2 - PAD.bottom;
    const midX = PAD.left + chartW / 2;
    const n = visible.length;
    if (n === 0) return;

    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap  = Math.max(1, (chartH - barH * n) / (n + 1));

    visible.forEach((s, i) => {
      const cy = padTop2 + gap + i * (barH + gap) + barH / 2;
      const isH = s === hovered;
      const isWall = callWalls.has(s.strike) || putWalls.has(s.strike);

      if (i % 2 === 0) {
        ctx.fillStyle = themeAlpha('--text-primary', 0.018);
        ctx.fillRect(PAD.left, cy - barH / 2, chartW, barH);
      }
      if (isH) {
        ctx.fillStyle = themeAlpha('--text-primary', 0.06);
        ctx.fillRect(PAD.left, cy - barH / 2 - 1, chartW, barH + 2);
      }

      const step = sorted.length > 1 ? (sorted[sorted.length-1].strike - sorted[0].strike) / (sorted.length-1) : 1;
      const isSpot = Math.abs(s.strike - spotPrice) <= step * 0.6;

      ctx.font = isH ? `bold 10px ${CANVAS_MONO}` : `10px ${CANVAS_MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isSpot ? col.accent : isH ? col.textPrimary : col.textMuted;
      ctx.fillText(fmtPrice(s.strike), PAD.left - 6, cy);

      // Call bar
      const cw = (s.callOI / maxOI) * (chartW / 2);
      const alpha = callWalls.has(s.strike) ? 1 : isH ? 0.85 : 0.6;
      ctx.fillStyle = col.bull;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(midX + 1, cy - barH / 2, Math.max(cw, 1), barH, Math.min(barH / 2, 4));
      ctx.fill();
      ctx.globalAlpha = 1;

      // Put bar
      const pw = (s.putOI / maxOI) * (chartW / 2);
      const alphaP = putWalls.has(s.strike) ? 1 : isH ? 0.85 : 0.6;
      ctx.fillStyle = col.bear;
      ctx.globalAlpha = alphaP;
      ctx.beginPath();
      ctx.roundRect(midX - pw - 1, cy - barH / 2, Math.max(pw, 1), barH, Math.min(barH / 2, 4));
      ctx.fill();
      ctx.globalAlpha = 1;

      // Wall badges — color + side already encode call/put direction (no glyphs)
      if (callWalls.has(s.strike) && cw > 20) {
        ctx.fillStyle = col.bull;
        ctx.font = `bold 8px ${CANVAS_MONO}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('C', midX + cw + 4, cy);
      }
      if (putWalls.has(s.strike) && pw > 20) {
        ctx.fillStyle = col.bear;
        ctx.font = `bold 8px ${CANVAS_MONO}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', midX - pw - 4, cy);
      }
    });

    // Center line
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, padTop2);
    ctx.lineTo(midX, padTop2 + chartH);
    ctx.stroke();

    // Spot line
    if (spotPrice > 0 && spotPrice >= visMin && spotPrice <= visMax) {
      const step = sorted.length > 1 ? (sorted[sorted.length-1].strike - sorted[0].strike) / (sorted.length-1) : 1;
      const spotIdx = visible.findIndex(s => Math.abs(s.strike - spotPrice) <= step * 0.6);
      if (spotIdx >= 0) {
        const sy = padTop2 + gap + spotIdx * (barH + gap) + barH / 2;
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
    const axisY = padTop2 + chartH + 5;
    ctx.fillStyle = col.textMuted;
    ctx.font = `9px ${CANVAS_MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`0`, PAD.left, axisY);
    ctx.fillText(fmtNum(maxOI), midX, axisY);
    ctx.fillText(fmtNum(maxOI), PAD.left + chartW, axisY);

  }, [visible, maxOI, spotPrice, size, hovered, totalCall, totalPut, callWalls, putWalls, sorted, visMin, visMax]);

  const hitRow = useCallback((my: number, h: number, topOffset: number): OIStrike | null => {
    const n = visible.length;
    if (n === 0) return null;
    const chartH = h - topOffset - PAD.bottom;
    const barH = Math.min(Math.floor(chartH / n) - 1, 20);
    const gap = Math.max(1, (chartH - barH * n) / (n + 1));
    const idx = Math.floor((my - topOffset - gap / 2) / (barH + gap));
    return idx >= 0 && idx < n ? visible[idx] : null;
  }, [visible]);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
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

    setHovered(hitRow(my, size.h, 26));
  }, [isPanning, size, dataMin, dataMax, hitRow]);

  const ttW = 172, ttH = 64;
  const ttX = Math.min(mousePos.x + 12, size.w - ttW - 8);
  const ttY = Math.min(Math.max(mousePos.y - ttH / 2, 4), size.h - ttH - 4);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-0 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseDown={e => {
          if (e.button !== 0) return;
          panRef.current = { startY: e.clientY, startMin: visMin, startMax: visMax };
          setIsPanning(true);
        }}
        onMouseUp={() => setIsPanning(false)}
        onMouseLeave={() => { setHovered(null); setIsPanning(false); }}
        onDoubleClick={() => setZoomRange(defaultZoom)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          panRef.current = { startY: t.clientY, startMin: visMin, startMax: visMax };
          setIsPanning(true);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          handleMouseMove({ clientX: t.clientX, clientY: t.clientY } as any);
        }}
        onTouchEnd={() => setIsPanning(false)}
      />
      {hovered && !isPanning && (
        <div className="panel-glass absolute z-50 pointer-events-none rounded-xl overflow-hidden text-[11px] shadow-2xl"
          style={{ left: ttX, top: ttY, minWidth: ttW, fontFamily: 'var(--font-jetbrains-mono)' }}>
          <div className="px-3 py-1.5 border-b flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Strike</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>${fmtPrice(hovered.strike)}</span>
          </div>
          <div className="px-3 py-1.5 space-y-0.5">
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Call OI</span>
              <span style={{ color: 'var(--bull)' }}>{fmtNum(hovered.callOI)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Put OI</span>
              <span style={{ color: 'var(--bear)' }}>{fmtNum(hovered.putOI)}</span>
            </div>
          </div>
        </div>
      )}
      <ChartHint isZoomed={!!zoomRange} zoomPct={zoomPct} onReset={() => setZoomRange(defaultZoom)} />
    </div>
  );
}

// ─── TopContractsTable ────────────────────────────────────────────────────────

type SortKey = keyof TopContract;

function TopContractsTable({ data }: { data: TopContract[] }) {
  const [sortKey, setSortKey]   = useState<SortKey>('premium');
  const [sortAsc, setSortAsc]   = useState(false);
  const [hoveredRow, setHovered] = useState<number | null>(null);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    }).slice(0, 25);
  }, [data, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const cols: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'strike',     label: 'Strike',  align: 'right' },
    { key: 'type',       label: 'Type',    align: 'left'  },
    { key: 'expiration', label: 'Exp',     align: 'left'  },
    { key: 'volume',     label: 'Vol',     align: 'right' },
    { key: 'oi',         label: 'OI',      align: 'right' },
    { key: 'premium',    label: 'Prem',    align: 'right' },
    { key: 'iv',         label: 'IV%',     align: 'right' },
    { key: 'delta',      label: 'Δ',       align: 'right' },
    { key: 'voiRatio',   label: 'V/OI',    align: 'right' },
  ];

  return (
    <div className="w-full h-full overflow-auto">
      <table className="w-full text-[11px] border-collapse" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="sticky top-0 z-10 px-1.5 py-1.5 cursor-pointer select-none whitespace-nowrap"
                style={{
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                  color: sortKey === col.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  textAlign: col.align,
                  fontWeight: sortKey === col.key ? 700 : 400,
                }}
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.label}
                  {sortKey === col.key && (sortAsc ? <ArrowUp size={9} strokeWidth={1.5} /> : <ArrowDown size={9} strokeWidth={1.5} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isCall    = row.type === 'C';
            const unusual   = row.voiRatio > 3;
            const isHovered = hoveredRow === i;
            return (
              <tr
                key={`${row.strike}-${row.type}-${row.expiration}-${i}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isHovered
                    ? isCall ? 'rgb(var(--bull-rgb) / 0.08)' : 'rgb(var(--bear-rgb) / 0.08)'
                    : i % 2 === 0 ? 'rgb(var(--text-primary-rgb, 255 255 255) / 0.015)' : 'transparent',
                  transition: 'background 100ms',
                }}
              >
                <td className="px-1.5 py-0.5 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                  {fmtPrice(row.strike)}
                </td>
                <td className="px-1.5 py-0.5 font-bold" style={{ color: isCall ? 'var(--bull)' : 'var(--bear)' }}>
                  {row.type}
                </td>
                <td className="px-1.5 py-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {row.expiration}
                </td>
                <td className="px-1.5 py-0.5 text-right" style={{ color: 'var(--text-primary)' }}>
                  {fmtNum(row.volume)}
                </td>
                <td className="px-1.5 py-0.5 text-right" style={{ color: 'var(--text-muted)' }}>
                  {fmtNum(row.oi)}
                </td>
                <td className="px-1.5 py-0.5 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>
                  ${fmtNum(row.premium)}
                </td>
                <td className="px-1.5 py-0.5 text-right" style={{ color: 'var(--text-secondary)' }}>
                  {(row.iv * 100).toFixed(1)}
                </td>
                <td className="px-1.5 py-0.5 text-right" style={{ color: 'var(--text-muted)' }}>
                  {row.delta.toFixed(2)}
                </td>
                <td className="px-1.5 py-0.5 text-right">
                  <span
                    className={unusual ? 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px]' : ''}
                    style={{
                      color:      unusual ? 'var(--warning)' : 'var(--text-muted)',
                      background: unusual ? 'rgb(var(--warning-rgb) / 0.15)' : undefined,
                      fontWeight: unusual ? 700 : 400,
                    }}
                  >
                    {row.voiRatio.toFixed(1)}{unusual && <ArrowUp size={9} strokeWidth={1.5} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── GEXExpiryChart ───────────────────────────────────────────────────────────

function GEXExpiryChart({ data }: { data: GEXExpiry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered]   = useState<GEXExpiry | null>(null);

  const size = useCanvasSize(canvasRef, containerRef);

  const sorted = useMemo(() => [...data].sort((a, b) => a.daysToExp - b.daysToExp), [data]);

  const maxGEX = useMemo(() => {
    let m = 0;
    for (const d of sorted) m = Math.max(m, Math.abs(d.callGEX), Math.abs(d.putGEX));
    return m || 1;
  }, [sorted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0 || size.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const col = clr();
    const pL = 56, pR = 16, pT = 16, pB = 48;
    const chartW = w - pL - pR;
    const chartH = h - pT - pB;
    const n = sorted.length;
    if (n === 0) return;

    const groupW = chartW / n;
    const barW   = Math.min(Math.max(groupW * 0.28, 6), 32);
    const zeroY  = pT + chartH / 2;

    // Background grid
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pT + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pL, y);
      ctx.lineTo(pL + chartW, y);
      ctx.stroke();
      const val = maxGEX - (maxGEX * 2 * i) / 4;
      ctx.fillStyle = col.textMuted;
      ctx.font = `9px ${CANVAS_MONO}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtNum(val), pL - 4, y);
    }

    const netPoints: { x: number; y: number }[] = [];

    sorted.forEach((item, i) => {
      const cx = pL + groupW * i + groupW / 2;
      const isH = item === hovered;

      // Column highlight
      if (isH) {
        ctx.fillStyle = themeAlpha('--text-primary', 0.04);
        ctx.fillRect(pL + groupW * i, pT, groupW, chartH);
      }

      // Call bar (above zero)
      const callH = (Math.abs(item.callGEX) / maxGEX) * (chartH / 2);
      const callY = zeroY - callH;
      const callGrad = ctx.createLinearGradient(0, callY, 0, zeroY);
      callGrad.addColorStop(0, col.bull + (isH ? 'cc' : '88'));
      callGrad.addColorStop(1, col.bull + '22');
      ctx.fillStyle = callGrad;
      ctx.beginPath();
      ctx.roundRect(cx - barW - 1, callY, barW, callH, [3, 3, 0, 0]);
      ctx.fill();

      // Put bar (below zero)
      const putH = (Math.abs(item.putGEX) / maxGEX) * (chartH / 2);
      const putGrad = ctx.createLinearGradient(0, zeroY, 0, zeroY + putH);
      putGrad.addColorStop(0, col.bear + '22');
      putGrad.addColorStop(1, col.bear + (isH ? 'cc' : '88'));
      ctx.fillStyle = putGrad;
      ctx.beginPath();
      ctx.roundRect(cx + 1, zeroY, barW, putH, [0, 0, 3, 3]);
      ctx.fill();

      // Net GEX point
      const netY = zeroY - (item.netGEX / maxGEX) * (chartH / 2);
      netPoints.push({ x: cx, y: netY });

      // X labels
      ctx.fillStyle = isH ? col.textPrimary : col.textSecondary;
      ctx.font = isH ? 'bold 9px system-ui' : '9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.label, cx, pT + chartH + 4);
      ctx.fillStyle = col.textMuted;
      ctx.font = '8px system-ui';
      ctx.fillText(`${item.daysToExp}d`, cx, pT + chartH + 16);
    });

    // Zero line
    ctx.strokeStyle = themeAlpha('--text-primary', 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pL, zeroY);
    ctx.lineTo(pL + chartW, zeroY);
    ctx.stroke();

    // Net GEX line + dots
    if (netPoints.length > 1) {
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      netPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      netPoints.forEach((p, i) => {
        const isH = sorted[i] === hovered;
        ctx.fillStyle = col.textPrimary;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isH ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col.accent;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isH ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Legend
    const ly = pT + chartH + 30;
    ctx.font = `9px ${CANVAS_MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = col.bull; ctx.fillRect(pL, ly, 8, 8);
    ctx.fillStyle = col.textSecondary; ctx.fillText('Call', pL + 11, ly + 7);
    ctx.fillStyle = col.bear; ctx.fillRect(pL + 44, ly, 8, 8);
    ctx.fillStyle = col.textSecondary; ctx.fillText('Put', pL + 55, ly + 7);
    ctx.strokeStyle = col.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pL + 84, ly + 4); ctx.lineTo(pL + 98, ly + 4); ctx.stroke();
    ctx.fillStyle = col.accent; ctx.fillText('Net', pL + 102, ly + 7);

  }, [sorted, maxGEX, size, hovered]);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || sorted.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: mx, y: my });
    const pL = 56, pR = 16;
    const chartW = size.w - pL - pR;
    const n = sorted.length;
    const groupW = chartW / n;
    const idx = Math.floor((mx - pL) / groupW);
    setHovered(idx >= 0 && idx < n ? sorted[idx] : null);
  }, [sorted, size]);

  const ttW = 176, ttH = 82;
  const ttX = Math.min(mousePos.x + 12, size.w - ttW - 8);
  const ttY = Math.min(Math.max(mousePos.y - ttH / 2, 4), size.h - ttH - 4);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-0 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      />
      {hovered && (
        <div className="panel-glass absolute z-50 pointer-events-none rounded-xl overflow-hidden text-[11px] shadow-2xl"
          style={{ left: ttX, top: ttY, minWidth: ttW, fontFamily: 'var(--font-jetbrains-mono)' }}>
          <div className="px-3 py-1.5 border-b flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{hovered.label}</span>
            <span style={{ color: 'var(--text-muted)' }}>{hovered.daysToExp}d</span>
          </div>
          <div className="px-3 py-1.5 space-y-0.5">
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Call GEX</span>
              <span style={{ color: 'var(--bull)' }}>{fmtNum(hovered.callGEX)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span style={{ color: 'var(--text-muted)' }}>Put GEX</span>
              <span style={{ color: 'var(--bear)' }}>{fmtNum(hovered.putGEX)}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-0.5" style={{ borderColor: 'var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Net GEX</span>
              <span className="font-bold" style={{ color: hovered.netGEX >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {hovered.netGEX >= 0 ? '+' : ''}{fmtNum(hovered.netGEX)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function OptionsFlowPanel({
  netFlowByStrike,
  oiByStrike,
  topContracts,
  gexByExpiry,
  spotPrice,
  symbol,
  liveSpot,
}: OptionsFlowPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('flow');

  // Use live spot when available, otherwise fall back to API spot
  const displayPrice = (liveSpot?.price ?? 0) > 0 ? liveSpot!.price : spotPrice;
  const isLive = (liveSpot?.price ?? 0) > 0;

  // Motion P8 — flash the headline live spot price when it ticks.
  const priceFlash = useValueFlash(displayPrice);

  // Compute age of last live update for staleness indicator
  const secAgo = liveSpot?.ts ? Math.floor((Date.now() - liveSpot.ts) / 1000) : null;

  return (
    <div className="panel-glass flex flex-col h-full rounded-xl overflow-hidden">

      {/* Header */}
      <div className="panel-glass flex items-center justify-between px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-jetbrains-mono)' }}>
          {symbol} Options Flow
        </span>
        <div className="flex items-center gap-2">
          {/* Live spot price badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
            style={{ background: isLive ? 'rgb(var(--bull-rgb) / 0.1)' : 'var(--surface-elevated)', border: `1px solid ${isLive ? 'rgb(var(--bull-rgb) / 0.25)' : 'var(--border)'}`, fontFamily: 'var(--font-jetbrains-mono)' }}>
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--bull)' }} />
            )}
            <span className={priceFlash ? 'value-flash' : ''} style={{ color: isLive ? 'var(--bull)' : 'var(--text-muted)' }}>
              ${fmtPrice(displayPrice)}
            </span>
            {secAgo !== null && (
              <span className="text-[11px] font-normal" style={{ color: 'var(--text-dimmed)' }}>
                {secAgo < 5 ? 'live' : `${secAgo}s`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="panel-glass flex px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <Segment
          options={TABS.map(tab => ({ id: tab.key, label: tab.label }))}
          value={activeTab}
          onChange={setActiveTab}
          size="sm"
        />
      </div>

      {/* Content */}
      <div key={activeTab} className="flex-1 min-h-0 overflow-hidden p-1 animate-fadeIn">
        {activeTab === 'flow'      && <NetFlowChart data={netFlowByStrike} spotPrice={spotPrice} />}
        {activeTab === 'oi'        && <OIChart data={oiByStrike} spotPrice={spotPrice} />}
        {activeTab === 'contracts' && <TopContractsTable data={topContracts} />}
        {activeTab === 'gex'       && <GEXExpiryChart data={gexByExpiry} />}
      </div>
    </div>
  );
}
