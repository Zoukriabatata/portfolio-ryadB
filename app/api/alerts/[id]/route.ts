/**
 * DELETE /api/alerts/[id]  — delete an alert
 * POST   /api/alerts/[id]  — trigger an alert (called client-side when price crosses)
 *
 * NOTE: temporarily disabled. Same reason as /api/alerts/route.ts —
 * PriceAlert model is being reintroduced in a dedicated PR. Both handlers
 * return HTTP 503 to avoid Prisma client crashes (the table doesn't
 * exist in the live DB anyway, the routes were already 500-ing).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await params;  // consume to keep the function signature stable

  return NextResponse.json(
    { ok: false, error: 'Alerts feature is temporarily unavailable.', alert: null },
    { status: 503 },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await params;

  return NextResponse.json(
    { ok: false, error: 'Alerts feature is temporarily unavailable.', alert: null },
    { status: 503 },
  );
}
