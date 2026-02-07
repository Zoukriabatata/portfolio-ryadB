import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

/**
 * Yahoo Finance Chart API Proxy
 *
 * Proxies requests to Yahoo Finance chart API to avoid CORS issues
 * FREE - No API key required!
 *
 * ✅ SECURED: Requires authentication + rate limiting
 *
 * Usage:
 * GET /api/yahoo/chart?symbol=NQ=F&interval=1m&range=2d
 */

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export async function GET(request: NextRequest) {
  // ✅ AUTHENTICATION REQUIRED
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      {
        status: authResult.status,
        headers: authResult.headers,
      }
    );
  }

  // ✅ TIER VALIDATION - Stock data requires ULTRA
  const tierCheck = await requireTier('ULTRA', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json(
      { error: tierCheck.error },
      { status: tierCheck.status }
    );
  }

  const { searchParams } = request.nextUrl;

  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1m';
  const range = searchParams.get('range') || '1d';
  const period1 = searchParams.get('period1');
  const period2 = searchParams.get('period2');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    // Build Yahoo Finance URL
    const params = new URLSearchParams({
      interval,
      includePrePost: 'true',
      events: 'div,splits',
    });

    if (period1 && period2) {
      params.set('period1', period1);
      params.set('period2', period2);
    } else {
      params.set('range', range);
    }

    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?${params}`;

    console.log(`[Yahoo API] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      // Cache for 10 seconds to avoid rate limiting
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Yahoo API] Error:', error);
      return NextResponse.json({
        error: 'Failed to fetch from Yahoo Finance',
        status: response.status,
        details: error,
      }, { status: response.status });
    }

    const data = await response.json();

    // ✅ ADD RATE LIMIT + CORS HEADERS
    return NextResponse.json(data, {
      headers: {
        ...authResult.headers,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('[Yahoo API] Error:', error);
    return NextResponse.json({
      error: 'Failed to fetch chart data',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
