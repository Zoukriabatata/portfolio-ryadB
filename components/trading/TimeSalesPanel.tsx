'use client';

/**
 * TIME & SALES PANEL
 *
 * Real-time trade tape showing executed trades:
 * - Timestamp
 * - Price
 * - Size (volume)
 * - Side (buy/sell)
 * - Cumulative volume
 *
 * Features:
 * - Color-coded by side (green=buy, red=sell)
 * - Large trade highlighting
 * - Auto-scroll with pause on hover
 * - Aggregation mode (group by price)
 * - Size filter
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

export interface Trade {
  id: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
}

export interface TimeSalesPanelProps {
  trades: Trade[];
  tickSize?: number;
  maxRows?: number;
  minSizeFilter?: number;
  aggregateByPrice?: boolean;
  showCumulativeVolume?: boolean;
  largeTradeThreshold?: number;
  buyColor?: string;
  sellColor?: string;
  onTradeClick?: (trade: Trade) => void;
}

interface AggregatedTrade {
  price: number;
  buySize: number;
  sellSize: number;
  count: number;
  lastTimestamp: number;
  side: 'buy' | 'sell' | 'mixed';
}

export function TimeSalesPanel({
  trades,
  tickSize = 0.01,
  maxRows = 100,
  minSizeFilter = 0,
  aggregateByPrice = false,
  showCumulativeVolume = true,
  largeTradeThreshold = 10,
  buyColor = '#22c55e',
  sellColor = '#ef4444',
  onTradeClick,
}: TimeSalesPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Filter trades by minimum size
  const filteredTrades = useMemo(() => {
    return trades.filter(t => t.size >= minSizeFilter).slice(-maxRows);
  }, [trades, minSizeFilter, maxRows]);

  // Calculate cumulative volume
  const tradesWithCumulative = useMemo(() => {
    let cumulative = 0;
    return filteredTrades.map(trade => {
      cumulative += trade.size;
      return { ...trade, cumulative };
    });
  }, [filteredTrades]);

  // Aggregate trades by price if enabled
  const aggregatedTrades = useMemo((): AggregatedTrade[] => {
    if (!aggregateByPrice) return [];

    const priceMap = new Map<number, AggregatedTrade>();
    const recentWindow = 5000; // 5 seconds
    const now = Date.now();

    filteredTrades
      .filter(t => now - t.timestamp < recentWindow)
      .forEach(trade => {
        const roundedPrice = Math.round(trade.price / tickSize) * tickSize;
        const existing = priceMap.get(roundedPrice);

        if (existing) {
          if (trade.side === 'buy') {
            existing.buySize += trade.size;
          } else {
            existing.sellSize += trade.size;
          }
          existing.count++;
          existing.lastTimestamp = Math.max(existing.lastTimestamp, trade.timestamp);
          existing.side = existing.buySize > existing.sellSize ? 'buy' :
                         existing.sellSize > existing.buySize ? 'sell' : 'mixed';
        } else {
          priceMap.set(roundedPrice, {
            price: roundedPrice,
            buySize: trade.side === 'buy' ? trade.size : 0,
            sellSize: trade.side === 'sell' ? trade.size : 0,
            count: 1,
            lastTimestamp: trade.timestamp,
            side: trade.side,
          });
        }
      });

    return Array.from(priceMap.values())
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [filteredTrades, aggregateByPrice, tickSize]);

  // Auto-scroll to bottom when new trades arrive
  useEffect(() => {
    if (shouldAutoScroll && !isPaused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [trades.length, shouldAutoScroll, isPaused]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShouldAutoScroll(isAtBottom);
  }, []);

  // Format timestamp
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0').slice(0, 2);
  }, []);

  // Format price
  const formatPrice = useCallback((price: number) => {
    const decimals = tickSize < 1 ? Math.ceil(-Math.log10(tickSize)) : 0;
    return price.toFixed(decimals);
  }, [tickSize]);

  // Format size
  const formatSize = useCallback((size: number) => {
    if (size >= 1000000) return (size / 1000000).toFixed(2) + 'M';
    if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
    return size.toFixed(2);
  }, []);

  // Calculate average trade size for large trade detection
  const avgSize = useMemo(() => {
    if (filteredTrades.length === 0) return 1;
    return filteredTrades.reduce((sum, t) => sum + t.size, 0) / filteredTrades.length;
  }, [filteredTrades]);

  // Check if trade is large
  const isLargeTrade = useCallback((size: number) => {
    return size >= avgSize * largeTradeThreshold;
  }, [avgSize, largeTradeThreshold]);

  // Stats
  const stats = useMemo(() => {
    const recent = filteredTrades.filter(t => Date.now() - t.timestamp < 60000);
    const buyVolume = recent.filter(t => t.side === 'buy').reduce((sum, t) => sum + t.size, 0);
    const sellVolume = recent.filter(t => t.side === 'sell').reduce((sum, t) => sum + t.size, 0);
    const totalVolume = buyVolume + sellVolume;
    const delta = buyVolume - sellVolume;
    const buyPercent = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;

    return { buyVolume, sellVolume, totalVolume, delta, buyPercent, tradeCount: recent.length };
  }, [filteredTrades]);

  return (
    <div className="flex flex-col h-full bg-zinc-900/95 border border-zinc-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
            <path d="M12 2v20M2 12h20" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-xs font-semibold text-white">Time & Sales</span>
          <span className="text-[10px] text-zinc-500">({stats.tradeCount}/min)</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Pause indicator */}
          {isPaused && (
            <span className="px-1.5 py-0.5 text-[9px] bg-amber-600/30 text-amber-400 rounded">
              PAUSED
            </span>
          )}
          {/* Live indicator */}
          {!isPaused && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] text-green-400">LIVE</span>
            </span>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-3 py-1.5 border-b border-zinc-700/30 bg-zinc-800/30">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3">
            <span className="text-zinc-500">Vol:</span>
            <span className="text-white font-mono">{formatSize(stats.totalVolume)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ color: buyColor }} className="font-mono">{formatSize(stats.buyVolume)}</span>
            <span className="text-zinc-600">/</span>
            <span style={{ color: sellColor }} className="font-mono">{formatSize(stats.sellVolume)}</span>
          </div>
          <div className={`font-mono font-semibold ${stats.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.delta >= 0 ? '+' : ''}{formatSize(stats.delta)}
          </div>
        </div>

        {/* Delta bar */}
        <div className="mt-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${stats.buyPercent}%`,
              background: `linear-gradient(90deg, ${buyColor} 0%, ${buyColor}80 100%)`,
            }}
          />
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-[60px_70px_60px_50px] gap-1 px-3 py-1 border-b border-zinc-700/30 text-[9px] text-zinc-500 font-medium uppercase tracking-wide">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        {showCumulativeVolume && <span className="text-right">Cum</span>}
      </div>

      {/* Trade List */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
        onScroll={handleScroll}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {aggregateByPrice ? (
          // Aggregated view
          aggregatedTrades.map((agg, index) => (
            <div
              key={`${agg.price}-${index}`}
              className="grid grid-cols-[60px_70px_60px_50px] gap-1 px-3 py-0.5 hover:bg-zinc-800/50 transition-colors text-[11px] font-mono"
            >
              <span className="text-zinc-500">{formatTime(agg.lastTimestamp)}</span>
              <span
                className="text-right font-semibold"
                style={{ color: agg.side === 'buy' ? buyColor : agg.side === 'sell' ? sellColor : '#fff' }}
              >
                {formatPrice(agg.price)}
              </span>
              <span className="text-right text-zinc-300">
                {agg.count > 1 && <span className="text-zinc-600 mr-1">x{agg.count}</span>}
                {formatSize(agg.buySize + agg.sellSize)}
              </span>
              <span className="text-right text-zinc-500">-</span>
            </div>
          ))
        ) : (
          // Individual trades view
          tradesWithCumulative.map((trade, index) => {
            const isLarge = isLargeTrade(trade.size);
            const color = trade.side === 'buy' ? buyColor : sellColor;

            return (
              <div
                key={trade.id || `${trade.timestamp}-${index}`}
                onClick={() => onTradeClick?.(trade)}
                className={`
                  grid grid-cols-[60px_70px_60px_50px] gap-1 px-3 py-0.5
                  hover:bg-zinc-800/50 transition-colors text-[11px] font-mono cursor-pointer
                  ${isLarge ? 'bg-zinc-800/30' : ''}
                `}
                style={isLarge ? {
                  borderLeft: `2px solid ${color}`,
                  backgroundColor: `${color}10`,
                } : undefined}
              >
                <span className="text-zinc-500">{formatTime(trade.timestamp)}</span>
                <span className="text-right font-semibold" style={{ color }}>
                  {formatPrice(trade.price)}
                </span>
                <span
                  className={`text-right ${isLarge ? 'font-bold' : ''}`}
                  style={{ color: isLarge ? color : undefined }}
                >
                  {formatSize(trade.size)}
                </span>
                {showCumulativeVolume && (
                  <span className="text-right text-zinc-600">
                    {formatSize(trade.cumulative)}
                  </span>
                )}
              </div>
            );
          })
        )}

        {filteredTrades.length === 0 && (
          <div className="flex items-center justify-center h-20 text-zinc-600 text-xs">
            Waiting for trades...
          </div>
        )}
      </div>

      {/* Footer - Scroll indicator */}
      {!shouldAutoScroll && (
        <button
          onClick={() => {
            setShouldAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
          className="flex items-center justify-center gap-1 px-2 py-1 bg-zinc-800 border-t border-zinc-700/50 text-[10px] text-zinc-400 hover:text-white transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          Scroll to latest
        </button>
      )}
    </div>
  );
}

export default TimeSalesPanel;
