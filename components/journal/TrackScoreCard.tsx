'use client';

import { useMemo } from 'react';
import { computeTrackScore, type TrackScoreBreakdown } from '@/lib/journal/TrackScore';
import type { JournalAnalytics, JournalEntry } from '@/types/journal';

interface TrackScoreCardProps {
  analytics: JournalAnalytics;
  entries: JournalEntry[];
  loading?: boolean;
}

const METRICS: { key: keyof TrackScoreBreakdown; label: string; max: number }[] = [
  { key: 'winRate', label: 'Win Rate', max: 25 },
  { key: 'profitFactor', label: 'Profit Factor', max: 20 },
  { key: 'avgRR', label: 'Risk:Reward', max: 15 },
  { key: 'maxDrawdown', label: 'Drawdown Control', max: 15 },
  { key: 'consistency', label: 'Consistency', max: 10 },
  { key: 'management', label: 'Position Mgmt', max: 10 },
  { key: 'discipline', label: 'Discipline', max: 5 },
];

export default function TrackScoreCard({ analytics, entries, loading }: TrackScoreCardProps) {
  const score = useMemo(
    () => computeTrackScore(analytics, entries),
    [analytics, entries]
  );

  if (loading) {
    return (
      <div className="rounded-xl p-4 animate-pulse"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="h-6 w-32 rounded bg-[var(--border)] mb-3" />
        <div className="h-24 rounded bg-[var(--border)]" />
      </div>
    );
  }

  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference * (1 - score.total / 100);

  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        Track Score
      </div>

      <div className="flex gap-4 items-start">
        {/* Circular gauge */}
        <div className="relative flex-shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)"
              strokeWidth="6" opacity="0.3" />
            {/* Score arc */}
            <circle cx="50" cy="50" r="42" fill="none"
              stroke={score.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color: score.color }}>
              {score.total}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>/ 100</span>
          </div>
        </div>

        {/* Metric bars */}
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="text-[10px] font-medium mb-1" style={{ color: score.color }}>
            {score.label}
          </div>
          {METRICS.map(({ key, label, max }) => {
            const value = score[key] as number;
            const pct = max > 0 ? (value / max) * 100 : 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[9px] w-20 truncate" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444',
                    }} />
                </div>
                <span className="text-[9px] font-mono w-8 text-right" style={{ color: 'var(--text-secondary)' }}>
                  {value}/{max}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
