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
  connected:    { label: 'Live',         color: 'var(--bull)',       dotColor: 'var(--bull)',       animate: true },
  connecting:   { label: 'Connecting…',  color: 'var(--warning)',    dotColor: 'var(--warning)',    animate: true },
  disconnected: { label: 'Disconnected', color: 'var(--text-muted)', dotColor: 'var(--text-muted)', animate: false },
  error:        { label: 'Error',        color: 'var(--bear)',       dotColor: 'var(--bear)',       animate: false },
};

export function ConnectionStatusBadge({ status, symbol, className = '' }: ConnectionStatusProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${cfg.color} 9%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
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
