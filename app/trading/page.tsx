'use client';

import { useState, useCallback, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';
import { useAccountRulesStore } from '@/stores/useAccountRulesStore';
import ModuleHeader        from '@/components/layouts/ModuleHeader';
import Tabs                from '@/components/ui/Tabs';
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

type ActivityTab = 'positions' | 'orders' | 'history';

/** Eyebrow de section — voix mono de marque. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </span>
  );
}

/**
 * /trading — Bento trading dashboard.
 * Zone principale (analyse : equity + performance) + rail d'action
 * (quick trade · risk · règles). Activité regroupée en onglets.
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

  const [showDemoPanel, setShowDemoPanel]       = useState(false);
  const [showRulesModal, setShowRulesModal]     = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [range, setRange]                       = useState<TimeRange>('all');
  const [symbolFilter, setSymbolFilter]         = useState<string | null>(null);
  const [activityTab, setActivityTab]           = useState<ActivityTab>('positions');

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

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
    <div className="min-h-screen p-4 md:p-6 space-y-5 animate-fadeIn" style={{ background: 'var(--background)' }}>
      {/* ─── Header ───────────────────────────── */}
      <ModuleHeader
        eyebrow="· Trading"
        title="Trading"
        accent="Dashboard"
        subtitle={broker === 'demo'
          ? <>Demo account · paper trading · ${balance.toLocaleString('en-US')} simulated capital</>
          : <>Live account · {broker.toUpperCase()}</>}
        actions={
          <>
            {broker === 'demo' && (
              <button
                onClick={() => setShowDemoPanel(true)}
                className="btn-brand-ghost px-3 py-1.5 rounded-lg text-[12px] font-medium"
              >
                Account Settings
              </button>
            )}
            <a
              href="/live"
              className="btn-brand px-3 py-1.5 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5"
            >
              Open Chart
              <ArrowRight size={14} strokeWidth={1.5} />
            </a>
          </>
        }
      />

      {/* ─── Quick actions ────────────────────── */}
      <QuickActions onReset={handleResetAccount} onHotkeys={() => setShowHotkeysModal(true)} />

      {/* ─── KPI strip (account stats) ────────── */}
      <AccountCard />

      {/* ─── Bento : principal (analyse) + rail (action) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5 items-start">

        {/* Principal — equity + performance (2/3) */}
        <div className="lg:col-span-2 space-y-4 stagger-in">
          <EquityCurve />

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <Eyebrow>· Performance</Eyebrow>
            <TimeRangeTabs value={range} onChange={setRange} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <PerformanceMetrics  range={range} />
            <PerformanceBySymbol range={range} />
          </div>
        </div>

        {/* Rail d'action — quick trade · risk · règles (1/3) */}
        <aside className="space-y-4 stagger-in lg:sticky lg:top-4">
          <QuickTradePanel />
          <RiskCalculator />
          <AccountRulesCard onConfigure={() => setShowRulesModal(true)} />
        </aside>
      </div>

      {/* ─── Activity — onglets (positions / orders / history) ─── */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <Eyebrow>· Activity</Eyebrow>
            <Tabs
              tabs={[
                { id: 'positions', label: `Positions (${positions.length})` },
                { id: 'orders',    label: `Orders (${pendingOrders})` },
                { id: 'history',   label: `History (${closedTrades.length})` },
              ]}
              activeTab={activityTab}
              onChange={(id) => setActivityTab(id as ActivityTab)}
              size="sm"
            />
          </div>
          <SymbolFilter value={symbolFilter} onChange={setSymbolFilter} />
        </div>

        <div className="animate-fadeIn" key={activityTab}>
          {activityTab === 'positions' && <PositionsTable symbolFilter={symbolFilter} />}
          {activityTab === 'orders'    && <OrdersTable    symbolFilter={symbolFilter} />}
          {activityTab === 'history'   && <TradeHistory   symbolFilter={symbolFilter} />}
        </div>
      </section>

      {/* Footer */}
      <div className="text-center pt-3 pb-8 text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
        Open positions <span className="tabular-nums">{positions.length}</span> · Pending <span className="tabular-nums">{pendingOrders}</span> · Closed <span className="tabular-nums">{closedTrades.length}</span>
      </div>

      <DemoAccountPanel  isOpen={showDemoPanel}    onClose={() => setShowDemoPanel(false)} />
      <AccountRulesModal isOpen={showRulesModal}   onClose={() => setShowRulesModal(false)} />
      <HotkeysModal      isOpen={showHotkeysModal} onClose={() => setShowHotkeysModal(false)} />
    </div>
  );
}
