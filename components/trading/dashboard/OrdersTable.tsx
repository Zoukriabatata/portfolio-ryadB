'use client';

import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

/**
 * Pending orders table (limit / stop / stop_limit).
 * Each row has a Cancel action.
 */
export default function OrdersTable() {
  const { orders, cancelOrder } = useTradingStore(
    useShallow(s => ({
      orders:      s.orders,
      cancelOrder: s.cancelOrder,
    })),
  );

  const pending = orders.filter(o => o.status === 'pending');

  if (pending.length === 0) {
    return (
      <Card title="Pending Orders" badge="0">
        <EmptyRow text="No pending orders. Limit and stop orders waiting to fill will show up here." />
      </Card>
    );
  }

  return (
    <Card title="Pending Orders" badge={pending.length.toString()}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }} className="text-left text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium text-right">Limit</th>
              <th className="px-3 py-2 font-medium text-right">Stop</th>
              <th className="px-3 py-2 font-medium text-right">Created</th>
              <th className="px-3 py-2 font-medium text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(o => {
              const isLong = o.side === 'buy';
              return (
                <tr
                  key={o.id}
                  className="border-t transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{o.symbol}</td>
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                      style={{
                        background: isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color:      isLong ? '#10b981' : '#ef4444',
                      }}
                    >
                      {isLong ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  <td className="px-3 py-2 uppercase text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    {o.type === 'stop_limit' ? 'STOP-LIMIT' : o.type}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{o.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: o.price ? 'var(--text-primary)' : 'var(--text-dimmed)' }}>
                    {o.price ? `$${o.price.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: o.stopPrice ? '#fbbf24' : 'var(--text-dimmed)' }}>
                    {o.stopPrice ? `$${o.stopPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatTime(o.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => cancelOrder(o.id)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide transition-colors hover:brightness-110"
                      style={{
                        background: 'rgba(239,68,68,0.15)',
                        color:      '#ef4444',
                        border:     '1px solid rgba(239,68,68,0.3)',
                      }}
                    >
                      Cancel
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

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
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
