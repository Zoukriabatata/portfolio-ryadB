'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { SYMBOLS } from '@/types/market';

interface TopstepDOMProps {
  width?: number;
  height?: number;
}

const COLORS = {
  bg: '#131722',
  bgAlt: '#1e222d',
  border: '#2a2e39',
  text: '#787b86',
  textBright: '#d1d4dc',
  bid: '#26a69a',
  bidBg: 'rgba(38, 166, 154, 0.15)',
  bidBar: 'rgba(38, 166, 154, 0.4)',
  ask: '#ef5350',
  askBg: 'rgba(239, 83, 80, 0.15)',
  askBar: 'rgba(239, 83, 80, 0.4)',
  lastPrice: '#2962ff',
  spread: '#ffeb3b',
};

export default function TopstepDOM({ width = 320, height }: TopstepDOMProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width, height: 600 });
  const animationFrameRef = useRef<number | null>(null);

  const { bids, asks, midPrice, spread } = useOrderbookStore();
  const { currentPrice, symbol } = useMarketStore();
  const symbolInfo = SYMBOLS[symbol];
  const tickSize = symbolInfo?.tickSize || 0.01;

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Draw DOM
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Header
    const headerHeight = 36;
    ctx.fillStyle = COLORS.bgAlt;
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    // Header text
    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('DEPTH OF MARKET', width / 2, 23);

    // Column headers
    const colHeaderY = headerHeight + 24;
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px system-ui';

    const bidCol = width * 0.2;
    const priceCol = width * 0.5;
    const askCol = width * 0.8;

    ctx.textAlign = 'center';
    ctx.fillText('BID', bidCol, colHeaderY);
    ctx.fillText('PRICE', priceCol, colHeaderY);
    ctx.fillText('ASK', askCol, colHeaderY);

    // Divider
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(0, colHeaderY + 10);
    ctx.lineTo(width, colHeaderY + 10);
    ctx.stroke();

    // Convert Maps to sorted arrays
    const bidArray = Array.from(bids.entries()).sort((a, b) => b[0] - a[0]); // High to low
    const askArray = Array.from(asks.entries()).sort((a, b) => a[0] - b[0]); // Low to high

    // Find max size for scaling
    const maxBidSize = Math.max(...bidArray.slice(0, 20).map(b => b[1]), 1);
    const maxAskSize = Math.max(...askArray.slice(0, 20).map(a => a[1]), 1);
    const maxSize = Math.max(maxBidSize, maxAskSize);

    // Calculate price levels
    const centerPrice = currentPrice || midPrice || 0;
    const rowHeight = 22;
    const startY = colHeaderY + 20;
    const visibleRows = Math.floor((height - startY - 40) / rowHeight);
    const halfRows = Math.floor(visibleRows / 2);

    // Create price ladder
    const priceLevels: number[] = [];
    for (let i = -halfRows; i <= halfRows; i++) {
      const price = Math.round((centerPrice + i * tickSize) / tickSize) * tickSize;
      priceLevels.push(price);
    }
    priceLevels.sort((a, b) => b - a); // High to low

    // Create bid/ask lookup maps (price key -> size)
    const bidMap = new Map<string, number>();
    const askMap = new Map<string, number>();

    bidArray.forEach(([price, size]) => {
      const key = price.toFixed(6);
      bidMap.set(key, (bidMap.get(key) || 0) + size);
    });

    askArray.forEach(([price, size]) => {
      const key = price.toFixed(6);
      askMap.set(key, (askMap.get(key) || 0) + size);
    });

    // Draw rows
    priceLevels.forEach((price, i) => {
      const y = startY + i * rowHeight;
      if (y > height - 30) return;

      const priceKey = price.toFixed(6);
      const bidSize = bidMap.get(priceKey) || 0;
      const askSize = askMap.get(priceKey) || 0;

      const isLastPrice = Math.abs(price - centerPrice) < tickSize / 2;
      const isAboveCenter = price > centerPrice;
      const isBelowCenter = price < centerPrice;

      // Row background
      if (isLastPrice) {
        ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
        ctx.fillRect(0, y - rowHeight / 2 + 4, width, rowHeight);
      }

      // Bid bar (left side)
      if (bidSize > 0) {
        const barWidth = (bidSize / maxSize) * (width * 0.35);
        ctx.fillStyle = COLORS.bidBar;
        ctx.fillRect(width * 0.35 - barWidth, y - rowHeight / 2 + 4, barWidth, rowHeight);
      }

      // Ask bar (right side)
      if (askSize > 0) {
        const barWidth = (askSize / maxSize) * (width * 0.35);
        ctx.fillStyle = COLORS.askBar;
        ctx.fillRect(width * 0.65, y - rowHeight / 2 + 4, barWidth, rowHeight);
      }

      // Bid size
      if (bidSize > 0) {
        ctx.fillStyle = COLORS.bid;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatSize(bidSize), bidCol, y + 4);
      }

      // Price
      ctx.fillStyle = isLastPrice ? COLORS.lastPrice :
                      isAboveCenter ? COLORS.ask :
                      isBelowCenter ? COLORS.bid : COLORS.textBright;
      ctx.font = isLastPrice ? 'bold 12px monospace' : '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatPrice(price, tickSize), priceCol, y + 4);

      // Ask size
      if (askSize > 0) {
        ctx.fillStyle = COLORS.ask;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatSize(askSize), askCol, y + 4);
      }
    });

    // Bottom stats bar
    const statsY = height - 30;
    ctx.fillStyle = COLORS.bgAlt;
    ctx.fillRect(0, statsY, width, 30);
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    ctx.moveTo(0, statsY);
    ctx.lineTo(width, statsY);
    ctx.stroke();

    // Stats
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Spread:', 10, statsY + 18);
    ctx.fillStyle = COLORS.spread;
    ctx.fillText(spread.toFixed(2), 55, statsY + 18);

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.fillText('Mid:', width - 60, statsY + 18);
    ctx.fillStyle = COLORS.textBright;
    ctx.fillText(formatPrice(midPrice, tickSize), width - 10, statsY + 18);

  }, [bids, asks, midPrice, currentPrice, spread, dimensions, tickSize]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      draw();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

function formatSize(size: number): string {
  if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
  if (size >= 100) return size.toFixed(0);
  if (size >= 10) return size.toFixed(1);
  return size.toFixed(2);
}

function formatPrice(price: number, tickSize: number): string {
  if (tickSize >= 1) return price.toFixed(0);
  if (tickSize >= 0.1) return price.toFixed(1);
  if (tickSize >= 0.01) return price.toFixed(2);
  return price.toFixed(3);
}
