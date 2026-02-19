export function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-80 animate-fadeIn">
      <div className="w-20 h-20 rounded-2xl bg-[var(--error-bg)] flex items-center justify-center mb-5 border border-red-500/20">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-[var(--text-secondary)] font-semibold text-lg mb-1.5">Something went wrong</p>
      <p className="text-[var(--text-muted)] text-sm mb-5 max-w-xs text-center">{error}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2 bg-[var(--surface-elevated)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] border border-[var(--border)] transition-all duration-200 active:scale-95 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
