/**
 * SENTRY EDGE CONFIG
 * Configuration pour l'Edge Runtime (Middleware, Edge API Routes)
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring (réduit pour Edge)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0, // 5% en prod

  // Environnement
  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  // Configuration Edge minimale (Edge Runtime a des limites)
  beforeSend(event) {
    // Pas de filtrage complexe sur Edge (limites de mémoire)
    return event;
  },
});
