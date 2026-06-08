'use client';

import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { themeColor, themeAlpha } from '@/lib/ui/themeColors';

interface TradingDOMProps {
  height?: number;
  width?: number;
  levels?: number;
  onTrade?: (side: 'buy' | 'sell', price: number, quantity: number) => void;
}

/**
 * Resolve the canvas palette from brand tokens at draw time (never at module
 * scope — themeColor() returns #000 during SSR). Called inside the draw
 * callback so it always reads the active theme.
 */
function resolveColors() {
  return {
    background: themeColor('--background'),
    backgroundAlt: themeAlpha('--surface', 0.5),
    backgroundHover: themeAlpha('--surface-elevated', 0.6),
    border: themeColor('--border'),
    text: themeColor('--text-muted'),
    textBright: themeColor('--text-primary'),

    // Bid/Ask
    bidBar: themeAlpha('--bull', 0.25),
    bidBarHover: themeAlpha('--bull', 0.4),
    bidText: themeColor('--bull'),
    bidTextBright: themeColor('--bull'),

    askBar: themeAlpha('--bear', 0.25),
    askBarHover: themeAlpha('--bear', 0.4),
    askText: themeColor('--bear'),
    askTextBright: themeColor('--bear'),

    // Current price
    currentPrice: themeColor('--warning'),
    currentPriceBg: themeAlpha('--warning', 0.15),

    // Trading
    buyButton: themeColor('--bull'),
    sellButton: themeColor('--bear'),
    stopLoss: themeColor('--warning'),
    takeProfit: themeColor('--accent'),

    // Whale (large order) — neutral structure accent
    whale: themeColor('--accent'),
    whaleBg: themeAlpha('--accent', 0.2),
  };
}

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 120;

export default memo(function TradingDOM({
  height = 700,
  width = 320,
  levels = 15,
  onTrade,
}: TradingDOMProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);

  const symbol = useMarketStore((s) => s.symbol);
  const currentPrice = useMarketStore((s) => s.currentPrice);
  const {
    bids,
    asks,
    midPrice,
    spread,
    bidAskImbalance,
    whaleOrders,
  } = useOrderbookStore();

  // Subscribe to orderbook
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
      50
    );

    return () => unsubscribe();
  }, [symbol]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = (height - HEADER_HEIGHT - FOOTER_HEIGHT) * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height - HEADER_HEIGHT - FOOTER_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    const canvasHeight = height - HEADER_HEIGHT - FOOTER_HEIGHT;

    // Resolve brand palette at draw time (theme-aware, SSR-safe)
    const c = resolveColors();

    // Background
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, width, canvasHeight);

    // Get sorted bid/ask levels
    const sortedBids = Array.from(bids.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, levels);

    const sortedAsks = Array.from(asks.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, levels);

    // Find max quantity
    let maxQty = 1;
    sortedBids.forEach(([, qty]) => { maxQty = Math.max(maxQty, qty); });
    sortedAsks.forEach(([, qty]) => { maxQty = Math.max(maxQty, qty); });

    // Whale prices
    const whalePrices = new Set(whaleOrders.map(w => w.price));

    // Layout
    const colQty = 70;
    const colPrice = 80;
    const colBar = width - colQty - colPrice - 10;

    // Mid point
    const midY = canvasHeight / 2;
    const rowsPerSide = Math.floor(midY / ROW_HEIGHT);

    // Draw asks (above mid) - reversed to show lowest ask at bottom
    const asksToShow = sortedAsks.slice(0, Math.min(rowsPerSide, sortedAsks.length)).reverse();
    asksToShow.forEach(([price, qty], index) => {
      const y = midY - ROW_HEIGHT - (asksToShow.length - 1 - index) * ROW_HEIGHT;
      const barWidth = (qty / maxQty) * colBar;
      const isWhale = whalePrices.has(price);
      const isHovered = hoveredPrice === price;

      // Row background
      if (index % 2 === 1) {
        ctx.fillStyle = c.backgroundAlt;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      if (isHovered) {
        ctx.fillStyle = c.backgroundHover;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      if (isWhale) {
        ctx.fillStyle = c.whaleBg;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      // Volume bar (from right)
      ctx.fillStyle = isHovered ? c.askBarHover : c.askBar;
      ctx.fillRect(width - barWidth - 5, y + 3, barWidth, ROW_HEIGHT - 6);

      // Quantity
      ctx.fillStyle = isWhale ? c.whale : c.askText;
      ctx.font = isWhale ? 'bold 11px monospace' : '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatQty(qty), colQty - 5, y + ROW_HEIGHT / 2 + 4);

      // Price
      ctx.fillStyle = isWhale ? c.whale : (isHovered ? c.askTextBright : c.askText);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), colQty + colPrice / 2, y + ROW_HEIGHT / 2 + 4);

      // Stop loss / Take profit indicators
      if (price === stopLoss) {
        ctx.fillStyle = c.stopLoss;
        ctx.fillText('SL', width - 25, y + ROW_HEIGHT / 2 + 4);
      }
      if (price === takeProfit) {
        ctx.fillStyle = c.takeProfit;
        ctx.fillText('TP', width - 25, y + ROW_HEIGHT / 2 + 4);
      }
    });

    // Draw mid price row
    ctx.fillStyle = c.currentPriceBg;
    ctx.fillRect(0, midY - ROW_HEIGHT / 2, width, ROW_HEIGHT);

    ctx.strokeStyle = c.currentPrice;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, midY - ROW_HEIGHT / 2);
    ctx.lineTo(width, midY - ROW_HEIGHT / 2);
    ctx.moveTo(0, midY + ROW_HEIGHT / 2);
    ctx.lineTo(width, midY + ROW_HEIGHT / 2);
    ctx.stroke();

    // Mid price text
    ctx.fillStyle = c.currentPrice;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`$${midPrice.toFixed(2)}`, width / 2, midY + 5);

    // Spread label
    ctx.font = '11px system-ui';
    ctx.fillStyle = c.text;
    ctx.fillText(`Spread: $${spread.toFixed(2)}`, width / 2, midY - 8);

    // Draw bids (below mid)
    const bidsToShow = sortedBids.slice(0, Math.min(rowsPerSide, sortedBids.length));
    bidsToShow.forEach(([price, qty], index) => {
      const y = midY + ROW_HEIGHT / 2 + index * ROW_HEIGHT;
      const barWidth = (qty / maxQty) * colBar;
      const isWhale = whalePrices.has(price);
      const isHovered = hoveredPrice === price;

      // Row background
      if (index % 2 === 1) {
        ctx.fillStyle = c.backgroundAlt;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      if (isHovered) {
        ctx.fillStyle = c.backgroundHover;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      if (isWhale) {
        ctx.fillStyle = c.whaleBg;
        ctx.fillRect(0, y, width, ROW_HEIGHT);
      }

      // Volume bar (from right)
      ctx.fillStyle = isHovered ? c.bidBarHover : c.bidBar;
      ctx.fillRect(width - barWidth - 5, y + 3, barWidth, ROW_HEIGHT - 6);

      // Quantity
      ctx.fillStyle = isWhale ? c.whale : c.bidText;
      ctx.font = isWhale ? 'bold 11px monospace' : '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatQty(qty), colQty - 5, y + ROW_HEIGHT / 2 + 4);

      // Price
      ctx.fillStyle = isWhale ? c.whale : (isHovered ? c.bidTextBright : c.bidText);
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), colQty + colPrice / 2, y + ROW_HEIGHT / 2 + 4);

      // Stop loss / Take profit indicators
      if (price === stopLoss) {
        ctx.fillStyle = c.stopLoss;
        ctx.fillText('SL', width - 25, y + ROW_HEIGHT / 2 + 4);
      }
      if (price === takeProfit) {
        ctx.fillStyle = c.takeProfit;
        ctx.fillText('TP', width - 25, y + ROW_HEIGHT / 2 + 4);
      }
    });

    // Draw grid lines
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colQty, 0);
    ctx.lineTo(colQty, canvasHeight);
    ctx.moveTo(colQty + colPrice, 0);
    ctx.lineTo(colQty + colPrice, canvasHeight);
    ctx.stroke();

  }, [bids, asks, width, height, levels, midPrice, spread, whaleOrders, hoveredPrice, stopLoss, takeProfit]);

  useEffect(() => {
    const animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [draw]);

  // Handle mouse move for hover effect
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const canvasHeight = height - HEADER_HEIGHT - FOOTER_HEIGHT;
    const midY = canvasHeight / 2;

    // Determine which price level is hovered
    const sortedAsks = Array.from(asks.entries()).sort((a, b) => a[0] - b[0]);
    const sortedBids = Array.from(bids.entries()).sort((a, b) => b[0] - a[0]);

    if (y < midY - ROW_HEIGHT / 2) {
      // In asks area
      const rowIndex = Math.floor((midY - ROW_HEIGHT / 2 - y) / ROW_HEIGHT);
      const asksReversed = sortedAsks.slice(0, levels).reverse();
      if (rowIndex >= 0 && rowIndex < asksReversed.length) {
        setHoveredPrice(asksReversed[asksReversed.length - 1 - rowIndex]?.[0] || null);
      }
    } else if (y > midY + ROW_HEIGHT / 2) {
      // In bids area
      const rowIndex = Math.floor((y - midY - ROW_HEIGHT / 2) / ROW_HEIGHT);
      if (rowIndex >= 0 && rowIndex < sortedBids.length) {
        setHoveredPrice(sortedBids[rowIndex]?.[0] || null);
      }
    } else {
      setHoveredPrice(null);
    }
  }, [asks, bids, height, levels]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredPrice && onTrade) {
      const sortedAsks = Array.from(asks.entries()).sort((a, b) => a[0] - b[0]);
      const isAsk = sortedAsks.some(([p]) => p === hoveredPrice);
      // Click on ask = buy limit, click on bid = sell limit
    }
  }, [hoveredPrice, asks, onTrade]);

  const handleBuy = () => {
    if (onTrade) onTrade('buy', currentPrice, quantity);
  };

  const handleSell = () => {
    if (onTrade) onTrade('sell', currentPrice, quantity);
  };

  return (
    <div
      className="flex flex-col"
      style={{ width, height, background: 'var(--background)', fontFamily: 'var(--font-jetbrains-mono)' }}
    >
      {/* Header */}
      <div className="panel-glass border-b" style={{ height: HEADER_HEIGHT, borderColor: 'var(--border)' }}>
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Trading DOM</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{symbol}</span>
          </div>

          {/* Quantity input */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>Qty:</span>
            <div className="flex items-center rounded border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <button
                onClick={() => setQuantity(Math.max(0.01, quantity - 0.1))}
                className="px-2 py-0.5 transition-colors hover:bg-[var(--surface-elevated)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0.01, parseFloat(e.target.value) || 0))}
                className="w-16 bg-transparent text-center text-sm border-none focus:outline-none tabular-nums"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
                step={0.1}
                min={0.01}
              />
              <button
                onClick={() => setQuantity(quantity + 0.1)}
                className="px-2 py-0.5 transition-colors hover:bg-[var(--surface-elevated)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                +
              </button>
            </div>
            <div className="flex gap-1">
              {[0.1, 0.5, 1, 5].map(q => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className="px-1.5 py-0.5 text-[10px] rounded transition-colors"
                  style={{
                    backgroundColor: quantity === q ? 'var(--primary)' : 'var(--surface-elevated)',
                    color: quantity === q ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          <div className="flex items-center text-[9px] uppercase px-1" style={{ color: 'var(--text-muted)' }}>
            <span className="w-16 text-right">Size</span>
            <span className="w-20 text-center">Price</span>
            <span className="flex-1"></span>
          </div>
        </div>
      </div>

      {/* DOM Canvas */}
      <canvas
        ref={canvasRef}
        className="cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPrice(null)}
        onClick={handleClick}
      />

      {/* Footer - Trading Controls */}
      <div className="panel-glass border-t" style={{ height: FOOTER_HEIGHT, borderColor: 'var(--border)' }}>
        <div className="px-3 py-2">
          {/* Imbalance indicator */}
          <div className="mb-2">
            <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
              <span>Sell Pressure</span>
              <span>{(bidAskImbalance * 100).toFixed(0)}%</span>
              <span>Buy Pressure</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--surface-elevated)' }}>
              <div
                className="h-full transition-all"
                style={{ width: `${50 - bidAskImbalance * 50}%`, background: 'linear-gradient(to right, rgb(var(--bear-rgb) / 0.85), var(--bear))' }}
              />
              <div
                className="h-full transition-all"
                style={{ width: `${50 + bidAskImbalance * 50}%`, background: 'linear-gradient(to right, var(--bull), rgb(var(--bull-rgb) / 0.85))' }}
              />
            </div>
          </div>

          {/* Buy/Sell buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSell}
              className="flex-1 py-2.5 rounded font-bold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, var(--bear), color-mix(in srgb, var(--bear) 78%, #000))',
                color: '#fff',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              SELL
              <span className="block text-[10px] font-normal opacity-80">
                {quantity} @ MKT
              </span>
            </button>
            <button
              onClick={handleBuy}
              className="flex-1 py-2.5 rounded font-bold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--bull) 78%, #000), var(--bull))',
                color: '#fff',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.2)',
              }}
            >
              BUY
              <span className="block text-[10px] font-normal opacity-80">
                {quantity} @ MKT
              </span>
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex gap-1 mt-2">
            <button className="press-fb flex-1 py-1 text-[10px] rounded transition-colors hover:brightness-110" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
              Flatten
            </button>
            <button className="press-fb flex-1 py-1 text-[10px] rounded transition-colors hover:brightness-110" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
              Cancel All
            </button>
            <button className="press-fb flex-1 py-1 text-[10px] rounded transition-colors hover:brightness-110" style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>
              Reverse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

function formatQty(qty: number): string {
  if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
  if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
  return qty.toFixed(qty >= 10 ? 0 : 2);
}
