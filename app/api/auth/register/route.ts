/**
 * USER REGISTRATION API
 *
 * Creates new user accounts with secure password hashing
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, generateSecureToken } from '@/lib/auth/security';
import { registerRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';
import { sendVerificationEmail } from '@/lib/auth/email-verification';
import { generateLicenseKey, isPreviewWindow, PREVIEW_END } from '@/lib/auth/license';

export async function POST(req: NextRequest) {
  // Rate limit: 3 registrations per hour per IP
  const rl = await registerRateLimit(req);
  if (!rl.allowed) return tooManyRequests(rl);

  try {
    const body = await req.json();
    const { email, password, name } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    // Password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Un compte existe déjà avec cet email' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Public preview window: every fresh registration is auto-promoted to
    // PRO with subscriptionEnd pinned to PREVIEW_END (no Stripe interaction).
    // After the window closes, the heartbeat naturally rejects these
    // accounts (subscriptionEnd < now) and the standard Stripe checkout
    // takes over. We still create the License row so the desktop app's
    // license/login + heartbeat flow works identically for preview and
    // paid users — single code path on the client.
    const inPreview = isPreviewWindow();
    const now = new Date();

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        name: name?.trim() || null,
        subscriptionTier: inPreview ? 'PRO' : 'FREE',
        subscriptionStart: inPreview ? now : null,
        subscriptionEnd: inPreview ? PREVIEW_END : null,
        verificationToken: generateSecureToken(),
        ...(inPreview && {
          license: {
            create: {
              licenseKey: generateLicenseKey(),
              status: 'ACTIVE',
              maxMachines: 2,
            },
          },
        }),
      },
    });

    // Send verification email (non-blocking — don't fail registration if email fails)
    const baseUrl = req.nextUrl.origin;
    sendVerificationEmail(user.email, user.verificationToken!, baseUrl).catch((err) => {
      console.error('[register] verification email failed:', err instanceof Error ? err.message : 'unknown');
    });

    return NextResponse.json({
      success: true,
      message: inPreview
        ? 'Compte créé. Accès preview gratuit jusqu\'au 17/06. Vérifiez votre email pour activer votre compte.'
        : 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
      userId: user.id,
      preview: inPreview,
      previewEndsAt: inPreview ? PREVIEW_END.toISOString() : null,
    });
  } catch (error) {
    console.error('[register] error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: 'Erreur lors de la création du compte' },
      { status: 500 }
    );
  }
}
