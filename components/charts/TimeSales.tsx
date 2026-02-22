'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';

interface TradeEntry {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  time: number;
  isLarge: boolean;
  isAggressive: boolean;
}

interface TimeSalesProps {
  height?: number;
  width?: number;
  maxTrades?: number;
  largeThreshold?: number;
}

const COLORS = {
  background: '#0a0a0f',
  backgroundAlt: '#0f0f14',
  border: '#1f2937',
  text: '#9ca3af',
  textBright: '#f3f4f6',

  // Trade colors
  buy: '#22c55e',
  buyBg: 'rgba(34, 197, 94, 0.15)',
  buyLarge: '#4ade80',
  buyLargeBg: 'rgba(34, 197, 94, 0.35)',

  sell: '#ef4444',
  sellBg: 'rgba(239, 68, 68, 0.15)',
  sellLarge: '#f87171',
  sellLargeBg: 'rgba(239, 68, 68, 0.35)',

  // Special
  aggressive: '#f59e0b',
  neutral: '#6b7280',
};

export default memo(function TimeSales({
  height = 400,
  width = 250,
  maxTrades = 100,
  largeThreshold = 1,
}: TimeSalesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'large' | 'buys' | 'sells'>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState({ buyVol: 0, sellVol: 0, trades: 0 });

  const { symbol } = useMarketStore();
  const lastPriceRef = useRef<number>(0);

  // Subscribe to trades
  useEffect(() => {
    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeTrades(
      symbol,
      (trade) => {
        if (isPaused) return;

        const side = trade.isBuyerMaker ? 'sell' : 'buy';
        const isLarge = trade.quantity >= largeThreshold;

        // Detect aggressive trades (price moves in direction of trade)
        const priceChange = trade.price - lastPriceRef.current;
        const isAggressive = (side === 'buy' && priceChange > 0) ||
                            (side === 'sell' && priceChange < 0);
        lastPriceRef.current = trade.price;

        const entry: TradeEntry = {
          id: trade.id,
          price: trade.price,
          size: trade.quantity,
          side,
          time: trade.time,
          isLarge,
          isAggressive,
        };

        setTrades(prev => [entry, ...prev].slice(0, maxTrades));

        // Update stats
        setStats(prev => ({
          buyVol: prev.buyVol + (side === 'buy' ? trade.quantity : 0),
          sellVol: prev.sellVol + (side === 'sell' ? trade.quantity : 0),
          trades: prev.trades + 1,
        }));
      },
      'linear'
    );

    return () => unsubscribe();
  }, [symbol, isPaused, largeThreshold, maxTrades]);

  // Filter trades
  const filteredTrades = trades.filter(t => {
    if (filter === 'large') return t.isLarge;
    if (filter === 'buys') return t.side === 'buy';
    if (filter === 'sells') return t.side === 'sell';
    return true;
  });

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(d.getMilliseconds() / 100)}`;
  };

  const formatSize = (size: number) => {
    if (size >= 1000) return `${(size / 1000).toFixed(2)}K`;
    return size.toFixed(size >= 1 ? 2 : 4);
  };

  const resetStats = () => {
    setStats({ buyVol: 0, sellVol: 0, trades: 0 });
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{ width, height, background: COLORS.background }}
    >
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-zinc-800 bg-[#0f0f14]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-zinc-300">Time & Sales</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`px-1.5 py-0.5 text-[10px] rounded ${
                isPaused
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {isPaused ? '▶' : '⏸'}
            </button>
            <button
              onClick={resetStats}
              className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:text-white"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1">
          {(['all', 'large', 'buys', 'sells'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${
                filter === f
                  ? f === 'buys' ? 'bg-green-600 text-white'
                  : f === 'sells' ? 'bg-red-600 text-white'
                  : 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-500 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-green-400">B: {formatSize(stats.buyVol)}</span>
          <span className="text-red-400">S: {formatSize(stats.sellVol)}</span>
        </div>
        <span className="text-zinc-500">#{stats.trades}</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-2 py-1 border-b border-zinc-800 text-[9px] text-zinc-500 uppercase">
        <span className="w-16">Time</span>
        <span className="w-16 text-right">Price</span>
        <span className="w-14 text-right">Size</span>
        <span className="flex-1 text-right">Side</span>
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
        {filteredTrades.map((trade, idx) => {
          const isBuy = trade.side === 'buy';
          const bgColor = trade.isLarge
            ? (isBuy ? COLORS.buyLargeBg : COLORS.sellLargeBg)
            : (isBuy ? COLORS.buyBg : COLORS.sellBg);
          const textColor = trade.isLarge
            ? (isBuy ? COLORS.buyLarge : COLORS.sellLarge)
            : (isBuy ? COLORS.buy : COLORS.sell);

          return (
            <div
              key={`${trade.id}-${idx}`}
              className="flex items-center px-2 py-0.5 border-b border-zinc-900 transition-colors"
              style={{
                background: bgColor,
                animation: idx === 0 ? 'fadeIn 0.2s ease-out' : undefined,
              }}
            >
              <span className="w-16 text-[10px] text-zinc-500 font-mono">
                {formatTime(trade.time)}
              </span>
              <span
                className="w-16 text-[11px] font-mono font-medium text-right"
                style={{ color: textColor }}
              >
                {trade.price.toFixed(2)}
              </span>
              <span
                className={`w-14 text-[11px] font-mono text-right ${
                  trade.isLarge ? 'font-bold' : ''
                }`}
                style={{ color: textColor }}
              >
                {formatSize(trade.size)}
              </span>
              <div className="flex-1 flex items-center justify-end gap-1">
                {trade.isAggressive && (
                  <span className="text-[8px] text-yellow-400">⚡</span>
                )}
                {trade.isLarge && (
                  <span className="text-[8px] text-purple-400">🐋</span>
                )}
                <span
                  className="text-[10px] font-medium"
                  style={{ color: textColor }}
                >
                  {isBuy ? 'BUY' : 'SELL'}
                </span>
              </div>
            </div>
          );
        })}

        {filteredTrades.length === 0 && (
          <div className="flex items-center justify-center h-20 text-zinc-600 text-xs">
            Waiting for trades...
          </div>
        )}
      </div>

      {/* Delta bar at bottom */}
      <div className="px-2 py-1.5 border-t border-zinc-800 bg-[#0f0f14]">
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{
              width: `${stats.buyVol + stats.sellVol > 0
                ? (stats.buyVol / (stats.buyVol + stats.sellVol)) * 100
                : 50}%`
            }}
          />
          <div
            className="h-full bg-red-500 transition-all duration-300"
            style={{
              width: `${stats.buyVol + stats.sellVol > 0
                ? (stats.sellVol / (stats.buyVol + stats.sellVol)) * 100
                : 50}%`
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px]">
          <span className="text-green-400">
            {stats.buyVol + stats.sellVol > 0
              ? ((stats.buyVol / (stats.buyVol + stats.sellVol)) * 100).toFixed(0)
              : 50}%
          </span>
          <span className="text-zinc-500">Delta</span>
          <span className="text-red-400">
            {stats.buyVol + stats.sellVol > 0
              ? ((stats.sellVol / (stats.buyVol + stats.sellVol)) * 100).toFixed(0)
              : 50}%
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
