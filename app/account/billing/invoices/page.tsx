// /account/billing/invoices — Stripe Customer Portal landing. The
// portal exposes a prominent "Invoice history" section once open, so
// the user is one click away from their billing history. Stripe's
// flow_data does not yet support a direct invoice deep-link (Nov 2026
// API) — we route through the default dashboard.

import { BillingError, redirectToStripePortal } from '../_portal-redirect';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const error = await redirectToStripePortal(
    'invoice_history',
    '/account/billing/invoices',
  );
  if (error) return <BillingError reason={error} />;
  return null;
}
