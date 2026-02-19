'use client';

interface SessionEmptyStateProps {
  onStartRecording: () => void;
}

export default function SessionEmptyState({ onStartRecording }: SessionEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 animate-scaleIn">
      {/* Animated play icon */}
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-full gradient-border flex items-center justify-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center animate-breathe"
            style={{ background: 'var(--surface-elevated)' }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: 'var(--primary)' }}
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none" />
            </svg>
          </div>
        </div>
      </div>

      <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
        No recordings yet
      </p>
      <p className="text-xs text-[var(--text-dimmed)] text-center mb-4 max-w-[200px]">
        Connect to IB Gateway and start recording CME data to build your replay library
      </p>
      <button
        onClick={onStartRecording}
        className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97]"
        style={{ background: 'var(--primary)', color: 'white' }}
      >
        Start Recording
      </button>
    </div>
  );
}
