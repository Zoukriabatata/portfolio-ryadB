/**
 * PAYPAL WEBHOOK (IPN)
 *
 * Receives PayPal payment notifications and activates subscriptions.
 * Supports both subscription payments and one-time payments.
 *
 * Setup: Add this URL in PayPal IPN settings:
 *   https://yourdomain.com/api/paypal/webhook
 *
 * Env vars:
 *   PAYPAL_WEBHOOK_ID - PayPal webhook ID for verification
 *   PAYPAL_CLIENT_ID - PayPal client ID
 *   PAYPAL_CLIENT_SECRET - PayPal client secret
 *   PAYPAL_MODE - 'sandbox' or 'live'
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_BASE_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Verify PayPal webhook signature
 */
async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn('[PayPal] No PAYPAL_WEBHOOK_ID set, skipping verification in dev');
    return process.env.NODE_ENV === 'development';
  }

  try {
    const token = await getPayPalAccessToken();

    const verifyRes = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        auth_algo: req.headers.get('paypal-auth-algo'),
        cert_url: req.headers.get('paypal-cert-url'),
        transmission_id: req.headers.get('paypal-transmission-id'),
        transmission_sig: req.headers.get('paypal-transmission-sig'),
        transmission_time: req.headers.get('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });

    const result = await verifyRes.json();
    return result.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('[PayPal] Webhook verification failed:', error);
    return false;
  }
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Verify webhook signature
  const isValid = await verifyWebhook(req, body);
  if (!isValid) {
    console.error('[PayPal] Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);
  const eventType = event.event_type;

  console.debug(`[PayPal] Webhook event: ${eventType}`);

  try {
    switch (eventType) {
      // Subscription activated (initial payment or reactivation)
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.RENEWED': {
        const sub = event.resource;
        const payerEmail = sub.subscriber?.email_address?.toLowerCase();
        const subscriptionId = sub.id;

        if (!payerEmail) break;

        const user = await prisma.user.findUnique({ where: { email: payerEmail } });
        if (!user) {
          console.warn(`[PayPal] No user found for email: ${payerEmail}`);
          break;
        }

        // Activate subscription - 1 month from now
        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionTier: 'ULTRA',
            subscriptionId,
            subscriptionStart: new Date(),
            subscriptionEnd,
          },
        });

        // Record payment
        await prisma.payment.create({
          data: {
            userId: user.id,
            stripePaymentId: subscriptionId, // Reuse field for PayPal ID
            amount: 5000, // 50€ in cents
            currency: 'eur',
            status: 'COMPLETED',
            tier: 'ULTRA',
            billingPeriod: 'MONTHLY',
            completedAt: new Date(),
          },
        });

        console.debug(`[PayPal] Activated ULTRA for ${payerEmail} until ${subscriptionEnd.toISOString()}`);
        break;
      }

      // Subscription cancelled
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const sub = event.resource;
        const payerEmail = sub.subscriber?.email_address?.toLowerCase();

        if (!payerEmail) break;

        const user = await prisma.user.findUnique({ where: { email: payerEmail } });
        if (!user) break;

        // Don't immediately downgrade - let them use until subscriptionEnd
        console.debug(`[PayPal] Subscription ${eventType} for ${payerEmail}`);
        break;
      }

      // Payment failed
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const sub = event.resource;
        const payerEmail = sub.subscriber?.email_address?.toLowerCase();

        if (!payerEmail) break;

        const user = await prisma.user.findUnique({ where: { email: payerEmail } });
        if (!user) break;

        // Record failed payment
        await prisma.payment.create({
          data: {
            userId: user.id,
            amount: 5000,
            currency: 'eur',
            status: 'FAILED',
            tier: 'ULTRA',
            billingPeriod: 'MONTHLY',
          },
        });

        console.debug(`[PayPal] Payment failed for ${payerEmail}`);
        break;
      }

      // One-time payment completed (for manual PayPal.me payments)
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const capture = event.resource;
        const payerEmail = capture.payer?.email_address?.toLowerCase();

        if (!payerEmail) break;

        // Try to match payer email to a user
        const user = await prisma.user.findUnique({ where: { email: payerEmail } });
        if (!user) {
          console.warn(`[PayPal] One-time payment from unmatched email: ${payerEmail}`);
          break;
        }

        const subscriptionEnd = new Date();
        subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionTier: 'ULTRA',
            subscriptionStart: new Date(),
            subscriptionEnd,
          },
        });

        await prisma.payment.create({
          data: {
            userId: user.id,
            stripePaymentId: capture.id,
            amount: Math.round(parseFloat(capture.amount?.value || '50') * 100),
            currency: capture.amount?.currency_code?.toLowerCase() || 'eur',
            status: 'COMPLETED',
            tier: 'ULTRA',
            billingPeriod: 'MONTHLY',
            completedAt: new Date(),
          },
        });

        console.debug(`[PayPal] One-time payment activated ULTRA for ${payerEmail}`);
        break;
      }

      default:
        console.debug(`[PayPal] Unhandled event: ${eventType}`);
    }
  } catch (error) {
    console.error('[PayPal] Webhook processing error:', error);
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
