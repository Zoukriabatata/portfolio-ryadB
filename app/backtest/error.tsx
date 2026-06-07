'use client';

import { useEffect } from 'react';

export default function BacktestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Backtest Error]', error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center text-[var(--bear)]"
          style={{ background: 'var(--bear-bg)', border: '1px solid rgb(var(--bear-rgb) / 0.2)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-1">
          Backtest Error
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Failed to load backtesting engine. Please try again.
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
