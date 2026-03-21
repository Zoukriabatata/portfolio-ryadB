/**
 * GET /api/fear-greed
 * Proxies the alternative.me Fear & Greed index with a 1-hour server-side cache.
 * The index updates at most once per day — no need to hit the external API every visit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

export const runtime = 'nodejs';
// Revalidate server cache every hour (Next.js ISR-style for route handlers)
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('ULTRA', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream error' }, { status: 502 });
    }

    const json = await res.json() as {
      data: Array<{ value: string; value_classification: string }>;
    };

    const item = json.data?.[0];
    if (!item) {
      return NextResponse.json({ error: 'no data' }, { status: 502 });
    }

    return NextResponse.json(
      { value: parseInt(item.value), classification: item.value_classification },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
        },
      }
    );
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 });
  }
}
