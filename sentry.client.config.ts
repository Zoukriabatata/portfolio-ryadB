/**
 * SENTRY CLIENT CONFIG
 * Configuration pour le monitoring côté client (navigateur)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% en prod, 100% en dev

  // Session Replay (utile pour debugging)
  replaysSessionSampleRate: 0.1, // 10% des sessions normales
  replaysOnErrorSampleRate: 1.0, // 100% des sessions avec erreurs

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

  // Breadcrumbs (historique d'actions avant l'erreur)
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false, // Masquer le texte sensible
      blockAllMedia: true, // Bloquer images/vidéos
    }),
    Sentry.browserTracingIntegration(),
  ],
});
