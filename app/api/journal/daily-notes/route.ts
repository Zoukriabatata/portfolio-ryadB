/**
 * DAILY NOTES API - CRUD for daily journal notes
 *
 * GET  /api/journal/daily-notes - List notes (by month or date)
 * POST /api/journal/daily-notes - Create/update note (upsert by date)
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
  const month = url.searchParams.get('month'); // "2026-02"
  const date = url.searchParams.get('date');   // "2026-02-15"

  const where: Record<string, unknown> = { userId: token.id as string };

  if (date) {
    where.date = new Date(date + 'T00:00:00Z');
  } else if (month) {
    const [year, m] = month.split('-').map(Number);
    where.date = {
      gte: new Date(year, m - 1, 1),
      lt: new Date(year, m, 1),
    };
  }

  const notes = await prisma.dailyNote.findMany({
    where,
    orderBy: { date: 'desc' },
  });

  // Batch query: fetch all trades spanning the date range of notes
  let allTrades: { id: string; symbol: string; side: string; pnl: number | null; entryTime: Date; entryPrice: number; exitPrice: number | null; quantity: number; setup: string | null }[] = [];
  if (notes.length > 0) {
    const dates = notes.map(n => n.date);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    maxDate.setHours(23, 59, 59, 999);

    allTrades = await prisma.journalEntry.findMany({
      where: {
        userId: token.id as string,
        entryTime: { gte: minDate, lte: maxDate },
      },
      select: {
        id: true, symbol: true, side: true, pnl: true,
        entryTime: true, entryPrice: true, exitPrice: true,
        quantity: true, setup: true,
      },
      orderBy: { entryTime: 'asc' },
    });
  }

  // Group trades by day
  const notesWithTrades = notes.map(note => {
    const dayStart = new Date(note.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(note.date);
    dayEnd.setHours(23, 59, 59, 999);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();

    const linkedTrades = allTrades.filter(t => {
      const ms = t.entryTime.getTime();
      return ms >= dayStartMs && ms <= dayEndMs;
    });

    return { ...note, linkedTrades };
  });

  return NextResponse.json({ notes: notesWithTrades });
}

export async function POST(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = await apiRateLimit(token.id as string);
  if (!rl.allowed) return tooManyRequests(rl);

  const body = await req.json();
  const { date, premarketPlan, endOfDayReview, lessons, mood, marketConditions } = body;

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  // Upsert: create or update note for this date
  const noteDate = new Date(date + 'T00:00:00Z');

  const note = await prisma.dailyNote.upsert({
    where: {
      userId_date: {
        userId: token.id as string,
        date: noteDate,
      },
    },
    create: {
      userId: token.id as string,
      date: noteDate,
      premarketPlan: premarketPlan || null,
      endOfDayReview: endOfDayReview || null,
      lessons: lessons || null,
      mood: mood || null,
      marketConditions: marketConditions || null,
    },
    update: {
      ...(premarketPlan !== undefined && { premarketPlan: premarketPlan || null }),
      ...(endOfDayReview !== undefined && { endOfDayReview: endOfDayReview || null }),
      ...(lessons !== undefined && { lessons: lessons || null }),
      ...(mood !== undefined && { mood: mood || null }),
      ...(marketConditions !== undefined && { marketConditions: marketConditions || null }),
    },
  });

  return NextResponse.json({ success: true, note });
}
