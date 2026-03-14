'use client';

import { useEffect, useRef, useCallback } from 'react';
import { binanceWS } from '@/lib/websocket/BinanceWS';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DOMLevel {
  price: number;
  qty: number;
  cum: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ASK_COLOR   = '#26a69a';
const BID_COLOR   = '#ef5350';
const BG          = '#0a0a0f';
const GRID        = '#1a1a24';
const TEXT_DIM    = '#4a4a5a';
const TEXT_MAIN   = '#d0d0e0';
const TEXT_PRICE  = '#ffffff';
const FONT        = '"Consolas", "Monaco", monospace';
const HEADER_H    = 32;
const SPREAD_H    = 22;
const LEVELS      = 20;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  symbol: string; // e.g. 'btcusdt'
  tickSize?: number;
  width?: number;
}

export default function DOMPanel({ symbol, tickSize = 0.1, width = 210 }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const bidsRef    = useRef<Map<number, number>>(new Map());
  const asksRef    = useRef<Map<number, number>>(new Map());
  const dirtyRef   = useRef(false);

  // ── Snapshot handler ─────────────────────────────────────────────────────
  const handleSnap = useCallback((snap: { bids: [string, string][]; asks: [string, string][] }) => {
    const newBids = new Map<number, number>();
    const newAsks = new Map<number, number>();
    snap.bids.forEach(([p, q]) => {
      const qty = parseFloat(q);
      if (qty > 0) newBids.set(parseFloat(p), qty);
    });
    snap.asks.forEach(([p, q]) => {
      const qty = parseFloat(q);
      if (qty > 0) newAsks.set(parseFloat(p), qty);
    });
    bidsRef.current = newBids;
    asksRef.current = newAsks;
    dirtyRef.current = true;
  }, []);

  // ── WebSocket subscription ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = binanceWS.subscribeDepth20(symbol, handleSnap, 'futures', '100ms');
    return () => { unsub(); };
  }, [symbol, handleSnap]);

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const h = canvas.clientHeight;
      const w = canvas.clientWidth;

      // Resize if needed
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, w, h);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Render function ───────────────────────────────────────────────────────
  const render = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const bids = bidsRef.current;
    const asks = asksRef.current;

    // Sort: bids descending (best bid first), asks ascending (best ask first)
    const bidLevels = Array.from(bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, LEVELS)
      .map(([price, qty]) => ({ price, qty, cum: 0 }));

    const askLevels = Array.from(asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, LEVELS)
      .map(([price, qty]) => ({ price, qty, cum: 0 }));

    // Compute cumulative volumes
    let cumBid = 0;
    bidLevels.forEach(l => { cumBid += l.qty; l.cum = cumBid; });
    let cumAsk = 0;
    askLevels.forEach(l => { cumAsk += l.qty; l.cum = cumAsk; });

    // Max for bar normalization (use combined max for fair visual comparison)
    const maxBidQty = Math.max(...bidLevels.map(l => l.qty), 1);
    const maxAskQty = Math.max(...askLevels.map(l => l.qty), 1);
    const maxCum    = Math.max(cumBid, cumAsk, 1);

    // Best bid / ask
    const bestBid = bidLevels[0]?.price ?? 0;
    const bestAsk = askLevels[0]?.price ?? 0;
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
    const spread   = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;

    // Layout
    const bodyH    = h - HEADER_H;
    const halfBody = (bodyH - SPREAD_H) / 2;
    const rowH     = Math.max(10, halfBody / LEVELS);
    const askBodyH = rowH * LEVELS;
    const bidBodyH = rowH * LEVELS;

    // Ask section Y: from header down
    const askStartY = HEADER_H + Math.max(0, halfBody - askBodyH);
    // Bid section Y: after spread
    const bidStartY = HEADER_H + halfBody + SPREAD_H;

    // ── Header ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, 0, w, HEADER_H);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H);
    ctx.lineTo(w, HEADER_H);
    ctx.stroke();

    // Symbol label
    ctx.font = `bold 9px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText(symbol.toUpperCase(), 8, 13);

    // Mid price
    if (midPrice > 0) {
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillStyle = TEXT_PRICE;
      ctx.textAlign = 'center';
      ctx.fillText(formatPrice(midPrice, tickSize), w / 2, HEADER_H - 7);
    }

    // DOM label
    ctx.font = `8px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'right';
    ctx.fillText('DOM', w - 6, 13);

    // ── Column headers ───────────────────────────────────────────────────────
    const colPrice = w - 6;
    const colQty   = w - 60;
    const colCum   = 6;

    // ── Ask levels (top section — highest ask at top, best ask at bottom) ────
    // Render asks in reverse: askLevels[LEVELS-1] at top, askLevels[0] (best) at bottom
    for (let i = 0; i < askLevels.length; i++) {
      const level = askLevels[askLevels.length - 1 - i]; // reversed
      const rowY  = askStartY + i * rowH;
      renderRow(ctx, level, rowY, rowH, w, maxAskQty, maxCum, ASK_COLOR,
        i === askLevels.length - 1, // best ask = last row
        colPrice, colQty, colCum, tickSize);
    }

    // ── Spread row ───────────────────────────────────────────────────────────
    const spreadY = HEADER_H + halfBody;
    ctx.fillStyle = '#111120';
    ctx.fillRect(0, spreadY, w, SPREAD_H);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, spreadY);
    ctx.lineTo(w, spreadY);
    ctx.moveTo(0, spreadY + SPREAD_H);
    ctx.lineTo(w, spreadY + SPREAD_H);
    ctx.stroke();

    if (spread > 0) {
      ctx.font = `9px ${FONT}`;
      ctx.fillStyle = '#6e7191';
      ctx.textAlign = 'center';
      const spreadStr = spread < 1 ? spread.toFixed(tickSize < 1 ? 1 : 0) : spread.toFixed(0);
      ctx.fillText(`spread ${spreadStr}`, w / 2, spreadY + 14);
    }

    // ── Bid levels (bottom section — best bid at top) ────────────────────────
    for (let i = 0; i < bidLevels.length; i++) {
      const level = bidLevels[i];
      const rowY  = bidStartY + i * rowH;
      renderRow(ctx, level, rowY, rowH, w, maxBidQty, maxCum, BID_COLOR,
        i === 0, // best bid = first row
        colPrice, colQty, colCum, tickSize);
    }

    // ── Imbalance bar at very bottom ─────────────────────────────────────────
    const ibY  = h - 14;
    const ib   = (cumBid - cumAsk) / (cumBid + cumAsk || 1);
    const ibW  = w - 16;
    ctx.fillStyle = '#111120';
    ctx.fillRect(8, ibY, ibW, 8);
    const midX = 8 + ibW / 2;
    if (ib > 0) {
      ctx.fillStyle = BID_COLOR;
      ctx.fillRect(midX, ibY, (ibW / 2) * ib, 8);
    } else {
      ctx.fillStyle = ASK_COLOR;
      ctx.fillRect(midX + (ibW / 2) * ib, ibY, -(ibW / 2) * ib, 8);
    }
    ctx.font = `7px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText('B/A', 8, ibY - 2);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderRow(
  ctx: CanvasRenderingContext2D,
  level: DOMLevel,
  rowY: number,
  rowH: number,
  w: number,
  maxQty: number,
  maxCum: number,
  color: string,
  isBest: boolean,
  colPrice: number,
  colQty: number,
  colCum: number,
  tickSize: number,
) {
  const barW = Math.max(1, (level.qty / maxQty) * (w - 4));
  const cumW = Math.max(1, (level.cum / maxCum) * (w - 4));

  // Cumulative fill (very faint, full width)
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.04;
  ctx.fillRect(2, rowY, cumW, rowH);
  ctx.globalAlpha = 1;

  // Volume bar fill
  ctx.fillStyle = color;
  ctx.globalAlpha = isBest ? 0.22 : 0.10;
  ctx.fillRect(2, rowY, barW, rowH);
  ctx.globalAlpha = 1;

  // Best bid/ask highlight background
  if (isBest) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.06;
    ctx.fillRect(0, rowY, w, rowH);
    ctx.globalAlpha = 1;
  }

  // Row separator
  ctx.strokeStyle = '#14141e';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, rowY + rowH);
  ctx.lineTo(w, rowY + rowH);
  ctx.stroke();

  const textY = rowY + rowH / 2 + 4;
  const fontSize = rowH >= 14 ? 9 : 8;

  // Price
  ctx.font = `${isBest ? 'bold ' : ''}${fontSize}px ${FONT}`;
  ctx.fillStyle = isBest ? color : TEXT_MAIN;
  ctx.textAlign = 'right';
  ctx.fillText(formatPrice(level.price, tickSize), colPrice, textY);

  // Qty
  ctx.font = `${fontSize}px ${FONT}`;
  ctx.fillStyle = isBest ? '#fff' : TEXT_MAIN;
  ctx.textAlign = 'right';
  ctx.fillText(formatQty(level.qty), colQty, textY);

  // Cumulative
  ctx.fillStyle = TEXT_DIM;
  ctx.textAlign = 'left';
  ctx.fillText(formatQty(level.cum), colCum, textY);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatPrice(price: number, tickSize: number): string {
  const decimals = tickSize < 0.01 ? 4 : tickSize < 1 ? 2 : tickSize < 10 ? 1 : 0;
  return price.toFixed(decimals);
}

function formatQty(qty: number): string {
  if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
  if (qty >= 100)  return qty.toFixed(0);
  if (qty >= 10)   return qty.toFixed(1);
  return qty.toFixed(2);
}
