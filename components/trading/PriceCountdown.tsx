'use client';

/**
 * PRICE COUNTDOWN
 * Shows a countdown timer until the current candle closes
 * Based on the selected timeframe
 */

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { usePageActive } from '@/hooks/usePageActive';

interface PriceCountdownProps {
  timeframeSeconds: number;
  className?: string;
}

export default function PriceCountdown({ timeframeSeconds, className = '' }: PriceCountdownProps) {
  const [countdown, setCountdown] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const isActive = usePageActive();

  useEffect(() => {
    if (!isActive) return;

    const updateCountdown = () => {
      const now = Date.now();
      const currentCandleStart = Math.floor(now / (timeframeSeconds * 1000)) * timeframeSeconds * 1000;
      const nextCandleStart = currentCandleStart + timeframeSeconds * 1000;
      const remaining = nextCandleStart - now;

      // Calculate progress (0-100%)
      const elapsed = now - currentCandleStart;
      const progressPercent = (elapsed / (timeframeSeconds * 1000)) * 100;
      setProgress(progressPercent);

      // Format countdown
      const seconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds % 60}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [timeframeSeconds, isActive]);

  // Get color based on remaining time (brand tokens — warning as candle nears close)
  const getColor = () => {
    if (progress > 90) return 'var(--bear)';    // closing imminently
    if (progress > 75) return 'var(--warning)'; // approaching
    return 'var(--bull)';                       // healthy
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Circular progress indicator */}
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 36 36">
          {/* Background circle */}
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          {/* Progress circle */}
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={getColor()}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${progress * 0.94} 100`}
            style={{
              transition: 'stroke-dasharray 0.1s linear, stroke 0.3s ease',
            }}
          />
        </svg>
        {/* Center icon */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: getColor() }}
        >
          <Clock size={12} strokeWidth={1.5} />
        </div>
      </div>

      {/* Countdown text */}
      <div className="flex flex-col">
        <span className="text-[9px] uppercase" style={{ color: 'var(--text-muted)' }}>Next candle</span>
        <span
          className="text-sm font-mono font-bold tabular-nums"
          style={{ color: getColor() }}
        >
          {countdown}
        </span>
      </div>
    </div>
  );
}

// Compact version for inline display
export function PriceCountdownCompact({ timeframeSeconds }: { timeframeSeconds: number }) {
  const [countdown, setCountdown] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const isActive = usePageActive();

  useEffect(() => {
    if (!isActive) return;

    const updateCountdown = () => {
      const now = Date.now();
      const currentCandleStart = Math.floor(now / (timeframeSeconds * 1000)) * timeframeSeconds * 1000;
      const nextCandleStart = currentCandleStart + timeframeSeconds * 1000;
      const remaining = nextCandleStart - now;

      const elapsed = now - currentCandleStart;
      const progressPercent = (elapsed / (timeframeSeconds * 1000)) * 100;
      setProgress(progressPercent);

      const seconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        setCountdown(`${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      } else {
        setCountdown(`${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [timeframeSeconds, isActive]);

  // Brand token triplet driving solid + derived translucent fills.
  const rgbVar =
    progress > 90 ? '--bear-rgb' :
    progress > 75 ? '--warning-rgb' :
    '--bull-rgb';
  const solid = `rgb(var(${rgbVar}))`;

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{
        backgroundColor: `rgb(var(${rgbVar}) / 0.08)`,
        border: `1px solid rgb(var(${rgbVar}) / 0.2)`,
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: solid }}
      />
      <span
        className="text-[11px] font-mono font-bold tabular-nums"
        style={{ color: solid }}
      >
        {countdown}
      </span>
    </div>
  );
}
