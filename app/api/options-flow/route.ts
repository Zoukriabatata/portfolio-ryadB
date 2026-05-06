import { NextRequest, NextResponse } from 'next/server';
import { fetchCboeChain } from '@/lib/cboe/fetchChain';
import { requireAuth, requireTier } from '@/lib/auth/api-middleware';

export interface FlowItem {
  id: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;       // "YYMMDD"
  expLabel: string;     // "Mar 21"
  dte: number;
  premium: number;      // estimated: mid * 100 * volume
  volume: number;
  oi: number;
  volOiRatio: number;
  iv: number;           // percent (25.3)
  delta: number;        // absolute value
  gamma: number;
  vega: number;
  theta: number;
  bid: number;
  ask: number;
  lastPrice: number;
  tag: 'WHALE' | 'UNUSUAL' | 'BLOCK' | 'SWEEP' | 'FLOW';
  sentiment: 'BULLISH' | 'BEARISH';
  sentimentScore: number; // -1 (max bearish) to +1 (max bullish)
}

function expToLabel(exp: string): string {
  // exp = "YYMMDD"
  const year  = 2000 + parseInt(exp.slice(0, 2), 10);
  const month = parseInt(exp.slice(2, 4), 10) - 1;
  const day   = parseInt(exp.slice(4, 6), 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calcDte(exp: string): number {
  const year  = 2000 + parseInt(exp.slice(0, 2), 10);
  const month = parseInt(exp.slice(2, 4), 10) - 1;
  const day   = parseInt(exp.slice(4, 6), 10);
  const expMs = new Date(year, month, day).getTime();
  return Math.max(0, Math.round((expMs - Date.now()) / 86_400_000));
}

function classifyTag(premium: number, volOiRatio: number): FlowItem['tag'] {
  if (premium >= 1_000_000)  return 'WHALE';
  if (volOiRatio >= 2)       return 'UNUSUAL';
  if (premium >= 500_000)    return 'BLOCK';
  if (volOiRatio >= 0.8)     return 'SWEEP';
  return 'FLOW';
}

/**
 * GET /api/options-flow?symbol=QQQ&type=all&minPremium=25000&limit=100
 *
 * Returns top options flow sorted by estimated premium.
 * Uses CBOE delayed quotes (free, no API key).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status, headers: authResult.headers });
  }
  const tierCheck = await requireTier('PRO', authResult.user.tier);
  if (tierCheck) {
    return NextResponse.json({ error: tierCheck.error }, { status: tierCheck.status });
  }

  const sp         = request.nextUrl.searchParams;
  const symbol     = sp.get('symbol')     || 'QQQ';
  const typeFilter = sp.get('type')       || 'all';   // all | calls | puts
  const tagFilter  = sp.get('tag')        || 'all';   // all | unusual | block | sweep | whale
  const minPremium = parseInt(sp.get('minPremium') || '25000', 10);
  const limit      = Math.min(200, parseInt(sp.get('limit') || '100', 10));

  try {
    const chain = await fetchCboeChain(symbol);

    const flows: FlowItem[] = [];

    for (const opt of chain.options) {
      if (opt.volume === 0) continue;

      const type = opt.type === 'C' ? 'CALL' : 'PUT';
      if (typeFilter === 'calls' && type !== 'CALL') continue;
      if (typeFilter === 'puts'  && type !== 'PUT')  continue;

      const mid      = opt.bid > 0 && opt.ask > 0 ? (opt.bid + opt.ask) / 2 : opt.lastPrice;
      const premium  = mid * 100 * opt.volume;
      if (premium < minPremium) continue;

      const volOiRatio = opt.openInterest > 0 ? opt.volume / opt.openInterest : 0;
      const tag        = classifyTag(premium, volOiRatio);

      if (tagFilter !== 'all' && tag.toLowerCase() !== tagFilter.toLowerCase()) continue;

      // Multi-factor sentiment: considers delta, vol/oi, premium weight
      const deltaWeight = Math.abs(opt.delta);         // 0-1, higher = more directional
      const volOiWeight = Math.min(volOiRatio / 3, 1); // 0-1, higher = more unusual
      const premWeight  = Math.min(premium / 1_000_000, 1); // 0-1, higher = bigger bet
      const rawScore    = (deltaWeight * 0.4 + volOiWeight * 0.3 + premWeight * 0.3);
      const sentimentScore = type === 'CALL' ? rawScore : -rawScore;

      const item: FlowItem = {
        id:          opt.option,
        type,
        strike:      opt.strike,
        expiry:      opt.expiration,
        expLabel:    expToLabel(opt.expiration),
        dte:         calcDte(opt.expiration),
        premium,
        volume:      opt.volume,
        oi:          opt.openInterest,
        volOiRatio,
        iv:          opt.iv * 100,
        delta:       Math.abs(opt.delta),
        gamma:       opt.gamma ?? 0,
        vega:        opt.vega ?? 0,
        theta:       opt.theta ?? 0,
        bid:         opt.bid,
        ask:         opt.ask,
        lastPrice:   opt.lastPrice,
        tag,
        sentiment:   type === 'CALL' ? 'BULLISH' : 'BEARISH',
        sentimentScore,
      };

      flows.push(item);
    }

    // Sort by premium descending
    flows.sort((a, b) => b.premium - a.premium);

    // Aggregate stats
    const totalCallPremium = flows.filter(f => f.type === 'CALL').reduce((s, f) => s + f.premium, 0);
    const totalPutPremium  = flows.filter(f => f.type === 'PUT').reduce((s, f) => s + f.premium, 0);
    const unusualCount     = flows.filter(f => f.tag === 'UNUSUAL' || f.tag === 'WHALE').length;

    // Weighted sentiment score: premium-weighted average of all sentiment scores
    const totalPremium = totalCallPremium + totalPutPremium;
    const avgSentiment = totalPremium > 0
      ? flows.reduce((s, f) => s + f.sentimentScore * f.premium, 0) / totalPremium
      : 0;

    // Strike × Expiry aggregation for heatmap
    const strikeExpiryMap = new Map<string, { strike: number; expLabel: string; dte: number; callPremium: number; putPremium: number; totalVolume: number }>();
    for (const f of flows) {
      const key = `${f.strike}_${f.expiry}`;
      const entry = strikeExpiryMap.get(key) || { strike: f.strike, expLabel: f.expLabel, dte: f.dte, callPremium: 0, putPremium: 0, totalVolume: 0 };
      if (f.type === 'CALL') entry.callPremium += f.premium;
      else entry.putPremium += f.premium;
      entry.totalVolume += f.volume;
      strikeExpiryMap.set(key, entry);
    }

    // Premium by strike for bar chart
    const strikeMap = new Map<number, { callPremium: number; putPremium: number }>();
    for (const f of flows) {
      const entry = strikeMap.get(f.strike) || { callPremium: 0, putPremium: 0 };
      if (f.type === 'CALL') entry.callPremium += f.premium;
      else entry.putPremium += f.premium;
      strikeMap.set(f.strike, entry);
    }
    const premiumByStrike = Array.from(strikeMap.entries())
      .map(([strike, v]) => ({ strike, ...v }))
      .sort((a, b) => a.strike - b.strike);

    // Top 5 unusual trades
    const topUnusual = flows
      .filter(f => f.tag === 'WHALE' || f.tag === 'UNUSUAL' || f.tag === 'BLOCK')
      .slice(0, 5);

    return NextResponse.json({
      symbol,
      spotPrice:         chain.spotPrice,
      timestamp:         chain.timestamp,
      flows:             flows.slice(0, limit),
      total:             flows.length,
      totalCallPremium,
      totalPutPremium,
      unusualCount,
      avgSentiment,
      premiumByStrike,
      strikeExpiry:      Array.from(strikeExpiryMap.values()),
      topUnusual,
    });

  } catch (err) {
    return NextResponse.json(
      { error: 'FETCH_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
