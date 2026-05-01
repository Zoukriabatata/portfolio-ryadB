import { NextRequest, NextResponse } from 'next/server';
import { getYahooTicker, validateCandle, validateInstrumentPrice } from '@/lib/instruments';

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
  if (tf <= 60) return `${Math.min(days, 7)}d`;
  if (tf <= 300) return `${Math.min(days, 60)}d`;
  return `${Math.min(days, 365)}d`;
}

// Stooq symbol mapping for CME futures (free, no API key, no Vercel block)
const STOOQ_MAP: Record<string, string> = {
  'NQ=F': 'nq.f', 'ES=F': 'es.f', 'YM=F': 'ym.f', 'RTY=F': 'rty.f',
  'GC=F': 'gc.f', 'SI=F': 'si.f', 'CL=F': 'cl.f', 'NG=F': 'ng.f',
  'ZB=F': 'zb.f', 'ZN=F': 'zn.f',
  // Micro contracts fall back to the main contract symbol
  'BTC=F': 'btc.f', 'ETH=F': 'eth.f',
};

function tfToStooqInterval(tf: number): string {
  if (tf <= 300) return '5';   // 5-min (smallest Stooq intraday)
  if (tf <= 900) return '15';
  if (tf <= 3600) return '60';
  return 'd';
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
};

async function fetchYahoo(yahooSymbol: string, interval: string, range: string) {
  // Try query1 then query2 — Vercel IPs are sometimes blocked on one but not the other
  for (const domain of ['query1', 'query2']) {
    try {
      const url = `https://${domain}.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${range}`;
      const res = await fetch(url, { headers: YAHOO_HEADERS, cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp) continue;
      return result;
    } catch { continue; }
  }
  return null;
}

async function fetchStooq(yahooSymbol: string, interval: string) {
  const stooqSym = STOOQ_MAP[yahooSymbol];
  if (!stooqSym) return null;
  const stooqInterval = interval === '1d' ? '' : `&i=${tfToStooqInterval(
    interval === '1m' ? 60 : interval === '5m' ? 300 : interval === '15m' ? 900 :
    interval === '30m' ? 1800 : interval === '1h' ? 3600 : 86400
  )}`;
  try {
    const url = `https://stooq.com/q/d/l/?s=${stooqSym}${stooqInterval}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_HEADERS['User-Agent'] },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    // CSV: Date,Time,Open,High,Low,Close,Volume  OR  Date,Open,High,Low,Close,Volume
    const header = lines[0].toLowerCase().split(',');
    const hasTime = header.includes('time');
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',');
      const dateStr = cols[0]; // YYYY-MM-DD
      const timeStr = hasTime ? cols[1] : '00:00:00';
      const off = hasTime ? 1 : 0;
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hh, mm, ss] = timeStr.split(':').map(Number);
      const ts = Math.floor(Date.UTC(y, m - 1, d, hh, mm, ss || 0) / 1000);
      return {
        time: ts,
        open: parseFloat(cols[1 + off]),
        high: parseFloat(cols[2 + off]),
        low: parseFloat(cols[3 + off]),
        close: parseFloat(cols[4 + off]),
        volume: parseFloat(cols[5 + off] || '0') || 0,
      };
    }).filter(c => !isNaN(c.open) && !isNaN(c.close));
    return rows;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  // Public endpoint — Yahoo Finance and Stooq are publicly accessible market data,
  // no licensing reason to gate behind auth. Required for unauthenticated visitors
  // viewing the live chart for CME symbols (MNQ, ES, NQ, GC, CL, etc.).
  const { searchParams } = request.nextUrl;
  const symbol = (searchParams.get('symbol') || '').toUpperCase();
  const timeframe = parseInt(searchParams.get('timeframe') || '60');
  const days = parseInt(searchParams.get('days') || '5');

  const yahooSymbol = getYahooTicker(symbol);
  if (!yahooSymbol) {
    return NextResponse.json({ error: `Unknown CME symbol: ${symbol}` }, { status: 400 });
  }

  const interval = tfToYahooInterval(timeframe);
  const range = tfToYahooRange(timeframe, days);

  // 1. Try Yahoo Finance (query1 + query2)
  const yahooResult = await fetchYahoo(yahooSymbol, interval, range);
  if (yahooResult) {
    const { timestamp, indicators } = yahooResult;
    const quote = indicators?.quote?.[0];
    if (quote && timestamp) {
      const candles = [];
      for (let i = 0; i < timestamp.length; i++) {
        const o = quote.open?.[i];
        const h = quote.high?.[i];
        const l = quote.low?.[i];
        const c = quote.close?.[i];
        const v = quote.volume?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        const candle = { time: timestamp[i], open: o, high: h, low: l, close: c, volume: v || 0 };
        if (!validateCandle(candle, symbol)) continue;
        if (!validateInstrumentPrice(symbol, candle.close)) continue;
        candles.push(candle);
      }
      if (candles.length > 0) {
        return NextResponse.json(candles, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
  }

  // 2. Stooq fallback
  const stooqRows = await fetchStooq(yahooSymbol, interval);
  if (stooqRows && stooqRows.length > 0) {
    const candles = stooqRows.filter(c => validateCandle(c, symbol) && validateInstrumentPrice(symbol, c.close));
    if (candles.length > 0) {
      return NextResponse.json(candles, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  return NextResponse.json({ error: 'No CME data available (Yahoo + Stooq both failed)' }, { status: 502 });
}
