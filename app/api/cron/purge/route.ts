import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/cron/purge
 *
 * Déclenché quotidiennement par Vercel Cron (vercel.json → 03:00 UTC).
 * Purge :
 *   - sessions expirées
 *   - devices inactifs depuis > 90 jours
 *   - ProcessedWebhookEvent vieux de > 90 jours
 * Maintenance abonnement :
 *   - rétrograde en FREE les comptes PRO dont subscriptionEnd est dépassé
 *     depuis > 24h (preview expiré, ou abonnement Stripe annulé/non renouvelé).
 *     Le grace de 24h évite de rétrograder un abonné en plein renouvellement
 *     Stripe (le webhook repousse subscriptionEnd en quelques minutes). Le gate
 *     d'accès réel reste subscriptionEnd côté heartbeat/login — ceci ne fait
 *     qu'aligner le label tier affiché. Les admins (subscriptionEnd = null) ne
 *     sont jamais touchés.
 *
 * Sécurisé par CRON_SECRET (header Authorization: Bearer <secret>).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET env var not configured' },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const now = new Date();
  // 24h grace before flipping an expired PRO to FREE — protects against the
  // Stripe renewal race (subscriptionEnd briefly in the past mid-renewal).
  const expiredCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const [deletedSessions, deletedDevices, deletedWebhookEvents, downgraded] =
    await Promise.all([
      prisma.session.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.device.deleteMany({
        where: {
          isActive: false,
          lastUsed: { lt: cutoff90Days },
        },
      }),
      prisma.processedWebhookEvent.deleteMany({
        where: { processedAt: { lt: cutoff90Days } },
      }),
      prisma.user.updateMany({
        where: {
          subscriptionTier: 'PRO',
          // `lt` excludes null subscriptionEnd, so admins / lifetime grants
          // are never matched. Email guard is belt-and-suspenders.
          subscriptionEnd: { lt: expiredCutoff },
          ...(adminEmails.length ? { email: { notIn: adminEmails } } : {}),
        },
        data: { subscriptionTier: 'FREE' },
      }),
    ]);

  return NextResponse.json({
    sessions: deletedSessions.count,
    devices: deletedDevices.count,
    webhookEvents: deletedWebhookEvents.count,
    downgradedToFree: downgraded.count,
  });
}
