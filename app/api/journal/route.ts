/**
 * JOURNAL API - CRUD for trading journal entries
 *
 * GET  /api/journal         - List entries (with filters)
 * POST /api/journal         - Create entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  const where: Record<string, unknown> = { userId: token.id as string };

  if (symbol) where.symbol = symbol;
  if (from || to) {
    where.entryTime = {};
    if (from) (where.entryTime as Record<string, unknown>).gte = new Date(from);
    if (to) (where.entryTime as Record<string, unknown>).lte = new Date(to);
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: { entryTime: 'desc' },
    take: Math.min(limit, 200),
  });

  // Compute stats
  const allEntries = await prisma.journalEntry.findMany({
    where: { userId: token.id as string },
    select: { pnl: true, side: true, symbol: true },
  });

  const totalPnl = allEntries.reduce((sum, e) => sum + (e.pnl || 0), 0);
  const winCount = allEntries.filter(e => (e.pnl || 0) > 0).length;
  const lossCount = allEntries.filter(e => (e.pnl || 0) < 0).length;
  const totalTrades = allEntries.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  return NextResponse.json({
    entries,
    stats: {
      totalPnl: Math.round(totalPnl * 100) / 100,
      totalTrades,
      winCount,
      lossCount,
      winRate: Math.round(winRate * 10) / 10,
    },
  });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  const body = await req.json();
  const { symbol, side, entryPrice, exitPrice, quantity, entryTime, exitTime, setup, tags, notes, rating, emotions } = body;

  if (!symbol || !side || !entryPrice || !entryTime) {
    return NextResponse.json({ error: 'Champs requis: symbol, side, entryPrice, entryTime' }, { status: 400 });
  }

  // Calculate PnL if both entry and exit prices
  let pnl: number | null = null;
  if (exitPrice && entryPrice) {
    const multiplier = side === 'LONG' ? 1 : -1;
    const priceDiff = (exitPrice - entryPrice) * multiplier;
    // Use a generic point value - user should adjust
    pnl = priceDiff * (quantity || 1);
  }

  const entry = await prisma.journalEntry.create({
    data: {
      userId: token.id as string,
      symbol: symbol.toUpperCase(),
      side,
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : null,
      quantity: quantity || 1,
      pnl,
      entryTime: new Date(entryTime),
      exitTime: exitTime ? new Date(exitTime) : null,
      setup: setup || null,
      tags: tags || [],
      notes: notes || null,
      rating: rating || null,
      emotions: emotions || null,
    },
  });

  return NextResponse.json({ success: true, entry });
}
