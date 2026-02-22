/**
 * JOURNAL API - CRUD for trading journal entries
 *
 * GET  /api/journal         - List entries (with advanced filters, pagination, sorting)
 * POST /api/journal         - Create entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';
import { apiRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const url = new URL(req.url);

  // Pagination
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10)));

  // Sorting
  const sortBy = url.searchParams.get('sortBy') || 'entryTime';
  const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
  const validSortFields = ['entryTime', 'symbol', 'side', 'pnl', 'entryPrice', 'exitPrice', 'quantity', 'setup', 'createdAt'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'entryTime';

  // Filters
  const where: Record<string, unknown> = { userId: token.id as string };

  // Symbol filter (comma-separated for multi-select)
  const symbols = url.searchParams.get('symbols');
  if (symbols) {
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (symbolList.length === 1) {
      where.symbol = symbolList[0];
    } else if (symbolList.length > 1) {
      where.symbol = { in: symbolList };
    }
  }
  // Legacy single symbol support
  const symbol = url.searchParams.get('symbol');
  if (symbol && !symbols) where.symbol = symbol;

  // Date range
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from || to) {
    where.entryTime = {};
    if (from) (where.entryTime as Record<string, unknown>).gte = new Date(from);
    if (to) (where.entryTime as Record<string, unknown>).lte = new Date(to);
  }

  // Side filter
  const side = url.searchParams.get('side');
  if (side === 'LONG' || side === 'SHORT') where.side = side;

  // Setup filter (comma-separated)
  const setups = url.searchParams.get('setups');
  if (setups) {
    const setupList = setups.split(',').map(s => s.trim()).filter(Boolean);
    if (setupList.length === 1) {
      where.setup = setupList[0];
    } else if (setupList.length > 1) {
      where.setup = { in: setupList };
    }
  }

  // Emotion filter (comma-separated)
  const emotions = url.searchParams.get('emotions');
  if (emotions) {
    const emotionList = emotions.split(',').map(s => s.trim()).filter(Boolean);
    if (emotionList.length === 1) {
      where.emotions = emotionList[0];
    } else if (emotionList.length > 1) {
      where.emotions = { in: emotionList };
    }
  }

  // P&L range
  const pnlMin = url.searchParams.get('pnlMin');
  const pnlMax = url.searchParams.get('pnlMax');
  if (pnlMin || pnlMax) {
    where.pnl = {};
    if (pnlMin) (where.pnl as Record<string, unknown>).gte = parseFloat(pnlMin);
    if (pnlMax) (where.pnl as Record<string, unknown>).lte = parseFloat(pnlMax);
  }

  // Query with pagination — only select fields needed for list view
  const [entries, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: { [orderField]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
        rating: true,
        emotions: true,
        playbookSetupId: true,
        createdAt: true,
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  // Compute stats (across all user's trades, not just filtered)
  const allEntries = await prisma.journalEntry.findMany({
    where: { userId: token.id as string },
    select: { pnl: true },
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
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const body = await req.json();
  const {
    symbol, side, entryPrice, exitPrice, quantity, entryTime, exitTime,
    timeframe, setup, tags, notes, rating, emotions,
    screenshotUrls, playbookSetupId,
  } = body;

  if (!symbol || !side || !entryPrice || !entryTime) {
    return NextResponse.json({ error: 'Required fields: symbol, side, entryPrice, entryTime' }, { status: 400 });
  }

  // Calculate PnL if both entry and exit prices
  let pnl: number | null = null;
  if (exitPrice && entryPrice) {
    const multiplier = side === 'LONG' ? 1 : -1;
    const priceDiff = (exitPrice - entryPrice) * multiplier;
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
      timeframe: timeframe || null,
      setup: setup || null,
      tags: tags ? JSON.stringify(tags) : null,
      notes: notes || null,
      rating: rating || null,
      emotions: emotions || null,
      ...(screenshotUrls && { screenshotUrls }),
      ...(playbookSetupId && { playbookSetupId }),
    },
  });

  return NextResponse.json({ success: true, entry });
}
