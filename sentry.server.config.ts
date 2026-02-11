/**
 * SENTRY SERVER CONFIG
 * Configuration pour le monitoring côté serveur (API routes, SSR)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Environnement
  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Configuration serveur spécifique
  beforeSend(event, hint) {
    // Filtrer les erreurs serveur non critiques
    if (event.exception) {
      const error = hint.originalException;

      // Ignorer les erreurs de connexion Binance (déjà loggées)
      if (error instanceof Error && error.message.includes('Binance')) {
        return null;
      }

      // Ignorer les erreurs de rate limiting (normales)
      if (error instanceof Error && error.message.includes('429')) {
        return null;
      }
    }

    return event;
  },

  // Ignore certaines erreurs serveur
  ignoreErrors: [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
  ],

  // Intégrations serveur
  integrations: [
    // Monitoring des requêtes HTTP sortantes
    Sentry.httpIntegration(),
  ],
});
