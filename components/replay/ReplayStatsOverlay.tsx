'use client';

import type { ReplayState } from '@/lib/replay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import { formatTime } from './utils';

interface ReplayStatsOverlayProps {
  state: ReplayState;
}

export default function ReplayStatsOverlay({ state }: ReplayStatsOverlayProps) {
  const { statsMinimized, toggleStatsMinimized } = useReplayUIStore();

  if (state.status === 'idle') return null;

  const elapsed = state.currentTime > 0 && state.startTime > 0
    ? state.currentTime - state.startTime
    : 0;
  const elapsedSec = Math.floor(elapsed / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedS = elapsedSec % 60;
  const elapsedStr = elapsedMin > 0
    ? `${elapsedMin}m ${elapsedS}s`
    : `${elapsedS}s`;

  if (statsMinimized) {
    return (
      <button
        onClick={toggleStatsMinimized}
        className="absolute top-3 right-3 z-20 glass rounded-lg px-2.5 py-1.5 text-[10px] font-mono transition-all hover:scale-105"
        style={{ border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}
      >
        {state.tradeFedCount}/{state.totalTrades}
      </button>
    );
  }

  return (
    <div
      className="absolute top-3 right-3 z-20 glass rounded-xl p-3 animate-fadeIn cursor-pointer"
      style={{ border: '1px solid var(--glass-border)', minWidth: '140px' }}
      onClick={toggleStatsMinimized}
      title="Click to minimize"
    >
      <div className="space-y-1.5">
        {/* Trades */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Trades</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
            {state.tradeFedCount.toLocaleString()} / {state.totalTrades.toLocaleString()}
          </span>
        </div>

        {/* Elapsed */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Elapsed</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {elapsedStr}
          </span>
        </div>

        {/* Time */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Time</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(state.currentTime)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Speed</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--primary)' }}>
            {state.speed}x
          </span>
        </div>
      </div>
    </div>
  );
}
