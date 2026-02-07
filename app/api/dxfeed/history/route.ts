import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

/**
 * DXFEED Historical Data API Proxy
 *
 * Proxies requests to dxFeed REST API for historical candle data
 * FREE with 15-minute delay
 *
 * ✅ SECURED: Requires authentication + rate limiting
 *
 * Usage:
 * GET /api/dxfeed/history?symbol=/NQ&timeframe=60
 */

const DXFEED_API_URL = 'https://tools.dxfeed.com/webservice/rest';

// Map timeframe (seconds) to dxFeed candle period
function timeframeToPeriod(tf: number): string {
  if (tf <= 60) return '1m';
  if (tf <= 300) return '5m';
  if (tf <= 900) return '15m';
  if (tf <= 1800) return '30m';
  if (tf <= 3600) return '1h';
  if (tf <= 14400) return '4h';
  return '1d';
}

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

  // ✅ TIER VALIDATION - Futures data requires ULTRA
  const tierCheck = await requireTier('ULTRA', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json(
      { error: tierCheck.error },
      { status: tierCheck.status }
    );
  }

  const { searchParams } = request.nextUrl;

  const symbol = searchParams.get('symbol');
  const timeframe = parseInt(searchParams.get('timeframe') || '60');
  const count = parseInt(searchParams.get('count') || '500');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    const period = timeframeToPeriod(timeframe);

    // Calculate time range (last 2-5 days depending on timeframe)
    const now = Date.now();
    const days = timeframe <= 300 ? 2 : 5;
    const fromTime = now - (days * 24 * 60 * 60 * 1000);

    // dxFeed Candle event format: symbol{=period}
    const candleSymbol = `${symbol}{=${period}}`;

    // dxFeed REST API for events
    const url = new URL(`${DXFEED_API_URL}/events.json`);
    url.searchParams.set('events', 'Candle');
    url.searchParams.set('symbols', candleSymbol);
    url.searchParams.set('fromTime', fromTime.toString());
    url.searchParams.set('toTime', now.toString());

    console.log(`[dxFeed API] Fetching: ${url}`);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OrderFlow-Platform/1.0',
      },
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      // Try alternative endpoint format
      const altUrl = `${DXFEED_API_URL}/eventSource/candles?symbol=${encodeURIComponent(candleSymbol)}&fromTime=${fromTime}`;

      const altResponse = await fetch(altUrl, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!altResponse.ok) {
        console.warn('[dxFeed API] Historical data not available');
        return NextResponse.json({
          candles: [],
          message: 'Historical data not available - will use live data only'
        });
      }

      const altData = await altResponse.json();
      return processResponse(altData, symbol);
    }

    const data = await response.json();
    return processResponse(data, symbol);

  } catch (error) {
    console.error('[dxFeed API] Error:', error);
    // Return empty candles instead of error - service will work with live data only
    return NextResponse.json({
      candles: [],
      message: 'Historical data unavailable - using live data only'
    });
  }
}

function processResponse(data: Record<string, unknown>, symbol: string) {
  const candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  // dxFeed returns data in various formats depending on endpoint
  const events = data.Candle || data.candles || data.events || [];

  if (Array.isArray(events)) {
    for (const event of events) {
      const candle = {
        time: Math.floor((event.time || event.timestamp || Date.now()) / 1000),
        open: event.open || 0,
        high: event.high || 0,
        low: event.low || 0,
        close: event.close || 0,
        volume: event.volume || 0,
      };

      if (candle.open > 0 && candle.close > 0) {
        candles.push(candle);
      }
    }
  }

  // Sort by time
  candles.sort((a, b) => a.time - b.time);

  console.log(`[dxFeed API] Processed ${candles.length} candles for ${symbol}`);

  return NextResponse.json({
    symbol,
    candles,
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
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
