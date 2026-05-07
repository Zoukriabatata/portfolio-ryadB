/**
 * Quick smoke test: confirm STRIPE_PRO_MONTHLY_PRICE_ID resolves to a real
 * Stripe price object (and matches our specs: $29 USD, monthly recurring).
 *
 * Usage:
 *   npx tsx scripts/verify-stripe-pro-price.ts            # test mode
 *   npx tsx scripts/verify-stripe-pro-price.ts --live     # live mode
 *
 * --live skips loading .env.local (so it doesn't override the explicit
 * sk_live_/price_live_ vars set in the current shell) and asserts
 * livemode=true on the returned price. Default mode keeps the existing
 * test-mode assertion so dev runs catch a stray sk_live_ leak.
 *
 * Exits with non-zero code on any mismatch so it can gate CI later.
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import Stripe from 'stripe';

const isLive = process.argv.includes('--live');

if (!isLive) {
  // Default: load .env.local for dev. Skipped in --live so the operator
  // can run this with sk_live_/price_live_ exported in the shell, without
  // having to wipe their .env.local sk_test_ values.
  loadEnv({ path: '.env.local' });
}

const secret  = process.env.STRIPE_SECRET_KEY ?? '';
const priceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? '';

if (!secret || !secret.startsWith('sk_')) {
  console.error('[verify] STRIPE_SECRET_KEY missing or malformed');
  process.exit(1);
}
if (!priceId) {
  console.error('[verify] STRIPE_PRO_MONTHLY_PRICE_ID is empty');
  process.exit(1);
}

if (isLive) {
  console.log('[verify] ⚠️  RUNNING IN LIVE MODE — asserting livemode=true');
  if (!secret.startsWith('sk_live_')) {
    console.error('[verify] FAIL — --live passed but STRIPE_SECRET_KEY is not sk_live_…');
    process.exit(1);
  }
}

const stripe = new Stripe(secret);

(async () => {
  console.log(`[verify] Looking up ${priceId}...`);
  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  } catch (err) {
    console.error(`[verify] FAIL — Stripe rejected the price ID: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Detailed dump
  const product = typeof price.product === 'object' ? price.product as Stripe.Product : null;
  const amountStr = price.unit_amount != null
    ? `$${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`
    : '(no unit_amount)';

  console.log('');
  console.log(`  id          : ${price.id}`);
  console.log(`  active      : ${price.active}`);
  console.log(`  livemode    : ${price.livemode}`);
  console.log(`  product     : ${product ? `${product.id} (${product.name})` : '(deleted?)'}`);
  console.log(`  amount      : ${amountStr}`);
  console.log(`  type        : ${price.type}`);
  console.log(`  interval    : ${price.recurring?.interval ?? '-'}`);
  console.log(`  intvl_count : ${price.recurring?.interval_count ?? '-'}`);
  console.log(`  tax_behavior: ${price.tax_behavior ?? '-'}`);

  // Spec checks — fail loud on any mismatch
  const issues: string[] = [];
  if (!price.active)                                                   issues.push('price is NOT active');
  if (price.livemode !== isLive)                                       issues.push(`livemode=${price.livemode}, expected ${isLive}`);
  if (price.currency !== 'usd')                                        issues.push(`currency=${price.currency}, expected usd`);
  if (price.unit_amount !== 2900)                                      issues.push(`unit_amount=${price.unit_amount}, expected 2900`);
  if (price.type !== 'recurring')                                      issues.push(`type=${price.type}, expected recurring`);
  if (price.recurring?.interval !== 'month')                           issues.push(`interval=${price.recurring?.interval}, expected month`);
  if ((price.recurring?.interval_count ?? 1) !== 1)                    issues.push(`interval_count=${price.recurring?.interval_count}, expected 1`);

  if (issues.length > 0) {
    console.error('\n[verify] FAIL — spec mismatches:');
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }

  console.log(`\n[verify] OK — price matches spec ($29.00 USD/month, ${isLive ? 'LIVE' : 'test'} mode, active)`);
})().catch(err => {
  console.error('[verify] unexpected error:', err);
  process.exit(1);
});
