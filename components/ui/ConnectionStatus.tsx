'use client';

import { useEffect, useState } from 'react';
import { wsManager } from '@/lib/websocket/WebSocketManager';

interface ConnectionStatusProps {
  exchangeId: string;
  label?: string;
}

export default function ConnectionStatus({ exchangeId, label }: ConnectionStatusProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  useEffect(() => {
    const unsubscribe = wsManager.onStatusChange(exchangeId, (newStatus) => {
      setStatus(newStatus);
    });

    return unsubscribe;
  }, [exchangeId]);

  const statusConfig = {
    connecting: { color: 'bg-yellow-500', text: 'Connecting...' },
    connected: { color: 'bg-green-500', text: 'Connected' },
    disconnected: { color: 'bg-zinc-500', text: 'Disconnected' },
    error: { color: 'bg-red-500', text: 'Error' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-2 h-2 rounded-full ${config.color} ${status === 'connecting' ? 'animate-pulse' : ''}`} />
      <span className="text-zinc-400">
        {label || exchangeId}: {config.text}
      </span>
    </div>
  );
}
