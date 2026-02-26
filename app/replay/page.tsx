'use client';

import { useEffect } from 'react';
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

export default function ReplayPage() {
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

    const connector = (mgr as any).connector;
    if (!connector) return;

    const unsub1 = connector.onTrade((trade: any) => recorder.recordTrade(trade));
    const unsub2 = connector.onDepth((depth: any) => recorder.recordDepth(depth));

    return () => {
      unsub1();
      unsub2();
    };
  }, [replay.isRecording]);

  return (
    <div className="h-[calc(100svh-56px)] flex overflow-hidden animate-fadeIn">
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
  );
}
