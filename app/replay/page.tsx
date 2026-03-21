'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReplay } from '@/hooks/useReplay';
import { useReplayKeyboard } from '@/hooks/useReplayKeyboard';
import { useIBConnection } from '@/hooks/useIBConnection';
import { getReplayRecorder } from '@/lib/replay';
import { getIBConnectionManager } from '@/lib/ib/ConnectionManager';
import SessionSidebar from '@/components/replay/SessionSidebar';
import ReplayViewer from '@/components/replay/ReplayViewer';
import SessionInfoModal from '@/components/replay/SessionInfoModal';
import SessionRenameModal from '@/components/replay/SessionRenameModal';
import KeyboardShortcutsHelp from '@/components/replay/KeyboardShortcutsHelp';
import dynamic from 'next/dynamic';

const BacktestPage = dynamic(() => import('@/app/backtest/page'), { ssr: false });

type PageTab = 'replay' | 'backtest';

function ReplayPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<PageTab>(
    (searchParams.get('tab') as PageTab) || 'replay'
  );

  const replay = useReplay();
  const { isConnected } = useIBConnection();

  // Keyboard shortcuts
  useReplayKeyboard(replay);

  // Wire IB data to recorder when recording
  useEffect(() => {
    if (!replay.isRecording) return;

    const recorder = getReplayRecorder();
    const mgr = getIBConnectionManager();

    if (!mgr.isConnected()) return;

    const unsub1 = mgr.onTrade((trade: any) => recorder.recordTrade(trade));
    const unsub2 = mgr.onDepth((depth: any) => recorder.recordDepth(depth));

    return () => {
      unsub1();
      unsub2();
    };
  }, [replay.isRecording]);

  return (
    <div className="h-[calc(100svh-56px)] flex flex-col overflow-hidden animate-fadeIn">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
        {(['replay', 'backtest'] as PageTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: activeTab === tab ? 'var(--surface-elevated)' : 'transparent',
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'replay' ? (
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="animate-slideInLeft" style={{ animationDuration: '300ms' }}>
            <SessionSidebar />
          </div>
          <div className="flex-1 flex flex-col h-full min-h-0 animate-slideUp" style={{ animationDuration: '400ms', animationDelay: '100ms', animationFillMode: 'both' }}>
            <ReplayViewer />
          </div>
          <SessionInfoModal />
          <SessionRenameModal />
          <KeyboardShortcutsHelp />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <BacktestPage />
        </div>
      )}
    </div>
  );
}

export default function ReplayPage() {
  return (
    <Suspense fallback={null}>
      <ReplayPageInner />
    </Suspense>
  );
}
