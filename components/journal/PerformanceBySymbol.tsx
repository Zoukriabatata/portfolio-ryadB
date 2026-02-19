'use client';

import { formatCurrency } from '@/lib/journal/chartUtils';

interface PerformanceBySymbolProps {
  data: { symbol: string; pnl: number; count: number; winRate: number; key: string; profitFactor: number }[];
}

export default function PerformanceBySymbol({ data }: PerformanceBySymbolProps) {
  if (data.length === 0) return null;

  const maxAbsPnl = Math.max(...data.map(d => Math.abs(d.pnl)), 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Performance by Symbol</p>
      <div className="space-y-2">
        {data.map((d) => {
          const width = (Math.abs(d.pnl) / maxAbsPnl) * 100;
          const isPositive = d.pnl >= 0;

          return (
            <div key={d.symbol} className="flex items-center gap-3">
              <span className="w-10 text-xs font-mono font-bold text-[var(--text-primary)] shrink-0">{d.symbol}</span>
              <div className="flex-1 h-5 bg-[var(--surface-elevated)] rounded-full overflow-hidden relative">
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
              <span className="w-8 text-right text-xs text-[var(--text-dimmed)] shrink-0">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
