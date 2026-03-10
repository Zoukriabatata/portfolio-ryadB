import { NextRequest, NextResponse } from 'next/server';
import { fetchSpotPrice } from '@/lib/cboe/fetchChain';

/**
 * GET /api/spot-price?ticker=QQQ
 * Lightweight endpoint — returns only the current spot price from Yahoo Finance.
 * Used for high-frequency live polling (every 10s) without fetching the full CBOE chain.
 */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') || 'QQQ';
  try {
    const price = await fetchSpotPrice(ticker);
    if (price <= 0) {
      return NextResponse.json({ error: 'NO_PRICE', ticker }, { status: 404 });
    }
    return NextResponse.json({ price, ticker, ts: Date.now() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
