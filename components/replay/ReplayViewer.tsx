'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useReplay } from '@/hooks/useReplay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import { useTradingStore } from '@/stores/useTradingStore';
import ReplayControlBar from './ReplayControlBar';
import ReplayStatsOverlay from './ReplayStatsOverlay';
import ReplayIdleState from './ReplayIdleState';
import ReplayDashboard from './ReplayDashboard';
import ReplayAnalyticsPanel from './ReplayAnalyticsPanel';
import ReplayFinishedOverlay from './ReplayFinishedOverlay';
import ReplayVolumeProfileOverlay from './ReplayVolumeProfileOverlay';
import ReplayClusterOverlay from './ReplayClusterOverlay';
import ReplayTradingChart from './ReplayTradingChart';
import ReplayHeatmapLayer from './ReplayHeatmapLayer';

const QuickTradeBar = dynamic(
  () => import('@/components/trading/QuickTradeBar'),
  { ssr: false }
);

const TRADE_BAR_COLORS = {
  surface: 'var(--surface)',
  border: 'var(--border)',
  text: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  success: 'var(--primary)',
  error: '#ef4444',
  background: 'var(--background)',
};

export default function ReplayViewer() {
  const {
    state,
    sessions,
    loadSession,
    play,
    pause,
    stop,
    seek,
    setSpeed,
  } = useReplay();

  const { toggleSidebar, sidebarOpen, toggleShortcuts } = useReplayUIStore();

  const isActive = state.status !== 'idle';
  const duration = state.endTime - state.startTime;

  // Auto-connect demo broker when replay is active for QuickTradeBar
  useEffect(() => {
    if (!isActive) return;
    const store = useTradingStore.getState();
    if (!store.connections?.demo?.connected) {
      useTradingStore.setState({
        activeBroker: 'demo',
        connections: {
          ...store.connections,
          demo: {
            broker: 'demo' as const,
            connected: true,
            connecting: false,
            error: null,
            balance: 100000,
            currency: 'USD',
            lastUpdate: Date.now(),
          },
        },
      });
    }
  }, [isActive]);

  return (
    <div className="flex-1 relative flex flex-col h-full min-h-0" style={{ background: 'var(--background)' }}>
      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-2"
        style={{ background: 'linear-gradient(to bottom, var(--background), transparent)' }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface)]"
          style={{ color: 'var(--text-muted)' }}
          title="Toggle sidebar ([)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>

        {/* Session info */}
        {isActive && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
              {state.symbol}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              REPLAY
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
              {state.status === 'playing' ? 'Playing' : state.status === 'paused' ? 'Paused' : state.status === 'loading' ? 'Loading...' : state.status === 'finished' ? 'Finished' : ''}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Keyboard shortcuts hint */}
        <button
          onClick={toggleShortcuts}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface)]"
          style={{ color: 'var(--text-dimmed)' }}
          title="Keyboard shortcuts (?)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>

      {/* ═══ MAIN TRADING CHART ═══ */}
      {isActive ? (
        <div className="flex-1 relative min-h-0 pt-10">
          {/* Depth heatmap layer (behind chart) */}
          <div className="absolute inset-0 pt-10">
            <ReplayHeatmapLayer visible={state.status === 'playing' || state.status === 'paused'} />
          </div>
          {/* Main chart (on top) */}
          <div className="absolute inset-0 pt-10">
            <ReplayTradingChart
              symbol={state.symbol || 'ES'}
              isPlaying={state.status === 'playing'}
            />
          </div>
        </div>
      ) : null}

      {/* Idle state — show dashboard if sessions exist, else idle prompt */}
      {state.status === 'idle' && (
        sessions.length > 0
          ? <ReplayDashboard sessions={sessions} onSelectSession={async (id) => { await loadSession(id); play(); }} />
          : <ReplayIdleState />
      )}

      {/* Paused overlay */}
      {state.status === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="opacity-20 animate-fadeIn">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--text-primary)">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          </div>
        </div>
      )}

      {/* Volume Profile overlay */}
      {isActive && state.status !== 'finished' && (
        <ReplayVolumeProfileOverlay visible />
      )}

      {/* Cluster Static overlay */}
      {isActive && state.status !== 'finished' && (
        <ReplayClusterOverlay visible />
      )}

      {/* Stats overlay */}
      {isActive && state.status !== 'finished' && (
        <ReplayStatsOverlay state={state} />
      )}

      {/* Analytics panel */}
      {isActive && state.status !== 'finished' && (
        <ReplayAnalyticsPanel state={state} />
      )}

      {/* ═══ QUICK TRADE BAR ═══ */}
      {isActive && state.status !== 'finished' && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <QuickTradeBar
            symbol={state.symbol || 'ES'}
            colors={TRADE_BAR_COLORS}
          />
        </div>
      )}

      {/* Control bar */}
      {isActive && state.status !== 'finished' && (
        <ReplayControlBar
          state={state}
          play={play}
          pause={pause}
          stop={stop}
          seek={seek}
          setSpeed={setSpeed}
        />
      )}

      {/* Finished overlay */}
      {state.status === 'finished' && (
        <ReplayFinishedOverlay
          totalTrades={state.totalTrades}
          durationMs={duration}
          onReplay={() => {
            seek(0);
            play();
          }}
          onClose={stop}
        />
      )}
    </div>
  );
}
