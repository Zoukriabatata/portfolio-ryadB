'use client';

import type { PlaybookSetup } from '@/types/journal';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface PlaybookRankingProps {
  setups: PlaybookSetup[];
}

export default function PlaybookRanking({ setups }: PlaybookRankingProps) {
  if (setups.length < 2) return null;

  const sorted = [...setups]
    .filter(s => s.stats.tradeCount > 0)
    .sort((a, b) => b.stats.totalPnl - a.stats.totalPnl);

  if (sorted.length < 2) return null;

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-xl border border-[var(--bull)]/20 bg-[var(--bull)]/5 p-4">
        <p className="text-xs text-[var(--text-muted)] mb-1">Best Setup</p>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{best.name}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-lg font-bold font-mono text-[var(--bull)]">{formatCurrency(best.stats.totalPnl)}</span>
          <span className="text-xs text-[var(--text-muted)]">{best.stats.winRate}% WR</span>
          <span className="text-xs text-[var(--text-dimmed)]">{best.stats.tradeCount} trades</span>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--bear)]/20 bg-[var(--bear)]/5 p-4">
        <p className="text-xs text-[var(--text-muted)] mb-1">Worst Setup</p>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{worst.name}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-lg font-bold font-mono text-[var(--bear)]">{formatCurrency(worst.stats.totalPnl)}</span>
          <span className="text-xs text-[var(--text-muted)]">{worst.stats.winRate}% WR</span>
          <span className="text-xs text-[var(--text-dimmed)]">{worst.stats.tradeCount} trades</span>
        </div>
      </div>
    </div>
  );
}
