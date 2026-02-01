'use client';

import { useEffect, useRef, useState } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS } from '@/types/market';

interface OrderBookWidgetProps {
  rows?: number;
}

export default function OrderBookWidget({ rows = 8 }: OrderBookWidgetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { symbol } = useMarketStore();
  const symbolInfo = SYMBOLS[symbol];
  const isBybit = symbolInfo?.exchange === 'bybit';
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw orderbook on canvas
  useEffect(() => {
    if (!isBybit || !canvasRef.current || size.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    ctx.scale(dpr, dpr);

    const fmt = (n: number) => n >= 1000
      ? n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : n.toFixed(2);

    const fmtQty = (q: number) => q >= 1000 ? (q/1000).toFixed(1)+'K' : q.toFixed(3);

    const draw = () => {
      const { bids, asks, midPrice, spread, bidAskImbalance } = useOrderbookStore.getState();

      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, size.width, size.height);

      if (bids.size === 0) {
        ctx.fillStyle = '#71717a';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', size.width / 2, size.height / 2);
        return;
      }

      const bidArr = Array.from(bids.entries()).sort((a,b) => b[0]-a[0]).slice(0, rows);
      const askArr = Array.from(asks.entries()).sort((a,b) => a[0]-b[0]).slice(0, rows);
      const maxQty = Math.max(...bidArr.map(([,q])=>q), ...askArr.map(([,q])=>q), 1);

      const rowHeight = 16;
      const headerHeight = 20;
      const spreadHeight = 40;
      const padding = 4;

      ctx.font = '11px ui-monospace, monospace';

      // Header
      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText('Price', padding, 14);
      ctx.textAlign = 'right';
      ctx.fillText('Size', size.width - padding, 14);

      // Asks (reversed)
      const asksReversed = askArr.slice().reverse();
      asksReversed.forEach((([price, qty], i) => {
        const y = headerHeight + i * rowHeight;
        const barWidth = (qty / maxQty) * size.width;

        // Bar
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(size.width - barWidth, y, barWidth, rowHeight - 2);

        // Text
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'left';
        ctx.fillText(fmt(price), padding, y + 12);

        ctx.fillStyle = '#a1a1aa';
        ctx.textAlign = 'right';
        ctx.fillText(fmtQty(qty), size.width - padding, y + 12);
      }));

      // Spread section
      const spreadY = headerHeight + rows * rowHeight;
      ctx.fillStyle = '#27272a';
      ctx.fillRect(0, spreadY, size.width, spreadHeight);

      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText('Mid', padding, spreadY + 16);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(fmt(midPrice), size.width - padding, spreadY + 16);

      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText('Spread', padding, spreadY + 32);
      ctx.fillStyle = '#a1a1aa';
      ctx.textAlign = 'right';
      ctx.fillText(fmt(spread), size.width - padding, spreadY + 32);

      // Bids
      const bidsY = spreadY + spreadHeight;
      bidArr.forEach(([price, qty], i) => {
        const y = bidsY + i * rowHeight;
        const barWidth = (qty / maxQty) * size.width;

        // Bar
        ctx.fillStyle = 'rgba(52, 211, 153, 0.2)';
        ctx.fillRect(size.width - barWidth, y, barWidth, rowHeight - 2);

        // Text
        ctx.fillStyle = '#34d399';
        ctx.textAlign = 'left';
        ctx.fillText(fmt(price), padding, y + 12);

        ctx.fillStyle = '#a1a1aa';
        ctx.textAlign = 'right';
        ctx.fillText(fmtQty(qty), size.width - padding, y + 12);
      });

      // Imbalance
      const imbY = bidsY + rows * rowHeight + 8;
      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText('Imbalance', padding, imbY + 12);

      const imbColor = bidAskImbalance > 0.05 ? '#34d399' : bidAskImbalance < -0.05 ? '#f87171' : '#a1a1aa';
      ctx.fillStyle = imbColor;
      ctx.textAlign = 'right';
      ctx.fillText(`${bidAskImbalance > 0 ? '+' : ''}${(bidAskImbalance*100).toFixed(1)}%`, size.width - padding, imbY + 12);
    };

    // Initial fetch
    fetch(`/api/bybit/v5/market/orderbook?category=linear&symbol=${symbol}&limit=200`)
      .then(r => r.json())
      .then(d => {
        if (d.retCode === 0 && d.result) {
          useOrderbookStore.getState().setInitialOrderbook(d.result.b || [], d.result.a || [], d.result.u || 0);
          draw();
        }
      })
      .catch(() => {});

    bybitWS.connect('linear');
    const unsub = bybitWS.subscribeDepth(symbol, (u) => {
      if (u.eventType === 'snapshot') {
        useOrderbookStore.getState().setInitialOrderbook(u.bids, u.asks, u.finalUpdateId);
      } else {
        useOrderbookStore.getState().updateOrderbook(u.bids, u.asks, u.finalUpdateId);
      }
    }, 'linear', 50);

    const interval = setInterval(draw, 200);
    draw();

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [symbol, isBybit, rows, size]);

  if (!isBybit) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Order book only for Bybit symbols
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height }}
        className="block"
      />
    </div>
  );
}
