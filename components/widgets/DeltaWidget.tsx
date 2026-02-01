'use client';

import { useEffect, useRef, useState } from 'react';
import { useTrades } from '@/hooks/useTrades';

interface DeltaWidgetProps {
  historyLength?: number;
}

interface DeltaPoint {
  time: number;
  delta: number;
  cumulativeDelta: number;
}

export default function DeltaWidget({ historyLength = 60 }: DeltaWidgetProps) {
  const { trades, isLive } = useTrades();
  const [deltaHistory, setDeltaHistory] = useState<DeltaPoint[]>([]);
  const lastProcessedIndex = useRef(0);

  // Process new trades and update delta history
  useEffect(() => {
    if (trades.length === 0) return;

    // Process only new trades
    const newTrades = trades.slice(lastProcessedIndex.current);
    if (newTrades.length === 0) return;

    setDeltaHistory((prev) => {
      let history = [...prev];
      let cumDelta = history.length > 0 ? history[history.length - 1].cumulativeDelta : 0;

      newTrades.forEach((trade) => {
        // Delta: positive for buys (taker buys), negative for sells (taker sells)
        const tradeDelta = trade.isBuyerMaker ? -trade.quantity : trade.quantity;
        cumDelta += tradeDelta;

        history.push({
          time: trade.time,
          delta: tradeDelta,
          cumulativeDelta: cumDelta,
        });
      });

      // Keep only recent history
      if (history.length > historyLength) {
        history = history.slice(-historyLength);
      }

      return history;
    });

    lastProcessedIndex.current = trades.length;
  }, [trades, historyLength]);

  // Reset when symbol changes
  useEffect(() => {
    setDeltaHistory([]);
    lastProcessedIndex.current = 0;
  }, [isLive]);

  if (!isLive) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Real-time delta only available for Bybit symbols
      </div>
    );
  }

  // Calculate stats
  const currentDelta = deltaHistory.length > 0
    ? deltaHistory[deltaHistory.length - 1].cumulativeDelta
    : 0;

  const maxDelta = deltaHistory.length > 0
    ? Math.max(...deltaHistory.map(d => d.cumulativeDelta))
    : 0;

  const minDelta = deltaHistory.length > 0
    ? Math.min(...deltaHistory.map(d => d.cumulativeDelta))
    : 0;

  // Recent delta (last 10 trades)
  const recentDelta = deltaHistory.slice(-10).reduce((sum, d) => sum + d.delta, 0);

  // Calculate chart points
  const chartHeight = 80;
  const range = Math.max(Math.abs(maxDelta), Math.abs(minDelta), 0.001);
  const points = deltaHistory.map((d, i) => {
    const x = (i / Math.max(deltaHistory.length - 1, 1)) * 100;
    const y = ((range - d.cumulativeDelta) / (range * 2)) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const zeroY = (range / (range * 2)) * chartHeight;

  return (
    <div className="h-full flex flex-col">
      {/* Cumulative Delta */}
      <div className="text-center mb-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Cumulative Delta</p>
        <p className={`text-2xl font-mono font-bold ${
          currentDelta > 0 ? 'text-emerald-400' :
          currentDelta < 0 ? 'text-red-400' :
          'text-zinc-400'
        }`}>
          {currentDelta >= 0 ? '+' : ''}{currentDelta.toFixed(3)}
        </p>
      </div>

      {/* Mini Chart */}
      <div className="flex-1 min-h-[80px] relative bg-zinc-800/30 rounded-lg overflow-hidden">
        {deltaHistory.length > 1 ? (
          <svg
            viewBox={`0 0 100 ${chartHeight}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Zero line */}
            <line
              x1="0"
              y1={zeroY}
              x2="100"
              y2={zeroY}
              stroke="#52525b"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />

            {/* Delta line */}
            <polyline
              fill="none"
              stroke={currentDelta >= 0 ? '#34d399' : '#f87171'}
              strokeWidth="1.5"
              points={points}
            />

            {/* Area fill */}
            <polygon
              fill={currentDelta >= 0 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)'}
              points={`0,${zeroY} ${points} 100,${zeroY}`}
            />
          </svg>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs">
            Waiting for data...
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <p className="text-xs text-zinc-500">Recent (10)</p>
          <p className={`text-sm font-mono font-semibold ${
            recentDelta > 0 ? 'text-emerald-400' :
            recentDelta < 0 ? 'text-red-400' :
            'text-zinc-400'
          }`}>
            {recentDelta >= 0 ? '+' : ''}{recentDelta.toFixed(3)}
          </p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <p className="text-xs text-zinc-500">Range</p>
          <p className="text-sm font-mono text-zinc-400">
            {minDelta.toFixed(2)} / {maxDelta.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-red-400">Selling</span>
          <span className="text-zinc-500">Flow</span>
          <span className="text-emerald-400">Buying</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
            style={{ width: `${Math.max(0, 50 - (recentDelta / (range || 1)) * 25)}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
            style={{ width: `${Math.max(0, 50 + (recentDelta / (range || 1)) * 25)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
