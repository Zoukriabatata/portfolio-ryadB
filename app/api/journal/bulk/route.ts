/**
 * JOURNAL BULK API - Bulk operations on journal entries
 *
 * POST /api/journal/bulk - Bulk delete or tag trades
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const body = await req.json();
  const { action, ids } = body;

  if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Required: action, ids[]' }, { status: 400 });
  }

  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 entries per bulk operation' }, { status: 400 });
  }

  // Verify ownership of all entries
  const entries = await prisma.journalEntry.findMany({
    where: { id: { in: ids }, userId: token.id as string },
    select: { id: true },
  });

  const ownedIds = entries.map(e => e.id);

  if (action === 'delete') {
    await prisma.journalEntry.deleteMany({
      where: { id: { in: ownedIds } },
    });
    return NextResponse.json({ success: true, deleted: ownedIds.length });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
