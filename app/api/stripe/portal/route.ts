/**
 * STRIPE CUSTOMER PORTAL API
 *
 * Redirects users to Stripe's billing portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { createPortalSession } from '@/lib/stripe';
import { getAppUrl } from '@/lib/config/app-url';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rl = await apiRateLimit(session.user.id);
    if (!rl.allowed) return tooManyRequests(rl);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user?.customerId) {
      return NextResponse.json(
        { error: 'Aucun abonnement actif' },
        { status: 400 }
      );
    }

    const baseUrl = getAppUrl();
    const portalUrl = await createPortalSession(
      user.customerId,
      `${baseUrl}/account`
    );

    return NextResponse.json({ url: portalUrl });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'accès au portail' },
      { status: 500 }
    );
  }
}
