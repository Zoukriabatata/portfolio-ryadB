'use client';

/**
 * ReplayTradingChart
 *
 * Full trading chart for replay mode — fusion of /live + /footprint.
 * Canvas-based with timeframe selector and footprint toggle.
 *
 * Features:
 * - Timeframe selector (5s → 1H)
 * - Footprint mode toggle (auto at ≤20 candles, or forced on/off)
 * - Scroll zoom, drag pan, crosshair
 * - Current price line, volume bars, delta labels
 * - Feeds currentPrice to useMarketStore for QuickTradeBar
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { FootprintCandle } from '@/lib/ib/IBFootprintAdapter';
import { useMarketStore } from '@/stores/useMarketStore';

interface ReplayTradingChartProps {
  symbol: string;
  isPlaying: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEFRAME OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TIMEFRAMES = [
  { label: '5s',  sec: 5 },
  { label: '15s', sec: 15 },
  { label: '30s', sec: 30 },
  { label: '1m',  sec: 60 },
  { label: '5m',  sec: 300 },
  { label: '15m', sec: 900 },
  { label: '30m', sec: 1800 },
  { label: '1H',  sec: 3600 },
];

type FootprintMode = 'auto' | 'on' | 'off';

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

const C = {
  bg: '#0a0a0f',
  up: '#10b981',
  down: '#ef4444',
  upFill: 'rgba(16,185,129,0.35)',
  downFill: 'rgba(239,68,68,0.35)',
  grid: 'rgba(255,255,255,0.04)',
  gridText: 'rgba(255,255,255,0.3)',
  priceLine: '#f59e0b',
  volUp: 'rgba(16,185,129,0.3)',
  volDown: 'rgba(239,68,68,0.3)',
  fpBid: 'rgba(239,68,68,0.7)',
  fpAsk: 'rgba(16,185,129,0.7)',
  fpImbBuy: 'rgba(16,185,129,1)',
  fpImbSell: 'rgba(239,68,68,1)',
  fpPoc: 'rgba(16,185,129,0.15)',
  fpCell: 'rgba(255,255,255,0.03)',
  crosshair: 'rgba(255,255,255,0.15)',
};

const PRICE_AXIS_W = 70;
const TIME_AXIS_H = 24;
const VOL_PCT = 0.15;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReplayTradingChart({ symbol, isPlaying }: ReplayTradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // UI state (triggers re-render for toolbar)
  const [timeframe, setTimeframe] = useState(60);
  const [fpMode, setFpMode] = useState<FootprintMode>('auto');
  const [showTfPicker, setShowTfPicker] = useState(false);

  // Render-loop state (refs, no re-render)
  const st = useRef({
    w: 0, h: 0,
    visibleCount: 40,
    scrollOffset: 0,
    mouseX: -1, mouseY: -1,
    isDragging: false,
    dragStartX: 0, dragStartOffset: 0,
    fpMode: 'auto' as FootprintMode,
  });

  // Sync fpMode to ref
  useEffect(() => { st.current.fpMode = fpMode; }, [fpMode]);

  // ── Timeframe change ──
  const handleTimeframeChange = useCallback((sec: number) => {
    setTimeframe(sec);
    setShowTfPicker(false);
    try {
      const engine = getReplayEngine();
      engine.setFootprintTimeframe(sec);
    } catch { /* engine not ready */ }
  }, []);

  // ── Resize ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      st.current.w = Math.floor(width);
      st.current.h = Math.floor(height);
    });
    obs.observe(el);
    const r = el.getBoundingClientRect();
    st.current.w = Math.floor(r.width);
    st.current.h = Math.floor(r.height);
    return () => obs.disconnect();
  }, []);

  // ── Scroll zoom ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      st.current.visibleCount = Math.max(5, Math.min(200, st.current.visibleCount + (e.deltaY > 0 ? 3 : -3)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Mouse ──
  const onDown = useCallback((e: React.MouseEvent) => {
    const s = st.current;
    s.isDragging = true;
    s.dragStartX = e.clientX;
    s.dragStartOffset = s.scrollOffset;
  }, []);
  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    s.mouseX = e.clientX - rect.left;
    s.mouseY = e.clientY - rect.top;
    if (s.isDragging) {
      const chartW = s.w - PRICE_AXIS_W;
      const candleW = chartW / s.visibleCount;
      s.scrollOffset = Math.max(0, s.dragStartOffset + Math.round((e.clientX - s.dragStartX) / candleW));
    }
  }, []);
  const onUp = useCallback(() => { st.current.isDragging = false; }, []);
  const onLeave = useCallback(() => { st.current.isDragging = false; st.current.mouseX = -1; st.current.mouseY = -1; }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const s = st.current;
    const { w, h, visibleCount, scrollOffset, mouseX, mouseY, fpMode: mode } = s;
    if (w < 10 || h < 10) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Data
    const engine = getReplayEngine();
    const allCandles = engine.getFootprintCandles() as FootprintCandle[];
    const price = engine.getCurrentPrice();
    if (price > 0) useMarketStore.setState({ currentPrice: price });

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    if (allCandles.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for trade data...', w / 2, h / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Visible slice
    const total = allCandles.length;
    const end = Math.max(0, total - scrollOffset);
    const start = Math.max(0, end - visibleCount);
    const candles = allCandles.slice(start, end);
    if (candles.length === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    // Should we show footprint?
    const showFP = mode === 'on' || (mode === 'auto' && visibleCount <= 20);

    const chartW = w - PRICE_AXIS_W;
    const volH = h * VOL_PCT;
    const chartH = h - TIME_AXIS_H - volH;
    const candleW = chartW / visibleCount;
    const bodyW = Math.max(1, candleW * (showFP ? 0.92 : 0.7));

    // Price range
    let hi = -Infinity, lo = Infinity, maxV = 0;
    for (const c of candles) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
      if (c.totalVolume > maxV) maxV = c.totalVolume;
    }
    const rng = hi - lo || 1;
    hi += rng * 0.05;
    lo -= rng * 0.05;
    const pR = hi - lo;

    const p2y = (p: number) => ((hi - p) / pR) * chartH;
    const y2p = (y: number) => hi - (y / chartH) * pR;

    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    const steps = 8;
    const pStep = pR / steps;
    ctx.font = '9px monospace';
    ctx.fillStyle = C.gridText;
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const p = lo + i * pStep;
      const y = p2y(p);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      ctx.fillText(p.toFixed(2), w - 4, y + 3);
    }

    // ── Candles ──
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * candleW;
      const cx = x + candleW / 2;
      const up = c.close >= c.open;

      if (showFP) {
        drawFP(ctx, c, x, candleW, bodyW, hi, lo, pR, chartH);
      } else {
        const oY = p2y(c.open), cY = p2y(c.close), hY = p2y(c.high), lY = p2y(c.low);
        const top = Math.min(oY, cY), bH = Math.max(1, Math.abs(cY - oY));

        ctx.strokeStyle = up ? C.up : C.down;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, hY); ctx.lineTo(cx, lY); ctx.stroke();

        if (bH < 2) {
          ctx.fillStyle = up ? C.up : C.down;
          ctx.fillRect(cx - bodyW / 2, top, bodyW, 1);
        } else {
          ctx.fillStyle = up ? C.upFill : C.downFill;
          ctx.fillRect(cx - bodyW / 2, top, bodyW, bH);
          ctx.strokeStyle = up ? C.up : C.down;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bodyW / 2, top, bodyW, bH);
        }
      }

      // Volume
      const vH = maxV > 0 ? (c.totalVolume / maxV) * volH * 0.85 : 0;
      ctx.fillStyle = c.close >= c.open ? C.volUp : C.volDown;
      ctx.fillRect(x + 1, chartH + volH - vH, candleW - 2, vH);
    }

    // Current price line
    if (price >= lo && price <= hi) {
      const py = p2y(price);
      ctx.strokeStyle = C.priceLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(chartW, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.priceLine;
      ctx.fillRect(chartW, py - 8, PRICE_AXIS_W, 16);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), chartW + PRICE_AXIS_W / 2, py + 3);
    }

    // Time axis
    ctx.fillStyle = C.gridText;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const tStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += tStep) {
      const c = candles[i];
      const x = i * candleW + candleW / 2;
      const d = new Date(c.time * 1000);
      ctx.fillText(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`, x, h - 4);
    }

    // Crosshair
    if (mouseX >= 0 && mouseX < chartW && mouseY >= 0 && mouseY < chartH) {
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, mouseY); ctx.lineTo(chartW, mouseY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mouseX, 0); ctx.lineTo(mouseX, chartH + volH); ctx.stroke();
      ctx.setLineDash([]);
      const cp = y2p(mouseY);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(chartW, mouseY - 8, PRICE_AXIS_W, 16);
      ctx.fillStyle = '#000';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cp.toFixed(2), chartW + PRICE_AXIS_W / 2, mouseY + 3);
    }

    // Separators
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(chartW, chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, h); ctx.stroke();

    // ── HUD: candle count + mode ──
    const modeLabel = showFP ? 'FOOTPRINT' : 'CANDLES';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${candles.length} candles · ${modeLabel}`, 8, chartH + volH + 14);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const currentTfLabel = TIMEFRAMES.find(t => t.sec === timeframe)?.label || '1m';

  return (
    <div className="w-full h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Timeframe picker */}
        <div className="relative">
          <button
            onClick={() => setShowTfPicker(p => !p)}
            className="px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {currentTfLabel}
          </button>
          {showTfPicker && (
            <div
              className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden"
              style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.sec}
                  onClick={() => handleTimeframeChange(tf.sec)}
                  className="block w-full px-4 py-1.5 text-left text-[10px] font-mono transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                  style={{
                    color: tf.sec === timeframe ? '#10b981' : 'rgba(255,255,255,0.6)',
                    fontWeight: tf.sec === timeframe ? 700 : 400,
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />

        {/* Footprint mode toggle */}
        {(['auto', 'on', 'off'] as FootprintMode[]).map(m => (
          <button
            key={m}
            onClick={() => setFpMode(m)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
            style={{
              background: fpMode === m ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: fpMode === m ? '#10b981' : 'rgba(255,255,255,0.4)',
              fontWeight: fpMode === m ? 700 : 400,
            }}
          >
            {m === 'auto' ? 'FP Auto' : m === 'on' ? 'Footprint' : 'Candles'}
          </button>
        ))}

        <div className="flex-1" />

        {/* Symbol label */}
        <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {symbol}
        </span>
      </div>

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ cursor: 'crosshair' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function drawFP(
  ctx: CanvasRenderingContext2D,
  candle: FootprintCandle,
  x: number, candleW: number, bodyW: number,
  hi: number, lo: number, pR: number, chartH: number,
) {
  const p2y = (p: number) => ((hi - p) / pR) * chartH;
  const up = candle.close >= candle.open;
  const levels = Array.from(candle.levels.values()).sort((a, b) => b.price - a.price);
  if (levels.length === 0) {
    // No levels yet — draw simple candle outline
    const oY = p2y(candle.open), cY = p2y(candle.close);
    ctx.strokeStyle = up ? C.up : C.down;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + candleW * 0.1, Math.min(oY, cY), candleW * 0.8, Math.max(1, Math.abs(cY - oY)));
    return;
  }

  let maxLV = 0;
  for (const l of levels) { if (l.totalVolume > maxLV) maxLV = l.totalVolume; }

  // Tick size from price gaps
  const prices = levels.map(l => l.price);
  let tick = 1;
  if (prices.length > 1) {
    const diffs: number[] = [];
    for (let i = 1; i < prices.length; i++) diffs.push(Math.abs(prices[i] - prices[i - 1]));
    tick = Math.min(...diffs.filter(d => d > 0)) || 1;
  }

  const cellH = Math.max(2, (tick / pR) * chartH);
  const half = bodyW / 2;
  const cx = x + candleW / 2;

  for (const lv of levels) {
    const y = p2y(lv.price);
    const intensity = maxLV > 0 ? lv.totalVolume / maxLV : 0;

    // Cell bg
    ctx.fillStyle = lv.price === candle.poc ? C.fpPoc : C.fpCell;
    ctx.fillRect(cx - half, y - cellH / 2, bodyW, cellH);

    // Bid/ask bars
    const bW = (half - 2) * (maxLV > 0 ? lv.bidVolume / maxLV : 0);
    const aW = (half - 2) * (maxLV > 0 ? lv.askVolume / maxLV : 0);

    ctx.fillStyle = lv.imbalanceSell ? C.fpImbSell : `rgba(239,68,68,${0.2 + intensity * 0.6})`;
    ctx.fillRect(cx - 1 - bW, y - cellH / 2 + 0.5, bW, cellH - 1);

    ctx.fillStyle = lv.imbalanceBuy ? C.fpImbBuy : `rgba(16,185,129,${0.2 + intensity * 0.6})`;
    ctx.fillRect(cx + 1, y - cellH / 2 + 0.5, aW, cellH - 1);

    // Volume text
    if (cellH >= 10 && candleW > 50) {
      ctx.font = `${Math.min(9, cellH - 2)}px monospace`;
      if (lv.bidVolume > 0) {
        ctx.fillStyle = C.fpBid;
        ctx.textAlign = 'right';
        ctx.fillText(fmtV(lv.bidVolume), cx - 3, y + 3);
      }
      if (lv.askVolume > 0) {
        ctx.fillStyle = C.fpAsk;
        ctx.textAlign = 'left';
        ctx.fillText(fmtV(lv.askVolume), cx + 3, y + 3);
      }
    }

    // Center divider
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx - 0.5, y - cellH / 2, 1, cellH);
  }

  // Body outline
  const oY = p2y(candle.open), cY = p2y(candle.close);
  ctx.strokeStyle = up ? C.up : C.down;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - half, Math.min(oY, cY), bodyW, Math.max(1, Math.abs(cY - oY)));

  // Wicks
  const hY = p2y(candle.high), lY = p2y(candle.low);
  ctx.strokeStyle = up ? C.up : C.down;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, hY); ctx.lineTo(cx, Math.min(oY, cY));
  ctx.moveTo(cx, Math.max(oY, cY)); ctx.lineTo(cx, lY);
  ctx.stroke();

  // Delta label
  if (candleW > 30) {
    const d = candle.totalDelta;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = d >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
    ctx.fillText((d >= 0 ? '+' : '') + fmtV(d), cx, lY + 12);
  }
}

function fmtV(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (a >= 1) return v.toFixed(0);
  return v.toFixed(2);
}
