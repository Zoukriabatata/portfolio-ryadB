'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Animated Footprint Preview for Landing Page
 * Shows real-time BTC price with footprint-style visualization
 */

interface AnimatedFootprintPreviewProps {
  className?: string;
}

interface PriceLevel {
  price: number;
  bid: number;
  ask: number;
  delta: number;
}

interface FootprintCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: PriceLevel[];
  totalVolume: number;
  totalDelta: number;
  poc: number;
}

export default function AnimatedFootprintPreview({ className = '' }: AnimatedFootprintPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [price, setPrice] = useState(97500);
  const [priceChange, setPriceChange] = useState({ value: 0, percent: 0 });
  const candlesRef = useRef<FootprintCandle[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const animationRef = useRef<number>(0);
  const lastPriceRef = useRef(97500);
  const openPriceRef = useRef(97500);

  // Generate simulated footprint data
  const generateFootprintCandle = useCallback((basePrice: number, prevClose: number): FootprintCandle => {
    const volatility = 50 + Math.random() * 100;
    const direction = Math.random() > 0.48 ? 1 : -1;

    const open = prevClose;
    const close = open + direction * (volatility * (0.3 + Math.random() * 0.7));
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;

    const levels: PriceLevel[] = [];
    const tickSize = 10;
    const priceMin = Math.floor(low / tickSize) * tickSize;
    const priceMax = Math.ceil(high / tickSize) * tickSize;

    let totalVolume = 0;
    let totalDelta = 0;
    let maxVolume = 0;
    let pocPrice = priceMin;

    for (let p = priceMin; p <= priceMax; p += tickSize) {
      const distFromClose = Math.abs(p - close);
      const intensity = Math.max(0.1, 1 - distFromClose / (volatility * 2));

      const bid = Math.floor(intensity * (10 + Math.random() * 50));
      const ask = Math.floor(intensity * (10 + Math.random() * 50));
      const delta = ask - bid;
      const volume = bid + ask;

      totalVolume += volume;
      totalDelta += delta;

      if (volume > maxVolume) {
        maxVolume = volume;
        pocPrice = p;
      }

      levels.push({ price: p, bid, ask, delta });
    }

    return {
      time: Date.now(),
      open,
      high,
      low,
      close,
      levels,
      totalVolume,
      totalDelta,
      poc: pocPrice,
    };
  }, []);

  // Initialize candles
  useEffect(() => {
    const candles: FootprintCandle[] = [];
    let prevClose = 97500;

    for (let i = 0; i < 20; i++) {
      const candle = generateFootprintCandle(prevClose, prevClose);
      candles.push(candle);
      prevClose = candle.close;
    }

    candlesRef.current = candles;
    lastPriceRef.current = prevClose;
    setPrice(Math.round(prevClose));
  }, [generateFootprintCandle]);

  // Connect to Binance WebSocket for real-time price
  useEffect(() => {
    const connectWS = () => {
      try {
        const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');

        ws.onopen = () => {
          console.log('BTC price feed connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const newPrice = parseFloat(data.c);
            const openPrice = parseFloat(data.o);
            const change = newPrice - openPrice;
            const changePercent = (change / openPrice) * 100;

            setPrice(Math.round(newPrice));
            setPriceChange({ value: change, percent: changePercent });
            lastPriceRef.current = newPrice;
            openPriceRef.current = openPrice;
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          // Silently handle errors
        };

        ws.onclose = () => {
          // Reconnect after delay
          setTimeout(connectWS, 5000);
        };

        wsRef.current = ws;
      } catch (e) {
        // Fallback to simulated price
        const interval = setInterval(() => {
          const change = (Math.random() - 0.48) * 100;
          setPrice(p => Math.round(p + change));
        }, 2000);
        return () => clearInterval(interval);
      }
    };

    connectWS();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Add new candle periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const candles = candlesRef.current;
      if (candles.length > 0) {
        const lastCandle = candles[candles.length - 1];
        const newCandle = generateFootprintCandle(lastPriceRef.current, lastCandle.close);
        candles.push(newCandle);

        // Keep only last 20 candles
        if (candles.length > 20) {
          candles.shift();
        }

        candlesRef.current = candles;
      }
    }, 3000); // New candle every 3 seconds for visual effect

    return () => clearInterval(interval);
  }, [generateFootprintCandle]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw footprint chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#050805';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.05)';
    ctx.lineWidth = 1;

    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const candles = candlesRef.current;
    if (candles.length === 0) return;

    // Calculate price range
    let priceMin = Infinity;
    let priceMax = -Infinity;
    candles.forEach(c => {
      c.levels.forEach(l => {
        priceMin = Math.min(priceMin, l.price);
        priceMax = Math.max(priceMax, l.price);
      });
    });

    const padding = { top: 20, bottom: 60, left: 10, right: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const candleWidth = chartWidth / candles.length;
    const priceRange = priceMax - priceMin || 100;

    const priceToY = (p: number) => padding.top + ((priceMax - p) / priceRange) * chartHeight;

    // Draw footprint candles
    candles.forEach((candle, idx) => {
      const x = padding.left + idx * candleWidth;
      const centerX = x + candleWidth / 2;
      const isBullish = candle.close >= candle.open;

      // OHLC candle (thin)
      const openY = priceToY(candle.open);
      const closeY = priceToY(candle.close);
      const highY = priceToY(candle.high);
      const lowY = priceToY(candle.low);

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));

      // Wick
      ctx.strokeStyle = isBullish ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, highY);
      ctx.lineTo(x + 4, lowY);
      ctx.stroke();

      // Body
      ctx.fillStyle = isBullish ? '#22c55e' : '#ef4444';
      ctx.globalAlpha = 0.8;
      ctx.fillRect(x + 1, bodyTop, 6, bodyHeight);
      ctx.globalAlpha = 1;

      // Footprint cluster visualization
      const fpX = x + 10;
      const fpWidth = candleWidth - 14;
      const maxVol = Math.max(...candle.levels.map(l => l.bid + l.ask), 1);

      candle.levels.forEach(level => {
        const y = priceToY(level.price);
        const rowH = (chartHeight / (priceRange / 10)) * 0.8;
        const isPOC = level.price === candle.poc;

        // Bid volume bar (left)
        if (level.bid > 0) {
          const bidW = (level.bid / maxVol) * (fpWidth / 2 - 2);
          ctx.fillStyle = '#ef4444';
          ctx.globalAlpha = 0.2 + (level.bid / maxVol) * 0.4;
          ctx.fillRect(centerX - bidW - 1, y - rowH / 2, bidW, rowH);
          ctx.globalAlpha = 1;
        }

        // Ask volume bar (right)
        if (level.ask > 0) {
          const askW = (level.ask / maxVol) * (fpWidth / 2 - 2);
          ctx.fillStyle = '#22c55e';
          ctx.globalAlpha = 0.2 + (level.ask / maxVol) * 0.4;
          ctx.fillRect(centerX + 1, y - rowH / 2, askW, rowH);
          ctx.globalAlpha = 1;
        }

        // POC highlight
        if (isPOC) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.6;
          ctx.strokeRect(fpX, y - rowH / 2, fpWidth, rowH);
          ctx.globalAlpha = 1;
        }
      });

      // Candle border
      ctx.strokeStyle = isBullish ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(fpX, priceToY(candle.high), fpWidth, priceToY(candle.low) - priceToY(candle.high));
    });

    // Current price line
    if (price > 0) {
      const priceY = priceToY(price);
      if (priceY > padding.top && priceY < height - padding.bottom) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, priceY);
        ctx.lineTo(width - padding.right, priceY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(width - padding.right + 5, priceY - 10, 70, 20);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`$${price.toLocaleString()}`, width - padding.right + 10, priceY + 4);
      }
    }

    // Delta bar at bottom
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      const maxDelta = Math.max(...candles.map(c => Math.abs(c.totalDelta)));

      candles.forEach((candle, idx) => {
        const x = padding.left + idx * candleWidth;
        const barMaxH = 30;
        const barH = (Math.abs(candle.totalDelta) / maxDelta) * barMaxH;
        const barY = height - padding.bottom + 15;

        ctx.fillStyle = candle.totalDelta >= 0 ? '#22c55e' : '#ef4444';
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x + 2, barY, candleWidth - 4, barH);
        ctx.globalAlpha = 1;
      });
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [dimensions, price]);

  // Animation loop
  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: dimensions.width, height: dimensions.height }}
      />

      {/* Price overlay */}
      <div className="absolute top-4 left-4 text-left">
        <div className="text-3xl md:text-4xl font-mono font-bold text-green-400">
          ${price.toLocaleString()}.00
        </div>
        <div className={`text-sm ${priceChange.value >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
          {priceChange.value >= 0 ? '+' : ''}{priceChange.percent.toFixed(2)}% today
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500/60 rounded-sm" />
          <span>Ask (Buys)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500/60 rounded-sm" />
          <span>Bid (Sells)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-1 border border-yellow-500/60" />
          <span>POC</span>
        </div>
      </div>
    </div>
  );
}
