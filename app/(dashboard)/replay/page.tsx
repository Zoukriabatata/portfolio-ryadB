'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useReplay } from '@/hooks/useReplay';
import { useIBConnection } from '@/hooks/useIBConnection';
import { getReplayRecorder } from '@/lib/replay';
import { getIBConnectionManager } from '@/lib/ib/ConnectionManager';
import { CME_CONTRACTS } from '@/types/ib-protocol';
import type { RecordingSession } from '@/lib/replay';

const IBLiquidityView = dynamic(
  () => import('@/components/charts/IBLiquidityView').then(m => ({ default: m.IBLiquidityView })),
  { ssr: false }
);

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 10];

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReplayPage() {
  const {
    state: replayState,
    sessions,
    loadSession,
    play,
    pause,
    stop,
    seek,
    setSpeed,
    startRecording,
    stopRecording,
    isRecording,
    recordingStats,
    deleteSession,
    refreshSessions,
  } = useReplay();

  const { status: ibStatus, isConnected } = useIBConnection();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [recordSymbol, setRecordSymbol] = useState('ES');
  const [recordDescription, setRecordDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'sessions' | 'record'>('sessions');
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Handle seek via progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const progress = (e.clientX - rect.left) / rect.width;
    seek(progress);
  }, [seek]);

  // Wire IB data to recorder when recording
  useEffect(() => {
    if (!isRecording) return;

    const recorder = getReplayRecorder();
    const mgr = getIBConnectionManager();

    const unsubTrade = mgr.isConnected()
      ? (() => {
          // Tap into the connector's trade/depth events via ConnectionManager
          // The recorder hooks into the same data stream
          const connector = (mgr as any).connector;
          if (connector) {
            const unsub1 = connector.onTrade((trade: any) => recorder.recordTrade(trade));
            const unsub2 = connector.onDepth((depth: any) => recorder.recordDepth(depth));
            return () => { unsub1(); unsub2(); };
          }
          return () => {};
        })()
      : () => {};

    return () => {
      if (typeof unsubTrade === 'function') unsubTrade();
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    if (!isConnected) return;
    await startRecording(recordSymbol, recordDescription || undefined);
    setRecordDescription('');
  };

  const handleLoadSession = async (sessionId: string) => {
    setSelectedSession(sessionId);
    await loadSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Delete this recording? This cannot be undone.')) return;
    await deleteSession(sessionId);
    if (selectedSession === sessionId) {
      stop();
      setSelectedSession(null);
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] flex">
      {/* Left Panel - Sessions & Controls */}
      <div className="w-80 flex-shrink-0 flex flex-col" style={{ background: 'var(--background)', borderRight: '1px solid var(--border)' }}>
        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('sessions')}
            className="flex-1 px-4 py-3 text-xs font-medium transition-colors"
            style={{
              color: activeTab === 'sessions' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'sessions' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('record')}
            className="flex-1 px-4 py-3 text-xs font-medium transition-colors"
            style={{
              color: activeTab === 'record' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'record' ? '2px solid var(--error)' : '2px solid transparent',
            }}
          >
            Record {isRecording && <span className="ml-1 w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: 'var(--error)' }} />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === 'sessions' ? (
            /* Sessions List */
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No recordings yet</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-dimmed)' }}>Switch to Record tab to capture data</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-3 rounded-lg transition-colors cursor-pointer"
                    style={{
                      background: selectedSession === session.id ? 'var(--primary-glow)' : 'var(--surface)',
                      border: selectedSession === session.id ? '1px solid var(--primary-dark)' : '1px solid var(--border)',
                    }}
                    onClick={() => handleLoadSession(session.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{session.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        background: session.status === 'completed' ? 'var(--success-bg)' : session.status === 'recording' ? 'var(--error-bg)' : 'var(--surface-elevated)',
                        color: session.status === 'completed' ? 'var(--success)' : session.status === 'recording' ? 'var(--error)' : 'var(--text-muted)',
                      }}>
                        {session.status}
                      </span>
                    </div>
                    <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                      <div>{formatDate(session.startTime)}</div>
                      <div className="flex items-center gap-3">
                        <span>{session.tradeCount.toLocaleString()} trades</span>
                        <span>{session.depthSnapshotCount} snapshots</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{formatDuration(session.endTime - session.startTime)}</span>
                        <span>{formatSize(session.fileSizeEstimate)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                      className="mt-2 text-[10px] transition-colors"
                      style={{ color: 'var(--error)', opacity: 0.5 }}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Recording Controls */
            <div className="space-y-4">
              {/* IB Connection Status */}
              <div className="p-3 rounded-lg" style={{
                background: isConnected ? 'var(--success-bg)' : 'var(--surface)',
                border: isConnected ? '1px solid var(--primary-dark)' : '1px solid var(--border)',
              }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: isConnected ? 'var(--success)' : 'var(--text-dimmed)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    IB Gateway: {isConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                {!isConnected && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-dimmed)' }}>
                    Connect to IB Gateway to record live CME data
                  </p>
                )}
              </div>

              {/* Recording Form */}
              {!isRecording ? (
                <>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Symbol</label>
                    <select
                      value={recordSymbol}
                      onChange={(e) => setRecordSymbol(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                    >
                      {Object.entries(CME_CONTRACTS).map(([sym, spec]) => (
                        <option key={sym} value={sym}>{sym} - {spec.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Description (optional)</label>
                    <input
                      type="text"
                      value={recordDescription}
                      onChange={(e) => setRecordDescription(e.target.value)}
                      placeholder="Morning session, FOMC day..."
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button
                    onClick={handleStartRecording}
                    disabled={!isConnected}
                    className="w-full px-4 py-2.5 rounded-lg transition-colors font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: 'var(--error)', color: 'var(--text-primary)' }}
                  >
                    Start Recording
                  </button>
                </>
              ) : (
                /* Active Recording Status */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: 'var(--error)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--error)' }}>Recording {recordSymbol}...</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Trades</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{recordingStats.tradeCount.toLocaleString()}</p>
                    </div>
                    <div className="p-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Depth</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{recordingStats.depthCount}</p>
                    </div>
                    <div className="p-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Duration</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{formatDuration(recordingStats.duration)}</p>
                    </div>
                    <div className="p-2 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Size</p>
                      <p className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{formatSize(recordingStats.sizeEstimate)}</p>
                    </div>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="w-full px-4 py-2.5 rounded-lg transition-colors font-medium text-sm"
                    style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}
                  >
                    Stop Recording
                  </button>
                </div>
              )}

              {/* Info */}
              <div className="p-3 rounded-lg" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Recordings are stored locally in your browser (IndexedDB). Your personal CME data is never uploaded to our servers.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Replay View */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Replay Viewer */}
        <div className="flex-1 relative" style={{ background: 'var(--background)' }}>
          {replayState.status === 'idle' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3" style={{ color: 'var(--border-light)' }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a recording to replay</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-dimmed)' }}>or start a new recording from the Record tab</p>
              </div>
            </div>
          ) : (
            <IBLiquidityView
              height={9999}
              ibSymbol={replayState.symbol || 'ES'}
            />
          )}
        </div>

        {/* Playback Controls Bar */}
        {replayState.status !== 'idle' && (
          <div className="h-16 flex items-center px-4 gap-4" style={{ background: 'var(--background)', borderTop: '1px solid var(--border)' }}>
            {/* Play/Pause */}
            <div className="flex items-center gap-1">
              <button
                onClick={replayState.status === 'playing' ? pause : play}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: 'var(--primary)', color: 'var(--text-primary)' }}
              >
                {replayState.status === 'playing' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg>
                )}
              </button>
              <button
                onClick={stop}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              </button>
            </div>

            {/* Time */}
            <div className="text-xs font-mono w-32" style={{ color: 'var(--text-muted)' }}>
              {replayState.currentTime > 0 ? formatTime(replayState.currentTime) : '--:--:--'}
              <span style={{ color: 'var(--text-dimmed)' }}> / </span>
              {replayState.endTime > 0 ? formatTime(replayState.endTime) : '--:--:--'}
            </div>

            {/* Progress Bar */}
            <div
              ref={progressBarRef}
              className="flex-1 h-2 rounded-full cursor-pointer group"
              style={{ background: 'var(--surface-elevated)' }}
              onClick={handleProgressClick}
            >
              <div
                className="h-full rounded-full relative transition-all duration-100"
                style={{ width: `${replayState.progress * 100}%`, background: 'var(--primary)' }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--text-primary)' }} />
              </div>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="px-2 py-1 rounded text-[10px] font-mono transition-colors"
                  style={{
                    background: replayState.speed === s ? 'var(--primary)' : 'var(--surface-elevated)',
                    color: replayState.speed === s ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="text-[10px] font-mono w-24 text-right" style={{ color: 'var(--text-dimmed)' }}>
              {replayState.tradeFedCount}/{replayState.totalTrades} trades
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
