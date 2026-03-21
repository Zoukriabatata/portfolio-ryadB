/**
 * HISTORICAL KLINES API
 *
 * Fetches historical candlestick data from Binance Futures API
 * Supports multiple timeframes and pagination for loading more history
 *
 * Public endpoint — proxies freely available Binance/Bybit public data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

// Binance interval mapping
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '6h': '6h',
  '8h': '8h',
  '12h': '12h',
  '1d': '1d',
  '3d': '3d',
  '1w': '1w',
  '1M': '1M',
};

// Bybit interval mapping
const BYBIT_INTERVAL_MAP: Record<string, string> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '6h': '360',
  '12h': '720',
  '1d': 'D',
  '1w': 'W',
  '1M': 'M',
};

interface BinanceKline {
  0: number;   // Open time
  1: string;   // Open
  2: string;   // High
  3: string;   // Low
  4: string;   // Close
  5: string;   // Volume
  6: number;   // Close time
  7: string;   // Quote asset volume
  8: number;   // Number of trades
  9: string;   // Taker buy base asset volume
  10: string;  // Taker buy quote asset volume
  11: string;  // Ignore
}

interface BybitKline {
  start: number;
  end: number;
  interval: string;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  turnover: string;
}

interface NormalizedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('ULTRA', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  const searchParams = request.nextUrl.searchParams;

  const symbol = searchParams.get('symbol') || 'BTCUSDT';
  const interval = searchParams.get('interval') || '1m';
  const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10), 1500);
  const endTime = searchParams.get('endTime'); // For pagination (load older data)
  const startTime = searchParams.get('startTime');
  const exchange = searchParams.get('exchange') || 'binance';

  try {
    let candles: NormalizedCandle[];

    if (exchange === 'bybit') {
      candles = await fetchBybitKlines(symbol, interval, limit, startTime, endTime);
    } else {
      candles = await fetchBinanceKlines(symbol, interval, limit, startTime, endTime);
    }

    return NextResponse.json({
      success: true,
      symbol,
      interval,
      count: candles.length,
      candles,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error fetching klines:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch klines'
      },
      { status: 500 }
    );
  }
}

async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit: number,
  startTime?: string | null,
  endTime?: string | null
): Promise<NormalizedCandle[]> {
  const binanceInterval = INTERVAL_MAP[interval] || '1m';

  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval: binanceInterval,
    limit: limit.toString(),
  });

  if (startTime) params.append('startTime', startTime);
  if (endTime) params.append('endTime', endTime);

  // Use Binance Futures API for perpetuals
  const url = `https://fapi.binance.com/fapi/v1/klines?${params}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const data: BinanceKline[] = await response.json();

  return data.map((k) => ({
    time: Math.floor(k[0] / 1000), // Convert to seconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function fetchBybitKlines(
  symbol: string,
  interval: string,
  limit: number,
  startTime?: string | null,
  endTime?: string | null
): Promise<NormalizedCandle[]> {
  const bybitInterval = BYBIT_INTERVAL_MAP[interval] || '1';

  const params = new URLSearchParams({
    category: 'linear',
    symbol: symbol.toUpperCase(),
    interval: bybitInterval,
    limit: limit.toString(),
  });

  if (startTime) params.append('start', startTime);
  if (endTime) params.append('end', endTime);

  const url = `https://api.bybit.com/v5/market/kline?${params}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Bybit API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  // Bybit returns newest first, we want oldest first
  const klines: BybitKline[] = data.result?.list || [];

  return klines.reverse().map((k) => ({
    time: Math.floor(Number(k.start) / 1000),
    open: parseFloat(k.open),
    high: parseFloat(k.high),
    low: parseFloat(k.low),
    close: parseFloat(k.close),
    volume: parseFloat(k.volume),
  }));
}
