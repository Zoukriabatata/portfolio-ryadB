import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimitByIP, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function GET(req: NextRequest) {
  // Rate limit: 5 promo code validations per minute per IP
  const rl = await rateLimitByIP(req, 5, 60_000);
  if (!rl.allowed) return tooManyRequests(rl);
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase().trim();

  if (!code) {
    return NextResponse.json({ valid: false, error: 'No code provided' });
  }

  try {
    const promoCode = await prisma.promoCode.findUnique({
      where: { code },
    });

    if (!promoCode) {
      return NextResponse.json({ valid: false, error: 'Invalid promo code' });
    }

    if (!promoCode.active) {
      return NextResponse.json({ valid: false, error: 'This code is no longer active' });
    }

    if (promoCode.validUntil && new Date(promoCode.validUntil) < new Date()) {
      return NextResponse.json({ valid: false, error: 'This code has expired' });
    }

    if (promoCode.usedCount >= promoCode.maxUses) {
      return NextResponse.json({ valid: false, error: 'This code has reached its limit' });
    }

    // Determine discount description
    const discountLabel =
      promoCode.discountType === 'PERCENTAGE'
        ? `${promoCode.discountValue}% off`
        : `$${promoCode.discountValue / 100} off`;

    const trialLabel = promoCode.trialDays
      ? ` + ${promoCode.trialDays} day free trial`
      : '';

    return NextResponse.json({
      valid: true,
      discount: discountLabel + trialLabel,
      remaining: promoCode.maxUses - promoCode.usedCount,
    });
  } catch {
    return NextResponse.json({ valid: false, error: 'Validation error' });
  }
}
