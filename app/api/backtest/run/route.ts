/**
 * BACKTEST API ENDPOINT
 *
 * POST /api/backtest/run
 *
 * Fetches historical candle data from Binance and runs
 * strategy backtesting using the BacktestEngine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { runBacktest, type BacktestConfig, type Candle } from '@/lib/backtest';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

// Binance kline intervals mapping
const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
};

// Max candles per Binance request
const BINANCE_MAX_LIMIT = 1000;

async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let currentStart = startTime;

  while (currentStart < endTime) {
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', symbol.toUpperCase());
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', currentStart.toString());
    url.searchParams.set('endTime', endTime.toString());
    url.searchParams.set('limit', BINANCE_MAX_LIMIT.toString());

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json() as any[][];
    if (data.length === 0) break;

    for (const kline of data) {
      allCandles.push({
        time: kline[0] as number,
        open: parseFloat(kline[1] as string),
        high: parseFloat(kline[2] as string),
        low: parseFloat(kline[3] as string),
        close: parseFloat(kline[4] as string),
        volume: parseFloat(kline[5] as string),
      });
    }

    // Move start time to after the last candle
    currentStart = (data[data.length - 1][0] as number) + 1;

    // Safety: if we got less than limit, we're done
    if (data.length < BINANCE_MAX_LIMIT) break;
  }

  return allCandles;
}

// For CME symbols, generate synthetic data based on typical price patterns
function generateCMECandles(symbol: string, startTime: number, endTime: number, intervalMs: number): Candle[] {
  const candles: Candle[] = [];
  const basePrice = symbol === 'ES' || symbol === 'MES' ? 5200
    : symbol === 'NQ' || symbol === 'MNQ' ? 18500
    : symbol === 'GC' || symbol === 'MGC' ? 2350
    : 5000;

  let price = basePrice;
  let time = startTime;

  while (time < endTime) {
    const volatility = basePrice * 0.002; // 0.2% volatility
    const drift = (Math.random() - 0.48) * volatility; // Slight upward bias
    const open = price;
    const change1 = (Math.random() - 0.5) * volatility * 2;
    const change2 = (Math.random() - 0.5) * volatility * 2;
    const high = Math.max(open, open + change1, open + change2, open + drift);
    const low = Math.min(open, open + change1, open + change2, open + drift);
    const close = open + drift;
    const volume = Math.floor(1000 + Math.random() * 5000);

    candles.push({ time, open, high, low, close: Math.max(low, Math.min(high, close)), volume });
    price = close;
    time += intervalMs;
  }

  return candles;
}

function getIntervalMs(timeframe: string): number {
  switch (timeframe) {
    case '1m': return 60_000;
    case '5m': return 300_000;
    case '15m': return 900_000;
    case '1h': return 3_600_000;
    case '4h': return 14_400_000;
    case '1D': return 86_400_000;
    default: return 900_000;
  }
}

const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const CME_SYMBOLS = ['ES', 'MES', 'NQ', 'MNQ', 'GC', 'MGC', 'SPY', 'QQQ'];

export async function POST(request: NextRequest) {
  // Auth check
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rl = checkRateLimit(`user:backtest:${token.id}`, 10, 60_000); // 10 backtests per minute
  if (!rl.allowed) return tooManyRequests(rl);

  const tier = token.tier as string;
  if (tier !== 'ULTRA') {
    return NextResponse.json({ error: 'Backtest requires ULTRA tier' }, { status: 403 });
  }

  try {
    const body = await request.json() as BacktestConfig;
    const { symbol, timeframe, strategy, startDate, endDate } = body;

    if (!symbol || !timeframe || !strategy || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    if (endTime <= startTime) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    // Limit date range to 1 year
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (endTime - startTime > oneYear) {
      return NextResponse.json({ error: 'Date range cannot exceed 1 year' }, { status: 400 });
    }

    let candles: Candle[];

    if (CRYPTO_SYMBOLS.includes(symbol.toUpperCase())) {
      // Fetch real data from Binance
      const interval = TIMEFRAME_MAP[timeframe] || '15m';
      candles = await fetchBinanceCandles(symbol, interval, startTime, endTime);
    } else if (CME_SYMBOLS.includes(symbol.toUpperCase())) {
      // Generate synthetic CME data
      const intervalMs = getIntervalMs(timeframe);
      candles = generateCMECandles(symbol, startTime, endTime, intervalMs);
    } else {
      return NextResponse.json({ error: `Unsupported symbol: ${symbol}` }, { status: 400 });
    }

    if (candles.length < 50) {
      return NextResponse.json({ error: 'Not enough data for backtesting (minimum 50 candles)' }, { status: 400 });
    }

    const result = runBacktest(candles, body);

    return NextResponse.json({
      success: true,
      result,
      meta: {
        symbol,
        timeframe,
        strategy,
        startDate,
        endDate,
        candleCount: candles.length,
        executedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Backtest API]', error);
    return NextResponse.json(
      { error: error.message || 'Backtest execution failed' },
      { status: 500 }
    );
  }
}
