// /account/billing/payment-method — opens the Stripe Customer Portal
// directly on the "Update payment method" flow. The user can swap card
// or add a new one without navigating through the dashboard.

import { BillingError, redirectToStripePortal } from '../_portal-redirect';

export const dynamic = 'force-dynamic';

export default async function PaymentMethodPage() {
  const error = await redirectToStripePortal(
    'payment_method_update',
    '/account/billing/payment-method',
  );
  if (error) return <BillingError reason={error} />;
  return null;
}
