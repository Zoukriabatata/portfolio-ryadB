import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Map our symbols to Yahoo symbols
const SYMBOL_MAP: Record<string, string> = {
  'SPX': 'SPY',     // S&P 500 -> SPY ETF
  'NDX': 'QQQ',     // Nasdaq 100 -> QQQ ETF
  'SPY': 'SPY',
  'QQQ': 'QQQ',
};

// Singleton Yahoo Finance instance
let yf: InstanceType<typeof YahooFinance> | null = null;

function getYahooFinance() {
  if (!yf) {
    yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }
  return yf;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  const expiration = request.nextUrl.searchParams.get('expiration');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const yahooSymbol = SYMBOL_MAP[symbol] || symbol;

  try {
    const yahooFinance = getYahooFinance();

    // Convert expiration to Date if provided
    const options: { date?: Date } = {};
    if (expiration) {
      options.date = new Date(parseInt(expiration) * 1000);
    }

    const result = await yahooFinance.options(yahooSymbol, options);

    if (!result) {
      return NextResponse.json({ error: 'No options data' }, { status: 404 });
    }

    const underlyingPrice = result.quote?.regularMarketPrice || 0;

    // Convert Date objects to Unix timestamps
    const expirations = (result.expirationDates || []).map((d: Date) =>
      Math.floor(d.getTime() / 1000)
    );

    const optionsData = result.options?.[0] || { calls: [], puts: [] };

    // Format calls
    const calls = (optionsData.calls || []).map((opt) => ({
      strike: opt.strike,
      expiration: opt.expiration ? Math.floor(new Date(opt.expiration).getTime() / 1000) : 0,
      lastPrice: opt.lastPrice || 0,
      bid: opt.bid || 0,
      ask: opt.ask || 0,
      volume: opt.volume || 0,
      openInterest: opt.openInterest || 0,
      impliedVolatility: opt.impliedVolatility || 0,
      inTheMoney: opt.inTheMoney || false,
      contractSymbol: opt.contractSymbol || '',
    }));

    // Format puts
    const puts = (optionsData.puts || []).map((opt) => ({
      strike: opt.strike,
      expiration: opt.expiration ? Math.floor(new Date(opt.expiration).getTime() / 1000) : 0,
      lastPrice: opt.lastPrice || 0,
      bid: opt.bid || 0,
      ask: opt.ask || 0,
      volume: opt.volume || 0,
      openInterest: opt.openInterest || 0,
      impliedVolatility: opt.impliedVolatility || 0,
      inTheMoney: opt.inTheMoney || false,
      contractSymbol: opt.contractSymbol || '',
    }));

    return NextResponse.json({
      symbol: yahooSymbol,
      underlyingPrice,
      expirations,
      calls,
      puts,
    });
  } catch (error) {
    console.error('[Yahoo Options API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch options data' },
      { status: 500 }
    );
  }
}
