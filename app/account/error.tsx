'use client';

import { useEffect } from 'react';

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Account Error]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-[var(--text-primary,rgba(255,255,255,0.9))] mb-1">
          Erreur du compte
        </h3>
        <p className="text-xs text-[var(--text-muted,rgba(255,255,255,0.4))] mb-4">
          Impossible de charger les donn&eacute;es du compte.
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
