/**
 * POST /api/account/delete
 *
 * Permanently deletes the authenticated user's account and every
 * piece of data attached to it. Requires explicit confirmation via
 * the `confirm` field exactly equal to the user's email — guards
 * against accidental triggering from a stale tab.
 *
 * Order of operations:
 *   1. Verify password (extra friction beyond session auth — many
 *      account-delete flows demand it).
 *   2. Best-effort cancel Stripe subscription so we stop billing.
 *   3. `User` row delete cascades to:
 *        Account, Session, Device, Payment, SupportTicket,
 *        JournalEntry, DataFeedConfig, PromoCodeUsage, DailyNote,
 *        PlaybookSetup, License (→ Machine).
 *   4. Sign the caller out client-side after the response.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
  if (!isPrismaAvailable()) {
    return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 });
  }

  let body: { confirm?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
  }

  // Confirmation must match the user's own email — same anti-mistake
  // pattern GitHub / Stripe use.
  if (!body.confirm || body.confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: 'Confirmation does not match your email' },
      { status: 400 },
    );
  }

  // Password check — skip for OAuth-only users (no local password set).
  if (user.password) {
    if (!body.password) {
      return NextResponse.json(
        { ok: false, error: 'Password is required to confirm account deletion' },
        { status: 400 },
      );
    }
    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: 'Incorrect password' },
        { status: 401 },
      );
    }
  }

  // Best-effort: cancel any live Stripe subscription so the user
  // doesn't keep getting billed after their account is gone.
  if (user.subscriptionId) {
    try {
      await stripe.subscriptions.cancel(user.subscriptionId);
    } catch (e) {
      console.warn('[account/delete] Stripe cancel failed (continuing):', e);
    }
  }

  // Wipe the user row — Prisma cascade handles every relation listed
  // on the User model with `onDelete: Cascade`.
  try {
    await prisma.user.delete({ where: { id: user.id } });
  } catch (e) {
    console.error('[account/delete] prisma delete failed:', e);
    return NextResponse.json(
      { ok: false, error: 'Failed to delete account' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
