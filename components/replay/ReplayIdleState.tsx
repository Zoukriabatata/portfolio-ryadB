'use client';

export default function ReplayIdleState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center animate-scaleIn">
      <div className="text-center">
        {/* Animated play icon with gradient border */}
        <div className="relative mx-auto mb-5 w-20 h-20">
          <div className="w-20 h-20 rounded-full gradient-border flex items-center justify-center">
            <div
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center animate-breathe"
              style={{ background: 'var(--surface-elevated)' }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: 'var(--primary)' }}
              >
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" opacity="0.3" />
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Select a recording to replay
        </p>
        <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-dimmed)' }}>
          or start a new recording from the sidebar
        </p>

        {/* Keyboard hint */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
            Space
          </kbd>
          to play
          <span style={{ color: 'var(--border-light)' }}>·</span>
          <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface)', border: '1px solid var(--border-light)' }}>
            ?
          </kbd>
          for shortcuts
        </div>
      </div>
    </div>
  );
}
