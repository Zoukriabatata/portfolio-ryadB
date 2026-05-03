'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTradingStore, BROKER_INFO, type BrokerType } from '@/stores/useTradingStore';

interface DemoAccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_BALANCES: Record<string, number> = {
  '$10K': 10000,
  '$25K': 25000,
  '$50K': 50000,
  '$100K': 100000,
  '$250K': 250000,
  '$1M': 1000000,
};

export default function DemoAccountPanel({ isOpen, onClose }: DemoAccountPanelProps) {
  const {
    activeBroker,
    connections,
    positions,
    orders,
    closedTrades,
    leverage,
    setLeverage,
    connect,
    disconnect,
  } = useTradingStore();

  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedBalance, setSelectedBalance] = useState('$50K');

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(timeout); document.removeEventListener('mousedown', handler); };
  }, [isOpen, onClose]);

  const isDemo = activeBroker === 'demo';
  const demoConnection = connections.demo;
  const balance = demoConnection.balance || 0;

  // Stats
  const stats = useMemo(() => {
    const trades = closedTrades.filter(t => t.broker === 'demo');
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    return {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      avgWin,
      avgLoss,
      profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
    };
  }, [closedTrades]);

  const handleConnect = useCallback(async () => {
    const bal = INITIAL_BALANCES[selectedBalance] || 100000;
    // Disconnect first if connected
    if (demoConnection.connected) {
      disconnect('demo');
    }
    // Connect with the chosen balance
    await connect('demo');
    // Override balance
    useTradingStore.setState((state) => ({
      connections: {
        ...state.connections,
        demo: { ...state.connections.demo, balance: bal },
      },
    }));
  }, [selectedBalance, demoConnection.connected, connect, disconnect]);

  const handleReset = useCallback(() => {
    const bal = INITIAL_BALANCES[selectedBalance] || 100000;
    useTradingStore.setState((state) => ({
      positions: state.positions.filter(p => false), // Clear all demo positions
      orders: state.orders.filter(o => o.broker !== 'demo'),
      closedTrades: [],
      connections: {
        ...state.connections,
        demo: { ...state.connections.demo, balance: bal },
      },
    }));
  }, [selectedBalance]);

  if (!isOpen) return null;

  const openPositions = positions.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        ref={panelRef}
        className="w-[380px] rounded-xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold" style={{ backgroundColor: '#7c3aed', color: '#fff' }}>
              D
            </div>
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Demo Account</h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Paper Trading Simulator</p>
            </div>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: 'var(--text-muted)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Status */}
        <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${demoConnection.connected ? 'bg-green-400' : 'bg-gray-500'}`} />
              <span className="text-[11px] font-medium" style={{ color: demoConnection.connected ? '#4ade80' : 'var(--text-muted)' }}>
                {demoConnection.connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {demoConnection.connected && (
              <span className="text-[18px] font-bold font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          {/* Quick stats */}
          {demoConnection.connected && (
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--background)' }}>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Positions</div>
                <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{openPositions}</div>
              </div>
              <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--background)' }}>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Orders</div>
                <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{pendingOrders}</div>
              </div>
              <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--background)' }}>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Trades</div>
                <div className="text-[13px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{stats.totalTrades}</div>
              </div>
              <div className="text-center p-1.5 rounded" style={{ backgroundColor: 'var(--background)' }}>
                <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>P&L</div>
                <div className="text-[13px] font-bold font-mono" style={{ color: stats.totalPnl >= 0 ? '#4ade80' : '#f87171' }}>
                  {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(0)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Config */}
        <div className="px-5 py-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Starting Balance */}
          <div>
            <label className="block text-[10px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Capital initial</label>
            <div className="flex gap-1">
              {Object.keys(INITIAL_BALANCES).map(k => (
                <button
                  key={k}
                  onClick={() => setSelectedBalance(k)}
                  className="flex-1 py-1.5 rounded text-[10px] font-mono font-medium transition-colors"
                  style={{
                    backgroundColor: selectedBalance === k ? 'var(--primary)' : 'var(--background)',
                    color: selectedBalance === k ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${selectedBalance === k ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Leverage</label>
              <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-secondary)' }}>{leverage}x</span>
            </div>
            <div className="flex gap-1">
              {[1, 2, 5, 10, 20, 50, 100].map(l => (
                <button
                  key={l}
                  onClick={() => setLeverage(l)}
                  className="flex-1 py-1 rounded text-[9px] font-mono transition-colors"
                  style={{
                    backgroundColor: leverage === l ? '#f59e0b' : 'var(--background)',
                    color: leverage === l ? '#000' : 'var(--text-muted)',
                    border: `1px solid ${leverage === l ? '#f59e0b' : 'var(--border)'}`,
                  }}
                >
                  {l}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Performance stats */}
        {demoConnection.connected && stats.totalTrades > 0 && (
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Performance</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Win Rate</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: stats.winRate >= 50 ? '#4ade80' : '#f87171' }}>
                  {stats.winRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Profit Factor</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: stats.profitFactor >= 1 ? '#4ade80' : '#f87171' }}>
                  {stats.profitFactor.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Avg Win</span>
                <span className="text-[10px] font-mono" style={{ color: '#4ade80' }}>+${stats.avgWin.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Avg Loss</span>
                <span className="text-[10px] font-mono" style={{ color: '#f87171' }}>-${Math.abs(stats.avgLoss).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Wins</span>
                <span className="text-[10px] font-mono" style={{ color: '#4ade80' }}>{stats.wins}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Losses</span>
                <span className="text-[10px] font-mono" style={{ color: '#f87171' }}>{stats.losses}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-3 flex items-center gap-2">
          {!demoConnection.connected ? (
            <button
              onClick={handleConnect}
              className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all hover:brightness-110"
              style={{ backgroundColor: '#7c3aed', color: '#fff' }}
            >
              Start Demo Trading
            </button>
          ) : (
            <>
              <button
                onClick={handleReset}
                className="flex-1 py-2 rounded-lg text-[11px] font-medium transition-colors"
                style={{ backgroundColor: 'var(--background)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Reset Account
              </button>
              <button
                onClick={() => disconnect('demo')}
                className="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
