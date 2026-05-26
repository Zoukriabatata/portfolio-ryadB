// /account/billing/renew — re-subscribe flow.
//
// Behaviour:
//   • Signed-out → bounce to /auth/login?callbackUrl=/account/billing/renew
//   • Active subscription → land on /account/billing (manage existing)
//   • No customerId (never subscribed) → bounce to /pricing for first-time checkout
//   • Expired/canceled subscription with customerId → open Stripe portal so
//     the user can pick a plan + reactivate without re-entering payment

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { BillingError, redirectToStripePortal } from '../_portal-redirect';

export const dynamic = 'force-dynamic';

export default async function RenewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent('/account/billing/renew')}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  // Never had a Stripe customer → must go through full checkout flow.
  if (!user?.customerId) {
    redirect('/pricing');
  }

  // Active subscription → no renewal needed, drop them in the portal
  // dashboard so they can adjust if they wanted to.
  const isActive =
    user.subscriptionTier !== 'FREE' &&
    user.subscriptionEnd &&
    user.subscriptionEnd.getTime() > Date.now();

  if (isActive) {
    redirect('/account/billing');
  }

  // Expired / canceled → portal lets them re-subscribe with stored payment.
  const error = await redirectToStripePortal('default', '/account/billing/renew');
  if (error) return <BillingError reason={error} />;
  return null;
}
