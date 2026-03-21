/**
 * STRIPE PAYMENT INTEGRATION
 *
 * Subscription management for SENZOUKRIA
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY - payments will not work');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  typescript: true,
});

// ============ PRICE CONFIG ============

export const STRIPE_PRICES = {
  ULTRA: {
    monthly: process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_ULTRA_MONTHLY_PRICE_ID || '',
    yearly: process.env.STRIPE_YEARLY_PRICE_ID || process.env.STRIPE_ULTRA_YEARLY_PRICE_ID || '',
  },
  RESEARCH_PACK: process.env.STRIPE_RESEARCH_PACK_PRICE_ID || '',
};

// ============ CUSTOMER MANAGEMENT ============

export async function createOrGetCustomer(
  email: string,
  name: string | null,
  userId: string
): Promise<string> {
  // Search for existing customer
  const existingCustomers = await stripe.customers.list({
    email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0].id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId,
    },
  });

  return customer.id;
}

// ============ CHECKOUT SESSION ============

export interface CreateCheckoutParams {
  customerId: string;
  userId: string;
  tier: 'ULTRA';
  billingPeriod: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  couponId?: string; // Optional Stripe coupon ID
  promoCodeUsageId?: string; // Optional promo code usage tracking ID
  trialDays?: number; // Optional trial period in days
}

export async function createCheckoutSession(params: CreateCheckoutParams): Promise<string> {
  const { customerId, userId, tier, billingPeriod, successUrl, cancelUrl, couponId, promoCodeUsageId, trialDays } = params;

  const priceId = STRIPE_PRICES[tier][billingPeriod];

  if (!priceId || !priceId.startsWith('price_')) {
    throw new Error(
      `Stripe price not configured for ${tier} ${billingPeriod}. ` +
      `Run: npx tsx scripts/setup-stripe.ts to create prices, then add IDs to .env.local`
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(couponId && { discounts: [{ coupon: couponId }] }), // Apply coupon if provided
    metadata: {
      userId,
      tier,
      billingPeriod,
      ...(promoCodeUsageId && { promoCodeUsageId }), // Include usage ID for webhook
    },
    subscription_data: {
      metadata: {
        userId,
        tier,
      },
      ...(trialDays && { trial_period_days: trialDays }), // Add trial period if provided
    },
    allow_promotion_codes: true,
  });

  return session.url!;
}

// ============ ONE-TIME PURCHASE CHECKOUT ============

export interface CreateOneTimeCheckoutParams {
  customerId: string;
  userId: string;
  product: 'research-pack';
  successUrl: string;
  cancelUrl: string;
}

export async function createOneTimeCheckoutSession(params: CreateOneTimeCheckoutParams): Promise<string> {
  const { customerId, userId, product, successUrl, cancelUrl } = params;

  const priceId = STRIPE_PRICES.RESEARCH_PACK;

  if (!priceId || !priceId.startsWith('price_')) {
    throw new Error(
      `Stripe price not configured for ${product}. ` +
      `Create a one-time $50 product in Stripe Dashboard and set STRIPE_RESEARCH_PACK_PRICE_ID in .env`
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment', // one-time payment, not subscription
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      product, // 'research-pack'
    },
  });

  return session.url!;
}

// ============ SUBSCRIPTION MANAGEMENT ============

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

// ============ CUSTOMER PORTAL ============

export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

// ============ WEBHOOKS ============

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
