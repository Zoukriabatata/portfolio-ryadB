import { NextRequest, NextResponse } from 'next/server';
import type { OptionsFlowData, StrikeWall } from '@/types/trading-bias';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

/**
 * GET /api/options-data
 * Fetches NDX options data from CBOE delayed quotes (public, no key needed).
 * Real data: OI, Greeks (delta, gamma, vega, theta), IV per strike.
 *
 * CBOE uses _NDX (underscore prefix) for index options.
 *
 * Query params:
 *   ?symbol=NDX (default NDX)
 */

const CBOE_BASE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';

// CBOE uses underscore prefix for index symbols
const CBOE_SYMBOL_MAP: Record<string, string> = {
  NDX: '_NDX',
  SPX: '_SPX',
  RUT: '_RUT',
  DJX: '_DJX',
};

/** Parse strike from CBOE option ticker e.g. "NDX260320C04000000" → 4000 */
function parseOptionTicker(ticker: string): { strike: number; type: 'C' | 'P' } | null {
  // Format: SYMBOLyymmddCssssssss (strike in 1/1000)
  const match = ticker.match(/(\d{6})(C|P)(\d{8})$/);
  if (!match) return null;
  return {
    type: match[2] as 'C' | 'P',
    strike: parseInt(match[3], 10) / 1000,
  };
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

  const symbol = request.nextUrl.searchParams.get('symbol') || 'QQQ';
  const cboeSymbol = CBOE_SYMBOL_MAP[symbol] || symbol;

  try {
    const res = await fetch(`${CBOE_BASE}/${cboeSymbol}.json`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'CBOE_ERROR',
          message: `CBOE returned ${res.status} for ${cboeSymbol}`,
        },
        { status: 502 }
      );
    }

    const json = await res.json();
    const options = json.data?.options ?? [];

    let totalCallOI = 0;
    let totalPutOI = 0;
    const callStrikes: Map<number, { oi: number; gamma: number }> = new Map();
    const putStrikes: Map<number, { oi: number; gamma: number }> = new Map();

    for (const opt of options) {
      const parsed = parseOptionTicker(opt.option ?? '');
      if (!parsed) continue;

      const { strike, type } = parsed;
      const oi = opt.open_interest ?? 0;
      const gamma = opt.gamma ?? 0;

      if (type === 'C') {
        totalCallOI += oi;
        const existing = callStrikes.get(strike);
        callStrikes.set(strike, {
          oi: (existing?.oi ?? 0) + oi,
          gamma: (existing?.gamma ?? 0) + gamma * oi * 100,
        });
      } else {
        totalPutOI += oi;
        const existing = putStrikes.get(strike);
        putStrikes.set(strike, {
          oi: (existing?.oi ?? 0) + oi,
          gamma: (existing?.gamma ?? 0) + gamma * oi * 100,
        });
      }
    }

    const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;

    // Top call walls (highest OI)
    const topCallWalls: StrikeWall[] = Array.from(callStrikes.entries())
      .sort((a, b) => b[1].oi - a[1].oi)
      .slice(0, 5)
      .map(([strike, data]) => ({ strike, oi: data.oi, gex: data.gamma }));

    // Top put walls (highest OI)
    const topPutWalls: StrikeWall[] = Array.from(putStrikes.entries())
      .sort((a, b) => b[1].oi - a[1].oi)
      .slice(0, 5)
      .map(([strike, data]) => ({ strike, oi: data.oi, gex: -data.gamma }));

    // IV Skew: ATM options (delta ~0.5)
    interface CboeOption {
      option: string;
      delta: number;
      iv: number;
      [key: string]: unknown;
    }

    const atmOptions = options.filter(
      (o: CboeOption) => o.delta && Math.abs(o.delta) > 0.4 && Math.abs(o.delta) < 0.6
    );

    let skewIndex = 0;
    if (atmOptions.length >= 2) {
      const atmCall = atmOptions.find((o: CboeOption) => {
        const p = parseOptionTicker(o.option);
        return p?.type === 'C';
      });
      const atmPut = atmOptions.find((o: CboeOption) => {
        const p = parseOptionTicker(o.option);
        return p?.type === 'P';
      });
      if (atmCall && atmPut) {
        // CBOE returns IV as decimal (0.25 = 25%), convert to percentage points
        skewIndex = ((Number(atmPut.iv) || 0) - (Number(atmCall.iv) || 0)) * 100;
      }
    }

    const result: OptionsFlowData = {
      totalCallOI,
      totalPutOI,
      pcRatio,
      topCallWalls,
      topPutWalls,
      skewIndex,
    };

    return NextResponse.json(result);
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
