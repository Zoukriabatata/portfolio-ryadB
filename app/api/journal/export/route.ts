/**
 * JOURNAL EXPORT API - Export entries as CSV
 *
 * GET /api/journal/export - Download CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    orderBy: { entryTime: 'desc' },
    take: 5000,
  });

  const headers = [
    'Date', 'Symbol', 'Side', 'Entry Price', 'Exit Price',
    'Quantity', 'P&L', 'Setup', 'Emotions', 'Rating',
    'Timeframe', 'Notes', 'Tags',
  ];

  const rows = entries.map((e) => [
    new Date(e.entryTime).toISOString(),
    e.symbol,
    e.side,
    e.entryPrice,
    e.exitPrice ?? '',
    e.quantity,
    e.pnl ?? '',
    e.setup ?? '',
    e.emotions ?? '',
    e.rating ?? '',
    e.timeframe ?? '',
    (e.notes ?? '').replace(/"/g, '""'),
    e.tags ?? '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        const s = String(cell);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s}"`
          : s;
      }).join(',')
    ),
  ].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="journal-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
