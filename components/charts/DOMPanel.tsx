'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';

interface DOMPanelProps {
  height?: number;
  width?: number;
  levels?: number;
  showTrades?: boolean;
}

interface RecentTrade {
  price: number;
  size: number;
  side: 'buy' | 'sell';
  time: number;
}

const COLORS = {
  background: '#0a0a0f',
  backgroundAlt: '#0f0f14',
  border: '#1f2937',
  text: '#9ca3af',
  textBright: '#f3f4f6',

  // Bid/Ask
  bidBar: 'rgba(34, 197, 94, 0.4)',
  bidBarStrong: 'rgba(34, 197, 94, 0.7)',
  bidText: '#22c55e',
  askBar: 'rgba(239, 68, 68, 0.4)',
  askBarStrong: 'rgba(239, 68, 68, 0.7)',
  askText: '#ef4444',

  // Current price
  currentPrice: '#f59e0b',
  currentPriceBg: 'rgba(245, 158, 11, 0.2)',

  // Whale orders
  whale: '#a855f7',
  whaleBg: 'rgba(168, 85, 247, 0.2)',

  // Trades
  buyTrade: '#22c55e',
  sellTrade: '#ef4444',
};

const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 40;
const FOOTER_HEIGHT = 50;

export default function DOMPanel({
  height = 600,
  width = 280,
  levels = 20,
  showTrades = true,
}: DOMPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);

  const { symbol } = useMarketStore();
  const {
    bids,
    asks,
    midPrice,
    spread,
    bidAskImbalance,
    whaleOrders,
  } = useOrderbookStore();

  // Subscribe to orderbook via depth stream
  useEffect(() => {
    bybitWS.connect('linear');

    const { updateOrderbook, setInitialOrderbook } = useOrderbookStore.getState();

    const unsubscribe = bybitWS.subscribeDepth(
      symbol,
      (update) => {
        if (update.eventType === 'snapshot') {
          setInitialOrderbook(update.bids, update.asks, update.finalUpdateId);
        } else {
          updateOrderbook(update.bids, update.asks, update.finalUpdateId);
        }
      },
      'linear',
      50 // 50 levels depth
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [symbol]);

  // Subscribe to trades for trade flow
  useEffect(() => {
    if (!showTrades) return;

    const unsubscribeTrades = bybitWS.subscribeTrades(
      symbol,
      (trade) => {
        const newTrade: RecentTrade = {
          price: trade.price,
          size: trade.quantity,
          side: trade.isBuyerMaker ? 'sell' : 'buy',
          time: trade.time,
        };
        setRecentTrades(prev => [...prev.slice(-30), newTrade]);
      },
      'linear'
    );

    return () => {
      unsubscribeTrades();
    };
  }, [symbol, showTrades]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Get sorted bid/ask levels
    const sortedBids = Array.from(bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, levels);

    const sortedAsks = Array.from(asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, levels);

    // Find max quantity for scaling
    let maxQty = 1;
    sortedBids.forEach(([, qty]) => { maxQty = Math.max(maxQty, qty); });
    sortedAsks.forEach(([, qty]) => { maxQty = Math.max(maxQty, qty); });

    // Get whale prices
    const whalePrices = new Set(whaleOrders.map(w => w.price));

    // Column layout
    const priceCol = 80;
    const qtyCol = 70;
    const barCol = width - priceCol - qtyCol;

    // Draw header
    ctx.fillStyle = COLORS.backgroundAlt;
    ctx.fillRect(0, 0, width, HEADER_HEIGHT);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('DOM - Order Book', width / 2, 15);

    ctx.font = '10px system-ui';
    ctx.fillText(`${symbol}`, width / 2, 30);

    // Border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(width, HEADER_HEIGHT);
    ctx.stroke();

    // Calculate vertical positions
    const contentHeight = height - HEADER_HEIGHT - FOOTER_HEIGHT;
    const midY = HEADER_HEIGHT + contentHeight / 2;
    const rowsPerSide = Math.floor(contentHeight / 2 / ROW_HEIGHT);

    // Draw column headers
    const headerY = HEADER_HEIGHT + 15;
    ctx.fillStyle = COLORS.text;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Size', 5, headerY);
    ctx.textAlign = 'center';
    ctx.fillText('Price', priceCol + qtyCol / 2, headerY);
    ctx.textAlign = 'right';
    ctx.fillText('Total', width - 5, headerY);

    ctx.beginPath();
    ctx.moveTo(0, headerY + 8);
    ctx.lineTo(width, headerY + 8);
    ctx.stroke();

    // Draw asks (above mid)
    const asksToShow = sortedAsks.slice(0, Math.min(rowsPerSide, sortedAsks.length)).reverse();
    asksToShow.forEach(([ price, qty ], index) => {
      const y = midY - (asksToShow.length - index) * ROW_HEIGHT;
      const barWidth = (qty / maxQty) * barCol;
      const isWhale = whalePrices.has(price);

      // Alternating background
      if (index % 2 === 0) {
        ctx.fillStyle = COLORS.backgroundAlt;
        ctx.fillRect(0, y - ROW_HEIGHT / 2, width, ROW_HEIGHT);
      }

      // Whale highlight
      if (isWhale) {
        ctx.fillStyle = COLORS.whaleBg;
        ctx.fillRect(0, y - ROW_HEIGHT / 2, width, ROW_HEIGHT);
      }

      // Volume bar
      ctx.fillStyle = isWhale ? COLORS.askBarStrong : COLORS.askBar;
      ctx.fillRect(width - barWidth, y - ROW_HEIGHT / 2 + 2, barWidth, ROW_HEIGHT - 4);

      // Quantity text
      ctx.fillStyle = isWhale ? COLORS.whale : COLORS.askText;
      ctx.font = isWhale ? 'bold 11px monospace' : '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(formatQty(qty), 5, y + 4);

      // Price text
      ctx.fillStyle = isWhale ? COLORS.whale : COLORS.askText;
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), priceCol + qtyCol / 2, y + 4);

      // Cumulative
      const cumQty = sortedAsks
        .slice(0, sortedAsks.findIndex(([p]) => p === price) + 1)
        .reduce((sum, [, q]) => sum + q, 0);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px monospace';
      ctx.fillText(formatQty(cumQty), width - 5, y + 4);
    });

    // Draw mid price area
    ctx.fillStyle = COLORS.currentPriceBg;
    ctx.fillRect(0, midY - ROW_HEIGHT / 2, width, ROW_HEIGHT);
    ctx.strokeStyle = COLORS.currentPrice;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, midY - ROW_HEIGHT / 2, width, ROW_HEIGHT);

    // Mid price and spread
    ctx.fillStyle = COLORS.currentPrice;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`$${midPrice.toFixed(2)}`, width / 2, midY + 5);

    // Spread indicator
    ctx.font = '9px system-ui';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`Spread: $${spread.toFixed(2)}`, width / 2, midY - 8);

    // Draw bids (below mid)
    const bidsToShow = sortedBids.slice(0, Math.min(rowsPerSide, sortedBids.length));
    bidsToShow.forEach(([ price, qty ], index) => {
      const y = midY + (index + 1) * ROW_HEIGHT;
      const barWidth = (qty / maxQty) * barCol;
      const isWhale = whalePrices.has(price);

      // Alternating background
      if (index % 2 === 0) {
        ctx.fillStyle = COLORS.backgroundAlt;
        ctx.fillRect(0, y - ROW_HEIGHT / 2, width, ROW_HEIGHT);
      }

      // Whale highlight
      if (isWhale) {
        ctx.fillStyle = COLORS.whaleBg;
        ctx.fillRect(0, y - ROW_HEIGHT / 2, width, ROW_HEIGHT);
      }

      // Volume bar
      ctx.fillStyle = isWhale ? COLORS.bidBarStrong : COLORS.bidBar;
      ctx.fillRect(width - barWidth, y - ROW_HEIGHT / 2 + 2, barWidth, ROW_HEIGHT - 4);

      // Quantity text
      ctx.fillStyle = isWhale ? COLORS.whale : COLORS.bidText;
      ctx.font = isWhale ? 'bold 11px monospace' : '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(formatQty(qty), 5, y + 4);

      // Price text
      ctx.fillStyle = isWhale ? COLORS.whale : COLORS.bidText;
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), priceCol + qtyCol / 2, y + 4);

      // Cumulative
      const cumQty = bidsToShow
        .slice(0, index + 1)
        .reduce((sum, [, q]) => sum + q, 0);
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px monospace';
      ctx.fillText(formatQty(cumQty), width - 5, y + 4);
    });

    // Draw footer with imbalance
    const footerY = height - FOOTER_HEIGHT;
    ctx.fillStyle = COLORS.backgroundAlt;
    ctx.fillRect(0, footerY, width, FOOTER_HEIGHT);

    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(width, footerY);
    ctx.stroke();

    // Imbalance bar
    const imbalanceWidth = width - 20;
    const imbalanceY = footerY + 15;

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(10, imbalanceY, imbalanceWidth, 12);

    // Draw imbalance indicator
    const imbalancePos = ((bidAskImbalance + 1) / 2) * imbalanceWidth;
    const barColor = bidAskImbalance >= 0 ? COLORS.bidText : COLORS.askText;

    if (bidAskImbalance >= 0) {
      ctx.fillStyle = barColor;
      ctx.fillRect(10 + imbalanceWidth / 2, imbalanceY, imbalancePos - imbalanceWidth / 2, 12);
    } else {
      ctx.fillStyle = barColor;
      ctx.fillRect(10 + imbalancePos, imbalanceY, imbalanceWidth / 2 - imbalancePos, 12);
    }

    // Center line
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10 + imbalanceWidth / 2, imbalanceY);
    ctx.lineTo(10 + imbalanceWidth / 2, imbalanceY + 12);
    ctx.stroke();

    // Imbalance labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('Sell Pressure', 10, footerY + 42);
    ctx.textAlign = 'right';
    ctx.fillText('Buy Pressure', width - 10, footerY + 42);
    ctx.textAlign = 'center';
    ctx.fillText(`${(bidAskImbalance * 100).toFixed(0)}%`, width / 2, footerY + 42);

  }, [bids, asks, width, height, levels, midPrice, spread, bidAskImbalance, whaleOrders, symbol]);

  // Redraw on data change
  useEffect(() => {
    const animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [draw]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} />

      {/* Recent trades overlay */}
      {showTrades && recentTrades.length > 0 && (
        <div className="absolute top-10 right-1 w-16 overflow-hidden">
          {recentTrades.slice(-5).reverse().map((trade, i) => (
            <div
              key={`${trade.time}-${i}`}
              className={`text-[10px] font-mono px-1 rounded mb-0.5 ${
                trade.side === 'buy'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
              style={{ opacity: 1 - i * 0.15 }}
            >
              {formatQty(trade.size)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatQty(qty: number): string {
  if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
  if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
  return qty.toFixed(qty >= 10 ? 0 : 2);
}
