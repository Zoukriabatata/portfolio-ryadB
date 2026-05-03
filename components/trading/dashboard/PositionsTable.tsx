'use client';

import { useMemo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useTradingStore } from '@/stores/useTradingStore';

interface PositionsTableProps {
  symbolFilter?: string | null;
}

/**
 * Live positions table — TradingView style.
 * Each row updates automatically as prices change (driven by
 * `updatePositionPrices()` calls from chart feeds).
 */
export default function PositionsTable({ symbolFilter = null }: PositionsTableProps) {
  const { positions: allPositions, closePosition, setTrailingStop } = useTradingStore(
    useShallow(s => ({
      positions:       s.positions,
      closePosition:   s.closePosition,
      setTrailingStop: s.setTrailingStop,
    })),
  );

  // Inline editor state — which symbol is currently editing its trail, and
  // the input value. Only one editor open at a time across the table.
  const [editing, setEditing]       = useState<string | null>(null);
  const [trailInput, setTrailInput] = useState('');

  const openEditor = useCallback((symbol: string, current?: number) => {
    setEditing(symbol);
    setTrailInput(current ? current.toString() : '');
  }, []);

  const closeEditor = useCallback(() => {
    setEditing(null);
    setTrailInput('');
  }, []);

  const applyTrail = useCallback((symbol: string) => {
    const val = parseFloat(trailInput);
    if (isNaN(val) || val <= 0) {
      toast.error('Enter a positive trail distance');
      return;
    }
    setTrailingStop(symbol, val);
    toast.success(`Trailing stop set on ${symbol}`, { duration: 1500 });
    closeEditor();
  }, [trailInput, setTrailingStop, closeEditor]);

  const clearTrail = useCallback((symbol: string) => {
    setTrailingStop(symbol, null);
    toast(`Trailing stop cleared on ${symbol}`, { duration: 1200 });
    closeEditor();
  }, [setTrailingStop, closeEditor]);

  const positions = useMemo(
    () => symbolFilter ? allPositions.filter(p => p.symbol === symbolFilter) : allPositions,
    [allPositions, symbolFilter],
  );

  if (positions.length === 0) {
    return (
      <Card title="Open Positions" badge="0">
        <EmptyRow text="No open positions. Place an order from the chart's trade bar to see them here." />
      </Card>
    );
  }

  return (
    <Card title="Open Positions" badge={positions.length.toString()}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }} className="text-left text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium text-right">Entry</th>
              <th className="px-3 py-2 font-medium text-right">Current</th>
              <th className="px-3 py-2 font-medium text-right">P&L</th>
              <th className="px-3 py-2 font-medium text-right">P&L %</th>
              <th className="px-3 py-2 font-medium text-right">Opened</th>
              <th className="px-3 py-2 font-medium text-center">Trail</th>
              <th className="px-3 py-2 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const isLong = p.side === 'buy';
              const pnlColor = p.pnl >= 0 ? '#10b981' : '#ef4444';
              return (
                <tr
                  key={`${p.symbol}-${i}`}
                  className="border-t transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>
                    {p.symbol}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                      style={{
                        background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color:      isLong ? '#10b981' : '#ef4444',
                      }}
                    >
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {p.quantity}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {formatPrice(p.entryPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {formatPrice(p.currentPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: pnlColor }}>
                    {p.pnl >= 0 ? '+' : ''}${Math.abs(p.pnl).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: pnlColor }}>
                    {p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatDuration(Date.now() - p.openedAt)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {editing === p.symbol ? (
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={0.0001}
                          step={0.01}
                          value={trailInput}
                          onChange={e => setTrailInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') applyTrail(p.symbol);
                            if (e.key === 'Escape') closeEditor();
                          }}
                          autoFocus
                          placeholder="dist"
                          className="w-14 px-1.5 py-0.5 rounded text-[10px] tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                        />
                        <button
                          onClick={() => applyTrail(p.symbol)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors"
                          style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--primary)', border: '1px solid rgba(74,222,128,0.3)' }}
                        >
                          ✓
                        </button>
                        <button
                          onClick={closeEditor}
                          className="px-1.5 py-0.5 rounded text-[10px] transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : p.trailingStop ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditor(p.symbol, p.trailingStop?.distance)}
                          title={`Trail distance: ${p.trailingStop.distance.toFixed(2)} · current stop ${p.trailingStop.currentStop.toFixed(2)}`}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums transition-colors hover:brightness-110"
                          style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                        >
                          ⬆ {p.trailingStop.currentStop.toFixed(2)}
                        </button>
                        <button
                          onClick={() => clearTrail(p.symbol)}
                          title="Clear trailing stop"
                          className="text-[10px] px-1 transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openEditor(p.symbol)}
                        title="Set a trailing stop on this position"
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                        style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}
                      >
                        + Trail
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => closePosition(p.symbol)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors hover:brightness-110"
                      style={{
                        background: 'rgba(168,85,247,0.15)',
                        color:      '#a78bfa',
                        border:     '1px solid rgba(168,85,247,0.3)',
                      }}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatPrice(p: number): string {
  if (p >= 1000)  return p.toFixed(2);
  if (p >= 1)     return p.toFixed(2);
  if (p >= 0.01)  return p.toFixed(4);
  return p.toFixed(6);
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60)   return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function Card({
  title,
  badge,
  children,
}: {
  title:    string;
  badge?:   string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {badge && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
