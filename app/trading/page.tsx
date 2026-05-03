'use client';

import { useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';
import AccountCard    from '@/components/trading/dashboard/AccountCard';
import PositionsTable from '@/components/trading/dashboard/PositionsTable';
import OrdersTable    from '@/components/trading/dashboard/OrdersTable';
import TradeHistory   from '@/components/trading/dashboard/TradeHistory';
import EquityCurve    from '@/components/trading/dashboard/EquityCurve';
import DemoAccountPanel from '@/components/trading/DemoAccountPanel';

/**
 * /trading — TradingView / Topstep-style trading dashboard.
 *
 * Composition:
 *   ┌─────────────────────────────────────┐
 *   │  AccountCard (balance, equity, P&L) │
 *   ├──────────────────┬──────────────────┤
 *   │ EquityCurve      │ Quick Actions    │
 *   ├──────────────────┴──────────────────┤
 *   │  PositionsTable                     │
 *   │  OrdersTable                        │
 *   │  TradeHistory                       │
 *   └─────────────────────────────────────┘
 */
export default function TradingPage() {
  const { positions, orders, closedTrades, activeBroker, connections } = useTradingStore(
    useShallow(s => ({
      positions:    s.positions,
      orders:       s.orders,
      closedTrades: s.closedTrades,
      activeBroker: s.activeBroker,
      connections:  s.connections,
    })),
  );

  const [showDemoPanel, setShowDemoPanel] = useState(false);

  const handleResetDemo = useCallback(() => {
    if (!confirm('Reset demo account? All positions, orders and trade history will be wiped. This cannot be undone.')) return;
    // Reset by clearing localStorage segment then reloading
    useTradingStore.setState({
      positions:    [],
      orders:       [],
      closedTrades: [],
    });
    // Reset demo balance to default $50k
    useTradingStore.setState(s => ({
      connections: {
        ...s.connections,
        demo: { ...s.connections.demo, balance: 50000 },
      },
    }));
  }, []);

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-4 animate-fadeIn" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Trading Dashboard</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {broker === 'demo' ? (
              <>Demo account · paper trading · ${balance.toLocaleString()} simulated capital</>
            ) : (
              <>Live account · {broker.toUpperCase()}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {broker === 'demo' && (
            <button
              onClick={() => setShowDemoPanel(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              Settings
            </button>
          )}
          <button
            onClick={handleResetDemo}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:brightness-110"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            Reset Account
          </button>
        </div>
      </div>

      {/* Account stats */}
      <AccountCard />

      {/* Equity curve */}
      <EquityCurve />

      {/* Open positions */}
      <PositionsTable />

      {/* Pending orders */}
      <OrdersTable />

      {/* Trade history */}
      <TradeHistory />

      {/* Footer hint */}
      <div className="text-center pt-4 pb-8 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        Place orders from the trade bar at the bottom of the <a href="/live" className="underline hover:text-[var(--primary)]">/live</a> chart.
        Open positions <span className="tabular-nums">{positions.length}</span> · Pending <span className="tabular-nums">{orders.filter(o => o.status === 'pending').length}</span> · Closed <span className="tabular-nums">{closedTrades.length}</span>
      </div>

      <DemoAccountPanel isOpen={showDemoPanel} onClose={() => setShowDemoPanel(false)} />
    </div>
  );
}
