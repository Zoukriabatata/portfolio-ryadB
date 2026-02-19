/**
 * DAILY NOTES API - Single note operations
 *
 * PUT    /api/journal/daily-notes/[id] - Update note
 * DELETE /api/journal/daily-notes/[id] - Delete note
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.dailyNote.findFirst({
    where: { id, userId: token.id as string },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const body = await req.json();
  const { premarketPlan, endOfDayReview, lessons, mood, marketConditions } = body;

  const note = await prisma.dailyNote.update({
    where: { id },
    data: {
      ...(premarketPlan !== undefined && { premarketPlan: premarketPlan || null }),
      ...(endOfDayReview !== undefined && { endOfDayReview: endOfDayReview || null }),
      ...(lessons !== undefined && { lessons: lessons || null }),
      ...(mood !== undefined && { mood }),
      ...(marketConditions !== undefined && { marketConditions: marketConditions || null }),
    },
  });

  return NextResponse.json({ success: true, note });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.dailyNote.findFirst({
    where: { id, userId: token.id as string },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  await prisma.dailyNote.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
