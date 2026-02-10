'use client';

import { useMemo } from 'react';
import { formatPrice as fmtPrice, formatVolume as fmtVolume } from '@/lib/utils/formatters';

interface PriceInfoBarProps {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  tickCount?: number;
  poc?: number;
  delta?: number;
  previousClose?: number;
  className?: string;
  // Price position indicator
  showPricePosition?: boolean;
  pricePositionColor?: string;
}

export function PriceInfoBar({
  symbol,
  open,
  high,
  low,
  close,
  volume,
  tickCount,
  poc,
  delta,
  previousClose,
  className = '',
  showPricePosition = true,
  pricePositionColor,
}: PriceInfoBarProps) {
  const priceChange = useMemo(() => {
    const ref = previousClose || open;
    const change = close - ref;
    const changePercent = ((change / ref) * 100);
    return { change, changePercent, isPositive: change >= 0 };
  }, [close, open, previousClose]);

  // Calculate price position within high-low range (0% = low, 100% = high)
  const pricePosition = useMemo(() => {
    if (high === low) return 50; // No range, default to middle
    const position = ((close - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, position));
  }, [close, high, low]);

  // Determine color based on position or use custom color
  const positionColor = useMemo(() => {
    if (pricePositionColor) return pricePositionColor;
    // Auto-color: red at bottom (0%), green at top (100%), yellow in middle
    if (pricePosition >= 66) return '#22c55e'; // Green (upper third)
    if (pricePosition >= 33) return '#eab308'; // Yellow (middle third)
    return '#ef4444'; // Red (lower third)
  }, [pricePosition, pricePositionColor]);

  const formatPrice = fmtPrice;
  const formatVolume = fmtVolume;

  return (
    <div className={`flex items-center gap-4 px-3 py-1.5 bg-[#0a0f0a]/80 backdrop-blur-sm rounded-lg border border-green-900/20 text-xs font-mono ${className}`}>
      {/* Symbol */}
      <span className="font-bold text-green-100">{symbol}</span>

      {/* Price Position Indicator */}
      {showPricePosition && (
        <>
          <div className="w-px h-4 bg-green-900/30" />
          <div className="flex items-center gap-2" title={`Price at ${pricePosition.toFixed(0)}% of range (High-Low)`}>
            {/* Position Square */}
            <div
              className="relative w-6 h-6 rounded border border-zinc-600/50 overflow-hidden"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              {/* Range bar (vertical) */}
              <div className="absolute inset-x-0 bottom-0 w-full transition-all duration-300" style={{
                height: `${pricePosition}%`,
                background: `linear-gradient(to top, ${positionColor}60, ${positionColor}20)`,
              }} />
              {/* Position indicator line */}
              <div
                className="absolute left-0 right-0 h-0.5 transition-all duration-300"
                style={{
                  bottom: `${pricePosition}%`,
                  backgroundColor: positionColor,
                  boxShadow: `0 0 4px ${positionColor}`,
                }}
              />
            </div>
            <span className="text-[10px]" style={{ color: positionColor }}>
              {pricePosition.toFixed(0)}%
            </span>
          </div>
        </>
      )}

      {/* OHLC */}
      <div className="flex items-center gap-2">
        <span className="text-green-500/60">O</span>
        <span className="text-green-200">{formatPrice(open)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-500/60">H</span>
        <span className="text-green-400">{formatPrice(high)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-500/60">L</span>
        <span className="text-red-400">{formatPrice(low)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-500/60">C</span>
        <span className={priceChange.isPositive ? 'text-green-400' : 'text-red-400'}>
          {formatPrice(close)}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-green-900/30" />

      {/* Change */}
      <div className={`flex items-center gap-1 ${priceChange.isPositive ? 'text-green-400' : 'text-red-400'}`}>
        <span>{priceChange.isPositive ? '+' : ''}{priceChange.change.toFixed(2)}</span>
        <span className="text-green-500/60">(</span>
        <span>{priceChange.isPositive ? '+' : ''}{priceChange.changePercent.toFixed(2)}%</span>
        <span className="text-green-500/60">)</span>
      </div>

      {/* Volume */}
      {volume !== undefined && (
        <>
          <div className="w-px h-4 bg-green-900/30" />
          <div className="flex items-center gap-2">
            <span className="text-green-500/60">Vol</span>
            <span className="text-green-200">{formatVolume(volume)}</span>
          </div>
        </>
      )}

      {/* Tick Count */}
      {tickCount !== undefined && (
        <>
          <div className="w-px h-4 bg-green-900/30" />
          <div className="flex items-center gap-2">
            <span className="text-green-500/60">Ticks</span>
            <span className="text-green-200">{tickCount}</span>
          </div>
        </>
      )}

      {/* POC */}
      {poc !== undefined && (
        <>
          <div className="w-px h-4 bg-green-900/30" />
          <div className="flex items-center gap-2">
            <span className="text-amber-500/80">POC</span>
            <span className="text-amber-400">{formatPrice(poc)}</span>
          </div>
        </>
      )}

      {/* Delta */}
      {delta !== undefined && (
        <>
          <div className="w-px h-4 bg-green-900/30" />
          <div className="flex items-center gap-2">
            <span className="text-green-500/60">Delta</span>
            <span className={delta >= 0 ? 'text-green-400' : 'text-red-400'}>
              {delta >= 0 ? '+' : ''}{formatVolume(delta)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
