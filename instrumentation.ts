/**
 * INSTRUMENTATION - Next.js 15+
 *
 * Ce fichier est automatiquement chargé par Next.js au démarrage.
 * Utilisé pour initialiser les outils de monitoring (Sentry, OpenTelemetry, etc.)
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Charge Sentry uniquement si on est en production ou si explicitement activé
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server runtime (API routes, SSR)
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime (Middleware, Edge API routes)
    await import('./sentry.edge.config');
  }
}

export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: Headers;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
    revalidateReason?: 'on-demand' | 'stale';
    renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering';
  }
) => {
  // Cette fonction est appelée automatiquement par Next.js quand une requête échoue
  // Sentry capture déjà les erreurs via ses propres hooks, mais on peut ajouter du contexte ici
  const Sentry = await import('@sentry/nextjs');

  Sentry.captureException(err, {
    tags: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
    },
    contexts: {
      request: {
        url: request.path,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      },
      nextjs: {
        routePath: context.routePath,
        revalidateReason: context.revalidateReason,
        renderSource: context.renderSource,
      },
    },
  });
};
