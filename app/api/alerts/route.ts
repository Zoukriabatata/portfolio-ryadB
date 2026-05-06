/**
 * GET  /api/alerts  — list user's active price alerts
 * POST /api/alerts  — create a new price alert
 *
 * NOTE: temporarily disabled. The PriceAlert Prisma model was removed
 * from schema.prisma to align with the live DB (the table was never
 * pushed). Will be reintroduced in a dedicated PR with proper migration.
 * Both handlers return HTTP 503 with a defensive body shape so the
 * existing client (hooks/usePriceAlerts.ts) handles the response
 * without crashing. Auth check kept so anonymous probes still get 401.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(
    { ok: false, error: 'Alerts feature is temporarily unavailable.', alerts: [] },
    { status: 503 },
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(
    { ok: false, error: 'Alerts feature is temporarily unavailable.', alert: null },
    { status: 503 },
  );
}
