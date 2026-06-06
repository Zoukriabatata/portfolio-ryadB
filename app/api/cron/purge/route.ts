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

  const [deletedSessions, deletedDevices, deletedWebhookEvents] =
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
    ]);

  return NextResponse.json({
    sessions: deletedSessions.count,
    devices: deletedDevices.count,
    webhookEvents: deletedWebhookEvents.count,
  });
}
