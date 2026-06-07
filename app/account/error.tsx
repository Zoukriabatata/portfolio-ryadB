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
          className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center text-[var(--bear)]"
          style={{ background: 'var(--bear-bg)', border: '1px solid rgb(var(--bear-rgb) / 0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-1">
          Account Error
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Failed to load account data. Please try again.
        </p>
        {error.digest && (
          <p className="text-[10px] text-[var(--text-dimmed)] mb-3 font-mono">Ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="btn-brand-ghost px-4 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
