import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for Binance depth — bypasses client-side geo-restrictions
const BINANCE_FUTURES = 'https://fapi.binance.com';
const BINANCE_SPOT = 'https://api.binance.com';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const market = searchParams.get('market') || 'futures';

  const base = market === 'futures' ? BINANCE_FUTURES : BINANCE_SPOT;
  const path = market === 'futures' ? '/fapi/v1/depth' : '/api/v3/depth';

  try {
    const res = await fetch(
      `${base}${path}?symbol=${symbol}&limit=500`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'upstream error', status: res.status }, { status: 502 });
    }

    const data = await res.json();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
