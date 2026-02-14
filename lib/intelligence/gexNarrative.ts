/**
 * GEX NARRATIVE ENGINE
 *
 * Rule-based narrative generator for dealer positioning analysis.
 * Produces human-readable summaries of current market structure
 * based on multi-Greek exposure data.
 */

import type { MultiGreekSummary } from '@/types/options';

export interface NarrativeSection {
  greek: string;
  symbol: string;
  title: string;
  body: string;
  implication: 'bullish' | 'bearish' | 'neutral';
  color: string;
}

export interface NarrativeResult {
  headline: string;
  headlineColor: string;
  severity: 'low' | 'medium' | 'high';
  sections: NarrativeSection[];
  keyLevels: string;
  timestamp: number;
}

export function generateNarrative(
  summary: MultiGreekSummary,
  spotPrice: number,
): NarrativeResult {
  const sections: NarrativeSection[] = [];

  // ─── Gamma Analysis ───
  const aboveZeroGamma = spotPrice >= summary.zeroGammaLevel;
  const gammaDistance = ((spotPrice - summary.zeroGammaLevel) / spotPrice * 100).toFixed(1);

  sections.push({
    greek: 'Gamma',
    symbol: 'Γ',
    title: aboveZeroGamma
      ? 'Dealers are long gamma - Market stabilization'
      : 'Dealers are short gamma - Volatility amplification',
    body: aboveZeroGamma
      ? `Spot $${spotPrice.toFixed(0)} is ABOVE the Zero Gamma Level ($${summary.zeroGammaLevel.toFixed(0)}, +${gammaDistance}%). Dealers will buy dips and sell rallies, dampening volatility. Expect range-bound price action between Put Wall ($${summary.putWall.toFixed(0)}) and Call Wall ($${summary.callWall.toFixed(0)}).`
      : `Spot $${spotPrice.toFixed(0)} is BELOW the Zero Gamma Level ($${summary.zeroGammaLevel.toFixed(0)}, ${gammaDistance}%). Dealers must hedge in the same direction as price → they sell when it drops, buy when it rips. Expect amplified moves and potential acceleration.`,
    implication: aboveZeroGamma ? 'bullish' : 'bearish',
    color: aboveZeroGamma ? '#22c55e' : '#ef4444',
  });

  // ─── Vanna Analysis ───
  const vannaPositive = summary.netVEX > 0;

  sections.push({
    greek: 'Vanna',
    symbol: 'ν',
    title: vannaPositive
      ? 'Positive Vanna - Volatility compression supports price'
      : 'Negative Vanna - Volatility expansion pressures price',
    body: vannaPositive
      ? `Net VEX is positive. If implied volatility drops (IV crush), dealers must buy the underlying to stay hedged → creates upward support. Favorable for steady grinding moves higher.`
      : `Net VEX is negative. If implied volatility drops, dealers must sell the underlying → downward pressure. Rising IV would force buying, creating potential short squeeze dynamics.`,
    implication: vannaPositive ? 'bullish' : 'bearish',
    color: vannaPositive ? '#8b5cf6' : '#a855f7',
  });

  // ─── Charm Analysis ───
  const charmPositive = summary.netCEX > 0;

  sections.push({
    greek: 'Charm',
    symbol: 'θ',
    title: charmPositive
      ? 'Positive Charm - Time decay favors upside'
      : 'Negative Charm - Time decay favors downside',
    body: charmPositive
      ? `Net CEX leans bullish. As options decay over the next 24h, dealer hedging adjustments naturally push toward buying → structural upward drift from theta decay.`
      : `Net CEX leans bearish. Time decay will cause dealers to sell delta over the next 24h → creates headwind for upward moves. Most impactful heading into expiration week.`,
    implication: charmPositive ? 'bullish' : 'bearish',
    color: charmPositive ? '#eab308' : '#f59e0b',
  });

  // ─── Delta Analysis ───
  const deltaPositive = summary.netDEX > 0;

  sections.push({
    greek: 'Delta',
    symbol: 'Δ',
    title: deltaPositive
      ? 'Net long delta exposure - Bullish positioning'
      : 'Net short delta exposure - Bearish positioning',
    body: deltaPositive
      ? `Dealers carry net long delta. The market is positioned for upside through directional option flow. Heavy call buying has created a natural floor.`
      : `Dealers carry net short delta. Put-heavy positioning suggests the market is hedging for downside. Expect support levels to be tested.`,
    implication: deltaPositive ? 'bullish' : 'neutral',
    color: deltaPositive ? '#3b82f6' : '#6366f1',
  });

  // ─── Headline ───
  const bullishCount = sections.filter(s => s.implication === 'bullish').length;
  const bearishCount = sections.filter(s => s.implication === 'bearish').length;

  let headline: string;
  let headlineColor: string;
  let severity: 'low' | 'medium' | 'high';

  if (bullishCount >= 3) {
    headline = 'BULLISH STRUCTURE - Multiple Greeks support upside';
    headlineColor = '#22c55e';
    severity = bullishCount === 4 ? 'high' : 'medium';
  } else if (bearishCount >= 3) {
    headline = 'BEARISH STRUCTURE - Multiple Greeks signal downside risk';
    headlineColor = '#ef4444';
    severity = bearishCount === 4 ? 'high' : 'medium';
  } else if (summary.regime === 'negative') {
    headline = 'VOLATILE REGIME - Negative gamma with mixed signals';
    headlineColor = '#f59e0b';
    severity = 'medium';
  } else {
    headline = 'MIXED SIGNALS - Balanced dealer positioning';
    headlineColor = '#6b7280';
    severity = 'low';
  }

  // Key levels summary
  const keyLevels = `Call Wall $${summary.callWall.toFixed(0)} | Put Wall $${summary.putWall.toFixed(0)} | Zero Gamma $${summary.zeroGammaLevel.toFixed(0)} | Max Pain $${summary.maxPain.toFixed(0)}`;

  return {
    headline,
    headlineColor,
    severity,
    sections,
    keyLevels,
    timestamp: Date.now(),
  };
}
