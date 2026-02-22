/**
 * STRIPE WEBHOOK HANDLER
 *
 * Processes subscription events from Stripe
 * Confirms promo code usage after successful payment
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { constructWebhookEvent } from '@/lib/stripe';
import { confirmPromoCodeUsage } from '@/lib/stripe/promo-code-service';
import Stripe from 'stripe';

// Stripe API objects may include fields not in the SDK types (depends on API version / expand)
interface StripeSubscriptionRaw extends Stripe.Subscription {
  current_period_end?: number;
}
// Access invoice fields that exist but may differ from SDK types depending on expand
type StripeInvoiceRaw = Stripe.Invoice & {
  payment_intent?: string | { id: string } | null;
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier as 'ULTRA';
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  if (!userId || !tier) {
    console.error('Missing metadata in checkout session');
    return;
  }

  // Update user subscription
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionId,
      customerId,
      subscriptionStart: new Date(),
      maxDevices: 2,
    },
  });

  // Record payment
  const payment = await prisma.payment.create({
    data: {
      userId,
      stripePaymentId: session.payment_intent as string,
      amount: session.amount_total || 0,
      currency: session.currency || 'eur',
      status: 'COMPLETED',
      tier,
      billingPeriod: session.metadata?.billingPeriod === 'yearly' ? 'YEARLY' : 'MONTHLY',
      completedAt: new Date(),
    },
  });

  // ✅ CONFIRM PROMO CODE USAGE IF PRESENT
  const promoCodeUsageId = session.metadata?.promoCodeUsageId;
  if (promoCodeUsageId) {
    await confirmPromoCodeUsage(promoCodeUsageId, payment.id);
    console.log(`✅ Promo code usage confirmed for user ${userId}`);
  }

  console.log(`User ${userId} subscribed to ${tier}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const subRaw = subscription as StripeSubscriptionRaw;

  if (!userId) {
    // Try to find user by subscription ID
    const user = await prisma.user.findFirst({
      where: { subscriptionId: subscription.id },
    });

    if (!user) {
      console.error('User not found for subscription:', subscription.id);
      return;
    }

    // Update subscription end date
    const currentPeriodEnd = subRaw.current_period_end;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionEnd: subscription.cancel_at_period_end && currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : null,
      },
    });
  }
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscription.id },
  });

  if (!user) {
    console.error('User not found for cancelled subscription:', subscription.id);
    return;
  }

  // Downgrade to FREE
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: 'FREE',
      subscriptionId: null,
      subscriptionEnd: null,
      maxDevices: 1,
    },
  });

  // Deactivate extra devices
  const devices = await prisma.device.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { lastUsed: 'desc' },
  });

  // Keep only the most recent device
  if (devices.length > 1) {
    const devicesToDeactivate = devices.slice(1);
    await prisma.device.updateMany({
      where: { id: { in: devicesToDeactivate.map((d: { id: string }) => d.id) } },
      data: { isActive: false },
    });
  }

  console.log(`User ${user.id} subscription cancelled, downgraded to FREE`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const inv = invoice as StripeInvoiceRaw;

  const user = await prisma.user.findFirst({
    where: { customerId },
  });

  if (!user) return;

  // Record successful renewal payment
  const paymentIntent = typeof inv.payment_intent === 'string'
    ? inv.payment_intent
    : inv.payment_intent?.id;
  await prisma.payment.create({
    data: {
      userId: user.id,
      stripePaymentId: paymentIntent || `invoice_${invoice.id}`,
      amount: inv.amount_paid || 0,
      currency: invoice.currency || 'eur',
      status: 'COMPLETED',
      tier: user.subscriptionTier,
      billingPeriod: 'MONTHLY',
      completedAt: new Date(),
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const inv = invoice as StripeInvoiceRaw;

  const user = await prisma.user.findFirst({
    where: { customerId },
  });

  if (!user) return;

  // Record failed payment
  const paymentIntent = typeof inv.payment_intent === 'string'
    ? inv.payment_intent
    : inv.payment_intent?.id;
  await prisma.payment.create({
    data: {
      userId: user.id,
      stripePaymentId: paymentIntent || `failed_${Date.now()}`,
      amount: inv.amount_due || 0,
      currency: invoice.currency || 'eur',
      status: 'FAILED',
      tier: user.subscriptionTier,
      billingPeriod: 'MONTHLY',
    },
  });

  console.warn(`[Stripe] Payment failed for user ${user.id}`);
}
