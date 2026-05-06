/**
 * ETF PRICE API — Real-time ETF prices for bias page
 *
 * GET /api/market/etf-price?symbol=SPY
 *
 * Uses Yahoo Finance (free, no API key).
 * Server-side cache of 5 minutes to avoid hitting rate limits.
 * Falls back to hardcoded prices if fetch fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { BASE_PRICES } from '@/lib/simulation/constants';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

const ALLOWED_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META'];

// Server-side price cache (5 min TTL)
const priceCache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();

  if (!symbol || !ALLOWED_SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  // Check cache
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({
      symbol,
      price: cached.price,
      source: 'yahoo-finance',
      cached: true,
    });
  }

  // Fetch from Yahoo Finance
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice || meta?.previousClose;

    if (!price || typeof price !== 'number') {
      throw new Error('No price data in response');
    }

    // Cache the result
    priceCache.set(symbol, { price, fetchedAt: Date.now() });

    return NextResponse.json({
      symbol,
      price,
      source: 'yahoo-finance',
      cached: false,
    });
  } catch (error) {
    console.error(`[etf-price] Failed to fetch ${symbol}:`, error);

    // Return fallback price
    const fallbackPrice = BASE_PRICES[symbol] || 100;
    return NextResponse.json({
      symbol,
      price: fallbackPrice,
      source: 'fallback',
      cached: false,
    });
  }
}
