import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

const BYBIT_API = 'https://api.bybit.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();

  // Public market-data endpoints — no user state, no auth needed.
  // Required for unauthenticated visitors viewing the live chart.
  const publicEndpoints = [
    'v5/market/kline',
    'v5/market/orderbook',
    'v5/market/tickers',
    'v5/market/recent-trade',
    'v5/market/instruments-info',
    'v5/market/mark-price-kline',
    'v5/market/index-price-kline',
  ];
  const isPublic = publicEndpoints.some(ep => pathStr.includes(ep));

  if (!isPublic) {
    const auth = await requireAuth(request);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status, headers: auth.headers });
    }
  }

  const url = `${BYBIT_API}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Bybit API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Bybit' },
      { status: 500 }
    );
  }
}
