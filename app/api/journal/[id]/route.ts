/**
 * JOURNAL API - Single entry operations
 *
 * PUT    /api/journal/[id]  - Update entry
 * DELETE /api/journal/[id]  - Delete entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const { id } = await params;

  const existing = await prisma.journalEntry.findFirst({
    where: { id, userId: token.id as string },
    select: { id: true, entryPrice: true, exitPrice: true, side: true, quantity: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const body = await req.json();
  const {
    symbol, side, entryPrice, exitPrice, quantity, entryTime, exitTime,
    timeframe, setup, tags, notes, rating, emotions,
    screenshotUrls, playbookSetupId,
  } = body;

  // Recalculate PnL
  const finalEntryPrice = entryPrice !== undefined ? parseFloat(entryPrice) : existing.entryPrice;
  const finalExitPrice = exitPrice !== undefined ? (exitPrice ? parseFloat(exitPrice) : null) : existing.exitPrice;
  const finalSide = side || existing.side;
  const finalQty = quantity || existing.quantity;

  let pnl: number | null = null;
  if (finalExitPrice && finalEntryPrice) {
    const multiplier = finalSide === 'LONG' ? 1 : -1;
    pnl = (finalExitPrice - finalEntryPrice) * multiplier * finalQty;
  }

  const entry = await prisma.journalEntry.update({
    where: { id },
    data: {
      ...(symbol !== undefined && { symbol: symbol.toUpperCase() }),
      ...(side !== undefined && { side }),
      ...(entryPrice !== undefined && { entryPrice: finalEntryPrice }),
      ...(exitPrice !== undefined && { exitPrice: finalExitPrice }),
      ...(quantity !== undefined && { quantity: finalQty }),
      pnl,
      ...(entryTime !== undefined && { entryTime: new Date(entryTime) }),
      ...(exitTime !== undefined && { exitTime: exitTime ? new Date(exitTime) : null }),
      ...(timeframe !== undefined && { timeframe: timeframe || null }),
      ...(setup !== undefined && { setup }),
      ...(tags !== undefined && { tags: tags ? JSON.stringify(tags) : null }),
      ...(notes !== undefined && { notes }),
      ...(rating !== undefined && { rating }),
      ...(emotions !== undefined && { emotions }),
      ...(screenshotUrls !== undefined && { screenshotUrls }),
      ...(playbookSetupId !== undefined && { playbookSetupId: playbookSetupId || null }),
    },
  });

  return NextResponse.json({ success: true, entry });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const { id } = await params;

  const existing = await prisma.journalEntry.findFirst({
    where: { id, userId: token.id as string },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  await prisma.journalEntry.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
