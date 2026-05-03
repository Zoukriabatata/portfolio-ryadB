'use client';

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useTradingStore } from '@/stores/useTradingStore';

interface QuickActionsProps {
  onReset:    () => void;
  onHotkeys?: () => void;
}

/**
 * Quick action bar for the trading dashboard — global actions across
 * all symbols / all positions. Sits at the top of the dashboard.
 */
export default function QuickActions({ onReset, onHotkeys }: QuickActionsProps) {
  const { positions, orders, closePosition, cancelOrder } = useTradingStore(
    useShallow(s => ({
      positions:     s.positions,
      orders:        s.orders,
      closePosition: s.closePosition,
      cancelOrder:   s.cancelOrder,
    })),
  );

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const positionCount = positions.length;

  const handleFlattenAll = useCallback(async () => {
    if (positions.length === 0) return;
    if (!confirm(`Close all ${positions.length} open positions at market?`)) return;
    let closed = 0;
    for (const p of positions) {
      const ok = await closePosition(p.symbol);
      if (ok) closed++;
    }
    if (closed > 0) toast.success(`Closed ${closed} position${closed > 1 ? 's' : ''}`, { duration: 1500 });
  }, [positions, closePosition]);

  const handleCancelAll = useCallback(async () => {
    const pending = orders.filter(o => o.status === 'pending');
    if (pending.length === 0) return;
    if (!confirm(`Cancel all ${pending.length} pending orders?`)) return;
    let cancelled = 0;
    for (const o of pending) {
      const ok = await cancelOrder(o.id);
      if (ok) cancelled++;
    }
    if (cancelled > 0) toast.success(`Cancelled ${cancelled} order${cancelled > 1 ? 's' : ''}`, { duration: 1500 });
  }, [orders, cancelOrder]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Action
        label="Flatten All"
        sub={positionCount > 0 ? `${positionCount} open` : undefined}
        onClick={handleFlattenAll}
        disabled={positionCount === 0}
        color="warning"
        title="Close all open positions at market"
      />
      <Action
        label="Cancel All Orders"
        sub={pendingCount > 0 ? `${pendingCount} pending` : undefined}
        onClick={handleCancelAll}
        disabled={pendingCount === 0}
        color="default"
        title="Cancel all pending limit/stop orders"
      />
      <div className="flex-1" />
      {onHotkeys && (
        <Action
          label="? Hotkeys"
          onClick={onHotkeys}
          color="default"
          title="Show keyboard shortcuts for /live trading"
        />
      )}
      <Action
        label="Reset Account"
        onClick={onReset}
        color="danger"
        title="Wipe positions, orders, history and reset balance"
      />
    </div>
  );
}

function Action({
  label,
  sub,
  onClick,
  disabled,
  color = 'default',
  title,
}: {
  label:    string;
  sub?:     string;
  onClick:  () => void;
  disabled?: boolean;
  color?:   'default' | 'warning' | 'danger';
  title?:   string;
}) {
  const styles = {
    default: { bg: 'var(--surface-elevated)', color: 'var(--text-primary)', border: 'var(--border)' },
    warning: { bg: 'rgba(251,191,36,0.12)',   color: '#fbbf24',              border: 'rgba(251,191,36,0.35)' },
    danger:  { bg: 'rgba(239,68,68,0.10)',    color: '#ef4444',              border: 'rgba(239,68,68,0.30)' },
  }[color];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
      style={{ background: styles.bg, color: styles.color, border: `1px solid ${styles.border}` }}
    >
      {label}
      {sub && (
        <span className="text-[10px] font-normal opacity-70 tabular-nums">{sub}</span>
      )}
    </button>
  );
}
