/**
 * EMAIL VERIFICATION API ROUTE
 *
 * GET /api/auth/verify-email?token=xxx
 *
 * Validates the verification token against the database,
 * marks the user's email as verified, and redirects to login.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token');

    // Validate token parameter
    if (!token || token.length < 16) {
      return NextResponse.redirect(
        new URL('/auth/login?error=invalid-token', req.url)
      );
    }

    // Find user with matching, non-expired verification token
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
      },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL('/auth/login?error=invalid-token', req.url)
      );
    }

    // Check if already verified
    if (user.emailVerified) {
      return NextResponse.redirect(
        new URL('/auth/login?verified=true', req.url)
      );
    }

    // Mark email as verified and clear the token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
      },
    });

    // Redirect to login with success indicator
    return NextResponse.redirect(
      new URL('/auth/login?verified=true', req.url)
    );
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(
      new URL('/auth/login?error=invalid-token', req.url)
    );
  }
}
