import { NextRequest, NextResponse } from 'next/server';

const BINANCE_FUTURES_API = 'https://fapi.binance.com';
const BINANCE_SPOT_API = 'https://api.binance.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const market = request.headers.get('x-market') || 'futures';

  const baseUrl = market === 'spot' ? BINANCE_SPOT_API : BINANCE_FUTURES_API;
  const url = `${baseUrl}/${pathStr}${searchParams ? `?${searchParams}` : ''}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Binance API Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Binance' },
      { status: 500 }
    );
  }
}
