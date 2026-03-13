import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { prisma } from '@/lib/db';

/**
 * Databento REST API Proxy
 *
 * Proxies requests to hist.databento.com using the user's own API key.
 * Each user pays Databento directly — we never store their usage or bill them.
 *
 * Usage:
 *   GET /api/databento/metadata.list_publishers
 *   GET /api/databento/timeseries.get_range?dataset=GLBX.MDP3&schema=ohlcv-1m&symbols=NQ.v.0&...
 *
 * Databento REST base URL: https://hist.databento.com/v0/
 */

const DATABENTO_BASE = 'https://hist.databento.com/v0';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Fetch user's Databento API key
  let apiKey: string | null = null;
  try {
    const config = await prisma.dataFeedConfig.findFirst({
      where: { userId: session.user.id, provider: 'DATABENTO' },
      select: { apiKey: true },
    });
    apiKey = config?.apiKey ?? null;
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Databento not configured — add your API key in /boutique' },
      { status: 404 }
    );
  }

  const { path } = await params;
  const endpoint = path.join('/');

  // Forward all query params
  const { searchParams } = new URL(req.url);
  const targetUrl = new URL(`${DATABENTO_BASE}/${endpoint}`);
  searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        // Databento uses HTTP Basic Auth: API key as username, empty password
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: text || `Databento error ${upstream.status}` },
        { status: upstream.status }
      );
    }

    // Stream JSON response back
    const body = await upstream.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[Databento proxy] Error:', err);
    return NextResponse.json({ error: 'Failed to reach Databento API' }, { status: 502 });
  }
}
