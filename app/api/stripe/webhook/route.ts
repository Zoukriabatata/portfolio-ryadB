/**
 * STRIPE WEBHOOK HANDLER — refactored 1.2.E
 *
 * Idempotent: every event is recorded in ProcessedWebhookEvent at the
 * start of a transaction. A Stripe replay hits the unique constraint on
 * eventId and returns 200 silently.
 *
 * Atomic: dispatch + license upsert + payment record + promo confirmation
 * all run inside the same prisma.$transaction. If anything throws, Postgres
 * rolls back the entire event (including the ProcessedWebhookEvent row) so
 * Stripe's 3-day retry window can re-deliver and try again.
 *
 * External I/O (Stripe API call, Resend email) runs OUTSIDE the transaction
 * to avoid pool starvation under network latency.
 *
 * Tier label: this file uses 'PRO' everywhere now (the new single plan).
 * Legacy 'ULTRA' value is being phased out across the rest of the codebase
 * in 1.2.F.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { constructWebhookEvent, stripe } from '@/lib/stripe';
import { confirmPromoCodeUsage } from '@/lib/stripe/promo-code-service';
import { sendProWelcomeEmail } from '@/lib/auth/email-verification';
import Stripe from 'stripe';

interface StripeSubscriptionRaw extends Stripe.Subscription {
  current_period_end?: number;
}
type StripeInvoiceRaw = Stripe.Invoice & {
  payment_intent?: string | { id: string } | null;
};

// Side-effect bag — populated inside the transaction, fired after commit.
type PostCommitActions = {
  welcomeEmail?: {
    email:           string;
    name:            string | null;
    amount:          number;
    currency:        string;
    nextBillingDate: Date | null;
    isInTrial:       boolean;
  };
};

// Pre-fetched Stripe data — captured BEFORE the transaction starts to
// keep all external I/O off the Postgres connection.
type PreFetched = {
  subscriptionEnd: Date | null;
  isInTrial:       boolean;
};

// ── Helpers ─────────────────────────────────────────────────────────

/** Detect Prisma unique-constraint violation on a given target column. */
function isPrismaUniqueViolation(err: unknown, target: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    (err.meta!.target as string[]).includes(target)
  );
}

/** "OFV2-<uuid v4>" — visible license ID format the user sees on /account. */
function generateLicenseKey(): string {
  return `OFV2-${randomUUID()}`;
}

/**
 * Pre-fetch Stripe data BEFORE the transaction. Currently only the
 * checkout.session.completed flow needs an extra Stripe API call
 * (subscriptions.retrieve for current_period_end + trial status). All
 * other events carry the data they need on the event object itself.
 */
async function preFetchForEvent(event: Stripe.Event): Promise<PreFetched> {
  const out: PreFetched = { subscriptionEnd: null, isInTrial: false };

  if (event.type !== 'checkout.session.completed') return out;

  const session = event.data.object as Stripe.Checkout.Session;
  const subscriptionId = session.subscription as string | null;
  if (!subscriptionId) return out;

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEnd = (sub as StripeSubscriptionRaw).current_period_end;
    if (periodEnd) out.subscriptionEnd = new Date(periodEnd * 1000);
    out.isInTrial = sub.status === 'trialing';
  } catch (err) {
    console.warn(`[stripe webhook] could not retrieve sub ${subscriptionId}`, err);
  }
  return out;
}

// ── Main handler ─────────────────────────────────────────────────────

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
    console.error('[stripe webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // [B] All external I/O happens BEFORE the transaction. The Postgres
  // connection is held only while we touch the DB, never while we're
  // waiting on Stripe's API.
  const preFetched = await preFetchForEvent(event);

  // Side-effect bag — populated inside transaction, fired after commit.
  const post: PostCommitActions = {};

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotence guard. Unique violation on eventId → caught below.
      await tx.processedWebhookEvent.create({
        data: { eventId: event.id, eventType: event.type },
      });

      switch (event.type) {
        case 'checkout.session.completed': {
          await handleCheckoutComplete(
            event.data.object as Stripe.Checkout.Session,
            tx,
            post,
            preFetched,
          );
          break;
        }
        case 'customer.subscription.updated': {
          await handleSubscriptionUpdate(event.data.object as Stripe.Subscription, tx);
          break;
        }
        case 'customer.subscription.deleted': {
          await handleSubscriptionCancelled(event.data.object as Stripe.Subscription, tx);
          break;
        }
        case 'invoice.payment_succeeded': {
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice, tx);
          break;
        }
        case 'invoice.payment_failed': {
          await handlePaymentFailed(event.data.object as Stripe.Invoice, tx);
          break;
        }
        default:
          console.log(`[stripe webhook] unhandled type=${event.type} event=${event.id}`);
      }
    }, {
      maxWait: 5000,    // wait up to 5s to acquire a tx slot
      timeout: 10000,   // tx itself can run 10s before rollback
    });
  } catch (err) {
    if (isPrismaUniqueViolation(err, 'eventId')) {
      console.log(`[stripe webhook] idempotent skip event=${event.id} type=${event.type}`);
      return NextResponse.json({ received: true, idempotent: true });
    }
    console.error(`[stripe webhook] FAIL ${event.type} event=${event.id}`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // Side effects fire OUTSIDE the transaction (Risk #4 mitigation).
  // A slow Resend/SMTP must never roll back a recorded payment.
  if (post.welcomeEmail) {
    sendProWelcomeEmail(post.welcomeEmail).catch(emailErr => {
      console.error(`[stripe webhook] welcome email send failed event=${event.id}`, emailErr);
    });
  }

  console.log(`[stripe webhook] OK ${event.type} event=${event.id}`);
  return NextResponse.json({ received: true });
}

// ── Handlers — receive `tx` and (optionally) pre-fetched Stripe data ──

async function handleCheckoutComplete(
  session: Stripe.Checkout.Session,
  tx: Prisma.TransactionClient,
  post: PostCommitActions,
  preFetched: PreFetched,
): Promise<void> {
  const userId     = session.metadata?.userId;
  const product    = session.metadata?.product;
  const customerId = session.customer as string;

  if (!userId) {
    console.error(`[stripe webhook] missing userId in metadata session=${session.id}`);
    return;
  }

  // Research Pack one-time purchase — unchanged from prior behavior.
  if (product === 'research-pack') {
    await tx.user.update({
      where: { id: userId },
      data:  { hasResearchPack: true, researchPackBoughtAt: new Date(), customerId },
    });
    await tx.payment.create({
      data: {
        userId,
        stripePaymentId: session.payment_intent as string,
        amount:   session.amount_total || 0,
        currency: session.currency || 'usd',
        status:   'COMPLETED',
        tier:     'FREE',
        billingPeriod: 'ONE_TIME',
        completedAt:   new Date(),
      },
    });
    console.log(`[stripe webhook] research-pack purchased userId=${userId}`);
    return;
  }

  // Subscription branch — tier hardcoded to 'PRO' (single-plan model).
  // Legacy in-flight checkouts may still carry tier='ULTRA' in metadata —
  // we treat them all as PRO going forward.
  const tier = 'PRO';
  const subscriptionId = session.subscription as string;
  const { subscriptionEnd, isInTrial } = preFetched;

  const user = await tx.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: tier,
      subscriptionId,
      customerId,
      subscriptionStart: new Date(),
      subscriptionEnd,
      maxDevices: 2,
    },
    select: { email: true, name: true },
  });

  const payment = await tx.payment.create({
    data: {
      userId,
      stripePaymentId: session.payment_intent as string,
      amount:   session.amount_total || 0,
      currency: session.currency || 'usd',
      status:   'COMPLETED',
      tier,
      billingPeriod: 'MONTHLY',
      completedAt:   new Date(),
    },
  });

  // [C] Promo code confirmation in the same tx — atomicity guarantee.
  // confirmPromoCodeUsage was extended to accept an optional tx param.
  const promoCodeUsageId = session.metadata?.promoCodeUsageId;
  if (promoCodeUsageId) {
    await confirmPromoCodeUsage(promoCodeUsageId, payment.id, tx);
    console.log(`[stripe webhook] promo confirmed userId=${userId}`);
  }

  // License upsert — idempotent. No-op if already exists (handles race
  // with subscription.updated arriving simultaneously).
  await tx.license.upsert({
    where:  { userId },
    create: {
      userId,
      licenseKey:  generateLicenseKey(),
      status:      'ACTIVE',
      maxMachines: 2,
    },
    update: {},
  });

  console.log(`[stripe webhook] PRO subscribed userId=${userId} sub=${subscriptionId}`);

  // Capture data for post-commit welcome email.
  post.welcomeEmail = {
    email:           user.email,
    name:            user.name,
    amount:          session.amount_total || 2900,
    currency:        session.currency || 'usd',
    nextBillingDate: subscriptionEnd,
    isInTrial,
  };
}

async function handleSubscriptionUpdate(
  subscription: Stripe.Subscription,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const subRaw = subscription as StripeSubscriptionRaw;
  const currentPeriodEnd = subRaw.current_period_end;
  const subscriptionEnd = subscription.cancel_at_period_end && currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000)
    : null;

  // [A] 3-tier user lookup with progressive fallbacks for the
  // race scenario where this event arrives before checkout.session.completed
  // has populated User.subscriptionId.
  const userId = subscription.metadata?.userId;

  // 1) by metadata.userId
  let user = userId
    ? await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
    : null;

  // 2) by subscriptionId (set later by checkout.session.completed)
  if (!user) {
    user = await tx.user.findFirst({
      where:  { subscriptionId: subscription.id },
      select: { id: true },
    });
  }

  // 3) by customerId — set from createOrGetCustomer well before checkout,
  //    so this is the only lookup guaranteed to work in the race scenario.
  if (!user && subscription.customer) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;
    user = await tx.user.findFirst({
      where:  { customerId },
      select: { id: true },
    });
  }

  if (!user) {
    console.error(`[stripe webhook] user not found for subscription=${subscription.id}`);
    return;
  }

  await tx.user.update({
    where: { id: user.id },
    data:  { subscriptionEnd },
  });

  // License upsert on active or trialing — covers the case where this
  // event fires before checkout.session.completed (during the 14-day
  // trial, status is 'trialing', not 'active').
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    await tx.license.upsert({
      where:  { userId: user.id },
      create: {
        userId:      user.id,
        licenseKey:  generateLicenseKey(),
        status:      'ACTIVE',
        maxMachines: 2,
      },
      update: {},
    });
  }

  console.log(`[stripe webhook] subscription updated userId=${user.id} status=${subscription.status}`);
}

async function handleSubscriptionCancelled(
  subscription: Stripe.Subscription,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const user = await tx.user.findFirst({
    where:  { subscriptionId: subscription.id },
    select: { id: true },
  });
  if (!user) {
    console.error(`[stripe webhook] user not found for cancelled subscription=${subscription.id}`);
    return;
  }

  // Web tier downgrade — kept for /account UI consistency.
  await tx.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: 'FREE',
      subscriptionId:   null,
      subscriptionEnd:  null,
      maxDevices:       1,
    },
  });

  // Web Device deactivation — existing behavior, kept.
  const devices = await tx.device.findMany({
    where:   { userId: user.id, isActive: true },
    orderBy: { lastUsed: 'desc' },
  });
  if (devices.length > 1) {
    const devicesToDeactivate = devices.slice(1);
    await tx.device.updateMany({
      where: { id: { in: devicesToDeactivate.map(d => d.id) } },
      data:  { isActive: false },
    });
  }

  // ⚠️ DELIBERATELY NOT touching Machine rows or License.status here.
  // The desktop app's /api/license/login (Week 2) checks user.subscription
  // status at next login attempt and refuses the JWT if not active.
  // Keeping License + Machines intact allows instant reactivation if the
  // user resubscribes before the JWT validity window expires (~24h).

  console.log(`[stripe webhook] subscription cancelled userId=${user.id} (License + Machines intact)`);
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const customerId = invoice.customer as string;
  const inv = invoice as StripeInvoiceRaw;

  const user = await tx.user.findFirst({
    where:  { customerId },
    select: { id: true, subscriptionTier: true },
  });
  if (!user) return;

  const paymentIntent = typeof inv.payment_intent === 'string'
    ? inv.payment_intent
    : inv.payment_intent?.id;

  await tx.payment.create({
    data: {
      userId: user.id,
      stripePaymentId: paymentIntent || `invoice_${invoice.id}`,
      amount:   inv.amount_paid || 0,
      currency: invoice.currency || 'usd',
      status:   'COMPLETED',
      tier:     user.subscriptionTier,
      billingPeriod: 'MONTHLY',
      completedAt:   new Date(),
    },
  });

  console.log(`[stripe webhook] payment succeeded userId=${user.id} invoice=${invoice.id}`);
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const customerId = invoice.customer as string;
  const inv = invoice as StripeInvoiceRaw;

  const user = await tx.user.findFirst({
    where:  { customerId },
    select: { id: true, subscriptionTier: true },
  });
  if (!user) return;

  const paymentIntent = typeof inv.payment_intent === 'string'
    ? inv.payment_intent
    : inv.payment_intent?.id;

  await tx.payment.create({
    data: {
      userId: user.id,
      stripePaymentId: paymentIntent || `failed_${Date.now()}`,
      amount:   inv.amount_due || 0,
      currency: invoice.currency || 'usd',
      status:   'FAILED',
      tier:     user.subscriptionTier,
      billingPeriod: 'MONTHLY',
    },
  });

  console.warn(`[stripe webhook] payment FAILED userId=${user.id} invoice=${invoice.id}`);
}
