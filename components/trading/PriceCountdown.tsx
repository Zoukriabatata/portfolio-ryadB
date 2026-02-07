'use client';

/**
 * PRICE COUNTDOWN
 * Shows a countdown timer until the current candle closes
 * Based on the selected timeframe
 */

import { useState, useEffect } from 'react';

interface PriceCountdownProps {
  timeframeSeconds: number;
  className?: string;
}

export default function PriceCountdown({ timeframeSeconds, className = '' }: PriceCountdownProps) {
  const [countdown, setCountdown] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
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
    const interval = setInterval(updateCountdown, 100); // Update every 100ms for smooth progress

    return () => clearInterval(interval);
  }, [timeframeSeconds]);

  // Get color based on remaining time
  const getColor = () => {
    if (progress > 90) return '#ef4444'; // Red when almost closing
    if (progress > 75) return '#f59e0b'; // Orange
    return '#22c55e'; // Green
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
            stroke="rgba(255,255,255,0.1)"
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
          className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
          style={{ color: getColor() }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
      </div>

      {/* Countdown text */}
      <div className="flex flex-col">
        <span className="text-[9px] text-zinc-500 uppercase">Next candle</span>
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

  useEffect(() => {
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
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [timeframeSeconds]);

  const getColor = () => {
    if (progress > 90) return '#ef4444';
    if (progress > 75) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{
        backgroundColor: `${getColor()}15`,
        border: `1px solid ${getColor()}30`,
      }}
    >
      <div
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: getColor() }}
      />
      <span
        className="text-[11px] font-mono font-bold tabular-nums"
        style={{ color: getColor() }}
      >
        {countdown}
      </span>
    </div>
  );
}
