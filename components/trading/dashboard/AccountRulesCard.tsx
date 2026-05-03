'use client';

import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';
import {
  useAccountRulesStore,
  ruleProgress,
  type AccountState,
} from '@/stores/useAccountRulesStore';

const STATE_STYLES: Record<AccountState, { label: string; bg: string; color: string; pulse: boolean }> = {
  ACTIVE:  { label: 'ACTIVE',  bg: 'rgba(16,185,129,0.18)', color: '#10b981', pulse: false },
  WARNING: { label: 'WARNING', bg: 'rgba(251,191,36,0.18)', color: '#fbbf24', pulse: true  },
  LOCKED:  { label: 'LOCKED',  bg: 'rgba(239,68,68,0.18)',  color: '#ef4444', pulse: true  },
  PASSED:  { label: 'PASSED',  bg: 'rgba(168,85,247,0.18)', color: '#a78bfa', pulse: false },
};

interface AccountRulesCardProps {
  onConfigure?: () => void;
}

/**
 * Account Rules — Topstep / Apex-style risk display.
 *
 * Three vertical progress bars showing Daily Loss, Max Drawdown and
 * Profit Target consumption. Account state badge at top updates live as
 * the trading store fires `evaluate()` on each price tick.
 */
export default function AccountRulesCard({ onConfigure }: AccountRulesCardProps) {
  const { connections, activeBroker, positions } = useTradingStore(
    useShallow(s => ({
      connections:  s.connections,
      activeBroker: s.activeBroker,
      positions:    s.positions,
    })),
  );

  const rules = useAccountRulesStore();

  const broker      = activeBroker ?? 'demo';
  const balance     = connections[broker]?.balance ?? 0;
  const unrealized  = useMemo(
    () => positions.reduce((sum, p) => sum + p.pnl, 0),
    [positions],
  );
  const equity = balance + unrealized;

  // Re-evaluate state whenever equity changes (debounced via React batch)
  useEffect(() => {
    if (rules.enabled) rules.evaluate(equity);
    // We intentionally only depend on equity + enabled — the evaluate fn
    // and the rule values themselves are stable references inside zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity, rules.enabled]);

  const dayPnl   = rules.dayStartBalance != null ? equity - rules.dayStartBalance : 0;
  const drawdown = Math.max(0, rules.peakEquity - equity);
  const totalPnl = equity - rules.startingBalance;

  const dailyProgress = ruleProgress(Math.max(0, -dayPnl), rules.dailyLossLimit);
  const ddProgress    = ruleProgress(drawdown, rules.maxDrawdown);
  const targetProgress = ruleProgress(Math.max(0, totalPnl), rules.profitTarget);

  const stateStyle = STATE_STYLES[rules.accountState];

  if (!rules.enabled) {
    return (
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account Rules</h3>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Off</span>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Enable Topstep / Apex-style risk rules to track daily loss limits, max drawdown
          and profit targets — like a real funded account combine.
        </p>
        <button
          onClick={onConfigure}
          className="self-start px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors hover:brightness-110"
          style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
        >
          Enable Rules
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account Rules</h3>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {rules.preset === 'custom' ? 'Custom' : rules.preset.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${stateStyle.pulse ? 'animate-pulse' : ''}`}
            style={{ background: stateStyle.bg, color: stateStyle.color }}
          >
            {stateStyle.label}
          </span>
          {onConfigure && (
            <button
              onClick={onConfigure}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-muted)' }}
              title="Configure rules"
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      {/* Locked reason */}
      {rules.lockedReason && (
        <div
          className="px-2.5 py-1.5 rounded text-[11px] flex items-start gap-1.5"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <span className="mt-px">⚠</span>
          <span>{rules.lockedReason}</span>
        </div>
      )}

      {/* Three progress bars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RuleBar
          label="Daily Loss"
          used={Math.max(0, -dayPnl)}
          limit={rules.dailyLossLimit}
          status={dailyProgress.status}
          pct={dailyProgress.pct}
          context={`Day P&L ${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(0)}`}
        />
        <RuleBar
          label="Max Drawdown"
          used={drawdown}
          limit={rules.maxDrawdown}
          status={ddProgress.status}
          pct={ddProgress.pct}
          context={`From peak $${rules.peakEquity.toFixed(0)}`}
        />
        <RuleBar
          label="Profit Target"
          used={Math.max(0, totalPnl)}
          limit={rules.profitTarget}
          status={targetProgress.status === 'danger' ? 'safe' : targetProgress.status}
          pct={targetProgress.pct}
          context={`Total ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(0)}`}
          inverted
        />
      </div>
    </div>
  );
}

function RuleBar({
  label,
  used,
  limit,
  status,
  pct,
  context,
  inverted = false,
}: {
  label:    string;
  used:     number;
  limit:    number;
  status:   'safe' | 'warning' | 'danger';
  pct:      number;
  context:  string;
  inverted?: boolean;  // For profit target — full bar is GOOD, not bad
}) {
  // Color logic: by default red bar = bad (loss/dd consumed)
  // Inverted (profit target): green bar = good
  const colorMap = {
    safe:    inverted ? '#10b981' : 'var(--text-muted)',
    warning: '#fbbf24',
    danger:  '#ef4444',
  };
  const fillColor = colorMap[status];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          ${used.toFixed(0)} <span className="opacity-50">/</span> ${limit.toFixed(0)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: fillColor,
            boxShadow: status === 'danger' ? `0 0 8px ${fillColor}` : 'none',
          }}
        />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{context}</span>
    </div>
  );
}
