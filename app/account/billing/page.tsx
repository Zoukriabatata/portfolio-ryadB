// /account/billing — main Stripe Customer Portal entry.
// Redirects to the portal dashboard where the user can manage every
// aspect of their subscription. Direct deep-links to specific flows
// live in the sibling pages (./payment-method, ./cancel, …).

import { BillingError, redirectToStripePortal } from './_portal-redirect';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const error = await redirectToStripePortal('default', '/account/billing');
  if (error) return <BillingError reason={error} />;
  return null;
}
