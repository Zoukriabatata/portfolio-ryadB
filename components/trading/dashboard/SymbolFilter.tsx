'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';
import Segment from '@/components/ui/Segment';

interface SymbolFilterProps {
  value:    string | null;            // null = all symbols
  onChange: (sym: string | null) => void;
}

// Sentinel id for the "All symbols" option (Segment needs a string value).
const ALL = '__all__';

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

  const allCount = positions.length + orders.filter(o => o.status === 'pending').length + closedTrades.length;

  const options = [
    {
      id: ALL,
      label: (
        <span className="inline-flex items-center gap-1 tracking-wide">
          All
          <span className="text-[10px] opacity-60 tabular-nums">{allCount}</span>
        </span>
      ),
    },
    ...symbols.map(s => ({ id: s, label: <span className="tracking-wide">{s}</span> })),
  ];

  return (
    <Segment
      options={options}
      value={value ?? ALL}
      onChange={(id) => onChange(id === ALL ? null : id)}
      size="sm"
      className="flex-wrap"
    />
  );
}
