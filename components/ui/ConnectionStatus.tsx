'use client';

import { useEffect, useState } from 'react';
import { wsManager } from '@/lib/websocket/WebSocketManager';

interface ConnectionStatusProps {
  exchangeId: string;
  label?: string;
}

const statusConfig = {
  connecting: { bg: 'var(--warning)', text: 'Connecting...', pulse: true },
  connected: { bg: 'var(--success)', text: 'Connected', pulse: false },
  disconnected: { bg: 'var(--text-muted)', text: 'Disconnected', pulse: false },
  error: { bg: 'var(--error)', text: 'Error', pulse: true },
} as const;

export default function ConnectionStatus({ exchangeId, label }: ConnectionStatusProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  useEffect(() => {
    const unsubscribe = wsManager.onStatusChange(exchangeId, (newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, [exchangeId]);

  const config = statusConfig[status];

  return (
    <div
      className="flex items-center gap-2 text-xs"
      role="status"
      aria-label={`${label || exchangeId}: ${config.text}`}
    >
      <div
        className={`w-2 h-2 rounded-full ${config.pulse ? 'live-dot' : ''}`}
        style={{ backgroundColor: config.bg }}
      />
      <span className="text-[var(--text-secondary)]">
        {label || exchangeId}: {config.text}
      </span>
    </div>
  );
}
