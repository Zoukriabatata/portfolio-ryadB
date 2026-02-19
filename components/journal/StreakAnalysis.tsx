'use client';

interface StreakAnalysisProps {
  streaks: { currentWin: number; currentLoss: number; maxWin: number; maxLoss: number };
}

export default function StreakAnalysis({ streaks }: StreakAnalysisProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">Streak Analysis</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 rounded-lg bg-[var(--surface-elevated)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Current</p>
          <p className="text-xl font-bold font-mono" style={{
            color: streaks.currentWin > 0 ? 'var(--bull)' : streaks.currentLoss > 0 ? 'var(--bear)' : 'var(--text-dimmed)'
          }}>
            {streaks.currentWin > 0 ? `${streaks.currentWin}W` : streaks.currentLoss > 0 ? `${streaks.currentLoss}L` : '—'}
          </p>
        </div>
        <div className="text-center p-3 rounded-lg bg-[var(--surface-elevated)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Max Win</p>
          <p className="text-xl font-bold font-mono text-[var(--bull)]">{streaks.maxWin}W</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-[var(--surface-elevated)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Max Loss</p>
          <p className="text-xl font-bold font-mono text-[var(--bear)]">{streaks.maxLoss}L</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-[var(--surface-elevated)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">Avg Win/Avg Loss</p>
          <p className="text-sm font-mono text-[var(--text-primary)]">
            {streaks.maxWin > 0 && streaks.maxLoss > 0
              ? (streaks.maxWin / streaks.maxLoss).toFixed(1)
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
