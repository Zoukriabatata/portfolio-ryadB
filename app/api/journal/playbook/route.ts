/**
 * PLAYBOOK API - CRUD for trading setups
 *
 * GET  /api/journal/playbook - List setups with computed stats
 * POST /api/journal/playbook - Create setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const setups = await prisma.playbookSetup.findMany({
    where: { userId: token.id as string },
    orderBy: { createdAt: 'desc' },
  });

  // Compute stats for each setup
  const setupsWithStats = await Promise.all(
    setups.map(async (setup) => {
      const trades = await prisma.journalEntry.findMany({
        where: { playbookSetupId: setup.id, userId: token.id as string },
        select: { pnl: true },
      });

      const closedTrades = trades.filter(t => t.pnl !== null);
      const wins = closedTrades.filter(t => t.pnl! > 0);
      const totalPnl = closedTrades.reduce((s, t) => s + t.pnl!, 0);
      const grossProfit = wins.reduce((s, t) => s + t.pnl!, 0);
      const grossLoss = Math.abs(closedTrades.filter(t => t.pnl! < 0).reduce((s, t) => s + t.pnl!, 0));

      return {
        ...setup,
        stats: {
          tradeCount: closedTrades.length,
          winRate: closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 1000) / 10 : 0,
          totalPnl: Math.round(totalPnl * 100) / 100,
          avgPnl: closedTrades.length > 0 ? Math.round((totalPnl / closedTrades.length) * 100) / 100 : 0,
          profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
        },
      };
    })
  );

  return NextResponse.json({ setups: setupsWithStats });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
