/**
 * Setup Stripe Products, Prices, Coupon & Promotion Code
 *
 * Creates the SENULTRA product with monthly/yearly prices,
 * a 100% off coupon, and the SENBETA5 promotion code.
 *
 * Run with: npx ts-node scripts/setup-stripe.ts
 *       or: npx tsx scripts/setup-stripe.ts
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY is not set.');
  console.error('Please set it in your environment or .env.local file.');
  console.error('  export STRIPE_SECRET_KEY="sk_test_..."');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

// -- Constants ---------------------------------------------------------------

const PRODUCT_NAME = 'SENULTRA - Professional Order Flow';
const MONTHLY_PRICE_CENTS = 2900; // $29/month
const YEARLY_PRICE_CENTS = 27900; // $279/year
const COUPON_CODE = 'SENBETA5';
const COUPON_MAX_REDEMPTIONS = 5;

// -- Helpers -----------------------------------------------------------------

async function findExistingProduct(): Promise<Stripe.Product | null> {
  const products = await stripe.products.list({ limit: 100, active: true });
  return products.data.find((p) => p.name === PRODUCT_NAME) ?? null;
}

async function findExistingPrice(
  productId: string,
  unitAmount: number,
  interval: 'month' | 'year'
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  return (
    prices.data.find(
      (p) =>
        p.unit_amount === unitAmount &&
        p.recurring?.interval === interval &&
        p.currency === 'usd'
    ) ?? null
  );
}

async function findExistingCoupon(): Promise<Stripe.Coupon | null> {
  try {
    const coupon = await stripe.coupons.retrieve(COUPON_CODE);
    return coupon;
  } catch (err: unknown) {
    const stripeErr = err as Stripe.errors.StripeError;
    if (stripeErr?.code === 'resource_missing') {
      return null;
    }
    // Fallback: list coupons and search
    try {
      const coupons = await stripe.coupons.list({ limit: 100 });
      return (
        coupons.data.find((c) => c.id === COUPON_CODE || c.name === COUPON_CODE) ?? null
      );
    } catch {
      return null;
    }
  }
}

async function findExistingPromotionCode(
  couponId: string
): Promise<Stripe.PromotionCode | null> {
  const promoCodes = await stripe.promotionCodes.list({
    coupon: couponId,
    limit: 100,
  });
  return promoCodes.data.find((pc) => pc.code === COUPON_CODE) ?? null;
}

// -- Main --------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('============================================================');
  console.log('  Stripe Setup: SENULTRA - Professional Order Flow');
  console.log('============================================================');
  console.log('');

  // 1. Product
  console.log('[1/5] Checking for existing product...');
  let product = await findExistingProduct();

  if (product) {
    console.log('  -> Product already exists: ' + product.id);
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        'Professional-grade order flow analysis platform with real-time footprint charts, liquidity heatmaps, GEX dashboards, and volatility skew tools.',
      metadata: {
        created_by: 'setup-stripe-script',
      },
    });
    console.log('  -> Product created: ' + product.id);
  }

  // 2. Monthly Price ($29/month)
  console.log('[2/5] Checking for monthly price ($29/month)...');
  let monthlyPrice = await findExistingPrice(product.id, MONTHLY_PRICE_CENTS, 'month');

  if (monthlyPrice) {
    console.log('  -> Monthly price already exists: ' + monthlyPrice.id);
  } else {
    monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: MONTHLY_PRICE_CENTS,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      metadata: {
        plan: 'monthly',
        created_by: 'setup-stripe-script',
      },
    });
    console.log('  -> Monthly price created: ' + monthlyPrice.id);
  }

  // 3. Yearly Price ($279/year)
  console.log('[3/5] Checking for yearly price ($279/year)...');
  let yearlyPrice = await findExistingPrice(product.id, YEARLY_PRICE_CENTS, 'year');

  if (yearlyPrice) {
    console.log('  -> Yearly price already exists: ' + yearlyPrice.id);
  } else {
    yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: YEARLY_PRICE_CENTS,
      currency: 'usd',
      recurring: {
        interval: 'year',
      },
      metadata: {
        plan: 'yearly',
        created_by: 'setup-stripe-script',
      },
    });
    console.log('  -> Yearly price created: ' + yearlyPrice.id);
  }

  // 4. Coupon (100% off, forever, max 5 redemptions)
  console.log('[4/5] Checking for SENBETA5 coupon (100% off, forever)...');
  let coupon = await findExistingCoupon();

  if (coupon) {
    console.log('  -> Coupon already exists: ' + coupon.id);
  } else {
    coupon = await stripe.coupons.create({
      id: COUPON_CODE,
      name: COUPON_CODE,
      percent_off: 100,
      duration: 'forever',
      max_redemptions: COUPON_MAX_REDEMPTIONS,
      metadata: {
        created_by: 'setup-stripe-script',
        description: 'Beta tester coupon - 100% off forever (max 5 users)',
      },
    });
    console.log('  -> Coupon created: ' + coupon.id);
  }

  // 5. Promotion Code linked to coupon
  console.log('[5/5] Checking for SENBETA5 promotion code...');
  let promoCode = await findExistingPromotionCode(coupon.id);

  if (promoCode) {
    console.log(
      '  -> Promotion code already exists: ' + promoCode.id + ' (code: ' + promoCode.code + ')'
    );
  } else {
    promoCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: COUPON_CODE,
      max_redemptions: COUPON_MAX_REDEMPTIONS,
      metadata: {
        created_by: 'setup-stripe-script',
      },
    });
    console.log(
      '  -> Promotion code created: ' + promoCode.id + ' (code: ' + promoCode.code + ')'
    );
  }

  // -- Summary ---------------------------------------------------------------

  console.log('');
  console.log('============================================================');
  console.log('  Setup Complete!');
  console.log('============================================================');
  console.log('');
  console.log('Add the following to your .env.local:');
  console.log('');
  console.log('  # Stripe Product & Price IDs');
  console.log('  STRIPE_PRODUCT_ID="' + product.id + '"');
  console.log('  STRIPE_MONTHLY_PRICE_ID="' + monthlyPrice.id + '"');
  console.log('  STRIPE_YEARLY_PRICE_ID="' + yearlyPrice.id + '"');
  console.log('  STRIPE_COUPON_ID="' + coupon.id + '"');
  console.log('  STRIPE_PROMO_CODE_ID="' + promoCode.id + '"');
  console.log('');
  console.log('Summary:');
  console.log('  Product:        ' + PRODUCT_NAME);
  console.log(
    '  Monthly:        $' + (MONTHLY_PRICE_CENTS / 100) + '/month  (' + monthlyPrice.id + ')'
  );
  console.log(
    '  Yearly:         $' + (YEARLY_PRICE_CENTS / 100) + '/year   (' + yearlyPrice.id + ')'
  );
  console.log(
    '  Coupon:         ' +
      COUPON_CODE +
      ' - 100% off, forever, max ' +
      COUPON_MAX_REDEMPTIONS +
      ' redemptions'
  );
  console.log('  Promotion Code: ' + promoCode.code + ' (' + promoCode.id + ')');
  console.log('');
}

main().catch((error) => {
  console.error('');
  console.error('ERROR: Stripe setup failed.');
  console.error('');

  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    console.error('  Authentication failed. Check your STRIPE_SECRET_KEY.');
    console.error(
      '  Make sure you are using a valid secret key (sk_test_... or sk_live_...).'
    );
  } else if (error instanceof Stripe.errors.StripePermissionError) {
    console.error(
      '  Permission denied. Your API key may not have the required permissions.'
    );
  } else if (error instanceof Stripe.errors.StripeRateLimitError) {
    console.error('  Rate limit exceeded. Please wait a moment and try again.');
  } else if (error instanceof Stripe.errors.StripeConnectionError) {
    console.error(
      '  Could not connect to Stripe. Check your internet connection.'
    );
  } else if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    console.error('  Invalid request: ' + error.message);
  } else {
    console.error('  ' + (error.message || error));
  }

  console.error('');
  process.exit(1);
});
