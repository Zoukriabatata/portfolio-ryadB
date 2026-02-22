/**
 * PLAYBOOK API - CRUD for trading setups
 *
 * GET  /api/journal/playbook - List setups with computed stats
 * POST /api/journal/playbook - Create setup
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

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const setups = await prisma.playbookSetup.findMany({
    where: { userId: token.id as string },
    orderBy: { createdAt: 'desc' },
  });

  // Single query: fetch all trades with pnl for user's setups
  const setupIds = setups.map(s => s.id);
  const allTrades = setupIds.length > 0
    ? await prisma.journalEntry.findMany({
        where: {
          userId: token.id as string,
          playbookSetupId: { in: setupIds },
          pnl: { not: null },
        },
        select: { playbookSetupId: true, pnl: true },
      })
    : [];

  // Group trades by setup and compute stats in-memory
  const tradesBySetup = new Map<string, number[]>();
  for (const t of allTrades) {
    if (!t.playbookSetupId) continue;
    const arr = tradesBySetup.get(t.playbookSetupId);
    if (arr) arr.push(t.pnl!);
    else tradesBySetup.set(t.playbookSetupId, [t.pnl!]);
  }

  const setupsWithStats = setups.map(setup => {
    const pnls = tradesBySetup.get(setup.id) || [];
    const wins = pnls.filter(p => p > 0);
    const totalPnl = pnls.reduce((s, p) => s + p, 0);
    const grossProfit = wins.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(pnls.filter(p => p < 0).reduce((s, p) => s + p, 0));

    return {
      ...setup,
      stats: {
        tradeCount: pnls.length,
        winRate: pnls.length > 0 ? Math.round((wins.length / pnls.length) * 1000) / 10 : 0,
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: pnls.length > 0 ? Math.round((totalPnl / pnls.length) * 100) / 100 : 0,
        profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
      },
    };
  });

  return NextResponse.json({ setups: setupsWithStats });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const body = await req.json();
  const { name, description, rules, exampleUrls } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const setup = await prisma.playbookSetup.create({
    data: {
      userId: token.id as string,
      name,
      description: description || null,
      rules: rules || [],
      exampleUrls: exampleUrls || [],
    },
  });

  return NextResponse.json({ success: true, setup });
}
