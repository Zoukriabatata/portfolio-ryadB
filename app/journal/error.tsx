'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function JournalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { errorBoundary: 'journal' } });
    console.error('[Journal Error]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-[var(--text-primary,rgba(255,255,255,0.9))] mb-1">
          Journal Error
        </h3>
        <p className="text-xs text-[var(--text-muted,rgba(255,255,255,0.4))] mb-4">
          Failed to load trading journal. Please try again.
        </p>
        {error.digest && (
          <p className="text-[10px] text-white/20 mb-3 font-mono">Ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white/80 border border-white/10 transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
