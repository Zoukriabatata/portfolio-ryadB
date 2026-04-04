'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';

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
const MAX_COLUMNS = 2400;        // 4 min at 100ms
const PRICE_AXIS_W = 70;         // right side price labels
const CVD_H = 60;                // cumulative volume delta section height
const TIME_AXIS_H = 22;          // bottom time labels
const BOTTOM_H = CVD_H + TIME_AXIS_H; // total bottom reserved area
const TRADE_BUBBLE_MAX = 500;    // max trades in buffer

// Bookmap color LUT: 256 entries for bid and ask
// Bid:  navy → blue → cyan → yellow → orange (walls)
// Ask:  navy → purple → magenta → yellow → orange (walls)
function buildLUT(stops: [number, number, number, number][]): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // find segment
    let si = 0;
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { si = s; break; }
    }
    const s0 = stops[si], s1 = stops[si + 1] || s0;
    const seg = s1[0] - s0[0] || 1;
    const lt = (t - s0[0]) / seg;
    lut[i * 4] = Math.round(s0[1] + (s1[1] - s0[1]) * lt);
    lut[i * 4 + 1] = Math.round(s0[2] + (s1[2] - s0[2]) * lt);
    lut[i * 4 + 2] = Math.round(s0[3] + (s1[3] - s0[3]) * lt);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// [stop, R, G, B]
const BID_STOPS: [number, number, number, number][] = [
  [0, 8, 18, 42], [0.15, 12, 50, 110], [0.3, 25, 95, 160],
  [0.45, 40, 160, 210], [0.6, 70, 210, 240], [0.75, 190, 225, 110],
  [0.85, 245, 210, 50], [0.95, 255, 150, 30], [1, 255, 90, 20],
];
const ASK_STOPS: [number, number, number, number][] = [
  [0, 8, 18, 42], [0.15, 40, 22, 75], [0.3, 90, 35, 110],
  [0.45, 150, 45, 100], [0.6, 210, 65, 85], [0.75, 225, 160, 65],
  [0.85, 245, 210, 50], [0.95, 255, 150, 30], [1, 255, 90, 20],
];

const BID_LUT = buildLUT(BID_STOPS);
const ASK_LUT = buildLUT(ASK_STOPS);

// Background navy
const BG_R = 8, BG_G = 14, BG_B = 32;

// ─── Symbols ─────────────────────────────────────────────────────────────────
const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC', tick: 1 },
  { value: 'ethusdt', label: 'ETH', tick: 0.1 },
  { value: 'solusdt', label: 'SOL', tick: 0.01 },
  { value: 'bnbusdt', label: 'BNB', tick: 0.1 },
  { value: 'xrpusdt', label: 'XRP', tick: 0.0001 },
  { value: 'dogeusdt', label: 'DOGE', tick: 0.00001 },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function HeatmapPageContent() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = usePageActive();
  const [symbol, setSymbol] = useState('btcusdt');
  const symbolCfg = SYMBOLS.find(s => s.value === symbol) || SYMBOLS[0];

  // Data refs (no re-renders)
  const columnsRef = useRef<DepthSnap[]>([]);
  const tradesRef = useRef<TradeEvent[]>([]);
  const smoothMaxRef = useRef(1);
  const priceRangeRef = useRef({ min: 0, max: 0, center: 0 });
  const autoCenter = useRef(true);

  // CVD (cumulative volume delta) refs — one entry per depth column
  const cvdColumnsRef = useRef<{ buyVol: number; sellVol: number }[]>([]);
  const currentCvdRef = useRef({ buyVol: 0, sellVol: 0 });
  const cvdSmoothMaxRef = useRef(1);

  // Mouse/crosshair ref
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Spread DOM ref (direct DOM update avoids React re-render every 100ms)
  const spreadSpanRef = useRef<HTMLSpanElement>(null);

  // Pan/zoom refs
  const zoomRef = useRef(1);
  const panYRef = useRef(0);
  const draggingRef = useRef(false);
  const lastMouseY = useRef(0);

  const handleSymbolChange = useCallback((s: string) => {
    columnsRef.current = [];
    tradesRef.current = [];
    cvdColumnsRef.current = [];
    currentCvdRef.current = { buyVol: 0, sellVol: 0 };
    cvdSmoothMaxRef.current = 1;
    smoothMaxRef.current = 1;
    priceRangeRef.current = { min: 0, max: 0, center: 0 };
    autoCenter.current = true;
    setSymbol(s);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false })!;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    let rafId = 0;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ── REST polling (server-side proxy bypasses geo-blocks) ──
    const columns = columnsRef.current;
    const trades = tradesRef.current;
    const sym = symbol.toUpperCase();
    let depthTimer = 0;
    let tradesTimer = 0;
    let lastTradeId = -1;

    const processDepthSnap = (snap: { bids: [string, string][]; asks: [string, string][] }) => {
      const bids = new Float64Array(snap.bids.length * 2);
      const asks = new Float64Array(snap.asks.length * 2);
      let bestBid = 0, bestAsk = Infinity;

      for (let i = 0; i < snap.bids.length; i++) {
        const p = parseFloat(snap.bids[i][0]);
        const q = parseFloat(snap.bids[i][1]);
        bids[i * 2] = p; bids[i * 2 + 1] = q;
        if (p > bestBid) bestBid = p;
      }
      for (let i = 0; i < snap.asks.length; i++) {
        const p = parseFloat(snap.asks[i][0]);
        const q = parseFloat(snap.asks[i][1]);
        asks[i * 2] = p; asks[i * 2 + 1] = q;
        if (p < bestAsk) bestAsk = p;
      }

      columns.push({ ts: Date.now(), bids, asks, bestBid, bestAsk });
      while (columns.length > MAX_COLUMNS) columns.shift();

      cvdColumnsRef.current.push({ ...currentCvdRef.current });
      currentCvdRef.current = { buyVol: 0, sellVol: 0 };
      while (cvdColumnsRef.current.length > MAX_COLUMNS) cvdColumnsRef.current.shift();

      if (bestBid > 0 && bestAsk < Infinity) {
        const mid = (bestBid + bestAsk) / 2;
        if (autoCenter.current) priceRangeRef.current.center = mid;
        if (spreadSpanRef.current) {
          const spreadPct = ((bestAsk - bestBid) / mid * 100).toFixed(3);
          spreadSpanRef.current.textContent = `Spread: ${(bestAsk - bestBid).toFixed(symbolCfg.tick < 0.01 ? 4 : symbolCfg.tick < 1 ? 2 : 1)} (${spreadPct}%)`;
        }
      }
    };

    const pollDepth = async () => {
      try {
        const res = await fetch(`/api/heatmap/snapshot?symbol=${sym}&market=futures`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.bids && data.asks) processDepthSnap(data);
        }
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
            const isBuy = !t.isBuyerMaker;
            const qty = parseFloat(t.qty);
            trades.push({ ts: t.time, price: parseFloat(t.price), qty, isBuy });
            if (isBuy) currentCvdRef.current.buyVol += qty;
            else currentCvdRef.current.sellVol += qty;
          }
          if (data.length > 0) lastTradeId = data[data.length - 1].id;
          while (trades.length > TRADE_BUBBLE_MAX) trades.shift();
        }
      } catch { /* ignore */ }
    };

    // Initial fetch immediately, then poll
    pollDepth();
    pollTrades();
    depthTimer = window.setInterval(pollDepth, 200);
    tradesTimer = window.setInterval(pollTrades, 1000);

    // ── Render loop ──
    const tickSize = symbolCfg.tick;

    const draw = () => {
      if (!w || !h) { rafId = requestAnimationFrame(draw); return; }

      const hmW = Math.floor(w - PRICE_AXIS_W);
      const hmH = Math.floor(h - BOTTOM_H);
      if (hmW <= 0 || hmH <= 0) { rafId = requestAnimationFrame(draw); return; }

      // Clear
      ctx.fillStyle = `rgb(${BG_R},${BG_G},${BG_B})`;
      ctx.fillRect(0, 0, w, h);

      const cols = columns;
      if (cols.length === 0) {
        // Show "Connecting..." message
        ctx.fillStyle = '#4a5568';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Connecting to ' + symbol.toUpperCase() + '...', w / 2, h / 2);
        rafId = requestAnimationFrame(draw);
        return;
      }

      // Price range from zoom + pan
      const center = priceRangeRef.current.center;
      const lastCol = cols[cols.length - 1];
      // Determine price spread from depth data
      let depthMin = Infinity, depthMax = -Infinity;
      for (let i = 0; i < lastCol.bids.length; i += 2) {
        if (lastCol.bids[i] < depthMin) depthMin = lastCol.bids[i];
        if (lastCol.bids[i] > depthMax) depthMax = lastCol.bids[i];
      }
      for (let i = 0; i < lastCol.asks.length; i += 2) {
        if (lastCol.asks[i] < depthMin) depthMin = lastCol.asks[i];
        if (lastCol.asks[i] > depthMax) depthMax = lastCol.asks[i];
      }

      const baseSpread = (depthMax - depthMin) || 100;
      const visibleSpread = baseSpread / zoomRef.current;
      const pMin = center - visibleSpread / 2 + panYRef.current;
      const pMax = center + visibleSpread / 2 + panYRef.current;
      const pSpan = pMax - pMin;

      // Column layout
      const visCols = Math.min(cols.length, hmW);
      const startIdx = Math.max(0, cols.length - visCols);
      const colW = hmW / visCols;

      // Max depth (smoothed)
      let frameMax = 0;
      const step = Math.max(1, Math.floor(visCols / 150));
      for (let ci = startIdx; ci < cols.length; ci += step) {
        const c = cols[ci];
        for (let j = 1; j < c.bids.length; j += 2) if (c.bids[j] > frameMax) frameMax = c.bids[j];
        for (let j = 1; j < c.asks.length; j += 2) if (c.asks[j] > frameMax) frameMax = c.asks[j];
      }
      if (frameMax > 0) smoothMaxRef.current = smoothMaxRef.current * 0.93 + frameMax * 0.07;
      const maxD = smoothMaxRef.current || 1;

      // ── Heatmap bitmap ──
      const imgData = ctx.createImageData(hmW, hmH);
      const px = imgData.data;

      // Fill background
      for (let p = 0; p < px.length; p += 4) {
        px[p] = BG_R; px[p + 1] = BG_G; px[p + 2] = BG_B; px[p + 3] = 255;
      }

      const pxPerTick = (tickSize / pSpan) * hmH;
      const cellH = Math.max(2, Math.ceil(pxPerTick));

      for (let ci = startIdx; ci < cols.length; ci++) {
        const col = cols[ci];
        const xS = Math.floor((ci - startIdx) * colW);
        const xE = Math.min(hmW, Math.ceil(xS + colW));
        if (xE <= xS) continue;

        // Bids
        for (let j = 0; j < col.bids.length; j += 2) {
          const price = col.bids[j], qty = col.bids[j + 1];
          const yMid = Math.floor(((pMax - price) / pSpan) * hmH);
          const yT = Math.max(0, yMid - (cellH >> 1));
          const yB = Math.min(hmH, yT + cellH);
          if (yB <= 0 || yT >= hmH) continue;
          const gamma = Math.pow(Math.min(qty / maxD, 1), 0.5);
          const li = Math.min(255, Math.floor(gamma * 255)) * 4;
          const cr = BID_LUT[li], cg = BID_LUT[li + 1], cb = BID_LUT[li + 2];
          for (let y = yT; y < yB; y++) {
            const row = y * hmW;
            for (let x = xS; x < xE; x++) {
              const off = (row + x) * 4;
              px[off] = cr; px[off + 1] = cg; px[off + 2] = cb;
            }
          }
        }

        // Asks
        for (let j = 0; j < col.asks.length; j += 2) {
          const price = col.asks[j], qty = col.asks[j + 1];
          const yMid = Math.floor(((pMax - price) / pSpan) * hmH);
          const yT = Math.max(0, yMid - (cellH >> 1));
          const yB = Math.min(hmH, yT + cellH);
          if (yB <= 0 || yT >= hmH) continue;
          const gamma = Math.pow(Math.min(qty / maxD, 1), 0.5);
          const li = Math.min(255, Math.floor(gamma * 255)) * 4;
          const cr = ASK_LUT[li], cg = ASK_LUT[li + 1], cb = ASK_LUT[li + 2];
          for (let y = yT; y < yB; y++) {
            const row = y * hmW;
            for (let x = xS; x < xE; x++) {
              const off = (row + x) * 4;
              px[off] = cr; px[off + 1] = cg; px[off + 2] = cb;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      // ── Staircase line (best bid/ask) ──
      if (cols.length > 1) {
        // Best Bid — cyan
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let ci = startIdx; ci < cols.length; ci++) {
          const x = (ci - startIdx) * colW;
          const y = ((pMax - cols[ci].bestBid) / pSpan) * hmH;
          if (ci === startIdx) ctx.moveTo(x, y);
          else {
            const prevY = ((pMax - cols[ci - 1].bestBid) / pSpan) * hmH;
            ctx.lineTo(x, prevY); // horizontal
            ctx.lineTo(x, y);     // vertical (staircase)
          }
        }
        ctx.stroke();

        // Best Ask — magenta
        ctx.strokeStyle = '#ff4488';
        ctx.beginPath();
        for (let ci = startIdx; ci < cols.length; ci++) {
          const x = (ci - startIdx) * colW;
          const y = ((pMax - cols[ci].bestAsk) / pSpan) * hmH;
          if (ci === startIdx) ctx.moveTo(x, y);
          else {
            const prevY = ((pMax - cols[ci - 1].bestAsk) / pSpan) * hmH;
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // ── Trade bubbles ──
      const now = Date.now();
      const firstTs = cols.length > 0 ? cols[startIdx].ts : now;
      const lastTs = cols.length > 0 ? cols[cols.length - 1].ts : now;
      const timeSpan = lastTs - firstTs || 1;

      for (const t of trades) {
        if (t.ts < firstTs || t.ts > lastTs) continue;
        const x = ((t.ts - firstTs) / timeSpan) * hmW;
        const y = ((pMax - t.price) / pSpan) * hmH;
        if (y < 0 || y > hmH || x < 0 || x > hmW) continue;

        const age = (now - t.ts) / 10000; // fade over 10s
        const alpha = Math.max(0.1, 1 - age);
        const radius = Math.min(12, 2 + Math.sqrt(t.qty) * 1.5);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.isBuy ? '#00ff88' : '#ff3366';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Glow on large trades
        if (radius > 5) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // ── Current price line ──
      if (cols.length > 0) {
        const last = cols[cols.length - 1];
        const mid = (last.bestBid + last.bestAsk) / 2;
        const midY = ((pMax - mid) / pSpan) * hmH;

        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffffff50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(hmW, midY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        ctx.fillStyle = '#1a73e8';
        const labelW = 68;
        ctx.fillRect(hmW, midY - 10, labelW, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(mid.toFixed(tickSize < 0.01 ? 4 : tickSize < 1 ? 2 : 0), hmW + labelW / 2, midY + 4);
      }

      // ── Price axis (right) ──
      ctx.fillStyle = `rgb(${BG_R + 4},${BG_G + 4},${BG_B + 6})`;
      ctx.fillRect(hmW, 0, PRICE_AXIS_W, h);

      ctx.fillStyle = '#6b7280';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const pxPerPrice = hmH / pSpan;
      const niceStep = getNiceStep(pSpan, hmH / 40);
      const firstPrice = Math.ceil(pMin / niceStep) * niceStep;
      for (let p = firstPrice; p <= pMax; p += niceStep) {
        const y = ((pMax - p) / pSpan) * hmH;
        if (y < 10 || y > hmH - 10) continue;
        ctx.fillText(p.toFixed(tickSize < 0.01 ? 4 : tickSize < 1 ? 2 : 0), hmW + PRICE_AXIS_W / 2, y + 3);
        // Grid line
        ctx.strokeStyle = '#ffffff08';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(hmW, y);
        ctx.stroke();
      }

      // ── CVD (Cumulative Volume Delta) bars ──
      const cvdCols = cvdColumnsRef.current;
      const cvdY = hmH; // CVD section starts right below heatmap

      ctx.fillStyle = `rgb(${BG_R + 2},${BG_G + 2},${BG_B + 4})`;
      ctx.fillRect(0, cvdY, hmW, CVD_H);

      if (cvdCols.length > 1) {
        // Find max |delta| for scaling (smoothed)
        let frameMax = 0;
        const cvdStep = Math.max(1, Math.floor(visCols / 200));
        for (let ci = Math.max(0, cvdCols.length - visCols); ci < cvdCols.length; ci += cvdStep) {
          const c = cvdCols[ci];
          if (c) {
            const net = Math.abs(c.buyVol - c.sellVol);
            if (net > frameMax) frameMax = net;
          }
        }
        if (frameMax > 0) {
          cvdSmoothMaxRef.current = cvdSmoothMaxRef.current * 0.95 + frameMax * 0.05;
        }
        const cvdMax = cvdSmoothMaxRef.current || 1;
        const cvdMidY = cvdY + CVD_H / 2;
        const cvdMaxBarH = CVD_H / 2 - 3;

        const cvdStartIdx = Math.max(0, cvdCols.length - visCols);
        for (let ci = cvdStartIdx; ci < cvdCols.length; ci++) {
          const cvd = cvdCols[ci];
          if (!cvd) continue;
          const delta = cvd.buyVol - cvd.sellVol;
          if (Math.abs(delta) < 0.0001) continue;
          const barH = Math.max(1, Math.min(cvdMaxBarH, Math.abs(delta / cvdMax) * cvdMaxBarH));
          const xS = Math.floor((ci - cvdStartIdx) * colW);
          const xE = Math.max(xS + 1, Math.ceil(xS + colW - 0.5));
          if (delta > 0) {
            ctx.fillStyle = 'rgba(0,230,120,0.75)';
            ctx.fillRect(xS, cvdMidY - barH, xE - xS, barH);
          } else {
            ctx.fillStyle = 'rgba(255,60,100,0.75)';
            ctx.fillRect(xS, cvdMidY, xE - xS, barH);
          }
        }

        // Zero line
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, cvdMidY);
        ctx.lineTo(hmW, cvdMidY);
        ctx.stroke();
      }

      // CVD label + separator
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cvdY); ctx.lineTo(hmW, cvdY); ctx.stroke();
      ctx.fillStyle = '#374151';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('CVD', 4, cvdY + 10);

      // ── Time axis (bottom) ──
      const timeAxisY = hmH + CVD_H;
      ctx.fillStyle = `rgb(${BG_R + 4},${BG_G + 4},${BG_B + 6})`;
      ctx.fillRect(0, timeAxisY, w, TIME_AXIS_H);

      if (cols.length > 1) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        const timeStep = Math.max(1, Math.floor(visCols / 8));
        for (let ci = startIdx; ci < cols.length; ci += timeStep) {
          const x = (ci - startIdx) * colW;
          const d = new Date(cols[ci].ts);
          const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
          ctx.fillText(label, x, timeAxisY + 15);
        }
      }

      // ── Crosshair ──
      const mouse = mouseRef.current;
      if (mouse && mouse.x >= 0 && mouse.x < hmW && mouse.y >= 0 && mouse.y < hmH) {
        const mousePrice = pMax - (mouse.y / hmH) * pSpan;
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.5;
        // Horizontal
        ctx.beginPath(); ctx.moveTo(0, mouse.y); ctx.lineTo(hmW, mouse.y); ctx.stroke();
        // Vertical
        ctx.beginPath(); ctx.moveTo(mouse.x, 0); ctx.lineTo(mouse.x, hmH); ctx.stroke();
        ctx.setLineDash([]);
        // Price label on axis
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(hmW, mouse.y - 9, PRICE_AXIS_W, 18);
        ctx.fillStyle = '#e0e4ec';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          mousePrice.toFixed(tickSize < 0.01 ? 4 : tickSize < 1 ? 2 : 0),
          hmW + PRICE_AXIS_W / 2,
          mouse.y + 3
        );
        // Time label
        if (cols.length > 1) {
          const tFrac = mouse.x / hmW;
          const tIdx = Math.min(cols.length - 1, Math.floor(startIdx + tFrac * visCols));
          const d = new Date(cols[tIdx]?.ts ?? 0);
          const tLabel = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          const tlW = 54;
          ctx.fillRect(mouse.x - tlW / 2, timeAxisY, tlW, 14);
          ctx.fillStyle = '#e0e4ec';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(tLabel, mouse.x, timeAxisY + 11);
        }
      }

      // ── Info overlay (top-left) ──
      if (cols.length > 0) {
        const last = cols[cols.length - 1];
        ctx.fillStyle = '#00000080';
        ctx.fillRect(4, 4, 200, 20);
        ctx.fillStyle = '#e0e4ec';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left';
        const mid = (last.bestBid + last.bestAsk) / 2;
        ctx.fillText(
          `${symbol.toUpperCase()}  $${mid.toFixed(tickSize < 1 ? 2 : 0)}`,
          8, 18
        );
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    // ── Mouse/touch interaction ──
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomRef.current = Math.max(0.8, Math.min(20, zoomRef.current * factor));
      } else {
        // Pan
        const hmHlocal = h - BOTTOM_H;
        const pSpan = (priceRangeRef.current.center ? 1 : 100) / zoomRef.current;
        panYRef.current += (e.deltaY / hmHlocal) * pSpan * 50;
        autoCenter.current = false;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      draggingRef.current = true;
      lastMouseY.current = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      // Update crosshair position
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (!draggingRef.current) return;
      const dy = e.clientY - lastMouseY.current;
      lastMouseY.current = e.clientY;
      const hmHlocal = h - BOTTOM_H;
      const c = columnsRef.current;
      const lastCol = c[c.length - 1];
      if (!lastCol) return;
      let depthMin = Infinity, depthMax = -Infinity;
      for (let i = 0; i < lastCol.bids.length; i += 2) {
        if (lastCol.bids[i] < depthMin) depthMin = lastCol.bids[i];
        if (lastCol.bids[i] > depthMax) depthMax = lastCol.bids[i];
      }
      for (let i = 0; i < lastCol.asks.length; i += 2) {
        if (lastCol.asks[i] < depthMin) depthMin = lastCol.asks[i];
        if (lastCol.asks[i] > depthMax) depthMax = lastCol.asks[i];
      }
      const baseSpread = (depthMax - depthMin) || 100;
      const pSpan = baseSpread / zoomRef.current;
      panYRef.current += (dy / hmHlocal) * pSpan;
      autoCenter.current = false;
    };
    const onMouseLeave = () => { mouseRef.current = null; };
    const onMouseUp = () => { draggingRef.current = false; };

    const onDblClick = () => {
      autoCenter.current = true;
      panYRef.current = 0;
      zoomRef.current = 1;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDblClick);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(depthTimer);
      clearInterval(tradesTimer);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, [symbol, symbolCfg.tick, isActive]);

  return (
    <div className="h-full flex flex-col" style={{ background: `rgb(${BG_R},${BG_G},${BG_B})` }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
      >
        {/* Symbol selector */}
        <div className="flex gap-0.5">
          {SYMBOLS.map(s => (
            <button
              key={s.value}
              onClick={() => handleSymbolChange(s.value)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: symbol === s.value ? '#1a73e8' : 'transparent',
                color: symbol === s.value ? '#fff' : '#8890b0',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Live spread */}
        <span
          ref={spreadSpanRef}
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{ color: '#6ee7b7', background: 'rgba(110,231,183,0.06)', border: '1px solid rgba(110,231,183,0.12)' }}
        />

        {/* Auto-center button */}
        <button
          onClick={() => { autoCenter.current = true; panYRef.current = 0; zoomRef.current = 1; }}
          className="px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
          style={{ color: '#8890b0', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Auto Center
        </button>

        {/* Info */}
        <span className="text-[10px] font-mono hidden md:inline" style={{ color: '#374151' }}>
          Ctrl+scroll: zoom · Drag: pan · Dbl-click: reset
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative cursor-crosshair">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getNiceStep(range: number, targetLines: number): number {
  const rough = range / targetLines;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  if (norm < 1.5) return pow;
  if (norm < 3) return 2 * pow;
  if (norm < 7) return 5 * pow;
  return 10 * pow;
}
