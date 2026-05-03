'use client';

import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';
import { useAccountRulesStore } from '@/stores/useAccountRulesStore';
import AccountCard         from '@/components/trading/dashboard/AccountCard';
import AccountRulesCard    from '@/components/trading/dashboard/AccountRulesCard';
import AccountRulesModal   from '@/components/trading/dashboard/AccountRulesModal';
import PositionsTable      from '@/components/trading/dashboard/PositionsTable';
import OrdersTable         from '@/components/trading/dashboard/OrdersTable';
import TradeHistory        from '@/components/trading/dashboard/TradeHistory';
import EquityCurve         from '@/components/trading/dashboard/EquityCurve';
import PerformanceMetrics  from '@/components/trading/dashboard/PerformanceMetrics';
import PerformanceBySymbol from '@/components/trading/dashboard/PerformanceBySymbol';
import TimeRangeTabs, { type TimeRange } from '@/components/trading/dashboard/TimeRangeTabs';
import QuickActions        from '@/components/trading/dashboard/QuickActions';
import QuickTradePanel     from '@/components/trading/dashboard/QuickTradePanel';
import RiskCalculator      from '@/components/trading/dashboard/RiskCalculator';
import SymbolFilter        from '@/components/trading/dashboard/SymbolFilter';
import HotkeysModal        from '@/components/trading/dashboard/HotkeysModal';
import DemoAccountPanel    from '@/components/trading/DemoAccountPanel';

/**
 * /trading — Topstep / TradingView-style trading dashboard.
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

  const [showDemoPanel, setShowDemoPanel]     = useState(false);
  const [showRulesModal, setShowRulesModal]   = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [range, setRange]                     = useState<TimeRange>('all');
  const [symbolFilter, setSymbolFilter]       = useState<string | null>(null);

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;

  // Reset rules state alongside the trading store on full account reset
  const handleResetAccount = useCallback(() => {
    if (!confirm('Reset demo account? All positions, orders, trade history AND rule state (day baseline + drawdown peak) will be wiped. This cannot be undone.')) return;
    useTradingStore.setState({
      positions:    [],
      orders:       [],
      closedTrades: [],
    });
    useTradingStore.setState(s => ({
      connections: {
        ...s.connections,
        demo: { ...s.connections.demo, balance: 50000 },
      },
    }));
    useAccountRulesStore.getState().reset(50000);
  }, []);

  // Hydrate rules store on mount (skipHydration: true in store config)
  useEffect(() => {
    useAccountRulesStore.persist.rehydrate();
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-4 animate-fadeIn" style={{ background: 'var(--background)' }}>
      {/* ─── Header ───────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
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
        <div className="flex items-center gap-2 shrink-0">
          {broker === 'demo' && (
            <button
              onClick={() => setShowDemoPanel(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:brightness-110"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              Account Settings
            </button>
          )}
          <a
            href="/live"
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors hover:brightness-110"
            style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
          >
            Open Chart →
          </a>
        </div>
      </div>

      {/* ─── Quick actions ────────────────────── */}
      <QuickActions onReset={handleResetAccount} onHotkeys={() => setShowHotkeysModal(true)} />

      {/* ─── Account stats ────────────────────── */}
      <AccountCard />

      {/* ─── Quick trade + Risk calculator ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickTradePanel />
        <RiskCalculator />
      </div>

      {/* ─── Equity + Topstep rules ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EquityCurve />
        <AccountRulesCard onConfigure={() => setShowRulesModal(true)} />
      </div>

      {/* ─── Performance section with time filter ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Performance</h2>
        <TimeRangeTabs value={range} onChange={setRange} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PerformanceMetrics  range={range} />
        <PerformanceBySymbol range={range} />
      </div>

      {/* ─── Positions / Orders / History — with symbol filter ─── */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Activity</h2>
        <SymbolFilter value={symbolFilter} onChange={setSymbolFilter} />
      </div>
      <PositionsTable symbolFilter={symbolFilter} />
      <OrdersTable    symbolFilter={symbolFilter} />
      <TradeHistory   symbolFilter={symbolFilter} />

      {/* Footer */}
      <div className="text-center pt-4 pb-8 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        Open positions <span className="tabular-nums">{positions.length}</span> · Pending <span className="tabular-nums">{orders.filter(o => o.status === 'pending').length}</span> · Closed <span className="tabular-nums">{closedTrades.length}</span>
      </div>

      <DemoAccountPanel  isOpen={showDemoPanel}    onClose={() => setShowDemoPanel(false)} />
      <AccountRulesModal isOpen={showRulesModal}   onClose={() => setShowRulesModal(false)} />
      <HotkeysModal      isOpen={showHotkeysModal} onClose={() => setShowHotkeysModal(false)} />
    </div>
  );
}
