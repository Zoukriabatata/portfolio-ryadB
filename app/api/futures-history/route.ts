import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

/**
 * GET /api/futures-history?symbol=NQ&timeframe=60&days=5
 *
 * Fetches CME futures historical candles via Yahoo Finance (free, no API key).
 * Used as fallback when Tradovate/dxFeed are unavailable (weekends, no credentials).
 *
 * Symbol mapping: NQ → NQ=F, ES → ES=F, YM → YM=F, GC → GC=F, CL → CL=F
 */

const CME_TO_YAHOO: Record<string, string> = {
  'ES': 'ES=F', 'MES': 'ES=F',
  'NQ': 'NQ=F', 'MNQ': 'NQ=F',
  'YM': 'YM=F',
  'RTY': 'RTY=F',
  'GC': 'GC=F',
  'SI': 'SI=F',
  'CL': 'CL=F',
  'NG': 'NG=F',
  'ZB': 'ZB=F',
  'ZN': 'ZN=F',
  'ZF': 'ZF=F',
};

function tfToYahooInterval(tf: number): string {
  if (tf <= 60) return '1m';
  if (tf <= 120) return '2m';
  if (tf <= 300) return '5m';
  if (tf <= 900) return '15m';
  if (tf <= 1800) return '30m';
  if (tf <= 3600) return '1h';
  if (tf <= 14400) return '4h';
  return '1d';
}

function tfToYahooRange(tf: number, days: number): string {
  // Yahoo limits: 1m=7d max, 5m=60d max, 15m+=730d
  if (tf <= 60) return `${Math.min(days, 7)}d`;
  if (tf <= 300) return `${Math.min(days, 60)}d`;
  return `${Math.min(days, 365)}d`;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }

  const { searchParams } = request.nextUrl;
  const symbol = (searchParams.get('symbol') || '').toUpperCase();
  const timeframe = parseInt(searchParams.get('timeframe') || '60');
  const days = parseInt(searchParams.get('days') || '5');

  const yahooSymbol = CME_TO_YAHOO[symbol];
  if (!yahooSymbol) {
    return NextResponse.json({ error: `Unknown CME symbol: ${symbol}` }, { status: 400 });
  }

  try {
    const interval = tfToYahooInterval(timeframe);
    const range = tfToYahooRange(timeframe, days);

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 60 }, // Cache 1 minute
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo Finance error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp) {
      return NextResponse.json({ error: 'No data returned' }, { status: 404 });
    }

    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0];
    if (!quote) {
      return NextResponse.json({ error: 'No quote data' }, { status: 404 });
    }

    const candles = [];
    for (let i = 0; i < timestamp.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      const v = quote.volume?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({
        time: timestamp[i],
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v || 0,
      });
    }

    return NextResponse.json(candles, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[futures-history] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch futures data' }, { status: 500 });
  }
}
