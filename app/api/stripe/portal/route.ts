/**
 * STRIPE CUSTOMER PORTAL API
 *
 * Redirects users to Stripe's billing portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';
import { createPortalSession, type PortalFlow } from '@/lib/stripe';
import { getAppUrl } from '@/lib/config/app-url';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

const ALLOWED_FLOWS: PortalFlow[] = [
  'default',
  'payment_method_update',
  'subscription_cancel',
  'invoice_history',
];

async function handle(req: NextRequest, flowFromQuery: string | null) {
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

    // Accept `flow` from JSON body (POST) or query string (GET-style
    // redirect from /account/billing/* pages). Falls back to default.
    let flow: PortalFlow = 'default';
    if (flowFromQuery && ALLOWED_FLOWS.includes(flowFromQuery as PortalFlow)) {
      flow = flowFromQuery as PortalFlow;
    } else if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (typeof body?.flow === 'string' && ALLOWED_FLOWS.includes(body.flow)) {
          flow = body.flow;
        }
      } catch {
        // body optional — keep default
      }
    }

    const baseUrl = getAppUrl();
    const portalUrl = await createPortalSession(
      user.customerId,
      `${baseUrl}/account`,
      flow,
      user.subscriptionId,
    );

    // For GET requests (browser-direct navigation from the desktop app),
    // 302-redirect straight to Stripe. For POST (in-app fetch), return
    // JSON so the client decides how to open it.
    if (req.method === 'GET') {
      return NextResponse.redirect(portalUrl, { status: 302 });
    }
    return NextResponse.json({ url: portalUrl });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'accès au portail' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req, null);
}

export async function GET(req: NextRequest) {
  const flow = new URL(req.url).searchParams.get('flow');
  return handle(req, flow);
}
