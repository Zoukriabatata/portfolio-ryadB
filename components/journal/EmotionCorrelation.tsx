'use client';

import { formatCurrency } from '@/lib/journal/chartUtils';

interface EmotionCorrelationProps {
  data: { emotion: string; pnl: number; count: number; winRate: number; key: string; profitFactor: number }[];
}

const EMOTION_COLORS: Record<string, string> = {
  Calm: '#3b82f6',
  Confident: '#22c55e',
  Disciplined: '#10b981',
  Anxious: '#f59e0b',
  FOMO: '#ef4444',
  Revenge: '#dc2626',
  Greedy: '#f97316',
};

export default function EmotionCorrelation({ data }: EmotionCorrelationProps) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Emotion vs Performance</p>
      <div className="space-y-2.5">
        {data.map((d) => (
          <div key={d.emotion} className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-24 shrink-0">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: EMOTION_COLORS[d.emotion] || '#888' }}
              />
              <span className="text-xs text-[var(--text-primary)] truncate">{d.emotion}</span>
            </div>
            <div className="flex-1 flex items-center gap-3">
              <span
                className="text-xs font-mono font-bold w-16 text-right"
                style={{ color: d.pnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}
              >
                {formatCurrency(d.pnl)}
              </span>
              <div className="flex-1 h-2 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${d.winRate}%`,
                    background: EMOTION_COLORS[d.emotion] || '#888',
                    opacity: 0.7,
                  }}
                />
              </div>
              <span className="text-xs text-[var(--text-dimmed)] w-10 text-right">{d.winRate}%</span>
              <span className="text-xs text-[var(--text-dimmed)] w-6 text-right">{d.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
