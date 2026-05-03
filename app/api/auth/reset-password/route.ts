/**
 * POST /api/auth/reset-password
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates a reset token and sets a new password.
 *
 * Body: { token: string, password: string }
 *
 * On success: clears the reset token, resets failedLoginAttempts and
 * unlocks any account lockout, returns 200.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/security';
import { registerRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  // Rate limit shared with register/forgot-password (3/h/IP)
  const rl = await registerRateLimit(req);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const token    = typeof body.token    === 'string' ? body.token.trim()    : '';
  const password = typeof body.password === 'string' ? body.password         : '';

  if (!token || token.length < 32) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Le mot de passe doit contenir au moins 8 caractères' },
      { status: 400 },
    );
  }

  if (password.length > 200) {
    return NextResponse.json({ error: 'Mot de passe trop long' }, { status: 400 });
  }

  // Find user by token AND check expiry in one query
  const user = await prisma.user.findFirst({
    where: {
      resetToken:       token,
      resetTokenExpiry: { gt: new Date() },
    },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: 'Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.' },
      { status: 400 },
    );
  }

  const hashed = await hashPassword(password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password:             hashed,
      resetToken:           null,
      resetTokenExpiry:     null,
      failedLoginAttempts:  0,
      lockedUntil:          null,
    },
  });

  console.log(`[reset-password] Password reset for ${user.email}`);

  return NextResponse.json({
    success: true,
    message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.',
  });
}
