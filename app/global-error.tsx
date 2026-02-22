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
      <body style={{ margin: 0, backgroundColor: '#0a0a0f', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div style={{
              width: 56, height: 56, margin: '0 auto 1rem',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
              Erreur critique
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.6 }}>
              Une erreur inattendue s&apos;est produite. Veuillez rafraichir la page.
            </p>
            {error.digest && (
              <p style={{
                fontSize: 10, color: 'rgba(255,255,255,0.2)', marginBottom: 16,
                fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)',
                borderRadius: 8, padding: '8px 12px',
              }}>
                Ref: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: '10px 20px', fontSize: '0.875rem', fontWeight: 500,
                borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
            >
              Rafraichir la page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
