import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BINANCE_SPOT_API = 'https://api.binance.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // ✅ STEP 1: AUTHENTICATION REQUIRED
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

  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const market = request.headers.get('x-market') || 'futures';

  // ✅ STEP 2: TIER VALIDATION FOR PREMIUM ENDPOINTS
  // Real-time data streams require ULTRA subscription
  const premiumEndpoints = ['aggTrade', 'depth', 'ticker', 'bookTicker', 'trade'];
  const isPremiumEndpoint = premiumEndpoints.some(endpoint => pathStr.includes(endpoint));

  if (isPremiumEndpoint) {
    const tierCheck = await requireTier('ULTRA', authResult.user.tier);
    if (tierCheck) {
      return NextResponse.json(
        { error: tierCheck.error },
        { status: tierCheck.status }
      );
    }
  }

  const baseUrl = market === 'spot' ? BINANCE_SPOT_API : BINANCE_FUTURES_API;
  const url = `${baseUrl}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  // Debug logging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Binance Proxy] GET ${url} [User: ${authResult.user.email}]`);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Binance Proxy] HTTP ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Binance API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Log response type for debugging (development only)
    if (process.env.NODE_ENV === 'development' && pathStr.includes('aggTrades')) {
      console.log(`[Binance Proxy] aggTrades response: ${Array.isArray(data) ? `${data.length} trades` : typeof data}`);
    }

    // ✅ STEP 3: ADD RATE LIMIT HEADERS TO RESPONSE
    return NextResponse.json(data, {
      headers: authResult.headers,
    });
  } catch (error) {
    console.error('[Binance API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Binance', details: String(error) },
      { status: 500 }
    );
  }
}
