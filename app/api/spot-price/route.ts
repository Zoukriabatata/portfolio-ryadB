import { NextRequest, NextResponse } from 'next/server';
import { fetchSpotPrice } from '@/lib/cboe/fetchChain';

/**
 * GET /api/spot-price?ticker=QQQ
 * Lightweight endpoint — returns only the current spot price from Yahoo Finance.
 * Used for high-frequency live polling (every 10s) without fetching the full CBOE chain.
 *
 * In-memory cache: 3s TTL per ticker — deduplicates burst requests without staleness.
 */

const cache = new Map<string, { price: number; ts: number }>();
const CACHE_TTL = 3_000; // 3 seconds

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') || 'QQQ';

  // Serve from cache if fresh
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ price: cached.price, ticker, ts: cached.ts, cached: true }, {
      headers: { 'Cache-Control': 'public, max-age=3, stale-while-revalidate=2' },
    });
  }

  try {
    const price = await fetchSpotPrice(ticker);
    if (price <= 0) {
      return NextResponse.json({ error: 'NO_PRICE', ticker }, { status: 404 });
    }

    const ts = Date.now();
    cache.set(ticker, { price, ts });

    // Evict stale entries (keep map small)
    if (cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of cache) {
        if (now - v.ts > 60_000) cache.delete(k);
      }
    }

    return NextResponse.json({ price, ticker, ts }, {
      headers: { 'Cache-Control': 'public, max-age=3, stale-while-revalidate=2' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
