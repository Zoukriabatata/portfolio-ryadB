'use client';

/**
 * WebGL Heatmap — powered by HybridRenderer (regl + Canvas2D overlay)
 * Replaces the Canvas2D polling version with GPU-accelerated rendering.
 *
 * Data: REST polling via /api/heatmap proxy (geo-block bypass)
 * Rendering: HybridRenderer → WebGL cells + Canvas2D labels
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
// import type only — no static import of HybridRenderer so regl (browser-only CJS) never loads server-side
import type { HybridRenderer as HybridRendererType } from '@/lib/heatmap-webgl/HybridRenderer';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import type { PassiveOrderData, TradeData } from '@/lib/heatmap-webgl/types';

// ─── Types ───────────────────────────────────────────────────────────────────
interface DepthSnap {
  ts: number;
  bids: Float64Array; // [price0, qty0, price1, qty1, ...]
  asks: Float64Array;
  bestBid: number;
  bestAsk: number;
}

interface TradeEvent {
  ts: number;
  price: number;
  qty: number;
  isBuy: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_COLUMNS = 1200;       // 2 min at 100ms
const PRICE_AXIS_W = 65;
const TIME_AXIS_H = 22;
const TRADE_MAX = 500;
const COL_W_PX = 4;             // CSS pixels per column at zoom=1

const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC', tick: 1 },
  { value: 'ethusdt', label: 'ETH', tick: 0.1 },
  { value: 'solusdt', label: 'SOL', tick: 0.01 },
  { value: 'bnbusdt', label: 'BNB', tick: 0.1 },
  { value: 'xrpusdt', label: 'XRP', tick: 0.0001 },
  { value: 'dogeusdt', label: 'DOGE', tick: 0.00001 },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function WebGLHeatmapContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = usePageActive();
  const [symbol, setSymbol] = useState('btcusdt');
  const symbolCfg = SYMBOLS.find(s => s.value === symbol) || SYMBOLS[0];

  // Settings from store
  const colorScheme = useHeatmapSettingsStore(s => s.colorScheme);
  const contrast = useHeatmapSettingsStore(s => s.contrast);
  const upperCutoffPercent = useHeatmapSettingsStore(s => s.upperCutoffPercent);
  const tradeFlow = useHeatmapSettingsStore(s => s.tradeFlow);
  const staircaseLine = useHeatmapSettingsStore(s => s.displayFeatures?.staircaseLine);

  // High-freq data refs (no re-renders)
  const columnsRef = useRef<DepthSnap[]>([]);
  const tradesRef = useRef<TradeEvent[]>([]);
  const smoothMaxRef = useRef(1);
  const priceRangeRef = useRef({ center: 0 });
  const autoCenter = useRef(true);

  // Interaction refs
  const zoomRef = useRef(1);
  const panYRef = useRef(0);
  const draggingRef = useRef(false);
  const lastMouseY = useRef(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // DOM refs for live text (avoid React re-renders)
  const spreadSpanRef = useRef<HTMLSpanElement>(null);
  const webglBadgeRef = useRef<HTMLSpanElement>(null);

  // Renderer ref (typed via import type — no runtime import)
  const rendererRef = useRef<HybridRendererType | null>(null);

  const handleSymbolChange = useCallback((s: string) => {
    columnsRef.current = [];
    tradesRef.current = [];
    smoothMaxRef.current = 1;
    priceRangeRef.current = { center: 0 };
    autoCenter.current = true;
    zoomRef.current = 1;
    panYRef.current = 0;
    setSymbol(s);
  }, []);

  // ─── Main effect: init renderer + polling + RAF ──────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    let w = rect.width || 800;
    let h = rect.height || 600;
    let cancelled = false;

    // Resize observer — resizes renderer once it's ready
    const ro = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      w = r.width || w;
      h = r.height || h;
      rendererRef.current?.resize(w, h);
    });
    ro.observe(container);

    // Dynamic import of HybridRenderer (regl is browser-only CJS — must NOT load server-side)
    import('@/lib/heatmap-webgl/HybridRenderer').then(({ HybridRenderer }) => {
      if (cancelled) return;
      const renderer = new HybridRenderer({
        canvas,
        container,
        width: w,
        height: h,
        dpr: Math.min(2, window.devicePixelRatio || 1),
        priceAxisWidth: PRICE_AXIS_W,
        deltaProfileWidth: 0,
      });
      rendererRef.current = renderer;

      if (webglBadgeRef.current) {
        webglBadgeRef.current.textContent = renderer.isWebGL ? 'WebGL' : 'Canvas2D';
        webglBadgeRef.current.style.color = renderer.isWebGL ? '#22c55e' : '#f59e0b';
      }
      renderer.setTheme(colorScheme as 'magma' | 'deepocean' | 'senzoukria' | 'atas' | 'bookmap' | 'sierra' | 'highcontrast');
    }).catch(err => console.error('[WebGLHeatmap] renderer load failed:', err));

    // ── Data polling ──
    const sym = symbol.toUpperCase();
    let depthTimer = 0;
    let tradesTimer = 0;
    let lastTradeId = -1;

    const processDepth = (snap: { bids: [string, string][]; asks: [string, string][] }) => {
      const bids = new Float64Array(snap.bids.length * 2);
      const asks = new Float64Array(snap.asks.length * 2);
      let bestBid = 0, bestAsk = Infinity;
      for (let i = 0; i < snap.bids.length; i++) {
        bids[i * 2] = parseFloat(snap.bids[i][0]);
        bids[i * 2 + 1] = parseFloat(snap.bids[i][1]);
        if (bids[i * 2] > bestBid) bestBid = bids[i * 2];
      }
      for (let i = 0; i < snap.asks.length; i++) {
        asks[i * 2] = parseFloat(snap.asks[i][0]);
        asks[i * 2 + 1] = parseFloat(snap.asks[i][1]);
        if (asks[i * 2] < bestAsk) bestAsk = asks[i * 2];
      }
      columnsRef.current.push({ ts: Date.now(), bids, asks, bestBid, bestAsk });
      while (columnsRef.current.length > MAX_COLUMNS) columnsRef.current.shift();

      if (bestBid > 0 && bestAsk < Infinity && autoCenter.current) {
        priceRangeRef.current.center = (bestBid + bestAsk) / 2;
        if (spreadSpanRef.current) {
          const mid = priceRangeRef.current.center;
          const spread = bestAsk - bestBid;
          const dec = symbolCfg.tick < 0.01 ? 4 : symbolCfg.tick < 1 ? 2 : 0;
          spreadSpanRef.current.textContent = `Spread: ${spread.toFixed(dec)} (${(spread / mid * 100).toFixed(3)}%)`;
        }
      }
    };

    const pollDepth = async () => {
      try {
        const res = await fetch(`/api/heatmap/snapshot?symbol=${sym}&market=futures`, { cache: 'no-store' });
        if (res.ok) { const d = await res.json(); if (d.bids && d.asks) processDepth(d); }
      } catch { /* ignore */ }
    };

    const pollTrades = async () => {
      try {
        const res = await fetch(`/api/heatmap/trades?symbol=${sym}&market=futures`, { cache: 'no-store' });
        if (res.ok) {
          const data: Array<{ id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }> = await res.json();
          if (!Array.isArray(data)) return;
          for (const t of data) {
            if (t.id <= lastTradeId) continue;
            tradesRef.current.push({ ts: t.time, price: parseFloat(t.price), qty: parseFloat(t.qty), isBuy: !t.isBuyerMaker });
          }
          if (data.length > 0) lastTradeId = data[data.length - 1].id;
          while (tradesRef.current.length > TRADE_MAX) tradesRef.current.shift();
        }
      } catch { /* ignore */ }
    };

    pollDepth();
    pollTrades();
    depthTimer = window.setInterval(pollDepth, 200);
    tradesTimer = window.setInterval(pollTrades, 1000);

    // ── RAF render loop ──
    let rafId = 0;
    const tickSize = symbolCfg.tick;
    const heatmapW = () => w - PRICE_AXIS_W;
    const heatmapH = () => h - TIME_AXIS_H;

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      const renderer = rendererRef.current;
      if (!renderer) return; // wait for dynamic import to complete

      const cols = columnsRef.current;
      if (cols.length === 0 || w <= 0 || h <= 0) return;

      const hmW = heatmapW();
      const hmH = heatmapH();
      const colW = Math.max(1, COL_W_PX * zoomRef.current);
      const visCols = Math.floor(hmW / colW);
      const startIdx = Math.max(0, cols.length - visCols);

      // Price range
      const lastCol = cols[cols.length - 1];
      let depthMin = Infinity, depthMax = -Infinity;
      for (let i = 0; i < lastCol.bids.length; i += 2) {
        if (lastCol.bids[i] < depthMin) depthMin = lastCol.bids[i];
        if (lastCol.bids[i] > depthMax) depthMax = lastCol.bids[i];
      }
      for (let i = 0; i < lastCol.asks.length; i += 2) {
        if (lastCol.asks[i] < depthMin) depthMin = lastCol.asks[i];
        if (lastCol.asks[i] > depthMax) depthMax = lastCol.asks[i];
      }
      const baseSpread = depthMax - depthMin || 200 * tickSize;
      const visSpread = baseSpread / Math.max(0.8, zoomRef.current);
      const center = priceRangeRef.current.center;
      const pMin = center - visSpread / 2 + panYRef.current;
      const pMax = center + visSpread / 2 + panYRef.current;

      // Build smoothed max for intensity normalization
      let frameMax = 0;
      const step = Math.max(1, Math.floor(visCols / 150));
      for (let ci = startIdx; ci < cols.length; ci += step) {
        const c = cols[ci];
        for (let j = 1; j < c.bids.length; j += 2) if (c.bids[j] > frameMax) frameMax = c.bids[j];
        for (let j = 1; j < c.asks.length; j += 2) if (c.asks[j] > frameMax) frameMax = c.asks[j];
      }
      if (frameMax > 0) smoothMaxRef.current = smoothMaxRef.current * 0.93 + frameMax * 0.07;
      const maxD = smoothMaxRef.current || 1;
      const cutoff = (upperCutoffPercent ?? 95) / 100;

      // ── Build PassiveOrderData[] ──
      const passiveOrders: PassiveOrderData[] = [];
      for (let ci = startIdx; ci < cols.length; ci++) {
        const col = cols[ci];
        const xLeft = (ci - startIdx) * colW;
        for (let j = 0; j < col.bids.length; j += 2) {
          const price = col.bids[j], qty = col.bids[j + 1];
          if (price < pMin || price > pMax) continue;
          const rawIntensity = Math.pow(Math.min(qty / maxD, 1), 0.5);
          passiveOrders.push({ price, size: qty, side: 'bid', intensity: Math.min(rawIntensity / cutoff, 1), x: xLeft, cellWidth: colW });
        }
        for (let j = 0; j < col.asks.length; j += 2) {
          const price = col.asks[j], qty = col.asks[j + 1];
          if (price < pMin || price > pMax) continue;
          const rawIntensity = Math.pow(Math.min(qty / maxD, 1), 0.5);
          passiveOrders.push({ price, size: qty, side: 'ask', intensity: Math.min(rawIntensity / cutoff, 1), x: xLeft, cellWidth: colW });
        }
      }

      // ── Build TradeData[] ──
      const now = Date.now();
      const firstTs = cols[startIdx]?.ts ?? now;
      const lastTs = cols[cols.length - 1]?.ts ?? now;
      const timeSpan = lastTs - firstTs || 1;
      const tradeData: TradeData[] = [];
      for (const t of tradesRef.current) {
        if (t.ts < firstTs || t.ts > lastTs) continue;
        if (t.price < pMin || t.price > pMax) continue;
        const x = ((t.ts - firstTs) / timeSpan) * hmW;
        const age = Math.min(1, (now - t.ts) / 15000);
        tradeData.push({ price: t.price, size: t.qty, side: t.isBuy ? 'buy' : 'sell', x, buyRatio: 0.5, age });
      }

      // ── Best bid/ask staircase points ──
      const bestBidPoints: { x: number; price: number }[] = [];
      const bestAskPoints: { x: number; price: number }[] = [];
      for (let ci = startIdx; ci < cols.length; ci++) {
        const x = (ci - startIdx) * colW;
        bestBidPoints.push({ x, price: cols[ci].bestBid });
        bestAskPoints.push({ x, price: cols[ci].bestAsk });
      }

      // ── Grid lines ──
      const gridInterval = tickSize * 10;
      const gridPrices: number[] = [];
      const firstGrid = Math.ceil(pMin / gridInterval) * gridInterval;
      for (let p = firstGrid; p <= pMax; p += gridInterval) {
        gridPrices.push(parseFloat(p.toFixed(10)));
      }

      // ── Time labels ──
      const timeLabels: { time: Date; x: number }[] = [];
      const labelStep = Math.max(1, Math.floor(visCols / 8));
      for (let ci = startIdx; ci < cols.length; ci += labelStep) {
        timeLabels.push({ time: new Date(cols[ci].ts), x: (ci - startIdx) * colW });
      }

      // ── Current price label ──
      const currentPrice = (lastCol.bestBid + lastCol.bestAsk) / 2;

      renderer.render({
        priceMin: pMin,
        priceMax: pMax,
        tickSize,
        currentPrice,
        passiveOrders,
        trades: tradeData,
        bestBidPoints,
        bestAskPoints,
        gridHorizontalPrices: gridPrices,
        timeLabels,
        crosshair: mouseRef.current ? {
          x: mouseRef.current.x,
          y: mouseRef.current.y,
          price: pMax - (mouseRef.current.y / hmH) * (pMax - pMin),
          visible: true,
        } : undefined,
        tradeBubbleSettings: {
          showBorder: true,
          borderWidth: 0.04,
          borderColor: 'rgba(255,255,255,0.3)',
          glowEnabled: tradeFlow?.glowEnabled ?? true,
          glowIntensity: tradeFlow?.glowIntensity ?? 0.3,
          showGradient: true,
          rippleEnabled: tradeFlow?.rippleEnabled ?? false,
          largeTradeThreshold: tradeFlow?.largeTradeThreshold ?? 50,
          sizeScaling: (tradeFlow?.sizeScaling ?? 'sqrt') as 'sqrt' | 'linear' | 'log',
          popInAnimation: tradeFlow?.popInAnimation ?? true,
          bubbleOpacity: 0.65,
          maxSize: 32,
          minSize: 3,
        },
        staircaseSettings: {
          lineWidth: staircaseLine?.lineWidth ?? 2,
          showGlow: staircaseLine?.showGlow ?? true,
          glowIntensity: staircaseLine?.glowIntensity ?? 0.6,
          showSpreadFill: staircaseLine?.showSpreadFill ?? true,
          spreadFillOpacity: staircaseLine?.spreadFillOpacity ?? 0.12,
          showTrail: staircaseLine?.showTrail ?? false,
          trailLength: staircaseLine?.trailLength ?? 2,
          trailFadeSpeed: staircaseLine?.trailFadeSpeed ?? 1,
        },
        contrast: contrast ?? 1.4,
        upperCutoff: cutoff,
        opacity: 0.88,
      });
    };

    rafId = requestAnimationFrame(draw);

    // ── Wheel: zoom/pan ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomRef.current = Math.max(0.8, Math.min(20, zoomRef.current * factor));
      } else {
        const pSpan = (depthRange() / zoomRef.current) || 200;
        panYRef.current += (e.deltaY / heatmapH()) * pSpan * 40;
        autoCenter.current = false;
      }
    };
    const depthRange = () => {
      const c = columnsRef.current;
      if (c.length === 0) return 200;
      const last = c[c.length - 1];
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < last.bids.length; i += 2) { if (last.bids[i] < mn) mn = last.bids[i]; if (last.bids[i] > mx) mx = last.bids[i]; }
      for (let i = 0; i < last.asks.length; i += 2) { if (last.asks[i] < mn) mn = last.asks[i]; if (last.asks[i] > mx) mx = last.asks[i]; }
      return mx - mn || 200;
    };

    const onMouseDown = (e: MouseEvent) => { draggingRef.current = true; lastMouseY.current = e.clientY; };
    const onMouseUp = () => { draggingRef.current = false; };
    const onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (draggingRef.current) {
        const dy = e.clientY - lastMouseY.current;
        const pSpan = (depthRange() / zoomRef.current) || 200;
        panYRef.current -= (dy / heatmapH()) * pSpan;
        autoCenter.current = false;
        lastMouseY.current = e.clientY;
      }
    };
    const onMouseLeave = () => { mouseRef.current = null; draggingRef.current = false; };
    const onDblClick = () => { zoomRef.current = 1; panYRef.current = 0; autoCenter.current = true; };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearInterval(depthTimer);
      clearInterval(tradesTimer);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('dblclick', onDblClick);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, symbol]);

  // Apply theme changes without re-init
  useEffect(() => {
    rendererRef.current?.setTheme(colorScheme as 'magma' | 'deepocean' | 'senzoukria' | 'atas' | 'bookmap' | 'sierra' | 'highcontrast');
  }, [colorScheme]);

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full h-full bg-black select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 shrink-0 text-xs text-zinc-400">
        {/* Symbol selector */}
        <div className="flex gap-1">
          {SYMBOLS.map(s => (
            <button
              key={s.value}
              onClick={() => handleSymbolChange(s.value)}
              className={`px-2 py-0.5 rounded font-mono text-xs transition-colors ${
                symbol === s.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-zinc-700" />

        <span ref={spreadSpanRef} className="font-mono text-zinc-500" />

        <div className="ml-auto flex items-center gap-2">
          <span ref={webglBadgeRef} className="text-zinc-600 font-mono text-[10px]" />
          <button
            onClick={() => { zoomRef.current = 1; panYRef.current = 0; autoCenter.current = true; }}
            className="px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Reset view (double-click chart)"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden cursor-crosshair">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

