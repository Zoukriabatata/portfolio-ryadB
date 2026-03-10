import { NextRequest, NextResponse } from 'next/server';
import { fetchSpotPrice } from '@/lib/cboe/fetchChain';

/**
 * GET /api/gex-data
 * Calculates GEX metrics from REAL CBOE NDX options chain data.
 * No API key needed — 100% free, 100% real data.
 *
 * Computes: Net GEX, Zero Gamma Level, GEX Ratio, Flow Ratio (volume proxy),
 *           Call IV, Put IV (ATM weighted average).
 *
 * Query params:
 *   ?ticker=NDX (default NDX)
 */

const CBOE_BASE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';

const CBOE_SYMBOL_MAP: Record<string, string> = {
  NDX: '_NDX',
  SPX: '_SPX',
  RUT: '_RUT',
  DJX: '_DJX',
};

// Index options = 100 multiplier
const CONTRACT_MULTIPLIER = 100;

interface CboeOption {
  option: string;
  delta: number;
  gamma: number;
  iv: number;
  open_interest: number;
  volume: number;
  bid: number;
  ask: number;
  last_trade_price: number;
  [key: string]: unknown;
}

/** Parse strike & type from CBOE ticker e.g. "NDX260320C04000000" */
function parseTicker(ticker: string): { strike: number; type: 'C' | 'P' } | null {
  const match = ticker.match(/(\d{6})(C|P)(\d{8})$/);
  if (!match) return null;
  return { type: match[2] as 'C' | 'P', strike: parseInt(match[3], 10) / 1000 };
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') || 'QQQ';
  const cboeSymbol = CBOE_SYMBOL_MAP[ticker] || ticker;

  try {
    // Fetch CBOE chain + Yahoo spot price in parallel
    const [cboeRes, yahooSpot] = await Promise.all([
      fetch(`${CBOE_BASE}/${cboeSymbol}.json`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }),
      fetchSpotPrice(ticker),
    ]);

    if (!cboeRes.ok) {
      return NextResponse.json(
        { error: 'CBOE_ERROR', message: `CBOE returned ${cboeRes.status}` },
        { status: 502 }
      );
    }

    const json = await cboeRes.json();
    const options: CboeOption[] = json.data?.options ?? [];

    if (options.length === 0) {
      return NextResponse.json(
        { error: 'NO_DATA', message: 'No options data from CBOE' },
        { status: 404 }
      );
    }

    // ─── Spot price: Yahoo real price, fallback to delta-based ───
    let deltaSpot = 0;
    let minDeltaDiff = Infinity;
    for (const opt of options) {
      const parsed = parseTicker(opt.option);
      if (!parsed || parsed.type !== 'C') continue;
      const diff = Math.abs(Math.abs(opt.delta) - 0.5);
      if (diff < minDeltaDiff) {
        minDeltaDiff = diff;
        deltaSpot = parsed.strike;
      }
    }
    const spotPrice = yahooSpot > 0 ? yahooSpot : deltaSpot;

    // ─── Calculate GEX per strike ───
    const strikeMap = new Map<number, {
      callGEX: number; putGEX: number; netGEX: number;
      callOI: number; putOI: number;
      callVol: number; putVol: number;
      callIV: number; putIV: number;
      callDelta: number; putDelta: number;
    }>();

    for (const opt of options) {
      const parsed = parseTicker(opt.option);
      if (!parsed) continue;

      const { strike, type } = parsed;
      const gamma = opt.gamma ?? 0;
      const oi = opt.open_interest ?? 0;
      const vol = opt.volume ?? 0;
      const iv = opt.iv ?? 0;

      // GEX = gamma * OI * spot^2 * 0.01 * multiplier
      const rawGEX = gamma * oi * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;

      let entry = strikeMap.get(strike);
      if (!entry) {
        entry = {
          callGEX: 0, putGEX: 0, netGEX: 0,
          callOI: 0, putOI: 0,
          callVol: 0, putVol: 0,
          callIV: 0, putIV: 0,
          callDelta: 0, putDelta: 0,
        };
        strikeMap.set(strike, entry);
      }

      if (type === 'C') {
        entry.callGEX += rawGEX;       // calls = positive GEX
        entry.callOI += oi;
        entry.callVol += vol;
        entry.callIV = iv;
        entry.callDelta = opt.delta;
      } else {
        entry.putGEX -= rawGEX;        // puts = negative GEX
        entry.putOI += oi;
        entry.putVol += vol;
        entry.putIV = iv;
        entry.putDelta = opt.delta;
      }
      entry.netGEX = entry.callGEX + entry.putGEX;
    }

    // ─── Aggregate totals ───
    let totalCallGEX = 0;
    let totalPutGEX = 0;
    let totalCallVol = 0;
    let totalPutVol = 0;

    for (const entry of strikeMap.values()) {
      totalCallGEX += entry.callGEX;
      totalPutGEX += entry.putGEX;
      totalCallVol += entry.callVol;
      totalPutVol += entry.putVol;
    }

    const netGex = totalCallGEX + totalPutGEX;
    const gexRatio = totalPutGEX !== 0 ? Math.abs(totalCallGEX / totalPutGEX) : 0;

    // Flow Ratio proxy: call volume / put volume
    const flowRatio = totalPutVol > 0 ? totalCallVol / totalPutVol : 1;

    // ─── Zero Gamma Level (cumulative GEX cross zero) ───
    const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
    let zeroGamma = 0;
    let cumulativeGEX = 0;
    let prevCumGEX = 0;
    let prevStrike = strikes[0];

    for (const strike of strikes) {
      const entry = strikeMap.get(strike)!;
      cumulativeGEX += entry.netGEX;

      if (prevCumGEX * cumulativeGEX < 0) {
        // Linear interpolation
        const ratio = Math.abs(prevCumGEX) / (Math.abs(prevCumGEX) + Math.abs(cumulativeGEX));
        zeroGamma = prevStrike + ratio * (strike - prevStrike);
        break;
      }

      prevStrike = strike;
      prevCumGEX = cumulativeGEX;
    }

    // ─── ATM IV (weighted by OI near the money) ───
    let callIV = 0;
    let putIV = 0;
    let callIVWeight = 0;
    let putIVWeight = 0;

    for (const entry of strikeMap.values()) {
      // Only use near-ATM options for IV (delta 0.3-0.7)
      if (entry.callDelta > 0.3 && entry.callDelta < 0.7 && entry.callIV > 0) {
        callIV += entry.callIV * entry.callOI;
        callIVWeight += entry.callOI;
      }
      if (entry.putDelta < -0.3 && entry.putDelta > -0.7 && entry.putIV > 0) {
        putIV += entry.putIV * entry.putOI;
        putIVWeight += entry.putOI;
      }
    }

    callIV = callIVWeight > 0 ? (callIV / callIVWeight) * 100 : 0;
    putIV = putIVWeight > 0 ? (putIV / putIVWeight) * 100 : 0;

    // ─── Call Wall / Put Wall (strike with highest OI) ───
    let callWall = 0, maxCallOI = 0;
    let putWall = 0, maxPutOI = 0;
    for (const [strike, entry] of strikeMap) {
      if (entry.callOI > maxCallOI) { maxCallOI = entry.callOI; callWall = strike; }
      if (entry.putOI > maxPutOI) { maxPutOI = entry.putOI; putWall = strike; }
    }

    return NextResponse.json({
      netGex,
      zeroGamma,
      flowRatio: Math.round(flowRatio * 100) / 100,
      gexRatio: Math.round(gexRatio * 100) / 100,
      callIV: Math.round(callIV * 100) / 100,
      putIV: Math.round(putIV * 100) / 100,
      callWall,
      putWall,
      ticker,
      date: new Date().toISOString().split('T')[0],
      source: 'cboe' as const,
      spotPrice,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gex-data
 * Manual override — still available as fallback.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const data = {
      netGex: Number(body.netGex) || 0,
      zeroGamma: Number(body.zeroGamma) || 0,
      flowRatio: Number(body.flowRatio) || 0,
      gexRatio: Number(body.gexRatio) || 0,
      callIV: Number(body.callIV) || 0,
      putIV: Number(body.putIV) || 0,
      ticker: body.ticker || 'QQQ',
      date: new Date().toISOString().split('T')[0],
      source: 'manual' as const,
    };

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'INVALID_BODY', message: 'Invalid JSON body' },
      { status: 400 }
    );
  }
}
