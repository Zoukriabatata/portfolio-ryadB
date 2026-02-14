/**
 * SENTRY CLIENT CONFIG
 * Configuration pour le monitoring côté client (navigateur)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring — disabled for bundle size
  tracesSampleRate: 0,

  // Session Replay — disabled for bundle size
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Environnement
  environment: process.env.NODE_ENV || 'development',

  // Release tracking (utile pour voir quelle version a des bugs)
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Configuration avancée
  beforeSend(event, hint) {
    // Filtrer les erreurs non critiques
    if (event.exception) {
      const error = hint.originalException;

      // Ignorer les erreurs réseau (déjà gérées par le WebSocket)
      if (error instanceof Error && error.message.includes('WebSocket')) {
        return null;
      }

      // Ignorer les erreurs de timeout (normales en dev)
      if (error instanceof Error && error.message.includes('timeout')) {
        return null;
      }
    }

    return event;
  },

  // Ignore certaines erreurs communes
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    'NotAllowedError: play() failed',
  ],

  // Keep only basic error reporting — replay & tracing removed for perf
  integrations: [],
});
