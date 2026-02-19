'use client';

import type { JournalMetrics } from '@/types/journal';

interface MetricsGridProps {
  metrics: JournalMetrics;
  streaks: { currentWin: number; currentLoss: number; maxWin: number; maxLoss: number };
  loading: boolean;
}

function MetricCard({ label, value, color, suffix }: { label: string; value: string | number; color?: string; suffix?: string }) {
  return (
    <div className="rounded-xl p-4 bg-[var(--surface)] border border-[var(--border)]">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-lg font-bold font-mono" style={{ color: color || 'var(--text-primary)' }}>
        {value}{suffix}
      </p>
    </div>
  );
}

export default function MetricsGrid({ metrics, streaks, loading }: MetricsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl p-4 bg-[var(--surface)] border border-[var(--border)] animate-pulse h-20" />
        ))}
      </div>
    );
  }

  const formatPf = (pf: number) => pf >= 999 ? '∞' : pf.toFixed(2);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard
        label="Profit Factor"
        value={formatPf(metrics.profitFactor)}
        color={metrics.profitFactor >= 1.5 ? 'var(--bull)' : metrics.profitFactor >= 1 ? 'var(--warning)' : 'var(--bear)'}
      />
      <MetricCard
        label="Sharpe Ratio"
        value={metrics.sharpeRatio.toFixed(2)}
        color={metrics.sharpeRatio >= 1 ? 'var(--bull)' : metrics.sharpeRatio >= 0 ? 'var(--warning)' : 'var(--bear)'}
      />
      <MetricCard
        label="Max Drawdown"
        value={`$${metrics.maxDrawdown.toFixed(0)}`}
        color="var(--bear)"
      />
      <MetricCard
        label="Expectancy"
        value={`$${metrics.expectancy.toFixed(2)}`}
        color={metrics.expectancy >= 0 ? 'var(--bull)' : 'var(--bear)'}
      />
      <MetricCard
        label="Avg R:R"
        value={metrics.avgRR.toFixed(2)}
        color={metrics.avgRR >= 1 ? 'var(--bull)' : 'var(--bear)'}
      />
      <MetricCard
        label="Best Trade"
        value={`+$${metrics.bestTrade.toFixed(0)}`}
        color="var(--bull)"
      />
      <MetricCard
        label="Worst Trade"
        value={`$${metrics.worstTrade.toFixed(0)}`}
        color="var(--bear)"
      />
      <MetricCard
        label="Streak"
        value={streaks.currentWin > 0 ? `${streaks.currentWin}W` : streaks.currentLoss > 0 ? `${streaks.currentLoss}L` : '—'}
        color={streaks.currentWin > 0 ? 'var(--bull)' : streaks.currentLoss > 0 ? 'var(--bear)' : undefined}
        suffix={` (max ${streaks.maxWin}W / ${streaks.maxLoss}L)`}
      />
    </div>
  );
}
