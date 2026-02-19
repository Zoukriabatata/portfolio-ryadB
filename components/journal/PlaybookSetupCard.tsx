'use client';

import type { PlaybookSetup } from '@/types/journal';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface PlaybookSetupCardProps {
  setup: PlaybookSetup;
  onEdit: (setup: PlaybookSetup) => void;
  onDelete: (id: string) => void;
  onClick: (setup: PlaybookSetup) => void;
}

export default function PlaybookSetupCard({ setup, onEdit, onDelete, onClick }: PlaybookSetupCardProps) {
  const formatPf = (pf: number) => pf >= 999 ? '∞' : pf.toFixed(2);

  return (
    <div
      onClick={() => onClick(setup)}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 cursor-pointer hover:border-[var(--primary)]/50 transition-all hover:-translate-y-0.5 group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
            {setup.name}
          </h3>
          {setup.description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{setup.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEdit(setup)}
            className="p-1 rounded text-[var(--text-dimmed)] hover:text-[var(--primary)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(setup.id)}
            className="p-1 rounded text-[var(--text-dimmed)] hover:text-[var(--error)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatItem label="Win Rate" value={`${setup.stats.winRate}%`} color={setup.stats.winRate >= 50 ? 'var(--bull)' : 'var(--bear)'} />
        <StatItem label="P&L" value={formatCurrency(setup.stats.totalPnl)} color={setup.stats.totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)'} />
        <StatItem label="Profit Factor" value={formatPf(setup.stats.profitFactor)} color={setup.stats.profitFactor >= 1 ? 'var(--bull)' : 'var(--bear)'} />
        <StatItem label="Trades" value={String(setup.stats.tradeCount)} />
      </div>

      {/* Rules preview */}
      {setup.rules.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--text-dimmed)] mb-1">{setup.rules.length} rules</p>
          <p className="text-xs text-[var(--text-muted)] truncate">{setup.rules[0]}</p>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-2 rounded-lg bg-[var(--surface-elevated)]">
      <p className="text-[10px] text-[var(--text-dimmed)]">{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
    </div>
  );
}
