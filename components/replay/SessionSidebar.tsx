'use client';

import { useState, useMemo } from 'react';
import { useReplay } from '@/hooks/useReplay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import { useIBConnection } from '@/hooks/useIBConnection';
import Tabs from '@/components/ui/Tabs';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SessionCard from './SessionCard';
import SessionEmptyState from './SessionEmptyState';
import RecordingPanel from './RecordingPanel';
import { formatSize } from './utils';

export default function SessionSidebar() {
  const {
    state: replayState,
    sessions,
    loadSession,
    startRecording,
    stopRecording,
    isRecording,
    recordingStats,
    deleteSession,
  } = useReplay();

  const { isConnected } = useIBConnection();
  const {
    sidebarOpen,
    searchQuery,
    setSearchQuery,
    sessionDeleteId,
    closeSessionDelete,
  } = useReplayUIStore();

  const [activeTab, setActiveTab] = useState<string>('sessions');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.metadata?.description?.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // Total storage used
  const totalStorage = useMemo(
    () => sessions.reduce((sum, s) => sum + s.fileSizeEstimate, 0),
    [sessions]
  );

  const handleLoadSession = async (sessionId: string) => {
    setSelectedSession(sessionId);
    setLoadingSession(sessionId);
    try {
      await loadSession(sessionId);
    } finally {
      setLoadingSession(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!sessionDeleteId) return;
    await deleteSession(sessionDeleteId);
    if (selectedSession === sessionDeleteId) {
      setSelectedSession(null);
    }
    closeSessionDelete();
  };

  const tabs = [
    {
      id: 'sessions',
      label: `Sessions${sessions.length > 0 ? ` (${sessions.length})` : ''}`,
    },
    {
      id: 'record',
      label: 'Record',
      icon: isRecording ? (
        <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--error)' }} />
      ) : undefined,
    },
  ];

  return (
    <>
      <div
        className="flex-shrink-0 flex flex-col transition-all duration-300 ease-out overflow-hidden"
        style={{
          width: sidebarOpen ? '320px' : '0px',
          background: 'var(--background)',
          borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
        }}
      >
        <div className="w-80 flex flex-col h-full">
          {/* Tabs */}
          <div className="px-3 pt-3 pb-2">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} size="sm" />
          </div>

          {/* Search (sessions tab only) */}
          {activeTab === 'sessions' && (
            <div className="px-3 pb-2">
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                iconLeft={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                }
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {activeTab === 'sessions' ? (
              filteredSessions.length === 0 ? (
                <SessionEmptyState onStartRecording={() => setActiveTab('record')} />
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map((session, i) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      isSelected={selectedSession === session.id}
                      isLoading={loadingSession === session.id}
                      onSelect={() => handleLoadSession(session.id)}
                      index={i}
                    />
                  ))}
                </div>
              )
            ) : (
              <RecordingPanel
                isConnected={isConnected}
                isRecording={isRecording}
                recordingStats={recordingStats}
                onStartRecording={startRecording}
                onStopRecording={stopRecording}
              />
            )}
          </div>

          {/* Footer */}
          <div
            className="px-3 py-2 flex items-center justify-between text-[10px]"
            style={{
              borderTop: '1px solid var(--border)',
              color: 'var(--text-dimmed)',
            }}
          >
            <span>Local storage</span>
            <span className="font-mono">{formatSize(totalStorage)}</span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={!!sessionDeleteId}
        onClose={closeSessionDelete}
        size="sm"
        title="Delete Recording"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeSessionDelete}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          This will permanently delete this recording and all associated data. This action cannot be undone.
        </p>
      </Modal>
    </>
  );
}
