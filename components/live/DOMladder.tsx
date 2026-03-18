'use client';

import { useMemo } from 'react';
import type { DOMSnapshot, DOMLevel, Quote } from '@/stores/useLiveStore';

interface DOMladderProps {
  dom: DOMSnapshot | null;
  quote: Quote | null;
  tickSize?: number;
  /** Number of levels to show on each side */
  depth?: number;
}

// How wide the volume bar can stretch (percentage of panel)
const BAR_MAX_PCT = 70;

function formatSize(size: number): string {
  if (size >= 1_000) return `${(size / 1_000).toFixed(1)}k`;
  return String(size);
}

function formatPrice(price: number, tickSize: number): string {
  // Determine decimal places from tickSize
  const decimals = tickSize < 1 ? String(tickSize).split('.')[1]?.length ?? 2 : 0;
  return price.toFixed(decimals);
}

interface LevelRowProps {
  level: DOMLevel;
  maxSize: number;
  side: 'bid' | 'ask';
  isBest: boolean;
  tickSize: number;
}

function LevelRow({ level, maxSize, side, isBest, tickSize }: LevelRowProps) {
  const barPct = maxSize > 0 ? (level.size / maxSize) * BAR_MAX_PCT : 0;
  const isBid = side === 'bid';

  const barColor = isBid ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)';
  const bestBg = isBest
    ? isBid
      ? 'rgba(34,197,94,0.08)'
      : 'rgba(239,68,68,0.08)'
    : 'transparent';
  const priceColor = isBest
    ? isBid ? '#22c55e' : '#ef4444'
    : 'var(--text-primary)';

  return (
    <div
      className="relative flex items-center h-[22px] text-[11px] tabular-nums overflow-hidden cursor-default select-none"
      style={{
        backgroundColor: bestBg,
        borderLeft: isBest ? `2px solid ${isBid ? '#22c55e' : '#ef4444'}` : '2px solid transparent',
      }}
    >
      {/* Volume bar — grows from the side opposite the price */}
      <div
        className="absolute top-0 bottom-0 transition-all duration-100"
        style={{
          width: `${barPct}%`,
          backgroundColor: barColor,
          ...(isBid ? { right: 0 } : { left: 0 }),
        }}
      />

      {/* Content */}
      <div className="relative flex w-full px-2 gap-1">
        {isBid ? (
          <>
            <span className="flex-1 text-right" style={{ color: priceColor }}>
              {formatPrice(level.price, tickSize)}
            </span>
            <span className="w-14 text-right" style={{ color: '#22c55e' }}>
              {formatSize(level.size)}
            </span>
          </>
        ) : (
          <>
            <span className="w-14 text-left" style={{ color: '#ef4444' }}>
              {formatSize(level.size)}
            </span>
            <span className="flex-1 text-left" style={{ color: priceColor }}>
              {formatPrice(level.price, tickSize)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function DOMladder({ dom, quote, tickSize = 0.25, depth = 15 }: DOMladderProps) {
  // Slice to the requested depth, best price at innermost position
  const { asks, bids, spread, maxSize } = useMemo(() => {
    if (!dom) return { asks: [], bids: [], spread: null, maxSize: 1 };

    // offers are sorted ascending (best ask first) — we want to show top `depth` asks
    // with the best ask at the bottom (nearest the mid)
    const asks = [...dom.offers].slice(0, depth).reverse(); // reverse so best ask is last row (closest to mid)
    const bids = [...dom.bids].slice(0, depth);             // best bid first (top of bid section)

    const bestBid = dom.bids[0]?.price;
    const bestAsk = dom.offers[0]?.price;
    const spread = bestBid && bestAsk ? +(bestAsk - bestBid).toFixed(4) : null;

    const allSizes = [...dom.offers, ...dom.bids].map((l) => l.size);
    const maxSize = allSizes.length > 0 ? Math.max(...allSizes) : 1;

    return { asks, bids, spread, maxSize };
  }, [dom, depth]);

  const last = quote?.last;

  if (!dom) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
        Waiting for DOM data…
        <br />
        <span className="text-[10px] mt-1 opacity-60">Requires CME Level 2 subscription</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1 text-[10px] font-medium shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
      >
        <span>DOM</span>
        {spread !== null && (
          <span>
            Spread:{' '}
            <span style={{ color: 'var(--text-primary)' }}>
              {formatPrice(spread, tickSize)}
            </span>
          </span>
        )}
      </div>

      {/* Column headers */}
      <div
        className="flex px-2 py-0.5 text-[10px] shrink-0"
        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="w-14 text-left" style={{ color: '#ef444480' }}>Size</span>
        <span className="flex-1 text-center">Price</span>
        <span className="w-14 text-right" style={{ color: '#22c55e80' }}>Size</span>
      </div>

      {/* Ask levels — top half, best ask at the bottom */}
      <div className="flex flex-col justify-end flex-1 overflow-hidden">
        {asks.map((level, i) => (
          <LevelRow
            key={`ask-${level.price}`}
            level={level}
            maxSize={maxSize}
            side="ask"
            isBest={i === asks.length - 1}
            tickSize={tickSize}
          />
        ))}
      </div>

      {/* Mid price row */}
      <div
        className="flex items-center justify-center py-1 shrink-0 font-bold text-[13px] tabular-nums"
        style={{
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
        }}
      >
        {last != null ? formatPrice(last, tickSize) : '—'}
      </div>

      {/* Bid levels — bottom half, best bid at the top */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {bids.map((level, i) => (
          <LevelRow
            key={`bid-${level.price}`}
            level={level}
            maxSize={maxSize}
            side="bid"
            isBest={i === 0}
            tickSize={tickSize}
          />
        ))}
      </div>
    </div>
  );
}
