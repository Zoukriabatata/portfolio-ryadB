/**
 * CBOE NDX Options Chain — Server-side utility
 * Fetches real delayed quotes from cdn.cboe.com (free, no key).
 * Spot price from Yahoo Finance (real-time).
 */

const CBOE_BASE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';

const CBOE_SYMBOL_MAP: Record<string, string> = {
  NDX: '_NDX',
  SPX: '_SPX',
  QQQ: 'QQQ',
  RUT: '_RUT',
};

// Yahoo symbol mapping (index symbols need special tickers)
const YAHOO_SYMBOL_MAP: Record<string, string> = {
  NDX: '^NDX',
  SPX: '^GSPC',
  RUT: '^RUT',
  DJX: '^DJI',
};

/** Fetch real spot price from Yahoo Finance */
export async function fetchSpotPrice(symbol: string): Promise<number> {
  const yahooSymbol = YAHOO_SYMBOL_MAP[symbol] || symbol;
  try {
    const res = await fetch(
      `${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
      { cache: 'no-store' }
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
  } catch {
    return 0; // fallback to delta-based detection
  }
}

export interface CboeOption {
  option: string;
  strike: number;
  type: 'C' | 'P';
  expiration: string;   // "YYMMDD"
  expirationTs: number; // Unix seconds
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  openInterest: number;
  volume: number;
  lastPrice: number;
}

export interface CboeChain {
  options: CboeOption[];
  spotPrice: number;
  timestamp: string;
  expirations: number[]; // unique expiration timestamps sorted
}

/** Parse CBOE ticker: "NDX260320C04000000" → { type, strike, expiration } */
function parseTicker(ticker: string): { type: 'C' | 'P'; strike: number; expiration: string } | null {
  const match = ticker.match(/(\d{6})(C|P)(\d{8})$/);
  if (!match) return null;
  return {
    expiration: match[1],
    type: match[2] as 'C' | 'P',
    strike: parseInt(match[3], 10) / 1000,
  };
}

/** Convert "YYMMDD" to Unix timestamp (seconds) */
function expToTimestamp(exp: string): number {
  const year = 2000 + parseInt(exp.slice(0, 2), 10);
  const month = parseInt(exp.slice(2, 4), 10) - 1;
  const day = parseInt(exp.slice(4, 6), 10);
  return Math.floor(new Date(year, month, day).getTime() / 1000);
}

export async function fetchCboeChain(symbol = 'NDX'): Promise<CboeChain> {
  const cboeSymbol = CBOE_SYMBOL_MAP[symbol] || symbol;

  // Fetch CBOE chain + Yahoo spot price in parallel
  const [cboeRes, yahooSpot] = await Promise.all([
    fetch(`${CBOE_BASE}/${cboeSymbol}.json`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }),
    fetchSpotPrice(symbol),
  ]);

  if (!cboeRes.ok) {
    throw new Error(`CBOE returned ${cboeRes.status} for ${cboeSymbol}`);
  }

  const json = await cboeRes.json();
  const raw = json.data?.options ?? [];
  const timestamp = json.timestamp ?? new Date().toISOString();

  const options: CboeOption[] = [];
  let deltaSpot = 0;
  let minDeltaDiff = Infinity;
  const expirationSet = new Set<number>();

  for (const opt of raw) {
    const parsed = parseTicker(opt.option ?? '');
    if (!parsed) continue;

    const expTs = expToTimestamp(parsed.expiration);
    expirationSet.add(expTs);

    const cboeOpt: CboeOption = {
      option: opt.option,
      strike: parsed.strike,
      type: parsed.type,
      expiration: parsed.expiration,
      expirationTs: expTs,
      bid: opt.bid ?? 0,
      ask: opt.ask ?? 0,
      iv: opt.iv ?? 0,
      delta: opt.delta ?? 0,
      gamma: opt.gamma ?? 0,
      vega: opt.vega ?? 0,
      theta: opt.theta ?? 0,
      openInterest: opt.open_interest ?? 0,
      volume: opt.volume ?? 0,
      lastPrice: opt.last_trade_price ?? 0,
    };

    options.push(cboeOpt);

    // Fallback: detect ATM strike from call delta closest to 0.5
    if (parsed.type === 'C') {
      const diff = Math.abs(Math.abs(opt.delta ?? 0) - 0.5);
      if (diff < minDeltaDiff) {
        minDeltaDiff = diff;
        deltaSpot = parsed.strike;
      }
    }
  }

  // Use Yahoo real price, fallback to delta-based estimation
  const spotPrice = yahooSpot > 0 ? yahooSpot : deltaSpot;

  const expirations = Array.from(expirationSet).sort((a, b) => a - b);

  return { options, spotPrice, timestamp, expirations };
}
