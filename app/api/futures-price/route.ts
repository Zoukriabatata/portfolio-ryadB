import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';
import { getYahooTicker } from '@/lib/instruments';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }

  const { searchParams } = request.nextUrl;
  const symbol = (searchParams.get('symbol') || '').toUpperCase();

  const yahooSymbol = getYahooTicker(symbol);
  if (!yahooSymbol) {
    return NextResponse.json({ error: `Unknown CME symbol: ${symbol}` }, { status: 400 });
  }

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbol}&fields=regularMarketPrice,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo Finance error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];
    if (!quote) {
      return NextResponse.json({ error: 'No quote data' }, { status: 404 });
    }

    return NextResponse.json({
      price: quote.regularMarketPrice,
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      prevClose: quote.regularMarketPreviousClose,
      symbol,
      timestamp: Math.floor(Date.now() / 1000),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[futures-price] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
  }
}
