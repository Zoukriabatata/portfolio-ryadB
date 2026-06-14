/**
 * POST /api/events
 * Best-effort conversion event log for the sales chat. Never blocks UX,
 * never surfaces an error. No PII (anonymous sessionId only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  sessionId: z.string().min(1).max(100),
  type:      z.enum(['opened', 'engaged', 'cta_shown', 'cta_clicked', 'lead_captured']),
  ctaType:   z.enum(['download', 'checkout', 'email', 'discord']).optional(),
  page:      z.string().max(200).optional(),
}).strict();

function getClientIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`ip:events:${ip}`, 120, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  try {
    await prisma.chatEvent.create({ data: parsed.data });
  } catch (err) {
    // Best-effort: swallow so the UX never sees an error.
    console.warn('[events] failed to record (ignored):', err);
  }

  return NextResponse.json({ ok: true });
}
