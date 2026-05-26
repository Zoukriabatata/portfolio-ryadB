// /account/billing/cancel — opens the Stripe Customer Portal directly
// on the "Cancel subscription" flow. Stripe handles the confirmation
// step + offers retention discounts if you have any configured.

import { BillingError, redirectToStripePortal } from '../_portal-redirect';

export const dynamic = 'force-dynamic';

export default async function CancelPage() {
  const error = await redirectToStripePortal(
    'subscription_cancel',
    '/account/billing/cancel',
  );
  if (error) return <BillingError reason={error} />;
  return null;
}
