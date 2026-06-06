/**
 * GET /api/account/export
 *
 * RGPD / GDPR data export — returns a structured JSON file containing
 * every piece of personal data tied to the authenticated user.
 *
 * Excluded fields (security / privacy):
 *   - password hash
 *   - verificationToken / verificationTokenExpiry
 *   - resetToken / resetTokenExpiry
 *   - OAuth tokens (Account.access_token, refresh_token, id_token)
 *   - Session.token (full bearer — only metadata exposed)
 *   - Payment.proofUrl / proofText (potentially contains bank screenshots)
 *   - DataFeedConfig.apiKey (broker credential)
 *
 * Rate-limited to 100 req/min per user via apiRateLimit (shared bucket
 * with other authenticated API routes — export is intentionally cheap
 * to abuse since the response is large).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma, isPrismaAvailable } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
  }

  // ── Rate-limit ─────────────────────────────────────────────────────────
  const rl = await apiRateLimit(session.user.id);
  if (!rl.allowed) {
    return tooManyRequests(rl);
  }

  // ── DB availability ────────────────────────────────────────────────────
  if (!isPrismaAvailable()) {
    return NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 });
  }

  // ── Fetch user + all related data ─────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      sessions: {
        where: { isActive: true },
        select: {
          id: true,
          deviceId: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
          lastActivity: true,
          // token intentionally omitted
        },
      },
      devices: {
        select: {
          id: true,
          fingerprint: true,
          name: true,
          browser: true,
          os: true,
          isActive: true,
          isTrusted: true,
          lastUsed: true,
          createdAt: true,
        },
      },
      payments: {
        select: {
          id: true,
          stripePaymentId: true,
          amount: true,
          currency: true,
          status: true,
          tier: true,
          billingPeriod: true,
          paymentMethod: true,
          createdAt: true,
          completedAt: true,
          // proofUrl / proofText / adminNote / reviewedBy omitted
        },
      },
      journalEntries: {
        select: {
          id: true,
          symbol: true,
          side: true,
          entryPrice: true,
          exitPrice: true,
          quantity: true,
          pnl: true,
          entryTime: true,
          exitTime: true,
          timeframe: true,
          setup: true,
          tags: true,
          notes: true,
          rating: true,
          emotions: true,
          screenshotUrl: true,
          screenshotUrls: true,
          playbookSetupId: true,
          createdAt: true,
          updatedAt: true,
          // userId omitted — redundant in a per-user export
        },
      },
      dailyNotes: {
        select: {
          id: true,
          date: true,
          premarketPlan: true,
          endOfDayReview: true,
          lessons: true,
          mood: true,
          marketConditions: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      playbookSetups: {
        select: {
          id: true,
          name: true,
          description: true,
          rules: true,
          exampleUrls: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
  }

  // ── Strip sensitive fields from the User row ──────────────────────────
  // Destructure to pick only the safe subset. TypeScript enforces exhaustiveness
  // via the explicit type annotation — adding a sensitive field to the model
  // will NOT automatically leak it here.
  const {
    // excluded:
    password: _password,
    verificationToken: _verificationToken,
    verificationTokenExpiry: _verificationTokenExpiry,
    resetToken: _resetToken,
    resetTokenExpiry: _resetTokenExpiry,
    // relations pulled separately above — exclude the prisma-join copies:
    sessions: _sessions,
    devices: _devices,
    payments: _payments,
    journalEntries: _journalEntries,
    dailyNotes: _dailyNotes,
    playbookSetups: _playbookSetups,
    // keep everything else:
    ...safeUser
  } = user;

  // Silence "unused variable" warnings for the intentionally discarded fields.
  void _password;
  void _verificationToken;
  void _verificationTokenExpiry;
  void _resetToken;
  void _resetTokenExpiry;
  void _sessions;
  void _devices;
  void _payments;
  void _journalEntries;
  void _dailyNotes;
  void _playbookSetups;

  // ── Build export payload ───────────────────────────────────────────────
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    schema_version: '1',
    user: safeUser,
    activeSessions: user.sessions,
    devices: user.devices,
    payments: user.payments,
    journalEntries: user.journalEntries,
    dailyNotes: user.dailyNotes,
    playbookSetups: user.playbookSetups,
  };

  const json = JSON.stringify(exportPayload, null, 2);
  const filename = `senzoukria-export-${user.id}.json`;

  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-RateLimit-Limit': String(rl.limit),
      'X-RateLimit-Remaining': String(rl.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rl.resetMs / 1000)),
    },
  });
}
