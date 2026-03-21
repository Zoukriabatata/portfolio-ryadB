/**
 * STRIPE CHECKOUT API
 *
 * Creates checkout sessions for subscription purchases
 * Supports promo codes with anti-abuse detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { createOrGetCustomer, createCheckoutSession, createOneTimeCheckoutSession, stripe } from '@/lib/stripe';
import { validatePromoCodeUsage, recordPromoCodeAttempt } from '@/lib/stripe/promo-code-service';
import { z } from 'zod';

const subscriptionSchema = z.object({
  tier: z.literal('ULTRA'),
  billingPeriod: z.enum(['monthly', 'yearly']),
  promoCode: z.string().max(30).optional(),
}).strict();

const oneTimeSchema = z.object({
  product: z.literal('research-pack'),
}).strict();

const checkoutSchema = z.union([subscriptionSchema, oneTimeSchema]);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const data = parsed.data;

    // ── One-time product purchase (Research Pack) ──
    if ('product' in data) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      // Already purchased?
      if (user.hasResearchPack) {
        return NextResponse.json({ error: 'You already own the Research Pack' }, { status: 400 });
      }

      // Already ULTRA? They get it for free
      if (user.subscriptionTier === 'ULTRA') {
        return NextResponse.json({ error: 'Research Pack is included in your Ultra subscription' }, { status: 400 });
      }

      let customerId = user.customerId;
      if (!customerId) {
        customerId = await createOrGetCustomer(user.email, user.name, user.id);
        await prisma.user.update({ where: { id: user.id }, data: { customerId } });
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const checkoutUrl = await createOneTimeCheckoutSession({
        customerId,
        userId: user.id,
        product: data.product,
        successUrl: `${baseUrl}/academy?success=true`,
        cancelUrl: `${baseUrl}/academy?cancelled=true`,
      });

      return NextResponse.json({ url: checkoutUrl });
    }

    // ── Subscription purchase (ULTRA) ──
    const { tier, billingPeriod, promoCode } = data;

    // Get device fingerprint and IP for anti-abuse detection
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               req.headers.get('x-real-ip') ||
               req.headers.get('cf-connecting-ip') ||
               '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const fingerprintCookie = req.cookies.get('_fp');
    const deviceFingerprint = fingerprintCookie?.value || 'unknown';

    // Get or create Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let customerId = user.customerId;

    if (!customerId) {
      customerId = await createOrGetCustomer(
        user.email,
        user.name,
        user.id
      );

      // Save customer ID
      await prisma.user.update({
        where: { id: user.id },
        data: { customerId },
      });
    }

    // ✅ PROMO CODE VALIDATION
    let couponId: string | undefined;
    let promoCodeUsageId: string | undefined;
    let promoCodeRecord: any = null;

    if (promoCode) {
      const validation = await validatePromoCodeUsage(
        promoCode,
        session.user.id,
        deviceFingerprint,
        ip,
        userAgent,
        session.user.email
      );

      if (!validation.valid) {
        return NextResponse.json({
          error: validation.reason,
          similarityScore: validation.similarityScore,
        }, { status: 400 });
      }

      promoCodeRecord = validation.promoCode;

      // Record the attempt (paymentCompleted=false)
      promoCodeUsageId = await recordPromoCodeAttempt(
        promoCodeRecord.id,
        session.user.id,
        deviceFingerprint,
        ip,
        userAgent,
        session.user.email
      );

      // Create or get Stripe coupon
      if (!promoCodeRecord.stripeCouponId) {
        // Create new coupon in Stripe
        const coupon = await stripe.coupons.create({
          name: promoCodeRecord.code,
          percent_off: promoCodeRecord.discountValue, // 70 for SENBETA5
          duration: 'forever', // Applied forever (after trial)
          max_redemptions: promoCodeRecord.maxUses,
        });

        // Save Stripe coupon ID
        await prisma.promoCode.update({
          where: { id: promoCodeRecord.id },
          data: { stripeCouponId: coupon.id },
        });

        couponId = coupon.id;
      } else {
        couponId = promoCodeRecord.stripeCouponId;
      }
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const checkoutUrl = await createCheckoutSession({
      customerId,
      userId: user.id,
      tier,
      billingPeriod,
      successUrl: `${baseUrl}/account?success=true`,
      cancelUrl: `${baseUrl}/pricing?cancelled=true`,
      couponId,
      promoCodeUsageId,
      trialDays: promoCodeRecord?.trialDays || undefined, // Add trial period if promo code has one
    });

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error('Checkout error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: `Payment error: ${message}` },
      { status: 500 }
    );
  }
}
