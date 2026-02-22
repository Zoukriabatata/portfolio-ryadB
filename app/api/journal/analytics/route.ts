/**
 * JOURNAL ANALYTICS API
 *
 * GET /api/journal/analytics - Compute all metrics server-side
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { computeAnalytics } from '@/lib/journal/metrics';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const where: Record<string, unknown> = { userId: token.id as string };
  if (from || to) {
    where.entryTime = {};
    if (from) (where.entryTime as Record<string, unknown>).gte = new Date(from);
    if (to) (where.entryTime as Record<string, unknown>).lte = new Date(to);
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    select: {
      pnl: true,
      entryTime: true,
      symbol: true,
      side: true,
      setup: true,
      emotions: true,
    },
    orderBy: { entryTime: 'asc' },
  });

  const analytics = computeAnalytics(entries);

  return NextResponse.json(analytics);
}
