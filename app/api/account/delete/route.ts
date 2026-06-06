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
import { sendEmail } from '@/lib/auth/email-verification';

export const dynamic = 'force-dynamic';

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'ryad.bouderga78@gmail.com';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }
  if (!isPrismaAvailable()) {
    return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 });
  }

  let body: { confirm?: string; password?: string; reason?: string; details?: string };
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

  // Best-effort: delete the Stripe customer so no orphan customer records
  // accumulate in the Stripe dashboard after account deletion.
  if (user.customerId) {
    try {
      await stripe.customers.del(user.customerId);
    } catch (err) {
      // non-bloquant : log uniquement
      console.error('[delete] stripe customer delete failed:', err);
    }
  }

  // Exit-survey notification — fire BEFORE the delete so we still have
  // the user's details. Non-blocking failure: a bounced email must never
  // stop the user from deleting their account.
  {
    const reason = (body.reason || '').toString().slice(0, 200).trim();
    const details = (body.details || '').toString().slice(0, 2000).trim();
    const tier = user.subscriptionTier ?? 'FREE';
    const html = `
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#e2e8f0;">
        Account deletion — exit survey
      </h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;border:1px solid #1e1e2e;border-radius:10px;margin-bottom:20px;">
        <tr><td style="padding:18px 22px;">
          <p style="margin:0 0 8px;"><span style="display:inline-block;min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">User</span>
            <span style="font-size:14px;color:#e2e8f0;">${escapeHtml(user.email)}</span></p>
          <p style="margin:0 0 8px;"><span style="display:inline-block;min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Tier</span>
            <span style="font-size:14px;color:#a78bfa;">${escapeHtml(tier)}</span></p>
          <p style="margin:0;"><span style="display:inline-block;min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Reason</span>
            <span style="font-size:14px;color:#fca5a5;">${escapeHtml(reason || '—')}</span></p>
        </td></tr>
      </table>
      ${details ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Details</p>
      <div style="padding:14px 18px;background:#0f0f1a;border:1px solid #1e1e2e;border-radius:8px;font-size:14px;color:#cbd5e1;line-height:1.6;white-space:pre-wrap;">${escapeHtml(details)}</div>` : ''}
    `;
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Account deleted] ${reason || 'No reason given'} — ${user.email}`,
      content: html,
      text: `Account deletion\nUser: ${user.email}\nTier: ${tier}\nReason: ${reason || '—'}\n\n${details || '(no details)'}`,
    }).catch((e) => {
      console.warn('[account/delete] exit-survey email failed (continuing):', e);
    });
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
