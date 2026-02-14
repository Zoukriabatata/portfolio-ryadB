/**
 * INSTITUTIONAL BIAS ANALYSIS ENGINE
 *
 * Derives ES/MES/NQ/MNQ institutional levels from SPY/QQQ GEX data.
 * Calculates trading bias (counter-trend vs continuation) based on:
 * - Gamma regime (positive = stabilizing, negative = amplifying)
 * - Vanna exposure (vol sensitivity)
 * - Charm decay (time pressure)
 * - Delta positioning (directional)
 * - Volatility skew (put/call IV ratio = fear gauge)
 * - IV level (high = continuation, low = counter-trend)
 * - Term structure (backwardation = fear, contango = normal)
 *
 * SPY → ES conversion: ES ≈ SPY × 10
 * QQQ → NQ conversion: NQ ≈ QQQ × 40 (approx)
 */

import type { MultiGreekSummary, MultiGreekData } from '@/types/options';

// ─── Types ──────────────────────────────────────────────────

export type FuturesContract = 'MES' | 'ES' | 'MNQ' | 'NQ' | 'YM';
export type BiasType = 'counter-trend' | 'continuation' | 'neutral';
export type DirectionBias = 'long' | 'short' | 'neutral';

export interface ESLevel {
  price: number;
  label: string;
  type: 'support' | 'resistance' | 'pivot' | 'round';
  strength: number; // 0-100
  color: string;
  source: 'gex' | 'structure' | 'round_number' | 'implied_move';
}

export interface SkewAnalysis {
  atmIV: number;              // ATM implied vol (annualized)
  put25IV: number;            // 25-delta put IV
  call25IV: number;           // 25-delta call IV
  skew25D: number;            // put25IV - call25IV (positive = put skew)
  skewRatio: number;          // put25IV / call25IV (>1 = put skew = bearish fear)
  ivLevel: 'low' | 'medium' | 'high';
  skewSignal: 'bearish' | 'bullish' | 'neutral';
  termStructure: 'contango' | 'backwardation' | 'flat';
  termSpread: number;         // short-term IV - long-term IV (positive = backwardation)
  skewScore: number;          // -30 to +30 contribution to bias
  ivScore: number;            // -15 to +15 contribution to bias
  termScore: number;          // -10 to +10 contribution to bias
  totalVolScore: number;      // Combined vol contribution
}

export interface TradePlan {
  headline: string;
  strategy: string;
  longSetup: string;
  shortSetup: string;
  stopZone: string;
  targetZone: string;
  reasoning: string[];
}

export interface BiasResult {
  contract: FuturesContract;
  bias: BiasType;
  biasScore: number; // -100 (strong continuation short) to +100 (strong counter-trend long)
  strength: number; // 0-100 absolute
  direction: DirectionBias;
  esSpot: number;
  levels: ESLevel[];
  supports: ESLevel[];
  resistances: ESLevel[];
  tradePlan: TradePlan;
  rangeHigh: number;
  rangeLow: number;
  skewAnalysis: SkewAnalysis | null;
}

// ─── Contract conversion ratios ──────────────────────────────

interface ConversionConfig {
  etfSymbol: string; // SPY or QQQ
  ratio: number;     // ETF price → futures price
  roundStep: number; // Round number step for the futures
}

const CONTRACT_CONFIG: Record<FuturesContract, ConversionConfig> = {
  ES:  { etfSymbol: 'SPY', ratio: 10,  roundStep: 25 },
  MES: { etfSymbol: 'SPY', ratio: 10,  roundStep: 25 },
  NQ:  { etfSymbol: 'QQQ', ratio: 40,  roundStep: 50 },
  MNQ: { etfSymbol: 'QQQ', ratio: 40,  roundStep: 50 },
  YM:  { etfSymbol: 'DIA', ratio: 100, roundStep: 100 },
};

// ─── Level Derivation ────────────────────────────────────────

function deriveGEXLevels(
  summary: MultiGreekSummary,
  spotPrice: number,
  ratio: number,
): ESLevel[] {
  const levels: ESLevel[] = [];

  const esSpot = spotPrice * ratio;
  const esCallWall = summary.callWall * ratio;
  const esPutWall = summary.putWall * ratio;
  const esZeroGamma = summary.zeroGammaLevel * ratio;
  const esMaxPain = summary.maxPain * ratio;
  const esImpliedMove = summary.impliedMove * ratio;

  // Call Wall → Resistance
  levels.push({
    price: esCallWall,
    label: 'Call Wall',
    type: 'resistance',
    strength: 90,
    color: '#ef4444',
    source: 'gex',
  });

  // Put Wall → Support
  levels.push({
    price: esPutWall,
    label: 'Put Wall',
    type: 'support',
    strength: 90,
    color: '#22c55e',
    source: 'gex',
  });

  // Zero Gamma → Pivot
  levels.push({
    price: esZeroGamma,
    label: 'Zero Gamma',
    type: 'pivot',
    strength: 85,
    color: '#eab308',
    source: 'gex',
  });

  // Max Pain → Support/Resistance (magnet)
  levels.push({
    price: esMaxPain,
    label: 'Max Pain',
    type: esMaxPain > esSpot ? 'resistance' : 'support',
    strength: 70,
    color: '#a78bfa',
    source: 'gex',
  });

  // Implied Move boundaries
  levels.push({
    price: esSpot + esImpliedMove,
    label: 'IM High',
    type: 'resistance',
    strength: 60,
    color: '#06b6d4',
    source: 'implied_move',
  });

  levels.push({
    price: esSpot - esImpliedMove,
    label: 'IM Low',
    type: 'support',
    strength: 60,
    color: '#06b6d4',
    source: 'implied_move',
  });

  return levels;
}

function deriveRoundNumbers(
  esSpot: number,
  roundStep: number,
  range: number = 200, // Points above/below spot
): ESLevel[] {
  const levels: ESLevel[] = [];
  const start = Math.floor((esSpot - range) / roundStep) * roundStep;
  const end = Math.ceil((esSpot + range) / roundStep) * roundStep;

  for (let price = start; price <= end; price += roundStep) {
    const isBigRound = price % (roundStep * 4) === 0;
    const isHalfRound = price % (roundStep * 2) === 0;

    levels.push({
      price,
      label: isBigRound ? 'Big Round' : isHalfRound ? 'Half Round' : 'Quarter',
      type: price > esSpot ? 'resistance' : 'support',
      strength: isBigRound ? 50 : isHalfRound ? 35 : 20,
      color: isBigRound ? '#64748b' : '#334155',
      source: 'round_number',
    });
  }

  return levels;
}

// ─── Skew Analysis ──────────────────────────────────────────

/**
 * Analyze volatility skew from options chain data.
 * Extracts 25-delta put/call IVs, ATM IV, skew ratio, term structure.
 *
 * Key signals:
 * - Steep put skew (ratio > 1.15) = institutions hedging downside = bearish
 * - Flat/inverted skew (ratio < 0.95) = call demand = bullish
 * - High ATM IV = vol expansion expected = continuation
 * - Low ATM IV = complacency = counter-trend (range-bound)
 * - Backwardation = near-term fear = bearish continuation
 */
export function analyzeSkew(
  data: MultiGreekData[],
  spotPrice: number,
  termStructure?: { expDays: number; atmIV: number }[],
): SkewAnalysis {
  // Find ATM strike (closest to spot)
  let atmIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < data.length; i++) {
    const dist = Math.abs(data[i].strike - spotPrice);
    if (dist < minDist) {
      minDist = dist;
      atmIdx = i;
    }
  }

  const atmIV = (data[atmIdx].callIV + data[atmIdx].putIV) / 2;

  // Find ~25-delta puts (OTM puts, ~5% below spot) and ~25-delta calls (~5% above spot)
  const put25Strike = spotPrice * 0.95;
  const call25Strike = spotPrice * 1.05;

  let put25Idx = 0, call25Idx = data.length - 1;
  let minPutDist = Infinity, minCallDist = Infinity;

  for (let i = 0; i < data.length; i++) {
    const putDist = Math.abs(data[i].strike - put25Strike);
    const callDist = Math.abs(data[i].strike - call25Strike);
    if (putDist < minPutDist) { minPutDist = putDist; put25Idx = i; }
    if (callDist < minCallDist) { minCallDist = callDist; call25Idx = i; }
  }

  const put25IV = data[put25Idx].putIV || atmIV * 1.1;
  const call25IV = data[call25Idx].callIV || atmIV * 0.95;
  const skew25D = put25IV - call25IV;
  const skewRatio = call25IV > 0 ? put25IV / call25IV : 1;

  // IV level classification (for SPY-like: <0.14 low, 0.14-0.22 medium, >0.22 high)
  const ivLevel: 'low' | 'medium' | 'high' =
    atmIV < 0.14 ? 'low' : atmIV > 0.22 ? 'high' : 'medium';

  // Skew signal
  const skewSignal: 'bearish' | 'bullish' | 'neutral' =
    skewRatio > 1.12 ? 'bearish' : skewRatio < 0.95 ? 'bullish' : 'neutral';

  // Term structure analysis
  let termStructureType: 'contango' | 'backwardation' | 'flat' = 'flat';
  let termSpread = 0;

  if (termStructure && termStructure.length >= 2) {
    const shortTerm = termStructure.find(t => t.expDays <= 14) || termStructure[0];
    const longTerm = termStructure.find(t => t.expDays >= 60) || termStructure[termStructure.length - 1];
    termSpread = shortTerm.atmIV - longTerm.atmIV;

    if (termSpread > 0.02) termStructureType = 'backwardation';
    else if (termSpread < -0.02) termStructureType = 'contango';
  }

  // ── Score contributions ──

  // Skew score: -30 to +30
  // Steep put skew = bearish = continuation short (-), flat/inverted = bullish = counter-trend (+)
  let skewScore = 0;
  if (skewRatio > 1.20) skewScore = -30;       // Very steep put skew → strong bearish
  else if (skewRatio > 1.12) skewScore = -20;   // Steep put skew → bearish
  else if (skewRatio > 1.05) skewScore = -8;    // Mild put skew → slight bearish
  else if (skewRatio > 0.95) skewScore = 0;     // Flat → neutral
  else if (skewRatio > 0.88) skewScore = 15;    // Call skew → bullish
  else skewScore = 25;                           // Inverted → very bullish

  // IV level score: -15 to +15
  // High IV = vol expansion = continuation, Low IV = complacency = counter-trend
  let ivScore = 0;
  if (ivLevel === 'high') ivScore = -15;         // High IV → continuation (big moves ahead)
  else if (ivLevel === 'low') ivScore = 15;      // Low IV → counter-trend (range-bound)
  // medium → 0

  // Term structure score: -10 to +10
  // Backwardation = near-term fear = bearish continuation
  // Contango = normal = slightly bullish
  let termScore = 0;
  if (termStructureType === 'backwardation') termScore = -10;
  else if (termStructureType === 'contango') termScore = 5;

  const totalVolScore = skewScore + ivScore + termScore;

  return {
    atmIV,
    put25IV,
    call25IV,
    skew25D,
    skewRatio,
    ivLevel,
    skewSignal,
    termStructure: termStructureType,
    termSpread,
    skewScore,
    ivScore,
    termScore,
    totalVolScore,
  };
}

// ─── Bias Calculation ────────────────────────────────────────

function calculateBiasScore(
  summary: MultiGreekSummary,
  skew: SkewAnalysis | null,
): number {
  // Score: negative = continuation, positive = counter-trend
  let score = 0;

  // ── Greek signals (weight: 55) ──

  // Gamma regime is the primary signal (weight: 30)
  if (summary.regime === 'positive') {
    score += 30; // Positive gamma → counter-trend (dealers stabilize)
  } else {
    score -= 30; // Negative gamma → continuation (dealers amplify)
  }

  // Vanna (weight: 15)
  if (summary.netVEX > 0) {
    score += 15; // Positive vanna → vol drop causes buying → counter-trend
  } else {
    score -= 10; // Negative vanna → vol drop causes selling → continuation
  }

  // Charm (weight: 10)
  if (summary.netCEX > 0) {
    score += 8; // Positive charm → time decay buying → counter-trend
  } else {
    score -= 10; // Negative charm → time decay selling → continuation
  }

  // ── Skew signals (weight: 45) ──
  if (skew) {
    // Skew ratio: biggest vol signal (weight: 25)
    score += skew.skewScore * 0.85;

    // IV level (weight: 12)
    score += skew.ivScore * 0.8;

    // Term structure (weight: 8)
    score += skew.termScore * 0.8;
  } else {
    // Fallback: use delta as proxy when no skew data
    if (summary.netDEX > 0) score += 10;
    else score -= 10;
  }

  // Gamma intensity modifier
  const intensityMultiplier = 0.6 + (summary.gammaIntensity / 100) * 0.4;
  score *= intensityMultiplier;

  return Math.max(-100, Math.min(100, score));
}

function getDirection(biasScore: number, regime: string): DirectionBias {
  if (Math.abs(biasScore) < 15) return 'neutral';

  if (regime === 'positive') {
    // Counter-trend: spot is above zero gamma → expect mean reversion
    return biasScore > 0 ? 'long' : 'short'; // Long dips, short rallies
  } else {
    // Continuation: follow the momentum
    return biasScore > 0 ? 'long' : 'short';
  }
}

function generateTradePlan(
  bias: BiasType,
  direction: DirectionBias,
  biasScore: number,
  esSpot: number,
  supports: ESLevel[],
  resistances: ESLevel[],
  summary: MultiGreekSummary,
  ratio: number,
  skew: SkewAnalysis | null,
): TradePlan {
  const topResistance = resistances.length > 0 ? resistances[resistances.length - 1] : null;
  const topSupport = supports.length > 0 ? supports[0] : null;
  const nearestRes = resistances.find(r => r.price > esSpot) || topResistance;
  const nearestSup = supports.find(s => s.price < esSpot) || topSupport;

  const esCallWall = summary.callWall * ratio;
  const esPutWall = summary.putWall * ratio;
  const esZeroGamma = summary.zeroGammaLevel * ratio;

  if (bias === 'counter-trend') {
    return {
      headline: `COUNTER-TREND — Fade extremes, mean reversion expected`,
      strategy: `Positive gamma regime. Dealers buy dips and sell rallies. Trade WITHIN the range ${esPutWall.toFixed(0)} - ${esCallWall.toFixed(0)}. Fade moves toward walls.`,
      longSetup: `Buy dips near ${nearestSup ? nearestSup.price.toFixed(0) : esPutWall.toFixed(0)} (${nearestSup?.label || 'Put Wall'}). Target: ${esZeroGamma.toFixed(0)} (Zero Gamma) then ${nearestRes ? nearestRes.price.toFixed(0) : esCallWall.toFixed(0)}.`,
      shortSetup: `Sell rallies near ${nearestRes ? nearestRes.price.toFixed(0) : esCallWall.toFixed(0)} (${nearestRes?.label || 'Call Wall'}). Target: ${esZeroGamma.toFixed(0)} (Zero Gamma) then ${nearestSup ? nearestSup.price.toFixed(0) : esPutWall.toFixed(0)}.`,
      stopZone: `Stop below ${(esPutWall - 10).toFixed(0)} for longs, above ${(esCallWall + 10).toFixed(0)} for shorts (beyond walls = regime break).`,
      targetZone: `Primary target: Zero Gamma ${esZeroGamma.toFixed(0)}. Extended: opposite wall.`,
      reasoning: [
        `Gamma regime: ${summary.regime.toUpperCase()} — dealers hedge against the move (stabilizing)`,
        `Vanna (VEX): ${summary.netVEX >= 0 ? 'Positive' : 'Negative'} — ${summary.netVEX >= 0 ? 'vol compression supports buying' : 'vol expansion adds selling pressure'}`,
        `Charm (CEX): ${summary.netCEX >= 0 ? 'Positive' : 'Negative'} — ${summary.netCEX >= 0 ? 'time decay creates upward drift' : 'time decay adds downward pressure'}`,
        ...(skew ? [
          `Skew: Put/Call ratio ${skew.skewRatio.toFixed(2)} (${skew.skewSignal}) — ${skew.skewSignal === 'bearish' ? 'institutions hedging downside, dip-buying opportunity' : skew.skewSignal === 'bullish' ? 'call demand confirms upside bias' : 'balanced positioning'}`,
          `IV Level: ${(skew.atmIV * 100).toFixed(1)}% (${skew.ivLevel}) — ${skew.ivLevel === 'low' ? 'low vol supports range-bound mean reversion' : skew.ivLevel === 'high' ? 'elevated vol may cause wider swings within range' : 'moderate vol environment'}`,
          `Term Structure: ${skew.termStructure} — ${skew.termStructure === 'backwardation' ? 'near-term event risk, watch for gap moves' : skew.termStructure === 'contango' ? 'normal structure, favorable for fade trades' : 'neutral term profile'}`,
        ] : []),
        `Expected range: ${esPutWall.toFixed(0)} to ${esCallWall.toFixed(0)} (${((esCallWall - esPutWall) / esSpot * 100).toFixed(1)}%)`,
      ],
    };
  } else if (bias === 'continuation') {
    return {
      headline: `CONTINUATION — Follow momentum, breakouts accelerate`,
      strategy: `Negative gamma regime. Dealers amplify moves. Trade breakouts beyond ${esPutWall.toFixed(0)} or ${esCallWall.toFixed(0)}. Avoid fading.`,
      longSetup: `Buy breakout above ${esCallWall.toFixed(0)} (Call Wall) or bounce from ${esZeroGamma.toFixed(0)} (Zero Gamma). Target: ${(esCallWall + (esCallWall - esZeroGamma)).toFixed(0)} (extension).`,
      shortSetup: `Sell breakdown below ${esPutWall.toFixed(0)} (Put Wall) or rejection at ${esZeroGamma.toFixed(0)} (Zero Gamma). Target: ${(esPutWall - (esZeroGamma - esPutWall)).toFixed(0)} (extension).`,
      stopZone: `Tight stops — momentum trades need quick confirmation. Stop at zero gamma ${esZeroGamma.toFixed(0)} if trading a wall break.`,
      targetZone: `Extensions beyond walls: +${((esCallWall - esZeroGamma) / 2).toFixed(0)} pts from breakout level.`,
      reasoning: [
        `Gamma regime: ${summary.regime.toUpperCase()} — dealers hedge WITH the move (amplifying)`,
        `Vanna (VEX): ${summary.netVEX >= 0 ? 'Positive' : 'Negative'} — ${summary.netVEX >= 0 ? 'potential squeeze if vol drops' : 'selling accelerates on vol spike'}`,
        `Charm (CEX): ${summary.netCEX >= 0 ? 'Positive' : 'Negative'} — ${summary.netCEX >= 0 ? 'time decay drifts higher' : 'time decay adds selling into close'}`,
        ...(skew ? [
          `Skew: Put/Call ratio ${skew.skewRatio.toFixed(2)} (${skew.skewSignal}) — ${skew.skewSignal === 'bearish' ? 'steep put skew confirms downside momentum risk' : skew.skewSignal === 'bullish' ? 'call demand may fuel upside breakout' : 'balanced skew, follow gamma direction'}`,
          `IV Level: ${(skew.atmIV * 100).toFixed(1)}% (${skew.ivLevel}) — ${skew.ivLevel === 'high' ? 'HIGH VOL amplifies moves, size down' : skew.ivLevel === 'low' ? 'low vol = potential for sudden expansion' : 'moderate vol, normal sizing'}`,
          `Term Structure: ${skew.termStructure} — ${skew.termStructure === 'backwardation' ? 'BACKWARDATION confirms near-term stress, breakout likely' : skew.termStructure === 'contango' ? 'contango suggests limited near-term catalyst' : 'neutral term profile'}`,
        ] : []),
        `CAUTION: Moves can accelerate quickly in negative gamma. Size smaller, use wider stops.`,
      ],
    };
  }

  // Neutral
  return {
    headline: `NEUTRAL — Mixed signals, wait for clarity`,
    strategy: `Conflicting Greek signals. Reduce size and wait for regime confirmation. Monitor zero gamma level ${esZeroGamma.toFixed(0)}.`,
    longSetup: `Conservative longs only at strong support ${nearestSup ? nearestSup.price.toFixed(0) : esPutWall.toFixed(0)} with tight stop.`,
    shortSetup: `Conservative shorts only at strong resistance ${nearestRes ? nearestRes.price.toFixed(0) : esCallWall.toFixed(0)} with tight stop.`,
    stopZone: `Keep stops tight — unclear bias means higher risk of random chop.`,
    targetZone: `Target zero gamma ${esZeroGamma.toFixed(0)} from either direction.`,
    reasoning: [
      `Mixed Greek signals — gamma, vanna, charm not aligned`,
      ...(skew ? [
        `Skew: Put/Call ratio ${skew.skewRatio.toFixed(2)} (${skew.skewSignal}) — ${skew.skewSignal !== 'neutral' ? 'skew leans ' + skew.skewSignal + ' but Greeks are mixed' : 'skew also neutral, wait for catalyst'}`,
        `IV Level: ${(skew.atmIV * 100).toFixed(1)}% (${skew.ivLevel}) — ${skew.ivLevel === 'high' ? 'high vol = stay small, expect chop' : 'monitor for vol regime change'}`,
      ] : []),
      `Reduce position size until bias clarifies`,
      `Key level to watch: Zero Gamma ${esZeroGamma.toFixed(0)} — break decides direction`,
    ],
  };
}

// ─── Main Export ──────────────────────────────────────────────

export function calculateInstitutionalBias(
  summary: MultiGreekSummary,
  spotPrice: number,
  contract: FuturesContract = 'MES',
  greekData?: MultiGreekData[],
  termStructure?: { expDays: number; atmIV: number }[],
): BiasResult {
  const config = CONTRACT_CONFIG[contract];
  const ratio = config.ratio;
  const esSpot = spotPrice * ratio;

  // Analyze skew if greek data available
  const skewAnalysis = greekData && greekData.length > 0
    ? analyzeSkew(greekData, spotPrice, termStructure)
    : null;

  // Derive all levels
  const gexLevels = deriveGEXLevels(summary, spotPrice, ratio);
  const roundLevels = deriveRoundNumbers(esSpot, config.roundStep);

  // Only keep round numbers that don't overlap with GEX levels (within 5 pts)
  const filteredRounds = roundLevels.filter(r =>
    !gexLevels.some(g => Math.abs(g.price - r.price) < config.roundStep * 0.3)
  );

  const allLevels = [...gexLevels, ...filteredRounds].sort((a, b) => a.price - b.price);

  const supports = allLevels
    .filter(l => l.type === 'support' && l.price < esSpot)
    .sort((a, b) => b.price - a.price); // Closest first

  const resistances = allLevels
    .filter(l => (l.type === 'resistance' || l.type === 'pivot') && l.price > esSpot)
    .sort((a, b) => a.price - b.price); // Closest first

  // Calculate bias (now includes skew)
  const biasScore = calculateBiasScore(summary, skewAnalysis);
  const bias: BiasType = Math.abs(biasScore) < 15 ? 'neutral'
    : biasScore > 0 ? 'counter-trend' : 'continuation';
  const strength = Math.abs(biasScore);
  const direction = getDirection(biasScore, summary.regime);

  // Range
  const esCallWall = summary.callWall * ratio;
  const esPutWall = summary.putWall * ratio;
  const esImpliedMove = summary.impliedMove * ratio;

  const rangeHigh = Math.max(esCallWall, esSpot + esImpliedMove);
  const rangeLow = Math.min(esPutWall, esSpot - esImpliedMove);

  // Trade plan (now includes skew reasoning)
  const tradePlan = generateTradePlan(
    bias, direction, biasScore, esSpot,
    supports, resistances, summary, ratio, skewAnalysis,
  );

  return {
    contract,
    bias,
    biasScore,
    strength,
    direction,
    esSpot,
    levels: allLevels,
    supports,
    resistances,
    tradePlan,
    rangeHigh,
    rangeLow,
    skewAnalysis,
  };
}
