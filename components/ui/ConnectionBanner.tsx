'use client';

import { useState, useEffect, useRef } from 'react';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';

export default function ConnectionBanner() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [visible, setVisible] = useState(false);
  const wasConnected = useRef(false);
  const visibleRef = useRef(false);
  const hideTimer = useRef<NodeJS.Timeout>(undefined);

  // Keep ref in sync with state
  visibleRef.current = visible;

  useEffect(() => {
    const ws = getBinanceLiveWS();
    const unsubscribe = ws.onStatus((newStatus: ConnectionStatus) => {
      setStatus(newStatus);

      if (newStatus === 'connected') {
        // Only show "Reconnected" if we lost connection before
        if (wasConnected.current && visibleRef.current) {
          clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setVisible(false), 2000);
        }
        wasConnected.current = true;
      } else if (newStatus === 'connecting' && wasConnected.current) {
        // Show reconnecting banner only if we were previously connected
        setVisible(true);
      } else if (newStatus === 'error') {
        setVisible(true);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  const isConnecting = status === 'connecting';
  const isError = status === 'error';
  const isConnected = status === 'connected';

  const bannerColor = isConnected ? 'success' : isError ? 'error' : 'warning';
  const colorMap = {
    success: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--success)' },
    error: { bg: 'var(--error-bg)', border: 'var(--error)', text: 'var(--error)' },
    warning: { bg: 'var(--warning-bg)', border: 'var(--warning)', text: 'var(--warning)' },
  };
  const colors = colorMap[bannerColor];

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-medium transition-all duration-300 animate-slideDown"
      style={{
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`,
        color: colors.text,
        backdropFilter: 'blur(8px)',
      }}
    >
      {isConnecting && (
        <>
          <div className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
          <span>Reconnecting to market data...</span>
        </>
      )}
      {isError && (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span>Connection lost. Retrying...</span>
        </>
      )}
      {isConnected && (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span>Reconnected</span>
        </>
      )}
    </div>
  );
}
