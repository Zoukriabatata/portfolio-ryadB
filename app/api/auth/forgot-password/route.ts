/**
 * POST /api/auth/forgot-password
 * ─────────────────────────────────────────────────────────────────────────────
 * Issues a password-reset token and sends the reset email.
 *
 * Anti-enumeration: ALWAYS returns success — even if the email is not
 * registered. Otherwise an attacker could discover which emails have accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateSecureToken } from '@/lib/auth/security';
import { sendPasswordResetEmail, getTokenExpiry } from '@/lib/auth/email-verification';
import { registerRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  // Rate limit: 3 attempts per hour per IP (same bucket as register)
  const rl = await registerRateLimit(req);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

  // Loose validation — never leak whether the address is valid in the DB
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }

  // Look up user — but do NOT leak whether it exists
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, password: true },
  });

  // Only generate a token if the user exists AND has a password (skip OAuth-only)
  if (user && user.password) {
    const token = generateSecureToken();

    await prisma.user.update({
      where:  { id: user.id },
      data:   {
        resetToken:       token,
        resetTokenExpiry: getTokenExpiry(),
      },
    });

    const baseUrl = req.nextUrl.origin;
    sendPasswordResetEmail(email, token, baseUrl).catch(err => {
      console.error('[forgot-password] Failed to send email:', err);
    });
  }

  // Always return the same response to prevent email enumeration
  return NextResponse.json({
    success: true,
    message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
  });
}
