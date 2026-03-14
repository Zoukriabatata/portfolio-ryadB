'use client';

/**
 * FootprintTEST Chart — DeepChart style
 *
 * Visual concept (DeepChart / ATAS):
 *  • Split bid/ask bars: bid fills from LEFT edge, ask from RIGHT edge
 *  • Text-first: bright numbers (bid | price | ask) over bar backgrounds
 *  • POC: full-width gold horizontal line at cell bottom
 *  • Imbalance triangles: ▶/◀ on cells with ratio > 3:1
 *  • Delta + volume callout above each candle
 *  • VWAP: quadratic-spline gold dashed line
 *  • CVD panel: area chart at bottom
 *  • Mouse: scroll (pan) | ctrl+wheel (zoom candleW) | shift+wheel (zoom rowH) | drag (pan)
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { generateSimCandles, type SimCandle } from './SimulationEngine';
import { binanceWS } from '@/lib/websocket/BinanceWS';

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg        : '#080b14',   // deep blue-black
  surface   : '#0a1220',
  grid      : '#0e1628',
  bid       : '#ef5350',   // ATAS standard red
  ask       : '#26a69a',   // ATAS standard teal
  poc       : '#c89020',   // gold
  deltaPos  : '#26a69a',   // same as ask for consistency
  deltaNeg  : '#ef5350',   // same as bid for consistency
  vwap      : '#ffab38',
  text      : '#7a9fc0',
  textMuted : '#283850',
  price     : '#c8dff8',
  separator : 'rgba(90,110,180,0.28)',
  cvdBg     : '#07090f',
};

// ─── Layout constants ─────────────────────────────────────────────────────────

const PRICE_W   = 68;
const SESSION_W = 72;   // daily session footprint profile strip
const TIME_H    = 22;
const CVD_H     = 54;
const HDR_H     = 30;
const FONT      = '"Consolas","Monaco",monospace';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1000)}K`;
  if (a >= 1e3) return `${(v / 1000).toFixed(1)}K`;
  return Math.round(v).toString();
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function fmtPrice(p: number, tick: number): string {
  const dec = tick < 0.01 ? 4 : tick < 1 ? 2 : tick < 10 ? 1 : 0;
  return p.toFixed(dec);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  symbol  ?: string;
  tickSize?: number;
}

export default function FootprintTESTChart({ symbol = 'BTCUSDT', tickSize = 10 }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const candlesRef = useRef<SimCandle[]>([]);
  const stateRef   = useRef({ candleW: 88, rowH: 13, offsetX: 0 });
  const hoverRef   = useRef<{ x: number; y: number } | null>(null);
  const dragRef    = useRef<{ active: boolean; startX: number; startOff: number }>({ active: false, startX: 0, startOff: 0 });
  const dirtyRef   = useRef(true);
  const rafRef     = useRef(0);
  const domBidsRef = useRef<Map<number, number>>(new Map());
  const domAsksRef = useRef<Map<number, number>>(new Map());

  // ── DOM subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = binanceWS.subscribeDepth20(symbol.toLowerCase(), (snap) => {
      const bids = new Map<number, number>();
      const asks = new Map<number, number>();
      snap.bids.forEach(([p, q]) => { const qty = parseFloat(q); if (qty > 0) bids.set(parseFloat(p), qty); });
      snap.asks.forEach(([p, q]) => { const qty = parseFloat(q); if (qty > 0) asks.set(parseFloat(p), qty); });
      domBidsRef.current = bids;
      domAsksRef.current = asks;
      dirtyRef.current = true;
    }, 'futures', '100ms');
    return unsub;
  }, [symbol]);

  // Generate simulation data once per symbol/tickSize
  const candles = useMemo(() => generateSimCandles(60, 95000, tickSize, 300), [symbol, tickSize]);
  useEffect(() => {
    candlesRef.current = candles;
    // Start scrolled to the newest candles
    const canvas = canvasRef.current;
    if (canvas) {
      const chartW = canvas.clientWidth - PRICE_W;
      const total  = candles.length * stateRef.current.candleW;
      stateRef.current.offsetX = Math.max(0, total - chartW * 0.95);
    }
    dirtyRef.current = true;
  }, [candles]);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.round(rect.width  * dpr);
      canvas.height = Math.round(rect.height * dpr);
      // Re-clamp offsetX after resize
      clampOffset(rect.width - PRICE_W);
      dirtyRef.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderAll(ctx, canvas.clientWidth, canvas.clientHeight);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [tickSize]);

  // ── Clamp ─────────────────────────────────────────────────────────────────
  function clampOffset(chartW: number) {
    const { candleW } = stateRef.current;
    const total = candlesRef.current.length * candleW;
    stateRef.current.offsetX = Math.max(
      -(chartW * 0.15),
      Math.min(total - chartW * 0.85, stateRef.current.offsetX)
    );
  }

  // ── Mouse handlers (native DOM — avoids React passive-event limitations) ──
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const state  = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const chartW = canvas.clientWidth - PRICE_W;
    const rect   = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    if (e.shiftKey) {
      // Shift+scroll → zoom row height
      const factor = e.deltaY > 0 ? 0.9 : 1.12;
      state.rowH   = Math.max(7, Math.min(32, state.rowH * factor));
    } else {
      // Plain scroll → zoom candle width, anchored to mouse position
      const factor     = e.deltaY > 0 ? 0.88 : 1.14;
      const newCandleW = Math.max(28, Math.min(260, state.candleW * factor));
      const anchor     = (mouseX + state.offsetX) / state.candleW;
      state.offsetX    = anchor * newCandleW - mouseX;
      state.candleW    = newCandleW;
    }
    dirtyRef.current = true;
  }, []);

  const onMouseDown = useCallback((e: MouseEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startOff: stateRef.current.offsetX };
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    hoverRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.startX;
      stateRef.current.offsetX = dragRef.current.startOff - dx;
    }
    dirtyRef.current = true;
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false;
    dirtyRef.current = true;
  }, []);

  // ── Native event binding ───────────────────────────────────────────────────
  // wheel needs { passive: false } so preventDefault() works;
  // move/up on window so drag tracks correctly outside the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel',     onWheel,     { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      canvas.removeEventListener('wheel',     onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [onWheel, onMouseDown, onMouseMove, onMouseUp]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  function renderAll(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const { candleW, rowH, offsetX } = stateRef.current;
    const candles = candlesRef.current;

    const chartX    = 0;
    const chartY    = HDR_H;
    const chartW    = W - PRICE_W - SESSION_W;
    const chartH    = H - HDR_H - CVD_H - TIME_H;
    const cvdY      = HDR_H + chartH;
    const timeY     = cvdY + CVD_H;
    const sessionX  = chartW;   // session profile starts right after chart area

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (candles.length === 0) return;

    // ── Visible range ────────────────────────────────────────────────────────
    const firstIdx = Math.max(0, Math.floor(offsetX / candleW));
    const lastIdx  = Math.min(candles.length - 1, Math.ceil((offsetX + chartW) / candleW));
    const visible  = candles.slice(firstIdx, lastIdx + 1);

    if (visible.length === 0) return;

    // ── Price range ───────────────────────────────────────────────────────────
    let priceMin =  Infinity;
    let priceMax = -Infinity;
    visible.forEach(c => { priceMin = Math.min(priceMin, c.low); priceMax = Math.max(priceMax, c.high); });
    const pad      = (priceMax - priceMin) * 0.08;
    priceMin -= pad;
    priceMax += pad;
    const pRange   = priceMax - priceMin || 1;
    const toY = (p: number) => chartY + chartH - ((p - priceMin) / pRange) * chartH;

    // ── Grid lines ────────────────────────────────────────────────────────────
    const gridStep = Math.ceil(pRange / 8 / tickSize) * tickSize;
    const gridStart = Math.ceil(priceMin / gridStep) * gridStep;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    for (let p = gridStart; p <= priceMax; p += gridStep) {
      const y = toY(p);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
    }

    // ── Clip to chart area ────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartX, chartY, chartW, chartH);
    ctx.clip();

    // ── Max volume for normalization ──────────────────────────────────────────
    let maxLevelVol = 1;
    visible.forEach(c => c.levels.forEach(l => {
      maxLevelVol = Math.max(maxLevelVol, l.bidVol + l.askVol);
    }));

    // ── Render each candle ────────────────────────────────────────────────────
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c  = candles[i];
      const cx = Math.round(i * candleW - offsetX);
      const cw = Math.max(1, candleW - 2);

      // Session separator
      if (c.sessionStart) {
        ctx.strokeStyle = C.separator;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(cx, chartY);
        ctx.lineTo(cx, chartY + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Price level cells ─────────────────────────────────────────────────
      for (const lv of c.levels) {
        const y1   = toY(lv.price + tickSize);
        const y2   = toY(lv.price);
        const cellH = y2 - y1 - 1;
        if (cellH < 1) continue;
        if (y1 + cellH < chartY || y1 > chartY + chartH) continue;

        const isPOC = lv.price === c.poc;

        // POC background tint
        if (isPOC) {
          ctx.fillStyle = C.poc;
          ctx.globalAlpha = 0.06;
          ctx.fillRect(cx + 1, y1, cw, cellH);
          ctx.globalAlpha = 1;
        }

        // Bid bar — from LEFT edge inward
        const bidBarW = Math.max(1, (lv.bidVol / maxLevelVol) * cw);
        ctx.fillStyle = C.bid;
        ctx.globalAlpha = 0.50;
        ctx.fillRect(cx + 1, y1, bidBarW, cellH);
        ctx.globalAlpha = 1;

        // Ask bar — from RIGHT edge inward
        const askBarW = Math.max(1, (lv.askVol / maxLevelVol) * cw);
        ctx.fillStyle = C.ask;
        ctx.globalAlpha = 0.50;
        ctx.fillRect(cx + cw - askBarW, y1, askBarW, cellH);
        ctx.globalAlpha = 1;

        // POC: full-width gold horizontal line at cell bottom
        if (isPOC) {
          ctx.fillStyle = C.poc;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(cx + 1, y2 - 1.5, cw - 1, 1.5);
          ctx.globalAlpha = 1;
        }

        // Imbalance triangle on dominant side (ratio > 3:1)
        const imbalRatio = lv.bidVol > lv.askVol
          ? lv.bidVol / Math.max(lv.askVol, 0.001)
          : lv.askVol / Math.max(lv.bidVol, 0.001);
        if (imbalRatio > 3 && cellH >= 9 && cw >= 22) {
          const my = y1 + cellH / 2;
          ctx.globalAlpha = 0.85;
          if (lv.bidVol > lv.askVol) {
            // Bid dominant: red ▶ at left
            ctx.fillStyle = C.bid;
            ctx.beginPath();
            ctx.moveTo(cx + 4, my - 4);
            ctx.lineTo(cx + 4, my + 4);
            ctx.lineTo(cx + 9, my);
            ctx.closePath();
            ctx.fill();
          } else {
            // Ask dominant: teal ◀ at right
            ctx.fillStyle = C.ask;
            ctx.beginPath();
            ctx.moveTo(cx + cw - 4, my - 4);
            ctx.lineTo(cx + cw - 4, my + 4);
            ctx.lineTo(cx + cw - 9, my);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }

        // Row separator line
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, y2);
        ctx.lineTo(cx + cw, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Text layout: wide=bid|price|ask, medium=bid|ask, narrow=none
        if (cw >= 72 && cellH >= 9) {
          const fs = Math.min(9, cellH - 2);
          const ty = y1 + cellH * 0.5 + fs * 0.38;
          ctx.font = `${fs}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.bid;
          ctx.fillText(fmtVol(lv.bidVol), cx + cw * 0.2, ty);
          ctx.fillStyle = isPOC ? C.poc : '#ffffff';
          ctx.fillText(fmtPrice(lv.price, tickSize), cx + cw * 0.5, ty);
          ctx.fillStyle = C.ask;
          ctx.fillText(fmtVol(lv.askVol), cx + cw * 0.8, ty);
        } else if (cw >= 36 && cellH >= 9) {
          const fs = Math.min(8, cellH - 2);
          const ty = y1 + cellH * 0.5 + fs * 0.38;
          ctx.font = `${fs}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.bid;
          ctx.fillText(fmtVol(lv.bidVol), cx + cw * 0.28, ty);
          ctx.fillStyle = C.ask;
          ctx.fillText(fmtVol(lv.askVol), cx + cw * 0.72, ty);
        }
      }

      // Delta + volume callout above candle
      if (cw >= 38) {
        const highY  = toY(c.high);
        const labelY = Math.max(chartY + 22, highY - 6);
        ctx.textAlign = 'center';
        ctx.font      = `bold 9px ${FONT}`;
        ctx.fillStyle = c.delta >= 0 ? C.deltaPos : C.deltaNeg;
        ctx.fillText((c.delta >= 0 ? '+' : '') + fmtVol(c.delta), cx + cw * 0.5, labelY);
        ctx.font      = `7px ${FONT}`;
        ctx.fillStyle = C.textMuted;
        ctx.fillText(fmtVol(c.totalVol), cx + cw * 0.5, labelY + 10);
      }

      // Candle separator
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 0.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + candleW - 1, chartY);
      ctx.lineTo(cx + candleW - 1, chartY + chartH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // end chart clip

    // ── VWAP ─────────────────────────────────────────────────────────────────
    renderVWAP(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartY, chartH, priceMin, pRange, chartW);

    // ── Session profile ───────────────────────────────────────────────────────
    // Find the last session start, aggregate bid/ask from there to end
    let sessionStartIdx = 0;
    for (let i = candles.length - 1; i >= 1; i--) {
      if (candles[i].sessionStart) { sessionStartIdx = i; break; }
    }
    const sessionBid = new Map<number, number>();
    const sessionAsk = new Map<number, number>();
    for (let i = sessionStartIdx; i < candles.length; i++) {
      for (const lv of candles[i].levels) {
        sessionBid.set(lv.price, (sessionBid.get(lv.price) ?? 0) + lv.bidVol);
        sessionAsk.set(lv.price, (sessionAsk.get(lv.price) ?? 0) + lv.askVol);
      }
    }
    let sessionPOC = 0; let maxSessionVol = 0;
    sessionBid.forEach((bid, price) => {
      const total = bid + (sessionAsk.get(price) ?? 0);
      if (total > maxSessionVol) { maxSessionVol = total; sessionPOC = price; }
    });
    renderSessionProfile(ctx, sessionX, chartY, SESSION_W, chartH, sessionBid, sessionAsk, sessionPOC, priceMin, pRange, tickSize, toY);

    // ── Price scale ───────────────────────────────────────────────────────────
    renderPriceScale(ctx, W, chartY, chartH, gridStart, gridStep, priceMax, toY, tickSize, priceMin, pRange, domBidsRef.current, domAsksRef.current);

    // ── CVD panel ─────────────────────────────────────────────────────────────
    renderCVD(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartW, cvdY, CVD_H);

    // ── Time axis ─────────────────────────────────────────────────────────────
    renderTimeAxis(ctx, candles, firstIdx, lastIdx, offsetX, candleW, chartW, timeY);

    // ── Header ────────────────────────────────────────────────────────────────
    renderHeader(ctx, W, symbol, visible);

    // ── Crosshair ─────────────────────────────────────────────────────────────
    renderCrosshair(ctx, W, H, chartW, chartY, chartH, priceMin, pRange, toY, tickSize, timeY);
  }

  // ─── VWAP ────────────────────────────────────────────────────────────────────

  function renderVWAP(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartY: number, chartH: number,
    priceMin: number, pRange: number,
    chartW: number,
  ) {
    let cumVol = 0, cumVwap = 0;
    const pts: { x: number; y: number }[] = [];

    for (let i = 0; i <= lastIdx; i++) {
      const c = candles[i];
      if (c.sessionStart && i > 0) { cumVol = 0; cumVwap = 0; }
      const typical = (c.high + c.low + c.close) / 3;
      cumVol  += c.totalVol;
      cumVwap += typical * c.totalVol;
      if (i < firstIdx) continue;
      const vwap = cumVwap / (cumVol || 1);
      const x = i * candleW - offsetX + candleW * 0.5;
      const y = chartY + chartH - ((vwap - priceMin) / pRange) * chartH;
      if (x >= 0 && x <= chartW) pts.push({ x, y });
    }

    if (pts.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chartY, chartW, chartH);
    ctx.clip();

    ctx.strokeStyle = C.vwap;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // VWAP label
    const last = pts[pts.length - 1];
    ctx.font      = `bold 8px ${FONT}`;
    ctx.fillStyle  = C.vwap;
    ctx.globalAlpha = 0.9;
    ctx.textAlign  = 'left';
    ctx.fillText('VWAP', Math.min(last.x + 4, chartW - 36), last.y - 3);
    ctx.globalAlpha = 1;
  }

  // ─── Session profile ─────────────────────────────────────────────────────────

  function renderSessionProfile(
    ctx: CanvasRenderingContext2D,
    sx: number, chartY: number, sw: number, chartH: number,
    bid: Map<number, number>, ask: Map<number, number>,
    poc: number,
    priceMin: number, pRange: number, tick: number,
    toY: (p: number) => number,
  ) {
    // Background + borders
    ctx.fillStyle = C.surface;
    ctx.fillRect(sx, chartY, sw, chartH);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, chartY); ctx.lineTo(sx, chartY + chartH);
    ctx.moveTo(sx + sw, chartY); ctx.lineTo(sx + sw, chartY + chartH);
    ctx.stroke();

    // Title
    ctx.font      = `bold 7px ${FONT}`;
    ctx.fillStyle = C.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText('SESSION', sx + sw / 2, chartY + 10);

    // Cell height for one tick
    const cellH   = Math.max(2, (tick / pRange) * chartH);
    const halfCell = cellH / 2;
    const barMaxW  = sw - 2;

    // Max volume for normalization
    let maxVol = 1;
    bid.forEach((v, p) => { if (p >= priceMin && p <= priceMin + pRange) maxVol = Math.max(maxVol, v + (ask.get(p) ?? 0)); });

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, chartY, sw, chartH);
    ctx.clip();

    bid.forEach((bidVol, price) => {
      const askVol = ask.get(price) ?? 0;
      const total  = bidVol + askVol;
      const y      = toY(price);
      if (y < chartY || y > chartY + chartH) return;

      const isPOC  = price === poc;
      const bidW   = Math.max(1, (bidVol / maxVol) * barMaxW);
      const askW   = Math.max(1, (askVol / maxVol) * barMaxW);
      const barH   = Math.max(2, cellH - 1);

      // Bid bar — left → right
      ctx.fillStyle   = C.bid;
      ctx.globalAlpha = isPOC ? 0.65 : 0.42;
      ctx.fillRect(sx + 1, y - halfCell, bidW, barH);

      // Ask bar — right → left
      ctx.fillStyle   = C.ask;
      ctx.globalAlpha = isPOC ? 0.65 : 0.42;
      ctx.fillRect(sx + sw - 1 - askW, y - halfCell, askW, barH);

      ctx.globalAlpha = 1;

      // POC gold line
      if (isPOC) {
        ctx.fillStyle   = C.poc;
        ctx.globalAlpha = 0.90;
        ctx.fillRect(sx + 1, y + halfCell - 1.5, sw - 2, 1.5);
        ctx.globalAlpha = 1;
      }

      // Volume text in wide cells
      if (cellH >= 9 && sw >= 56) {
        const fs = Math.min(8, cellH - 2);
        const ty = y - halfCell + cellH * 0.5 + fs * 0.38;
        ctx.font      = `${fs}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = isPOC ? C.poc : C.textMuted;
        ctx.fillText(fmtVol(total), sx + sw / 2, ty);
      }
    });

    ctx.restore();
  }

  // ─── Price scale ─────────────────────────────────────────────────────────────

  function renderPriceScale(
    ctx: CanvasRenderingContext2D,
    W: number, chartY: number, chartH: number,
    gridStart: number, gridStep: number, priceMax: number,
    toY: (p: number) => number, tick: number,
    priceMin: number, pRange: number,
    domBids: Map<number, number>, domAsks: Map<number, number>,
  ) {
    const scaleX  = W - PRICE_W;
    const cellH   = Math.max(2, (tick / pRange) * chartH);
    const halfCell = cellH / 2;

    // Background
    ctx.fillStyle = C.surface;
    ctx.fillRect(scaleX, chartY - 2, PRICE_W, chartH + 4);

    // Left border
    ctx.strokeStyle = C.grid;
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(scaleX, chartY);
    ctx.lineTo(scaleX, chartY + chartH);
    ctx.stroke();

    // ── DOM bars (rendered behind price labels) ──────────────────────────────
    if (domBids.size > 0 || domAsks.size > 0) {
      // Max qty across visible price range for normalization
      let maxQty = 1;
      domBids.forEach((qty, price) => { if (price >= priceMin && price <= priceMax) maxQty = Math.max(maxQty, qty); });
      domAsks.forEach((qty, price) => { if (price >= priceMin && price <= priceMax) maxQty = Math.max(maxQty, qty); });

      const barMaxW = PRICE_W - 1;

      ctx.save();
      ctx.beginPath();
      ctx.rect(scaleX, chartY, PRICE_W, chartH);
      ctx.clip();

      // Bid bars — left → right (red)
      ctx.fillStyle = C.bid;
      ctx.globalAlpha = 0.50;
      domBids.forEach((qty, price) => {
        const y = toY(price);
        if (y < chartY || y > chartY + chartH) return;
        const barW = Math.max(2, (qty / maxQty) * barMaxW);
        ctx.fillRect(scaleX, y - halfCell, barW, Math.max(2, cellH - 1));
      });

      // Ask bars — right → left (teal)
      ctx.fillStyle = C.ask;
      ctx.globalAlpha = 0.50;
      domAsks.forEach((qty, price) => {
        const y = toY(price);
        if (y < chartY || y > chartY + chartH) return;
        const barW = Math.max(2, (qty / maxQty) * barMaxW);
        ctx.fillRect(scaleX + PRICE_W - barW, y - halfCell, barW, Math.max(2, cellH - 1));
      });

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Price labels (on top of bars) ────────────────────────────────────────
    ctx.font      = `9px ${FONT}`;
    ctx.textAlign  = 'left';
    for (let p = gridStart; p <= priceMax; p += gridStep) {
      const y = toY(p);
      if (y < chartY || y > chartY + chartH) continue;
      ctx.strokeStyle = C.grid;
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.moveTo(scaleX, y);
      ctx.lineTo(scaleX + 4, y);
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.fillText(fmtPrice(p, tick), scaleX + 7, y + 3);
    }
  }

  // ─── CVD panel ───────────────────────────────────────────────────────────────

  function renderCVD(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartW: number, cvdY: number, cvdH: number,
  ) {
    // Background
    ctx.fillStyle = C.cvdBg;
    ctx.fillRect(0, cvdY, chartW, cvdH);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cvdY);
    ctx.lineTo(chartW, cvdY);
    ctx.stroke();

    // Compute cumulative delta
    let cumDelta = 0;
    const pts: { x: number; v: number }[] = [];
    for (let i = 0; i <= lastIdx; i++) {
      const c = candles[i];
      if (c.sessionStart && i > 0) cumDelta = 0;
      cumDelta += c.delta;
      if (i < firstIdx) continue;
      const x = i * candleW - offsetX + candleW * 0.5;
      if (x >= 0 && x <= chartW) pts.push({ x, v: cumDelta });
    }
    if (pts.length < 2) { renderCVDLabel(ctx, 0, cvdY, cvdH); return; }

    let minV = Infinity, maxV = -Infinity;
    pts.forEach(p => { minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v); });
    const vRange = maxV - minV || 1;
    const pad = 6;
    const drawH = cvdH - pad * 2;
    const toVY = (v: number) => cvdY + pad + drawH - ((v - minV) / vRange) * drawH;

    // Zero line
    const zeroY = toVY(0);
    if (zeroY > cvdY + pad && zeroY < cvdY + cvdH - pad) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(chartW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Colored line segments + fill
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, cvdY, chartW, cvdH);
    ctx.clip();

    // Positive fill
    ctx.fillStyle = C.ask;
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, Math.min(toVY(pts[0].v), zeroY));
    pts.forEach(p => ctx.lineTo(p.x, Math.min(toVY(p.v), zeroY)));
    ctx.lineTo(pts[pts.length - 1].x, zeroY);
    ctx.lineTo(pts[0].x, zeroY);
    ctx.closePath();
    ctx.fill();

    // Negative fill
    ctx.fillStyle = C.bid;
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, Math.max(toVY(pts[0].v), zeroY));
    pts.forEach(p => ctx.lineTo(p.x, Math.max(toVY(p.v), zeroY)));
    ctx.lineTo(pts[pts.length - 1].x, zeroY);
    ctx.lineTo(pts[0].x, zeroY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Colored line
    ctx.lineWidth = 1.5;
    ctx.lineJoin  = 'round';
    for (let i = 1; i < pts.length; i++) {
      ctx.strokeStyle = pts[i].v >= pts[i - 1].v ? C.ask : C.bid;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, toVY(pts[i - 1].v));
      ctx.lineTo(pts[i].x, toVY(pts[i].v));
      ctx.stroke();
    }

    ctx.restore();

    renderCVDLabel(ctx, pts[pts.length - 1].v, cvdY, cvdH);
  }

  function renderCVDLabel(ctx: CanvasRenderingContext2D, lastVal: number, cvdY: number, cvdH: number) {
    ctx.font      = `bold 8px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle  = 'rgba(255,255,255,0.25)';
    ctx.fillText('CVD', 6, cvdY + 11);
    ctx.fillStyle  = lastVal >= 0 ? C.ask : C.bid;
    ctx.fillText(fmtVol(lastVal), 32, cvdY + 11);
  }

  // ─── Time axis ───────────────────────────────────────────────────────────────

  function renderTimeAxis(
    ctx: CanvasRenderingContext2D,
    candles: SimCandle[],
    firstIdx: number, lastIdx: number,
    offsetX: number, candleW: number,
    chartW: number, timeY: number,
  ) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, timeY, chartW, TIME_H);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, timeY);
    ctx.lineTo(chartW, timeY);
    ctx.stroke();

    const minSpacing = 80;
    const step = Math.max(1, Math.ceil(minSpacing / candleW));

    ctx.font      = `8px ${FONT}`;
    ctx.fillStyle  = C.text;
    ctx.textAlign  = 'center';

    for (let i = firstIdx; i <= lastIdx; i += step) {
      const x = i * candleW - offsetX + candleW * 0.5;
      if (x < 20 || x > chartW - 10) continue;
      ctx.fillText(fmtTime(candles[i].time), x, timeY + 14);
    }
  }

  // ─── Header ───────────────────────────────────────────────────────────────────

  function renderHeader(
    ctx: CanvasRenderingContext2D,
    W: number, sym: string, visible: SimCandle[],
  ) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, HDR_H);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, HDR_H);
    ctx.lineTo(W, HDR_H);
    ctx.stroke();

    // Symbol
    ctx.font      = `bold 11px ${FONT}`;
    ctx.fillStyle  = C.price;
    ctx.textAlign  = 'left';
    ctx.fillText(sym.toUpperCase(), 10, 19);

    // Timeframe badge
    ctx.font      = `8px ${FONT}`;
    ctx.fillStyle  = '#2a3a5a';
    ctx.fillText('5M  SIM', 92, 19);

    // Last candle stats
    if (visible.length > 0) {
      const last = visible[visible.length - 1];
      const stats = [
        { label: 'O', val: fmtPrice(last.open,  tickSize), color: C.text },
        { label: 'H', val: fmtPrice(last.high,  tickSize), color: C.ask },
        { label: 'L', val: fmtPrice(last.low,   tickSize), color: C.bid },
        { label: 'C', val: fmtPrice(last.close, tickSize), color: last.close >= last.open ? C.ask : C.bid },
        { label: 'VOL', val: fmtVol(last.totalVol), color: C.text },
        { label: 'Δ',  val: (last.delta >= 0 ? '+' : '') + fmtVol(last.delta), color: last.delta >= 0 ? C.deltaPos : C.deltaNeg },
      ];

      let ox = 175;
      for (const s of stats) {
        ctx.font      = `8px ${FONT}`;
        ctx.fillStyle  = C.textMuted;
        ctx.textAlign  = 'left';
        ctx.fillText(s.label, ox, 13);
        ctx.font      = `9px ${FONT}`;
        ctx.fillStyle  = s.color;
        ctx.fillText(s.val, ox, 24);
        ox += 68;
      }
    }
  }

  // ─── Crosshair ────────────────────────────────────────────────────────────────

  function renderCrosshair(
    ctx: CanvasRenderingContext2D,
    W: number, _H: number,
    chartW: number, chartY: number, chartH: number,
    priceMin: number, pRange: number,
    toY: (p: number) => number,
    tick: number,
    _timeY: number,
  ) {
    const pos = hoverRef.current;
    if (!pos || pos.x > chartW || pos.y < chartY || pos.y > chartY + chartH) return;

    ctx.strokeStyle = 'rgba(140,170,220,0.22)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(pos.x, chartY);
    ctx.lineTo(pos.x, chartY + chartH);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos.y);
    ctx.lineTo(chartW, pos.y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Price tag on scale
    const hPrice = priceMin + (1 - (pos.y - chartY) / chartH) * pRange;
    const tagH   = 18;
    const tagY   = pos.y - tagH / 2;
    ctx.fillStyle = '#1a2a4a';
    ctx.fillRect(chartW + 1, tagY, PRICE_W - 2, tagH);
    ctx.strokeStyle = 'rgba(100,140,220,0.4)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(chartW + 1, tagY, PRICE_W - 2, tagH);
    ctx.font      = `bold 9px ${FONT}`;
    ctx.fillStyle  = C.price;
    ctx.textAlign  = 'center';
    ctx.fillText(fmtPrice(hPrice, tick), chartW + PRICE_W / 2, tagY + 12);
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
    />
  );
}
