'use client';

import { useTradingData } from '@/lib/useTradingData';

function fmt(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(decimals);
}

export default function QuickBiasWidget({ symbol = 'QQQ' }: { symbol?: string }) {
  const { gexData, loading, error, refresh } = useTradingData(30_000);

  const spot = gexData?.spotPrice ?? 0;
  const callWall = gexData?.callWall ?? 0;
  const putWall = gexData?.putWall ?? 0;
  const netGex = gexData?.netGex ?? 0;
  const flowRatio = gexData?.flowRatio ?? 0;

  const gexBull = netGex > 0;
  const flowBull = flowRatio >= 1;

  // Bias: 2 signals — if both agree → strong, one each → neutral
  const bullSignals = [gexBull, flowBull].filter(Boolean).length;
  const bias = bullSignals === 2 ? 'BULLISH' : bullSignals === 0 ? 'BEARISH' : 'NEUTRAL';
  const biasColor =
    bias === 'BULLISH' ? '#22c55e' : bias === 'BEARISH' ? '#ef4444' : '#eab308';

  // Distance from spot to walls
  const toCallWall = callWall > 0 && spot > 0 ? ((callWall - spot) / spot * 100) : null;
  const toPutWall = putWall > 0 && spot > 0 ? ((spot - putWall) / spot * 100) : null;

  // Position between walls for the bar
  const barPct = callWall > putWall && spot > putWall
    ? Math.min(100, Math.max(0, ((spot - putWall) / (callWall - putWall)) * 100))
    : 50;

  return (
    <div
      className="rounded-2xl border p-5 space-y-4 font-mono"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: biasColor }}
          />
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-widest">
            {symbol} Quick Bias
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-40"
        >
          {loading ? '...' : '↻ refresh'}
        </button>
      </div>

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      {/* Big bias */}
      <div className="text-center py-2">
        <p
          className="text-4xl font-black tracking-tight"
          style={{ color: biasColor }}
        >
          {bias}
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">
          {bias === 'NEUTRAL' ? 'Signaux contradictoires — attendre confirmation' :
           bias === 'BULLISH' ? 'GEX + Flow alignés haussiers' :
           'GEX + Flow alignés baissiers'}
        </p>
      </div>

      {/* 3 key metrics */}
      <div className="grid grid-cols-3 gap-2">
        {/* Net GEX */}
        <div
          className="rounded-xl p-3 border text-center"
          style={{
            background: `${gexBull ? '#22c55e' : '#ef4444'}10`,
            borderColor: `${gexBull ? '#22c55e' : '#ef4444'}30`,
          }}
        >
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Net GEX</p>
          <p
            className="text-sm font-bold"
            style={{ color: gexBull ? '#22c55e' : '#ef4444' }}
          >
            {netGex >= 0 ? '+' : ''}{fmt(netGex)}
          </p>
          <p className="text-[9px] mt-0.5" style={{ color: gexBull ? '#22c55e' : '#ef4444' }}>
            {gexBull ? '▲ Dealers long' : '▼ Dealers short'}
          </p>
        </div>

        {/* Net Flow */}
        <div
          className="rounded-xl p-3 border text-center"
          style={{
            background: `${flowBull ? '#22c55e' : '#ef4444'}10`,
            borderColor: `${flowBull ? '#22c55e' : '#ef4444'}30`,
          }}
        >
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Flow Ratio</p>
          <p
            className="text-sm font-bold"
            style={{ color: flowBull ? '#22c55e' : '#ef4444' }}
          >
            {flowRatio.toFixed(2)}
          </p>
          <p className="text-[9px] mt-0.5" style={{ color: flowBull ? '#22c55e' : '#ef4444' }}>
            {flowBull ? '▲ Calls dominant' : '▼ Puts dominant'}
          </p>
        </div>

        {/* Spot vs Zero Gamma */}
        <div className="rounded-xl p-3 border text-center" style={{ background: '#3b82f610', borderColor: '#3b82f630' }}>
          <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Zero Gamma</p>
          <p className="text-sm font-bold text-blue-400">
            ${gexData?.zeroGamma?.toFixed(0) ?? '---'}
          </p>
          <p className="text-[9px] mt-0.5 text-blue-400">
            {spot > 0 && gexData?.zeroGamma
              ? `Spot ${spot > gexData.zeroGamma ? '▲ above' : '▼ below'}`
              : '---'}
          </p>
        </div>
      </div>

      {/* Price between walls — visual bar */}
      <div>
        <div className="flex justify-between text-[9px] text-[var(--text-muted)] mb-1.5">
          <span className="text-red-400 font-bold">PUT WALL ${putWall > 0 ? putWall.toFixed(0) : '---'}</span>
          <span className="text-[var(--text-secondary)]">
            ${spot > 0 ? spot.toFixed(2) : '---'}
          </span>
          <span className="text-green-400 font-bold">CALL WALL ${callWall > 0 ? callWall.toFixed(0) : '---'}</span>
        </div>

        {/* Bar track */}
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated, #1a1a2e)' }}>
          {/* Gradient fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{
              width: `${barPct}%`,
              background: 'linear-gradient(90deg, #ef4444, #eab308, #22c55e)',
            }}
          />
          {/* Spot cursor */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow"
            style={{ left: `${barPct}%`, transform: 'translateX(-50%)' }}
          />
        </div>

        {/* Distances */}
        <div className="flex justify-between text-[9px] mt-1">
          <span className="text-red-400">
            {toPutWall !== null ? `-${toPutWall.toFixed(1)}%` : ''}
          </span>
          <span className="text-[var(--text-muted)]">prix entre les murs</span>
          <span className="text-green-400">
            {toCallWall !== null ? `+${toCallWall.toFixed(1)}%` : ''}
          </span>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[9px] text-[var(--text-dimmed)] text-center">
        CBOE delayed · OI EOD · auto-refresh 30s
      </p>
    </div>
  );
}
