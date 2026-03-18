'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { Trade } from '@/stores/useLiveStore';

interface LiveTapeProps {
  trades: Trade[];
  tickSize?: number;
  /** Auto-scroll to top when new trades arrive */
  autoScroll?: boolean;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatPrice(price: number, tickSize: number): string {
  const decimals = tickSize < 1 ? (String(tickSize).split('.')[1]?.length ?? 2) : 0;
  return price.toFixed(decimals);
}

function formatSize(size: number): string {
  return size >= 1000 ? `${(size / 1000).toFixed(1)}k` : String(size);
}

// Highlight large trades relative to recent average
const LARGE_TRADE_MULTIPLIER = 3;

interface TradeRowProps {
  trade: Trade;
  avgSize: number;
  tickSize: number;
}

function TradeRow({ trade, avgSize, tickSize }: TradeRowProps) {
  const isBuy = trade.side === 'buy';
  const isLarge = avgSize > 0 && trade.size >= avgSize * LARGE_TRADE_MULTIPLIER;

  const color = isBuy ? '#22c55e' : '#ef4444';
  const bgColor = isLarge
    ? isBuy
      ? 'rgba(34,197,94,0.12)'
      : 'rgba(239,68,68,0.12)'
    : 'transparent';

  return (
    <div
      className="flex items-center px-2 h-[19px] text-[11px] tabular-nums shrink-0 gap-2"
      style={{
        backgroundColor: bgColor,
        borderLeft: isLarge ? `2px solid ${color}` : '2px solid transparent',
      }}
    >
      {/* Side indicator */}
      <span
        className="w-2 text-center font-bold"
        style={{ color, fontSize: 9 }}
      >
        {isBuy ? '▲' : '▼'}
      </span>

      {/* Price */}
      <span className="flex-1 font-medium" style={{ color }}>
        {formatPrice(trade.price, tickSize)}
      </span>

      {/* Size */}
      <span
        className="w-10 text-right"
        style={{ color: isLarge ? color : 'var(--text-secondary)', fontWeight: isLarge ? 700 : 400 }}
      >
        {formatSize(trade.size)}
      </span>

      {/* Time */}
      <span className="w-14 text-right" style={{ color: 'var(--text-muted)' }}>
        {formatTime(trade.time)}
      </span>
    </div>
  );
}

export function LiveTape({ trades, tickSize = 0.25, autoScroll = true }: LiveTapeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(trades.length);

  // Auto-scroll when new trades arrive (only if user is already at the top)
  useEffect(() => {
    if (!autoScroll) return;
    if (trades.length !== prevLengthRef.current) {
      prevLengthRef.current = trades.length;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [trades.length, autoScroll]);

  // Running delta (cumulative buy - sell volume from visible trades)
  const { cumulativeDelta, avgSize } = useMemo(() => {
    let buyVol = 0;
    let sellVol = 0;
    let totalSize = 0;

    for (const t of trades) {
      totalSize += t.size;
      if (t.side === 'buy') buyVol += t.size;
      else sellVol += t.size;
    }

    return {
      cumulativeDelta: buyVol - sellVol,
      avgSize: trades.length > 0 ? totalSize / trades.length : 0,
    };
  }, [trades]);

  const deltaColor = cumulativeDelta >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1 text-[10px] font-medium shrink-0"
        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span>Time & Sales</span>
        <span>
          Δ{' '}
          <span className="font-bold" style={{ color: deltaColor }}>
            {cumulativeDelta >= 0 ? '+' : ''}
            {cumulativeDelta.toLocaleString()}
          </span>
        </span>
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-2 py-0.5 text-[10px] gap-2 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span className="w-2" />
        <span className="flex-1">Price</span>
        <span className="w-10 text-right">Size</span>
        <span className="w-14 text-right">Time</span>
      </div>

      {/* Trade list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'thin' }}
      >
        {trades.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            Waiting for trades…
          </div>
        ) : (
          trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} avgSize={avgSize} tickSize={tickSize} />
          ))
        )}
      </div>
    </div>
  );
}
