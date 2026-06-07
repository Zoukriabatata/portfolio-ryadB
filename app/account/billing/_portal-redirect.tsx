/**
 * Shared server-side flow used by every `/account/billing/*` page.
 *
 * 1. Verifies the user is authenticated — bounces to /auth/login with
 *    a callbackUrl pointing back to the same billing page so they
 *    land where they tried to go after signing in.
 * 2. Looks up the Stripe `customerId` on the User row.
 * 3. Creates a Customer Portal session with the requested deep-link
 *    flow (payment_method_update / subscription_cancel / default).
 * 4. Server-side `redirect()` to the Stripe-hosted URL.
 *
 * No JSX is rendered: by the time React thinks about painting, the
 * browser is already at `https://billing.stripe.com/...`. If anything
 * fails (no customerId, Stripe down, ...), we fall back to a small
 * inline error component.
 */

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { createPortalSession, type PortalFlow } from '@/lib/stripe';
import { getAppUrl } from '@/lib/config/app-url';

export type BillingErrorReason =
  | 'no_subscription'
  | 'stripe_error'
  | 'no_customer';

export async function redirectToStripePortal(
  flow: PortalFlow,
  callbackPath: string,
): Promise<BillingErrorReason | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) return 'no_customer';
  if (!user.customerId) return 'no_subscription';

  try {
    const baseUrl = getAppUrl();
    const portalUrl = await createPortalSession(
      user.customerId,
      `${baseUrl}/account`,
      flow,
      user.subscriptionId,
    );
    redirect(portalUrl);
  } catch (err) {
    // `redirect()` throws a special NEXT_REDIRECT error that must
    // propagate. Anything else is a real Stripe failure.
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[/account/billing] Stripe portal session failed:', err);
    return 'stripe_error';
  }

  return null;
}

/**
 * Inline error UI rendered when `redirectToStripePortal` returns a
 * non-null reason (no customerId yet, Stripe API down, …). Lets the
 * user recover with a link back to /account or /pricing.
 */
export function BillingError({ reason }: { reason: BillingErrorReason }) {
  const messages: Record<BillingErrorReason, { title: string; sub: string; cta: { href: string; label: string } }> = {
    no_subscription: {
      title: 'No active subscription',
      sub: "You don't have a Senzoukria plan yet. Pick one to unlock the dashboard.",
      cta: { href: '/pricing', label: 'See plans →' },
    },
    no_customer: {
      title: 'Account not found',
      sub: 'We could not locate your user record. Please sign out and back in.',
      cta: { href: '/account', label: 'Back to account' },
    },
    stripe_error: {
      title: 'Billing portal unavailable',
      sub: 'We could not reach Stripe right now. Try again in a moment, or contact support.',
      cta: { href: '/account', label: 'Back to account' },
    },
  };
  const m = messages[reason];
  return (
    <main style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          padding: 32,
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          textAlign: 'center',
          color: 'var(--text-primary)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            margin: '0 auto 16px',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--warning-bg)',
            border: '1px solid rgb(var(--warning-rgb) / 0.25)',
            color: 'var(--warning)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          · Billing
        </div>
        <div className="font-display" style={{ fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>{m.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 22 }}>
          {m.sub}
        </div>
        <a
          href={m.cta.href}
          className="btn-brand"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 18px', borderRadius: 10, textDecoration: 'none', fontSize: 13 }}
        >
          {m.cta.label}
        </a>
      </div>
    </main>
  );
}
