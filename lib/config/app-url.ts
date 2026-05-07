/**
 * Resolve the app's canonical URL for Stripe redirect flows.
 *
 * Used by: /api/stripe/checkout (success/cancel) and /api/stripe/portal (return).
 * NOT used for SEO assets (layout, robots, sitemap) which keep their own
 * fallback to senzoukria.com — a deliberate semantic choice.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_APP_URL — explicit override (not set on Vercel today)
 * 2. NEXTAUTH_URL — canonical URL on Vercel Production (https://orderflow-v2.vercel.app)
 * 3. http://localhost:3000 — local dev fallback
 */
export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}
