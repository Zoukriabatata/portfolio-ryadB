import { NextRequest, NextResponse } from 'next/server';
import { fetchCboeChain } from '@/lib/cboe/fetchChain';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

/**
 * GET /api/volatility-live
 * Real IV data from CBOE, formatted for Volatility page components.
 *
 * Returns: { skewData, surfaceData, termStructure, spotPrice, atmIV, expirations }
 *
 * Query: ?symbol=NDX&expiration=1234567890
 */

interface SkewPoint {
  strike: number;
  callIV: number | null;
  putIV: number | null;
  moneyness: number;
}

interface SurfacePoint {
  strike: number;
  expiration: number;
  iv: number;
}

interface TermPoint {
  expiration: number;
  expirationLabel: string;
  daysToExpiry: number;
  atmIV: number;
  callIV: number;
  putIV: number;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  const symbol = request.nextUrl.searchParams.get('symbol') || 'NDX';
  const expFilter = request.nextUrl.searchParams.get('expiration');

  try {
    const chain = await fetchCboeChain(symbol);
    const { spotPrice, expirations } = chain;

    const targetExp = expFilter ? parseInt(expFilter, 10) : expirations[0];

    // ─── 1. Skew Data (IV smile for selected expiration) ───
    const expOptions = targetExp
      ? chain.options.filter(o => o.expirationTs === targetExp)
      : chain.options.filter(o => o.expirationTs === expirations[0]);

    const strikeIV = new Map<number, { callIV: number; putIV: number }>();

    for (const opt of expOptions) {
      const { strike, type, iv } = opt;
      if (iv <= 0) continue;

      let entry = strikeIV.get(strike);
      if (!entry) {
        entry = { callIV: 0, putIV: 0 };
        strikeIV.set(strike, entry);
      }

      // Keep IV as decimal (0.25 = 25%) — charts/table multiply by 100 for display
      if (type === 'C') entry.callIV = iv;
      else entry.putIV = iv;
    }

    const skewData: SkewPoint[] = Array.from(strikeIV.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([strike, ivs]) => ({
        strike,
        callIV: ivs.callIV > 0 ? ivs.callIV : null,
        putIV: ivs.putIV > 0 ? ivs.putIV : null,
        moneyness: spotPrice > 0 ? strike / spotPrice : 1,
      }));

    // ─── 2. Surface Data (IV across select expirations, limited strikes) ───
    // Limit to ~8 nearest expirations × ~30 strikes around ATM for WebGL perf
    const maxSurfaceExps = 8;
    const maxSurfaceStrikes = 30;
    const surfaceExps = expirations.slice(0, maxSurfaceExps);
    const surfaceExpSet = new Set(surfaceExps);

    // Find strikes near ATM
    const allStrikes = Array.from(new Set(chain.options.map(o => o.strike))).sort((a, b) => a - b);
    const atmIdx = allStrikes.findIndex(s => s >= spotPrice);
    const halfRange = Math.floor(maxSurfaceStrikes / 2);
    const surfaceStrikeStart = Math.max(0, atmIdx - halfRange);
    const surfaceStrikes = new Set(allStrikes.slice(surfaceStrikeStart, surfaceStrikeStart + maxSurfaceStrikes));

    const surfaceData: SurfacePoint[] = [];

    for (const opt of chain.options) {
      if (opt.iv <= 0) continue;
      if (!surfaceExpSet.has(opt.expirationTs)) continue;
      if (!surfaceStrikes.has(opt.strike)) continue;
      surfaceData.push({
        strike: opt.strike,
        expiration: opt.expirationTs,
        iv: opt.iv, // decimal — renderer handles normalization
      });
    }

    // ─── 3. Term Structure (ATM IV per expiration) ───
    const now = Math.floor(Date.now() / 1000);
    const termStructure: TermPoint[] = [];

    for (const exp of expirations) {
      const daysToExpiry = Math.max(1, Math.round((exp - now) / 86400));
      if (daysToExpiry > 365) continue; // Skip very far out

      // Find ATM options (delta closest to ±0.5) for this expiration
      const expOpts = chain.options.filter(o => o.expirationTs === exp);

      let bestCallIV = 0, bestPutIV = 0;
      let bestCallDiff = Infinity, bestPutDiff = Infinity;

      for (const opt of expOpts) {
        if (opt.iv <= 0) continue;
        if (opt.type === 'C') {
          const diff = Math.abs(opt.delta - 0.5);
          if (diff < bestCallDiff) { bestCallDiff = diff; bestCallIV = opt.iv; }
        } else {
          const diff = Math.abs(Math.abs(opt.delta) - 0.5);
          if (diff < bestPutDiff) { bestPutDiff = diff; bestPutIV = opt.iv; }
        }
      }

      if (bestCallIV > 0 || bestPutIV > 0) {
        const atmIV = bestCallIV > 0 && bestPutIV > 0
          ? (bestCallIV + bestPutIV) / 2
          : bestCallIV || bestPutIV;

        const expDate = new Date(exp * 1000);
        termStructure.push({
          expiration: exp,
          expirationLabel: expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          daysToExpiry,
          atmIV,
          callIV: bestCallIV || atmIV,
          putIV: bestPutIV || atmIV,
        });
      }
    }

    // ─── ATM IV for the selected expiration ───
    const atmSkewPoint = skewData.find(d =>
      d.moneyness > 0.98 && d.moneyness < 1.02 && (d.callIV || d.putIV)
    );
    const atmIV = atmSkewPoint
      ? ((atmSkewPoint.callIV ?? 0) + (atmSkewPoint.putIV ?? 0)) / (atmSkewPoint.callIV && atmSkewPoint.putIV ? 2 : 1)
      : 0;

    return NextResponse.json({
      skewData,
      surfaceData,
      termStructure,
      spotPrice,
      atmIV,
      expirations,
      symbol,
      timestamp: chain.timestamp,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'FETCH_ERROR', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
