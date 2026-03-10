import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  GEXStreamData,
  OptionsFlowData,
  TradingBias,
  BiasSignal,
  BiasDirection,
  TradeStyle,
  MarketRegime,
} from '@/types/trading-bias';

interface UseTradingDataReturn {
  gexData: GEXStreamData | null;
  optionsData: OptionsFlowData | null;
  bias: TradingBias | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  symbol: string;
  setSymbol: (s: string) => void;
}

// ─── AI Reasoning Generator ─────────────────────────────────────────────────

function generateReasoning(
  direction: BiasDirection,
  tradeStyle: TradeStyle,
  regime: MarketRegime,
  gex: GEXStreamData,
  options: OptionsFlowData | null,
  spot: number | null,
): string {
  const parts: string[] = [];

  // 1. GEX regime context
  if (regime === 'NEGATIVE_GEX') {
    parts.push(
      `Market is in a negative GEX environment (${(gex.netGex / 1e9).toFixed(2)}B). ` +
      `Dealers are net short gamma — they must sell into weakness and buy into strength, ` +
      `amplifying directional moves and increasing realized volatility.`
    );
  } else if (regime === 'POSITIVE_GEX') {
    parts.push(
      `Market is in a positive GEX environment (+${(gex.netGex / 1e9).toFixed(2)}B). ` +
      `Dealers are net long gamma — they sell rallies and buy dips, ` +
      `providing a natural dampening effect and supporting mean-reversion.`
    );
  } else {
    parts.push(
      `GEX is near neutral (${(gex.netGex / 1e9).toFixed(2)}B), ` +
      `meaning dealer hedging flows will not strongly amplify or dampen price moves.`
    );
  }

  // 2. Price vs Zero Gamma
  if (spot && gex.zeroGamma > 0) {
    const above = spot > gex.zeroGamma;
    const pct = Math.abs((spot - gex.zeroGamma) / gex.zeroGamma * 100).toFixed(1);
    parts.push(
      `Price ($${spot.toFixed(0)}) is ${above ? 'above' : 'below'} Zero Gamma ` +
      `($${gex.zeroGamma.toFixed(0)}, ${pct}% ${above ? 'above' : 'below'}). ` +
      `${above
        ? 'This structurally supports upside continuation as dealers hedge long gamma.'
        : 'Below Zero Gamma, dealer flows accelerate downside — a bearish structural tilt.'}`
    );
  }

  // 3. Key walls context
  if (spot && gex.callWall > 0 && gex.putWall > 0) {
    const toCall = ((gex.callWall - (spot ?? 0)) / (spot ?? 1) * 100).toFixed(1);
    const toPut = (((spot ?? 0) - gex.putWall) / (spot ?? 1) * 100).toFixed(1);
    parts.push(
      `Call Wall at $${gex.callWall.toFixed(0)} (+${toCall}%) acts as overhead resistance. ` +
      `Put Wall at $${gex.putWall.toFixed(0)} (−${toPut}%) provides dealer-supported floor.`
    );
  }

  // 4. Options flow sentiment
  if (options) {
    if (options.pcRatio > 1.3) {
      parts.push(
        `Heavy put buying (P/C ${options.pcRatio.toFixed(2)}) signals institutional hedging — ` +
        `a defensive posture consistent with downside risk pricing.`
      );
    } else if (options.pcRatio < 0.75) {
      parts.push(
        `Call flow dominates (P/C ${options.pcRatio.toFixed(2)}), ` +
        `confirming bullish institutional positioning.`
      );
    }
    if (options.skewIndex > 4) {
      parts.push(`IV Skew is elevated (+${options.skewIndex.toFixed(1)}%), markets are pricing downside risk premium.`);
    }
  }

  // 5. Trade style conclusion
  if (tradeStyle === 'CONTINUATION') {
    parts.push(
      `Signal alignment favors a ${direction === 'BUY' ? 'long continuation' : 'short continuation'} setup — ` +
      `trade with the dominant structural flow.`
    );
  } else if (tradeStyle === 'COUNTER_TREND') {
    parts.push(
      `Price is approaching a key ${direction === 'BUY' ? 'put wall support' : 'call wall resistance'} level. ` +
      `A counter-trend bounce is plausible — watch for price rejection and confirmation before entry.`
    );
  } else {
    parts.push(
      `High GEX near ATM creates a magnetic pinning effect. ` +
      `Range-bound conditions favor selling vol at extremes rather than directional trades.`
    );
  }

  return parts.join(' ');
}

// ─── Bias Calculator ─────────────────────────────────────────────────────────

function calculateBias(
  gex: GEXStreamData,
  options: OptionsFlowData | null,
  spot: number | null,
): TradingBias {
  const signals: BiasSignal[] = [];

  // 1. Net GEX — weight 30
  const gexDir: BiasDirection = gex.netGex > 0 ? 'BUY' : gex.netGex < 0 ? 'SELL' : 'NEUTRAL';
  signals.push({
    name: 'Net GEX',
    value: `${gex.netGex >= 0 ? '+' : ''}${(gex.netGex / 1e9).toFixed(2)}B`,
    direction: gexDir,
    weight: 30,
    description: gex.netGex > 0 ? 'Dealers long gamma — dampening rallies' : 'Dealers short gamma — amplifying moves',
  });

  // 2. Price vs Zero Gamma — weight 25
  if (spot && gex.zeroGamma > 0) {
    const aboveZG = spot > gex.zeroGamma;
    signals.push({
      name: 'Price vs Zero Gamma',
      value: `$${spot.toFixed(0)} ${aboveZG ? '>' : '<'} $${gex.zeroGamma.toFixed(0)}`,
      direction: aboveZG ? 'BUY' : 'SELL',
      weight: 25,
      description: aboveZG ? 'Above Zero Gamma — structural bull zone' : 'Below Zero Gamma — structural bear zone',
    });
  }

  // 3. Flow Ratio (call/put volume) — weight 20
  if (gex.flowRatio > 0) {
    const flowDir: BiasDirection = gex.flowRatio > 1.2 ? 'BUY' : gex.flowRatio < 0.8 ? 'SELL' : 'NEUTRAL';
    signals.push({
      name: 'Call/Put Volume Ratio',
      value: gex.flowRatio.toFixed(2),
      direction: flowDir,
      weight: 20,
      description: gex.flowRatio > 1 ? 'Call volume dominant — bullish flow' : 'Put volume dominant — bearish flow',
    });
  }

  // 4. Put/Call OI Ratio — weight 15
  if (options && options.pcRatio > 0) {
    const pcDir: BiasDirection = options.pcRatio > 1.2 ? 'SELL' : options.pcRatio < 0.75 ? 'BUY' : 'NEUTRAL';
    signals.push({
      name: 'Put/Call OI Ratio',
      value: options.pcRatio.toFixed(2),
      direction: pcDir,
      weight: 15,
      description: options.pcRatio > 1.2 ? 'Heavy put hedging' : options.pcRatio < 0.75 ? 'Call-heavy positioning' : 'Balanced OI',
    });
  }

  // 5. IV Skew (put IV − call IV) — weight 10
  if (gex.putIV > 0 && gex.callIV > 0) {
    const skew = gex.putIV - gex.callIV;
    const skewDir: BiasDirection = skew > 5 ? 'SELL' : skew < -2 ? 'BUY' : 'NEUTRAL';
    signals.push({
      name: 'IV Skew (Put−Call)',
      value: `${skew >= 0 ? '+' : ''}${skew.toFixed(1)}%`,
      direction: skewDir,
      weight: 10,
      description: skew > 3 ? 'Elevated put premium — fear in market' : skew < -1 ? 'Call premium — bullish demand' : 'IV skew balanced',
    });
  }

  // ─── Weighted Score ───
  let totalWeight = 0;
  let weightedScore = 0;
  for (const sig of signals) {
    const s = sig.direction === 'BUY' ? 1 : sig.direction === 'SELL' ? -1 : 0;
    weightedScore += s * sig.weight;
    totalWeight += sig.weight;
  }
  const normalized = totalWeight > 0 ? weightedScore / totalWeight : 0; // -1 to +1
  const score = Math.round(normalized * 100);

  const direction: BiasDirection = normalized > 0.2 ? 'BUY' : normalized < -0.2 ? 'SELL' : 'NEUTRAL';
  const confidence = Math.min(100, Math.round(Math.abs(normalized) * 130));

  // ─── Market Regime ───
  let regime: MarketRegime = 'NEUTRAL_GEX';
  if (gex.netGex < -5e8) regime = 'NEGATIVE_GEX';
  else if (gex.netGex > 5e8) regime = 'POSITIVE_GEX';

  // ─── Trade Style ───
  let tradeStyle: TradeStyle = 'CONTINUATION';
  if (spot && gex.callWall > 0 && gex.putWall > 0) {
    const nearCall = Math.abs(spot - gex.callWall) / spot < 0.012;
    const nearPut = Math.abs(spot - gex.putWall) / spot < 0.012;
    if ((direction === 'BUY' && nearCall) || (direction === 'SELL' && nearPut)) {
      tradeStyle = 'COUNTER_TREND';
    }
  }
  // If GEX is very balanced → range bound
  if (gex.gexRatio > 0.85 && gex.gexRatio < 1.15 && Math.abs(gex.netGex) < 3e8) {
    tradeStyle = 'RANGE_BOUND';
  }

  // ─── Entry / Targets / Invalidation ───
  const entry = spot || null;
  const targets: number[] = [];
  let invalidation: number | null = null;

  if (direction === 'SELL') {
    if (gex.putWall > 0) targets.push(gex.putWall);
    if (options?.topPutWalls?.[1]?.strike) targets.push(options.topPutWalls[1].strike);
    invalidation = gex.zeroGamma > 0 ? gex.zeroGamma : gex.callWall > 0 ? gex.callWall : null;
  } else if (direction === 'BUY') {
    if (gex.callWall > 0) targets.push(gex.callWall);
    if (options?.topCallWalls?.[1]?.strike) targets.push(options.topCallWalls[1].strike);
    invalidation = gex.zeroGamma > 0 ? gex.zeroGamma : gex.putWall > 0 ? gex.putWall : null;
  }

  const reasoning = generateReasoning(direction, tradeStyle, regime, gex, options, spot);

  return { direction, tradeStyle, regime, confidence, signals, reasoning, entry, targets, invalidation, score };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTradingData(autoRefreshMs = 60_000): UseTradingDataReturn {
  const [symbol, setSymbol] = useState('QQQ');
  const [gexData, setGexData] = useState<GEXStreamData | null>(null);
  const [optionsData, setOptionsData] = useState<OptionsFlowData | null>(null);
  const [bias, setBias] = useState<TradingBias | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sym = symbolRef.current;
      const [gexRes, optRes] = await Promise.all([
        fetch(`/api/gex-data?ticker=${sym}`).catch(() => null),
        fetch(`/api/options-data?symbol=${sym}`).catch(() => null),
      ]);

      let gex: GEXStreamData | null = null;
      let opts: OptionsFlowData | null = null;
      let spot: number | null = null;

      if (gexRes?.ok) {
        const j = await gexRes.json();
        if (j.spotPrice) spot = j.spotPrice;
        gex = j as GEXStreamData;
        setGexData(gex);
      } else {
        const errBody = gexRes ? await gexRes.json().catch(() => null) : null;
        setError(errBody?.message || 'GEX data unavailable');
      }

      if (optRes?.ok) {
        opts = await optRes.json();
        setOptionsData(opts);
      }

      if (gex) setBias(calculateBias(gex, opts, spot));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when symbol changes
  useEffect(() => {
    setGexData(null);
    setOptionsData(null);
    setBias(null);
    fetchAll();
  }, [symbol, fetchAll]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshMs > 0) {
      intervalRef.current = setInterval(fetchAll, autoRefreshMs);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchAll, autoRefreshMs]);

  return { gexData, optionsData, bias, loading, error, refresh: fetchAll, symbol, setSymbol };
}
