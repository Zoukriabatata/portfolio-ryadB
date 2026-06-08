'use client';

import { useLiveAgent } from '@/hooks/useLiveAgent';
import { useValueFlash } from '@/lib/ui/useValueFlash';

// ── Bias color helpers ────────────────────────────────────────────────────────

const BIAS_STYLES = {
  LONG:    { dot: 'bg-[var(--bull)]',    text: 'text-[var(--bull)]',    label: 'LONG' },
  SHORT:   { dot: 'bg-[var(--bear)]',    text: 'text-[var(--bear)]',    label: 'SHORT' },
  NEUTRAL: { dot: 'bg-[var(--warning)]', text: 'text-[var(--warning)]', label: 'NEUT' },
} as const;

const STATUS_DOT: Record<string, string> = {
  live:         'bg-[var(--accent)]',
  connecting:   'bg-[var(--warning)] animate-pulse',
  reconnecting: 'bg-[var(--warning)] animate-pulse',
  offline:      'bg-[var(--bear)]',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveSignalBadge() {
  const { signal, status } = useLiveAgent({ interval: 3000, historyLen: 5 });

  const bias   = signal?.bias ?? 'NEUTRAL';
  const conf   = signal ? Math.round(signal.confidence * 100) : null;
  const style  = BIAS_STYLES[bias];
  const biasFlash = useValueFlash(bias);

  // While not yet live and no signal, show a minimal connecting indicator
  if (!signal && status !== 'live') {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)]/60 border border-[var(--border)]">
        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT.offline}`} />
        <span className="text-[11px] font-medium text-[var(--text-muted)] hidden md:inline tracking-wide">
          AI
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)]/60 border border-[var(--border)] cursor-default select-none"
      title={signal ? `${signal.bias} — ${signal.reason}` : 'AI Agent'}
    >
      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status] ?? STATUS_DOT.offline}`} />

      {/* Bias label */}
      <span className={`text-[11px] font-bold tracking-wide ${style.text} ${biasFlash ? 'value-flash' : ''}`}>
        {style.label}
      </span>

      {/* Confidence */}
      {conf !== null && (
        <span className="text-[11px] text-[var(--text-muted)] font-medium tabular-nums hidden md:inline">
          {conf}%
        </span>
      )}

      {/* Gamma regime (short label) */}
      {signal?.gamma_regime && (
        <span className="text-[9px] text-[var(--text-muted)] hidden lg:inline opacity-70">
          {signal.gamma_regime === 'LONG_GAMMA'  ? 'LG' :
           signal.gamma_regime === 'SHORT_GAMMA' ? 'SG' : '≈F'}
        </span>
      )}
    </div>
  );
}
