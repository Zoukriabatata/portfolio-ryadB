'use client';
import LogoMark from './LogoMark';

interface LockupProps {
  markSize?: number;
  animated?: boolean;
  showDescriptor?: boolean;
}

/** Lockup display : mark Sz + wordmark SENZOUKRIA + descripteur. */
export default function Lockup({ markSize = 44, animated = true, showDescriptor = true }: LockupProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: markSize * 0.6 }}>
      <LogoMark size={markSize} animated={animated} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 600,
            fontSize: markSize * 0.8,
            lineHeight: 0.94,
            letterSpacing: '-.015em',
            color: 'var(--text-primary)',
          }}
        >
          SENZOUKRIA
        </span>
        {showDescriptor && (
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 10,
              letterSpacing: '.28em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginTop: 6,
            }}
          >
            The Science of Orderflow
          </span>
        )}
      </div>
    </div>
  );
}
