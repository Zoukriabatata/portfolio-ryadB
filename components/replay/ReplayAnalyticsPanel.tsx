'use client';

import { useState, useMemo } from 'react';
import type { ReplayState } from '@/lib/replay/ReplayEngine';
import { formatDuration } from './utils';

interface ReplayAnalyticsPanelProps {
  state: ReplayState;
}

interface SimulatedTrade {
  id: number;
  time: number;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl: number;
}

export default function ReplayAnalyticsPanel({ state }: ReplayAnalyticsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Derive stats from replay state
  const stats = useMemo(() => {
    const elapsed = state.currentTime - state.startTime;
    const tradesPerMin = elapsed > 60000 ? (state.tradeFedCount / (elapsed / 60000)).toFixed(1) : '—';
    const progress = ((state.progress || 0) * 100).toFixed(1);

    return {
      elapsed,
      tradesFed: state.tradeFedCount,
      totalTrades: state.totalTrades,
      tradesPerMin,
      progress,
      depthSnapshots: state.totalDepthSnapshots,
      speed: state.speed,
    };
  }, [state]);

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        className="absolute bottom-20 right-3 z-20 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:brightness-110"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        Analytics ▸
      </button>
    );
  }

  return (
    <div className="absolute bottom-20 right-3 z-20 w-56 rounded-xl overflow-hidden animate-slideInRight"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Analytics
        </span>
        <button onClick={() => setCollapsed(true)}
          className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          ◂
        </button>
      </div>

      {/* Stats */}
      <div className="p-3 space-y-2 text-[10px]">
        {/* Progress */}
        <div>
          <div className="flex justify-between mb-1">
            <span style={{ color: 'var(--text-muted)' }}>Progress</span>
            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{stats.progress}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${stats.progress}%`,
              background: 'var(--primary)',
            }} />
          </div>
        </div>

        {/* Trade stats grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <StatRow label="Trades Fed" value={`${stats.tradesFed} / ${stats.totalTrades}`} />
          <StatRow label="Trades/min" value={stats.tradesPerMin} />
          <StatRow label="Elapsed" value={formatDuration(stats.elapsed)} />
          <StatRow label="Speed" value={`${stats.speed}x`} />
          <StatRow label="Depth Snaps" value={stats.depthSnapshots.toLocaleString()} />
        </div>

        {/* Volume analysis placeholder */}
        <div className="pt-1 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>Session</span>
            <span className="font-mono font-medium" style={{ color: 'var(--primary)' }}>
              {state.symbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}
