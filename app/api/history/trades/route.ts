/**
 * HISTORICAL TRADES API
 *
 * Fetches historical aggregated trades from Binance Futures API
 * Used for footprint chart with REAL bid/ask data per price level
 *
 * Supports: All Binance Futures symbols (BTCUSDT, ETHUSDT, SOLUSDT, etc.)
 *
 * ✅ SECURED: Requires authentication + rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

interface BinanceAggTrade {
  a: number;     // Aggregate tradeId
  p: string;     // Price
  q: string;     // Quantity
  f: number;     // First tradeId
  l: number;     // Last tradeId
  T: number;     // Timestamp
  m: boolean;    // Was the buyer the maker?
}

interface NormalizedTrade {
  id: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

export async function GET(request: NextRequest) {
  // ✅ AUTHENTICATION REQUIRED
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json(
      { success: false, error: authResult.error },
      {
        status: authResult.status,
        headers: authResult.headers,
      }
    );
  }

  // ✅ TIER VALIDATION - Trades data requires PRO
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json(
      { success: false, error: tierCheck.error },
      { status: tierCheck.status }
    );
  }

  const searchParams = request.nextUrl.searchParams;

  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');
  const limit = Math.min(parseInt(searchParams.get('limit') || '1000', 10), 1000);

  try {
    const trades = await fetchBinanceAggTrades(symbol, limit, startTime, endTime);

    // ✅ ADD RATE LIMIT HEADERS
    return NextResponse.json({
      success: true,
      symbol,
      count: trades.length,
      trades,
    }, {
      headers: authResult.headers,
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch trades'
      },
      { status: 500 }
    );
  }
}

async function fetchBinanceAggTrades(
  symbol: string,
  limit: number,
  startTime?: string | null,
  endTime?: string | null
): Promise<NormalizedTrade[]> {
  const params = new URLSearchParams({
    symbol,
    limit: limit.toString(),
  });

  if (startTime) params.append('startTime', startTime);
  if (endTime) params.append('endTime', endTime);

  const url = `https://fapi.binance.com/fapi/v1/aggTrades?${params}`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data: BinanceAggTrade[] = await response.json();

  return data.map((t) => ({
    id: t.a.toString(),
    price: parseFloat(t.p),
    quantity: parseFloat(t.q),
    time: t.T,
    isBuyerMaker: t.m,
  }));
}
