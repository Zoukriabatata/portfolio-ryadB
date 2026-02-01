import { NextRequest, NextResponse } from 'next/server';

// Yahoo Finance API (unofficial but free)
const YAHOO_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Map our symbols to Yahoo Finance symbols
const SYMBOL_MAP: Record<string, string> = {
  // Micro futures
  'MNQH5': 'MNQ=F',
  'MNQZ4': 'MNQ=F',
  'MESH5': 'MES=F',
  'MESZ4': 'MES=F',
  'MGCJ5': 'MGC=F',
  'MGCG5': 'MGC=F',
  // E-mini futures
  'NQH5': 'NQ=F',
  'NQZ4': 'NQ=F',
  'ESH5': 'ES=F',
  'ESZ4': 'ES=F',
  // Gold
  'GCJ5': 'GC=F',
  'GCG5': 'GC=F',
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const interval = request.nextUrl.searchParams.get('interval') || '1m';
  const range = request.nextUrl.searchParams.get('range') || '1d';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const yahooSymbol = SYMBOL_MAP[symbol] || symbol;

  // Convert interval to Yahoo format
  const intervalMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '1h', // Yahoo doesn't have 4h, use 1h
    '1d': '1d',
  };

  // Convert range based on interval
  const rangeMap: Record<string, string> = {
    '1m': '1d',
    '5m': '5d',
    '15m': '5d',
    '30m': '1mo',
    '1h': '1mo',
    '4h': '3mo',
    '1d': '1y',
  };

  const yahooInterval = intervalMap[interval] || '1m';
  const yahooRange = rangeMap[interval] || '1d';

  try {
    const url = `${YAHOO_API}/${yahooSymbol}?interval=${yahooInterval}&range=${yahooRange}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = await response.json();

    if (data.chart?.error) {
      return NextResponse.json(
        { error: data.chart.error.description },
        { status: 400 }
      );
    }

    const result = data.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: 'No data' }, { status: 404 });
    }

    const { timestamp, indicators } = result;
    const quote = indicators?.quote?.[0];

    if (!timestamp || !quote) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 500 });
    }

    // Format candles
    const candles = timestamp.map((time: number, i: number) => ({
      time,
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i] || 0,
    })).filter((c: { open: number | null }) => c.open !== null);

    // Get current price
    const meta = result.meta;
    const currentPrice = meta?.regularMarketPrice || candles[candles.length - 1]?.close || 0;

    return NextResponse.json({
      symbol: yahooSymbol,
      candles,
      currentPrice,
      previousClose: meta?.previousClose,
      marketState: meta?.marketState, // PRE, REGULAR, POST, CLOSED
    });
  } catch (error) {
    console.error('[Yahoo API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from Yahoo Finance' },
      { status: 500 }
    );
  }
}
