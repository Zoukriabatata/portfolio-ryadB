'use client';

import Button from '@/components/ui/Button';
import { formatDuration } from './utils';

interface ReplayFinishedOverlayProps {
  totalTrades: number;
  durationMs: number;
  onReplay: () => void;
  onClose: () => void;
}

export default function ReplayFinishedOverlay({
  totalTrades,
  durationMs,
  onReplay,
  onClose,
}: ReplayFinishedOverlayProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div
        className="glass rounded-2xl p-6 text-center max-w-sm animate-scaleIn"
        style={{ border: '1px solid var(--glass-border)' }}
      >
        {/* Animated checkmark */}
        <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--success-bg)' }}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-check"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Replay Complete
        </h3>
        <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
          {totalTrades.toLocaleString()} trades processed in {formatDuration(durationMs)}
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" size="md" onClick={onReplay}>
            Replay Again
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
