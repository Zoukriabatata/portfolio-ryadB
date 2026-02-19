'use client';

import { formatCurrency } from '@/lib/journal/chartUtils';

interface PerformanceBySetupProps {
  data: { setup: string; pnl: number; count: number; winRate: number; profitFactor: number; key: string }[];
}

export default function PerformanceBySetup({ data }: PerformanceBySetupProps) {
  if (data.length === 0) return null;

  const maxAbsPnl = Math.max(...data.map(d => Math.abs(d.pnl)), 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Performance by Setup</p>
      <div className="space-y-2">
        {data.map((d) => {
          const width = (Math.abs(d.pnl) / maxAbsPnl) * 100;
          const isPositive = d.pnl >= 0;

          return (
            <div key={d.setup} className="flex items-center gap-3">
              <span className="w-24 text-xs text-[var(--text-primary)] truncate shrink-0">{d.setup}</span>
              <div className="flex-1 h-5 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(width, 3)}%`,
                    background: isPositive ? 'var(--bull)' : 'var(--bear)',
                    opacity: 0.7,
                  }}
                />
              </div>
              <span
                className="w-16 text-right text-xs font-mono font-bold shrink-0"
                style={{ color: isPositive ? 'var(--bull)' : 'var(--bear)' }}
              >
                {formatCurrency(d.pnl)}
              </span>
              <span className="w-12 text-right text-xs text-[var(--text-dimmed)] shrink-0">
                {d.winRate}%
              </span>
              <span className="w-10 text-right text-xs text-[var(--text-dimmed)] shrink-0">
                PF {d.profitFactor >= 999 ? '∞' : d.profitFactor.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
