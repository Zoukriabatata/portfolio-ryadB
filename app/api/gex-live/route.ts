import { NextRequest, NextResponse } from 'next/server';
import { fetchCboeChain } from '@/lib/cboe/fetchChain';
import type { MultiGreekData, MultiGreekSummary } from '@/types/options';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

/**
 * GET /api/gex-live
 * Real GEX data from CBOE, formatted for GEX page components.
 *
 * Returns: { legacyData, legacySummary, multiGreekData, multiGreekSummary,
 *            spotPrice, expirations, totalCallOI, totalPutOI }
 *
 * Query: ?symbol=NDX&expiration=1234567890 (unix seconds, optional)
 */

const CONTRACT_MULTIPLIER = 100; // Index options

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('ULTRA', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  const symbol = request.nextUrl.searchParams.get('symbol') || 'NDX';
  const expFilter = request.nextUrl.searchParams.get('expiration');

  try {
    const chain = await fetchCboeChain(symbol);
    const { spotPrice, expirations } = chain;

    // Filter by expiration if specified, otherwise use nearest
    const targetExp = expFilter ? parseInt(expFilter, 10) : expirations[0];
    const filtered = targetExp
      ? chain.options.filter(o => o.expirationTs === targetExp)
      : chain.options;

    // ─── Build per-strike data ───
    const strikeMap = new Map<number, {
      callGEX: number; putGEX: number; netGEX: number;
      callOI: number; putOI: number;
      callVol: number; putVol: number;
      callGamma: number; putGamma: number;
      gex: number; vex: number; cex: number; dex: number;
      callIV: number; putIV: number;
      callDelta: number; putDelta: number;
      callPremium: number; putPremium: number;
    }>();

    for (const opt of filtered) {
      const { strike, type, gamma, openInterest, volume, delta, vega, theta, iv, bid, ask } = opt;
      const rawGEX = gamma * openInterest * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;
      const midPrice = (bid + ask) / 2;

      let entry = strikeMap.get(strike);
      if (!entry) {
        entry = {
          callGEX: 0, putGEX: 0, netGEX: 0,
          callOI: 0, putOI: 0,
          callVol: 0, putVol: 0,
          callGamma: 0, putGamma: 0,
          gex: 0, vex: 0, cex: 0, dex: 0,
          callIV: 0, putIV: 0,
          callDelta: 0, putDelta: 0,
          callPremium: 0, putPremium: 0,
        };
        strikeMap.set(strike, entry);
      }

      // Vanna (vex) = vega * |delta| * OI * spot * multiplier (dollar-weighted like GEX/DEX)
      const vannaExp = vega * Math.abs(delta) * openInterest * spotPrice * CONTRACT_MULTIPLIER;
      // Charm (cex) = -theta * |delta| * OI * spot * multiplier (dollar-weighted)
      const charmExp = -theta * Math.abs(delta) * openInterest * spotPrice * CONTRACT_MULTIPLIER;
      // Delta exposure
      const deltaExp = delta * openInterest * spotPrice * CONTRACT_MULTIPLIER;

      if (type === 'C') {
        entry.callGEX += rawGEX;
        entry.callOI += openInterest;
        entry.callVol += volume;
        entry.callGamma += gamma * openInterest;
        entry.callIV = iv;
        entry.callDelta = delta;
        entry.callPremium += midPrice * volume * CONTRACT_MULTIPLIER;
        entry.gex += rawGEX;
        entry.vex += vannaExp;
        entry.cex += charmExp;
        entry.dex += deltaExp;
      } else {
        entry.putGEX -= rawGEX;
        entry.putOI += openInterest;
        entry.putVol += volume;
        entry.putGamma += gamma * openInterest;
        entry.putIV = iv;
        entry.putDelta = delta;
        entry.putPremium += midPrice * volume * CONTRACT_MULTIPLIER;
        entry.gex -= rawGEX;
        entry.vex -= vannaExp;
        entry.cex -= charmExp;
        entry.dex -= deltaExp;
      }
      entry.netGEX = entry.callGEX + entry.putGEX;
    }

    // ─── Legacy format (GEXDashboard, GEXHeatmap) ───
    const strikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);

    const legacyData = strikes.map(strike => {
      const e = strikeMap.get(strike)!;
      return {
        strike,
        callGEX: e.callGEX,
        putGEX: e.putGEX,
        netGEX: e.netGEX,
        callOI: e.callOI,
        putOI: e.putOI,
        callVolume: e.callVol,
        putVolume: e.putVol,
      };
    });

    // ─── Aggregates ───
    let totalCallGEX = 0, totalPutGEX = 0;
    let totalCallOI = 0, totalPutOI = 0;
    let totalCallVol = 0, totalPutVol = 0;
    let totalCallPremium = 0, totalPutPremium = 0;
    let maxCallOIStrike = 0, maxCallOI = 0;
    let maxPutOIStrike = 0, maxPutOI = 0;
    let netVEX = 0, netCEX = 0, netDEX = 0;

    for (const [strike, e] of strikeMap) {
      totalCallGEX += e.callGEX;
      totalPutGEX += e.putGEX;
      totalCallOI += e.callOI;
      totalPutOI += e.putOI;
      totalCallVol += e.callVol;
      totalPutVol += e.putVol;
      totalCallPremium += e.callPremium;
      totalPutPremium += e.putPremium;
      netVEX += e.vex;
      netCEX += e.cex;
      netDEX += e.dex;
      if (e.callOI > maxCallOI) { maxCallOI = e.callOI; maxCallOIStrike = strike; }
      if (e.putOI > maxPutOI) { maxPutOI = e.putOI; maxPutOIStrike = strike; }
    }

    const netGEX = totalCallGEX + totalPutGEX;
    const regime: 'positive' | 'negative' = netGEX >= 0 ? 'positive' : 'negative';

    // ─── Zero Gamma Level ───
    let zeroGamma = spotPrice;
    let cumGEX = 0, prevCum = 0, prevStrike = strikes[0];
    for (const strike of strikes) {
      const e = strikeMap.get(strike)!;
      cumGEX += e.netGEX;
      if (prevCum * cumGEX < 0) {
        const ratio = Math.abs(prevCum) / (Math.abs(prevCum) + Math.abs(cumGEX));
        zeroGamma = prevStrike + ratio * (strike - prevStrike);
        break;
      }
      prevStrike = strike;
      prevCum = cumGEX;
    }

    // ─── Max Pain (strike where total OI is highest) ───
    let maxPainStrike = spotPrice, maxPainOI = 0;
    for (const [strike, e] of strikeMap) {
      const totalOI = e.callOI + e.putOI;
      if (totalOI > maxPainOI) { maxPainOI = totalOI; maxPainStrike = strike; }
    }

    // ─── ATM IV (weighted by OI near the money, delta 0.3–0.7) ───
    let atmCallIV = 0, atmPutIV = 0;
    let atmCallIVWeight = 0, atmPutIVWeight = 0;
    for (const e of strikeMap.values()) {
      if (e.callDelta > 0.3 && e.callDelta < 0.7 && e.callIV > 0) {
        atmCallIV += e.callIV * e.callOI;
        atmCallIVWeight += e.callOI;
      }
      if (e.putDelta < -0.3 && e.putDelta > -0.7 && e.putIV > 0) {
        atmPutIV += e.putIV * e.putOI;
        atmPutIVWeight += e.putOI;
      }
    }
    const callIV = atmCallIVWeight > 0 ? atmCallIV / atmCallIVWeight : 0; // decimal
    const putIV = atmPutIVWeight > 0 ? atmPutIV / atmPutIVWeight : 0;     // decimal
    const ivSkew = (putIV - callIV) * 100; // percentage points

    // ─── Net Flow (net premium $) & Flow Ratio ───
    const netFlow = totalCallPremium - totalPutPremium;
    const flowRatio = totalPutVol > 0 ? totalCallVol / totalPutVol : 1;

    // ─── Implied Move from ATM straddle ───
    // Formula: ATM_IV * spot * sqrt(DTE/365)
    let impliedMove = 0;
    const now = Math.floor(Date.now() / 1000);
    const daysToExp = targetExp ? Math.max(1, Math.round((targetExp - now) / 86400)) : 30;
    const avgATMIV = (callIV + putIV) / 2;
    if (avgATMIV > 0 && spotPrice > 0) {
      impliedMove = avgATMIV * spotPrice * Math.sqrt(daysToExp / 365);
    }

    // ─── Legacy Summary ───
    const legacySummary = {
      netGEX: netGEX,
      totalCallGEX,
      totalPutGEX,
      callWall: maxCallOIStrike,
      putWall: maxPutOIStrike,
      zeroGamma,
      maxGamma: maxCallOIStrike,
      gammaFlip: zeroGamma,
      hvl: zeroGamma,
      regime,
    };

    // ─── MultiGreek format (CumulativeGEXChart, KPI, Narrative) ───
    const multiGreekData: MultiGreekData[] = strikes.map(strike => {
      const e = strikeMap.get(strike)!;
      return {
        strike,
        gex: e.gex,
        vex: e.vex,
        cex: e.cex,
        dex: e.dex,
        callOI: e.callOI,
        putOI: e.putOI,
        callIV: e.callIV,   // Keep as decimal (0.25 = 25%) — UI multiplies for display
        putIV: e.putIV,
      };
    });

    const gexRatio = totalPutGEX !== 0 ? Math.abs(totalCallGEX / totalPutGEX) : 0;
    const gammaIntensity = Math.min(100, Math.round(Math.abs(netGEX) / 1e9 * 10));

    const multiGreekSummary: MultiGreekSummary = {
      netGEX: netGEX,
      netVEX: netVEX,
      netCEX: netCEX,
      netDEX: netDEX,
      zeroGammaLevel: zeroGamma,
      callWall: maxCallOIStrike,
      putWall: maxPutOIStrike,
      maxPain: maxPainStrike,
      impliedMove,
      regime,
      gammaIntensity,
      // GEXStream metrics
      netFlow,
      flowRatio: Math.round(flowRatio * 100) / 100,
      gexRatio: Math.round(gexRatio * 100) / 100,
      callIV,
      putIV,
      ivSkew: Math.round(ivSkew * 100) / 100,
    };

    // ─── Net Flow by Strike ───
    const netFlowByStrike = strikes.map(strike => {
      const e = strikeMap.get(strike)!;
      return {
        strike,
        callPremium: e.callPremium,
        putPremium: e.putPremium,
        net: e.callPremium - e.putPremium,
      };
    });

    // ─── OI by Strike ───
    const oiByStrike = strikes.map(strike => {
      const e = strikeMap.get(strike)!;
      return { strike, callOI: e.callOI, putOI: e.putOI };
    });

    // ─── Top Contracts (top 30 by premium) ───
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const formatExpYYMMDD = (exp: string): string => {
      const y = parseInt(exp.slice(0, 2), 10) + 2000;
      const m = parseInt(exp.slice(2, 4), 10) - 1;
      const d = parseInt(exp.slice(4, 6), 10);
      return `${MONTH_NAMES[m]} ${d}`;
    };

    const topContracts = filtered
      .map(o => {
        const midPrice = (o.bid + o.ask) / 2;
        const premium = midPrice * o.volume * CONTRACT_MULTIPLIER;
        return {
          strike: o.strike,
          type: o.type as 'C' | 'P',
          expiration: formatExpYYMMDD(o.expiration),
          volume: o.volume,
          oi: o.openInterest,
          premium,
          iv: o.iv,
          delta: o.delta,
          voiRatio: o.volume / Math.max(1, o.openInterest),
        };
      })
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 30);

    // ─── GEX by Expiry (all options, nearest 8) ───
    const expiryGEXMap = new Map<number, { callGEX: number; putGEX: number }>();
    for (const opt of chain.options) {
      const { type, gamma, openInterest, expirationTs } = opt;
      const rawGEX = gamma * openInterest * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;
      let entry = expiryGEXMap.get(expirationTs);
      if (!entry) {
        entry = { callGEX: 0, putGEX: 0 };
        expiryGEXMap.set(expirationTs, entry);
      }
      if (type === 'C') {
        entry.callGEX += rawGEX;
      } else {
        entry.putGEX -= rawGEX;
      }
    }

    const gexByExpiry = Array.from(expiryGEXMap.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 8)
      .map(([ts, e]) => {
        const d = new Date(ts * 1000);
        const daysUntil = Math.max(0, Math.round((ts - now) / 86400));
        return {
          label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`,
          callGEX: e.callGEX,
          putGEX: e.putGEX,
          netGEX: e.callGEX + e.putGEX,
          daysToExp: daysUntil,
        };
      });

    return NextResponse.json({
      legacyData,
      legacySummary,
      multiGreekData,
      multiGreekSummary,
      spotPrice,
      expirations,
      totalCallOI,
      totalPutOI,
      gexRatio,
      timestamp: chain.timestamp,
      netFlowByStrike,
      oiByStrike,
      topContracts,
      gexByExpiry,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'FETCH_ERROR', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
