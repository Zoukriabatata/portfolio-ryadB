'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

interface SymbolFilterProps {
  value:    string | null;            // null = all symbols
  onChange: (sym: string | null) => void;
}

/**
 * Symbol filter chips — dynamically lists every symbol currently present
 * in positions / orders / closed trades, plus an "All" option.
 *
 * Used as a header for the Positions / Orders / History card group on
 * /trading so the user can drill into a single instrument's activity.
 */
export default function SymbolFilter({ value, onChange }: SymbolFilterProps) {
  const { positions, orders, closedTrades } = useTradingStore(
    useShallow(s => ({
      positions:    s.positions,
      orders:       s.orders,
      closedTrades: s.closedTrades,
    })),
  );

  const symbols = useMemo(() => {
    const set = new Set<string>();
    positions.forEach(p => set.add(p.symbol));
    orders.forEach(o => set.add(o.symbol));
    closedTrades.forEach(t => set.add(t.symbol));
    return Array.from(set).sort();
  }, [positions, orders, closedTrades]);

  if (symbols.length <= 1) return null;  // Nothing to filter on

  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5 flex-wrap gap-0.5"
      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
    >
      <Chip label="All" active={value === null} onClick={() => onChange(null)} count={positions.length + orders.filter(o => o.status === 'pending').length + closedTrades.length} />
      {symbols.map(s => (
        <Chip
          key={s}
          label={s}
          active={value === s}
          onClick={() => onChange(s)}
        />
      ))}
    </div>
  );
}

function Chip({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-all flex items-center gap-1"
      style={{
        background: active ? 'var(--surface)' : 'transparent',
        color:      active ? 'var(--text-primary)' : 'var(--text-muted)',
        boxShadow:  active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {label}
      {typeof count === 'number' && (
        <span className="text-[9px] opacity-60 tabular-nums">{count}</span>
      )}
    </button>
  );
}
