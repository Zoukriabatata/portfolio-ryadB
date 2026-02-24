'use client';

import dynamic from 'next/dynamic';
import { useReplay } from '@/hooks/useReplay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import ReplayControlBar from './ReplayControlBar';
import ReplayStatsOverlay from './ReplayStatsOverlay';
import ReplayIdleState from './ReplayIdleState';
import ReplayDashboard from './ReplayDashboard';
import ReplayAnalyticsPanel from './ReplayAnalyticsPanel';
import ReplayChartContainer from './ReplayChartContainer';
import ReplayFinishedOverlay from './ReplayFinishedOverlay';

const IBLiquidityView = dynamic(
  () => import('@/components/charts/IBLiquidityView').then((m) => ({ default: m.IBLiquidityView })),
  { ssr: false }
);

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

  return (
    <div className="flex-1 relative" style={{ background: 'var(--background)' }}>
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

      {/* Chart area with toolbar */}
      {isActive ? (
        <ReplayChartContainer symbol={state.symbol || 'ES'}>
          <IBLiquidityView height={9999} ibSymbol={state.symbol || 'ES'} />
        </ReplayChartContainer>
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

      {/* Stats overlay */}
      {isActive && state.status !== 'finished' && (
        <ReplayStatsOverlay state={state} />
      )}

      {/* Analytics panel */}
      {isActive && state.status !== 'finished' && (
        <ReplayAnalyticsPanel state={state} />
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
