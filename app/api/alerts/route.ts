/**
 * GET  /api/alerts  — list user's active price alerts
 * POST /api/alerts  — create a new price alert
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createSchema = z.object({
  symbol:      z.string().min(1).max(20).toUpperCase(),
  condition:   z.enum(['above', 'below']),
  targetPrice: z.number().positive(),
  label:       z.string().max(80).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const alerts = await prisma.priceAlert.findMany({
    where: { userId: auth.user.id, triggered: false },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ alerts });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fields', issues: parsed.error.issues }, { status: 400 });
  }

  // Cap at 10 active alerts per user
  const count = await prisma.priceAlert.count({ where: { userId: auth.user.id, triggered: false } });
  if (count >= 10) {
    return NextResponse.json({ error: 'Maximum 10 active alerts per account' }, { status: 400 });
  }

  const alert = await prisma.priceAlert.create({
    data: {
      userId:      auth.user.id,
      symbol:      parsed.data.symbol,
      condition:   parsed.data.condition,
      targetPrice: parsed.data.targetPrice,
      label:       parsed.data.label || null,
    },
  });

  return NextResponse.json({ alert }, { status: 201 });
}
