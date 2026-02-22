'use client';

import { useEffect } from 'react';

export default function ReplayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Replay Error]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-[var(--text-primary,rgba(255,255,255,0.9))] mb-1">
          Erreur du replay
        </h3>
        <p className="text-xs text-[var(--text-muted,rgba(255,255,255,0.4))] mb-4">
          Impossible de charger le replay de session.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white/80 border border-white/10 transition-colors cursor-pointer"
        >
          R&eacute;essayer
        </button>
      </div>
    </div>
  );
}
