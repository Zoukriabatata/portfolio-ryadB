'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { errorBoundary: 'global-error' },
    });
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#0a0a0f', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Ambient glow */}
          <div style={{
            position: 'absolute',
            top: '30%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(239,68,68,0.06) 0%, transparent 70%)',
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }} />

          <div style={{ textAlign: 'center', maxWidth: '28rem', position: 'relative', zIndex: 1 }}>
            {/* Error icon with glow */}
            <div style={{
              width: 64, height: 64, margin: '0 auto 1.5rem',
              borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
              boxShadow: '0 0 40px rgba(239,68,68,0.1)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
              Critical Error
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.7 }}>
              Something went seriously wrong. Please refresh the page to continue.
            </p>

            {error.digest && (
              <p style={{
                fontSize: 10, color: 'rgba(255,255,255,0.2)', marginBottom: 20,
                fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)',
                borderRadius: 10, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                Ref: {error.digest}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 24px', fontSize: '0.875rem', fontWeight: 500,
                  borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                </svg>
                Refresh Page
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error runs outside app layout, Link is unavailable */}
              <a
                href="/"
                style={{
                  padding: '10px 24px', fontSize: '0.875rem', fontWeight: 500,
                  borderRadius: 12, border: '1px solid rgba(74,222,128,0.25)',
                  background: 'rgba(74,222,128,0.1)', color: '#86efac',
                  cursor: 'pointer', transition: 'all 0.2s',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(74,222,128,0.18)';
                  e.currentTarget.style.borderColor = 'rgba(74,222,128,0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(74,222,128,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(74,222,128,0.25)';
                }}
              >
                Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
