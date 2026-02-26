'use client';

import { useMemo, useState } from 'react';
import type { RecordingSession } from '@/lib/replay/ReplayRecorder';
import { formatDuration, formatSize, formatDate } from './utils';

type DashboardView = 'overview' | 'sessions';

interface ReplayDashboardProps {
  sessions: RecordingSession[];
  onSelectSession: (sessionId: string) => void;
}

export default function ReplayDashboard({ sessions, onSelectSession }: ReplayDashboardProps) {
  const [view, setView] = useState<DashboardView>('overview');
  const [sortBy, setSortBy] = useState<'date' | 'trades' | 'duration'>('date');

  const stats = useMemo(() => {
    const completed = sessions.filter(s => s.status === 'completed');
    const totalTrades = completed.reduce((s, c) => s + c.tradeCount, 0);
    const totalTime = completed.reduce((s, c) => s + (c.endTime - c.startTime), 0);
    const totalSize = completed.reduce((s, c) => s + c.fileSizeEstimate, 0);
    const avgDuration = completed.length > 0 ? totalTime / completed.length : 0;

    // Group by symbol
    const bySymbol = new Map<string, { count: number; trades: number }>();
    completed.forEach(s => {
      const prev = bySymbol.get(s.symbol) || { count: 0, trades: 0 };
      bySymbol.set(s.symbol, { count: prev.count + 1, trades: prev.trades + s.tradeCount });
    });

    return {
      totalSessions: completed.length,
      totalTrades,
      totalTime,
      avgDuration,
      totalSize,
      bySymbol: Array.from(bySymbol.entries())
        .map(([symbol, data]) => ({ symbol, ...data }))
        .sort((a, b) => b.count - a.count),
    };
  }, [sessions]);

  const recent = sessions
    .filter(s => s.status === 'completed')
    .slice(0, 6);

  return (
    <div className="absolute inset-0 overflow-y-auto p-6 animate-fadeIn">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Replay Dashboard
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Review your recorded sessions and performance
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Sessions', value: stats.totalSessions.toString(), icon: '📊' },
            { label: 'Total Trades', value: stats.totalTrades.toLocaleString(), icon: '📈' },
            { label: 'Time Invested', value: formatDuration(stats.totalTime), icon: '⏱' },
            { label: 'Avg Duration', value: formatDuration(stats.avgDuration), icon: '⌛' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                {kpi.label}
              </div>
              <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Symbols breakdown */}
        {stats.bySymbol.length > 0 && (
          <div className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              By Instrument
            </div>
            <div className="flex gap-3 flex-wrap">
              {stats.bySymbol.map(s => (
                <div key={s.symbol} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                  <span className="font-bold font-mono" style={{ color: 'var(--primary)' }}>{s.symbol}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {s.count} session{s.count > 1 ? 's' : ''} · {s.trades.toLocaleString()} trades
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Storage + View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Storage:</span>
            <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
              {formatSize(stats.totalSize)}
            </span>
          </div>
          <div className="flex items-center rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border)' }}>
            {(['overview', 'sessions'] as DashboardView[]).map(v => (
              <button key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-[10px] font-medium capitalize transition-all"
                style={{
                  background: view === v ? 'var(--primary)' : 'transparent',
                  color: view === v ? '#fff' : 'var(--text-muted)',
                }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'overview' ? (
          <>
            {/* Recent Sessions Grid */}
            {recent.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Recent Sessions
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recent.map(session => (
                    <button key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className="rounded-xl p-3 text-left transition-all hover:brightness-110 group"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                          style={{
                            background: session.exchange === 'binance' ? '#F0B90B15' : session.exchange === 'bybit' ? '#FFAB0015' : '#e44d2615',
                            color: session.exchange === 'binance' ? '#F0B90B' : session.exchange === 'bybit' ? '#FFAB00' : '#e44d26',
                          }}>
                          {session.symbol}
                        </span>
                        {session.metadata?.description && (
                          <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {session.metadata.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                        <span>{session.tradeCount.toLocaleString()} trades</span>
                        <span>{formatDuration(session.endTime - session.startTime)}</span>
                        <span>{formatDate(session.startTime)}</span>
                      </div>
                      <div className="mt-2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--primary)' }}>
                        Click to replay →
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Sessions List — fxreplay-style table */
          <div className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {/* Sort controls */}
            <div className="flex items-center gap-2 px-4 py-2 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Sort by:</span>
              {(['date', 'trades', 'duration'] as const).map(s => (
                <button key={s}
                  onClick={() => setSortBy(s)}
                  className="px-2 py-0.5 rounded text-[10px] capitalize transition-all"
                  style={{
                    background: sortBy === s ? 'var(--primary)' : 'transparent',
                    color: sortBy === s ? '#fff' : 'var(--text-muted)',
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Session rows */}
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {sessions
                .filter(s => s.status === 'completed')
                .sort((a, b) => {
                  if (sortBy === 'trades') return b.tradeCount - a.tradeCount;
                  if (sortBy === 'duration') return (b.endTime - b.startTime) - (a.endTime - a.startTime);
                  return b.startTime - a.startTime;
                })
                .map(session => {
                  const duration = session.endTime - session.startTime;
                  const tradesPerMin = duration > 60000 ? Math.round(session.tradeCount / (duration / 60000)) : session.tradeCount;

                  return (
                    <button key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left transition-all hover:bg-[var(--surface-hover)] group">

                      {/* Exchange + Symbol */}
                      <div className="w-28 shrink-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono"
                          style={{
                            background: session.exchange === 'binance' ? '#F0B90B15' : session.exchange === 'bybit' ? '#FFAB0015' : session.exchange === 'deribit' ? '#00D08415' : '#e44d2615',
                            color: session.exchange === 'binance' ? '#F0B90B' : session.exchange === 'bybit' ? '#FFAB00' : session.exchange === 'deribit' ? '#00D084' : '#e44d26',
                          }}>
                          {session.symbol}
                        </span>
                        <span className="ml-1.5 text-[9px] uppercase" style={{ color: 'var(--text-dimmed)' }}>
                          {session.exchange}
                        </span>
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs truncate block" style={{ color: 'var(--text-secondary)' }}>
                          {session.metadata?.description || 'Recording session'}
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-4 text-[10px] font-mono shrink-0">
                        <div className="text-center w-16">
                          <div style={{ color: 'var(--text-primary)' }}>{session.tradeCount.toLocaleString()}</div>
                          <div style={{ color: 'var(--text-dimmed)' }}>trades</div>
                        </div>
                        <div className="text-center w-16">
                          <div style={{ color: 'var(--text-primary)' }}>{tradesPerMin}</div>
                          <div style={{ color: 'var(--text-dimmed)' }}>trades/m</div>
                        </div>
                        <div className="text-center w-16">
                          <div style={{ color: 'var(--text-primary)' }}>{formatDuration(duration)}</div>
                          <div style={{ color: 'var(--text-dimmed)' }}>duration</div>
                        </div>
                        <div className="text-center w-16">
                          <div style={{ color: 'var(--text-primary)' }}>{session.depthSnapshotCount}</div>
                          <div style={{ color: 'var(--text-dimmed)' }}>depth</div>
                        </div>
                        <div className="text-center w-20">
                          <div style={{ color: 'var(--text-muted)' }}>{formatDate(session.startTime)}</div>
                        </div>
                      </div>

                      {/* Replay button */}
                      <div className="text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        style={{ color: 'var(--primary)' }}>
                        Replay →
                      </div>
                    </button>
                  );
                })}
            </div>

            {sessions.filter(s => s.status === 'completed').length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No completed sessions yet
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {sessions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No sessions recorded yet. Start a recording from the sidebar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
