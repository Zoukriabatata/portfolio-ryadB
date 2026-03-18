'use client';

import type { ConnectionStatus } from '@/stores/useLiveStore';

interface ConnectionStatusProps {
  status: ConnectionStatus;
  symbol?: string;
  className?: string;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; dotColor: string; animate: boolean }
> = {
  connected:    { label: 'Live',         color: '#22c55e', dotColor: '#22c55e', animate: true },
  connecting:   { label: 'Connecting…',  color: '#f59e0b', dotColor: '#f59e0b', animate: true },
  disconnected: { label: 'Disconnected', color: '#6b7280', dotColor: '#6b7280', animate: false },
  error:        { label: 'Error',        color: '#ef4444', dotColor: '#ef4444', animate: false },
};

export function ConnectionStatusBadge({ status, symbol, className = '' }: ConnectionStatusProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: `${cfg.color}18`,
        border: `1px solid ${cfg.color}40`,
        color: cfg.color,
      }}
    >
      {/* Animated dot */}
      <span className="relative flex h-1.5 w-1.5">
        {cfg.animate && (
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ backgroundColor: cfg.dotColor }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: cfg.dotColor }}
        />
      </span>

      {symbol && <span className="font-bold">{symbol}</span>}
      <span>{cfg.label}</span>
    </div>
  );
}
