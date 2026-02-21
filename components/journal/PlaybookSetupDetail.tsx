'use client';

import { useState, useEffect } from 'react';
import { throttledFetch } from '@/lib/api/throttledFetch';
import type { PlaybookSetup, JournalEntry } from '@/types/journal';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface PlaybookSetupDetailProps {
  setup: PlaybookSetup;
  onClose: () => void;
  onEdit: (setup: PlaybookSetup) => void;
}

export default function PlaybookSetupDetail({ setup, onClose, onEdit }: PlaybookSetupDetailProps) {
  const [trades, setTrades] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await throttledFetch(`/api/journal/playbook/${setup.id}`);
        if (res.ok) {
          const data = await res.json();
          setTrades(data.setup.journalEntries || []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [setup.id]);

  const formatPf = (pf: number) => pf >= 999 ? '∞' : pf.toFixed(2);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      style={{ zIndex: 'var(--z-modal, 400)' }}
      onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] bg-[var(--surface-elevated)] border border-[var(--border-light)] rounded-2xl shadow-xl flex flex-col animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{setup.name}</h2>
            {setup.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{setup.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onEdit(setup)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--surface)] transition-colors">
              Edit
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-5 gap-3">
            <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
              <p className="text-[10px] text-[var(--text-dimmed)]">Win Rate</p>
              <p className="text-lg font-bold font-mono" style={{ color: setup.stats.winRate >= 50 ? 'var(--bull)' : 'var(--bear)' }}>
                {setup.stats.winRate}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
              <p className="text-[10px] text-[var(--text-dimmed)]">Total P&L</p>
              <p className="text-lg font-bold font-mono" style={{ color: setup.stats.totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {formatCurrency(setup.stats.totalPnl)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
              <p className="text-[10px] text-[var(--text-dimmed)]">Avg P&L</p>
              <p className="text-lg font-bold font-mono" style={{ color: setup.stats.avgPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {formatCurrency(setup.stats.avgPnl)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
              <p className="text-[10px] text-[var(--text-dimmed)]">Profit Factor</p>
              <p className="text-lg font-bold font-mono text-[var(--text-primary)]">{formatPf(setup.stats.profitFactor)}</p>
            </div>
            <div className="p-3 rounded-lg bg-[var(--surface)] text-center">
              <p className="text-[10px] text-[var(--text-dimmed)]">Trades</p>
              <p className="text-lg font-bold font-mono text-[var(--text-primary)]">{setup.stats.tradeCount}</p>
            </div>
          </div>

          {/* Rules */}
          {setup.rules.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Rules / Checklist</p>
              <div className="space-y-1">
                {setup.rules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--surface)]">
                    <span className="text-xs text-[var(--primary)] mt-0.5">•</span>
                    <span className="text-xs text-[var(--text-secondary)]">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked trades */}
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Recent Trades</p>
            {loading ? (
              <p className="text-xs text-[var(--text-dimmed)]">Loading...</p>
            ) : trades.length === 0 ? (
              <p className="text-xs text-[var(--text-dimmed)]">No trades linked to this setup yet</p>
            ) : (
              <div className="space-y-1">
                {trades.map((trade) => (
                  <div key={trade.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--surface)]">
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(trade.entryTime).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{trade.symbol}</span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: trade.side === 'LONG' ? 'var(--bull-bg, rgba(34,197,94,0.15))' : 'var(--bear-bg, rgba(239,68,68,0.15))',
                        color: trade.side === 'LONG' ? 'var(--bull)' : 'var(--bear)',
                      }}
                    >
                      {trade.side}
                    </span>
                    <span className="flex-1" />
                    <span
                      className="text-xs font-bold font-mono"
                      style={{ color: (trade.pnl || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}
                    >
                      {trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
