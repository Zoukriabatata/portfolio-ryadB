'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { useTrades } from '@/hooks/useTrades';

interface DeltaWidgetProps {
  historyLength?: number;
}

interface DeltaPoint {
  time: number;
  delta: number;
  cumulativeDelta: number;
}

export default memo(function DeltaWidget({ historyLength = 60 }: DeltaWidgetProps) {
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
      <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmed)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0122.56 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Real-time delta only available for Bybit symbols</span>
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
        <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-dimmed)' }}>Cumulative Delta</p>
        <p className="text-2xl font-mono font-bold" style={{ color: currentDelta > 0 ? 'var(--bull)' : currentDelta < 0 ? 'var(--bear)' : 'var(--text-muted)' }}>
          {currentDelta >= 0 ? '+' : ''}{currentDelta.toFixed(3)}
        </p>
      </div>

      {/* Mini Chart */}
      <div className="flex-1 min-h-[80px] relative rounded-lg overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
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
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />

            {/* Delta line */}
            <polyline
              fill="none"
              stroke={currentDelta >= 0 ? 'var(--bull)' : 'var(--bear)'}
              strokeWidth="1.5"
              points={points}
            />

            {/* Area fill */}
            <polygon
              fill={currentDelta >= 0 ? 'var(--bull-bg)' : 'var(--bear-bg)'}
              points={`0,${zeroY} ${points} 100,${zeroY}`}
            />
          </svg>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmed)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 4-6" />
            </svg>
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Waiting for data...</span>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2" style={{ background: 'var(--surface-elevated)' }}>
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Recent (10)</p>
          <p className="text-sm font-mono font-semibold" style={{ color: recentDelta > 0 ? 'var(--bull)' : recentDelta < 0 ? 'var(--bear)' : 'var(--text-muted)' }}>
            {recentDelta >= 0 ? '+' : ''}{recentDelta.toFixed(3)}
          </p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'var(--surface-elevated)' }}>
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>Range</p>
          <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
            {minDelta.toFixed(2)} / {maxDelta.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-xs mb-1">
          <span style={{ color: 'var(--bear)' }}>Selling</span>
          <span style={{ color: 'var(--text-dimmed)' }}>Flow</span>
          <span style={{ color: 'var(--bull)' }}>Buying</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-elevated)' }}>
          <div
            className="h-full transition-all"
            style={{ background: 'var(--bear)', width: `${Math.max(0, 50 - (recentDelta / (range || 1)) * 25)}%` }}
          />
          <div
            className="h-full transition-all"
            style={{ background: 'var(--bull)', width: `${Math.max(0, 50 + (recentDelta / (range || 1)) * 25)}%` }}
          />
        </div>
      </div>
    </div>
  );
});
