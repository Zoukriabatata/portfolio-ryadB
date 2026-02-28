'use client';

/**
 * DERIVATIVES PRESSURE — Funding analysis & basis anomaly detection
 */

interface DerivativesPressureProps {
  fundingRate: number;
  fundingHistory: Array<{ time: number; rate: number }>;
  markPrice: number;
  indexPrice: number;
}

export default function DerivativesPressure({
  fundingRate,
  fundingHistory,
  markPrice,
  indexPrice,
}: DerivativesPressureProps) {
  const basis = markPrice > 0 && indexPrice > 0 ? markPrice - indexPrice : 0;
  const basisPct = indexPrice > 0 ? (basis / indexPrice) * 100 : 0;

  // Funding in basis points
  const fundingBps = fundingRate * 10000;

  // Detect funding anomaly
  const isFundingAnomaly = Math.abs(fundingRate) > 0.0005; // > 5bps
  const isBasisAnomaly = Math.abs(basisPct) > 0.5;        // > 0.5% premium/discount

  // Average funding from history
  const avgFunding = fundingHistory.length > 0
    ? fundingHistory.reduce((s, f) => s + f.rate, 0) / fundingHistory.length
    : fundingRate;
  const avgFundingBps = avgFunding * 10000;

  // Funding gauge angle (-90 to +90)
  const gaugeAngle = Math.max(-90, Math.min(90, fundingBps * 10));

  // Funding sparkline
  const sparkHeight = 30;
  const sparkPoints = fundingHistory.length >= 2
    ? (() => {
        const rates = fundingHistory.map(f => f.rate);
        let min = Infinity, max = -Infinity;
        for (const r of rates) { if (r < min) min = r; if (r > max) max = r; }
        const range = max - min || 0.0001;
        return fundingHistory.map((f, i) => {
          const x = (i / (fundingHistory.length - 1)) * 100;
          const y = ((max - f.rate) / range) * sparkHeight;
          return `${x},${y}`;
        }).join(' ');
      })()
    : '';

  // Derivatives pressure score (combined funding + basis signal)
  const pressureScore = Math.min(100, Math.abs(fundingBps) * 8 + Math.abs(basisPct) * 40);
  const pressureDirection = (fundingRate > 0 && basis > 0) ? 'bullish'
    : (fundingRate < 0 && basis < 0) ? 'bearish'
    : 'mixed';

  return (
    <div className="space-y-2">
      {/* Funding Gauge */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 text-center">Funding Pressure</p>

        {/* Arc gauge */}
        <div className="flex justify-center mb-1">
          <svg width="100" height="55" viewBox="0 0 100 55">
            {/* Background arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="var(--border)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Colored arc segments */}
            <path d="M 10 50 A 40 40 0 0 1 30 17" fill="none" stroke="var(--bear)" strokeWidth="4" strokeLinecap="round" opacity="0.3" />
            <path d="M 70 17 A 40 40 0 0 1 90 50" fill="none" stroke="var(--bull)" strokeWidth="4" strokeLinecap="round" opacity="0.3" />
            {/* Needle */}
            <line
              x1="50"
              y1="50"
              x2={50 + Math.cos((gaugeAngle - 90) * Math.PI / 180) * 32}
              y2={50 + Math.sin((gaugeAngle - 90) * Math.PI / 180) * 32}
              stroke={fundingRate >= 0 ? 'var(--bull)' : 'var(--bear)'}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="50" cy="50" r="3" fill={fundingRate >= 0 ? 'var(--bull)' : 'var(--bear)'} />
            {/* Labels */}
            <text x="8" y="54" fontSize="7" fill="var(--text-dimmed)" textAnchor="start">-</text>
            <text x="92" y="54" fontSize="7" fill="var(--text-dimmed)" textAnchor="end">+</text>
          </svg>
        </div>

        <div className="text-center">
          <span
            className="font-mono text-sm font-bold"
            style={{ color: fundingRate >= 0 ? 'var(--bull)' : 'var(--bear)' }}
          >
            {fundingBps >= 0 ? '+' : ''}{fundingBps.toFixed(2)} bps
          </span>
        </div>

        {/* Avg funding */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-[var(--text-dimmed)]">24h Avg</span>
          <span className="font-mono text-[10px]" style={{ color: avgFunding >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {avgFundingBps >= 0 ? '+' : ''}{avgFundingBps.toFixed(2)} bps
          </span>
        </div>

        {/* Anomaly badge */}
        {isFundingAnomaly && (
          <div className="mt-1.5 flex items-center justify-center gap-1 py-0.5 rounded bg-[var(--warning)]/10">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
            <span className="text-[9px] font-semibold text-[var(--warning)] uppercase">Extreme Funding</span>
          </div>
        )}
      </div>

      {/* Funding History Sparkline */}
      {sparkPoints && (
        <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
          <p className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider mb-1">Funding History (24h)</p>
          <div className="h-[30px] bg-[var(--background)]/50 rounded overflow-hidden">
            <svg viewBox={`0 0 100 ${sparkHeight}`} preserveAspectRatio="none" className="w-full h-full">
              <line x1="0" y1={sparkHeight / 2} x2="100" y2={sparkHeight / 2} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />
              <polyline
                fill="none"
                stroke={fundingRate >= 0 ? 'var(--bull)' : 'var(--bear)'}
                strokeWidth="1.5"
                points={sparkPoints}
              />
            </svg>
          </div>
        </div>
      )}

      {/* Basis Analysis */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Basis (Mark - Index)</span>
          <span className="font-mono text-xs font-semibold" style={{ color: basisPct >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {basisPct >= 0 ? '+' : ''}{basisPct.toFixed(4)}%
          </span>
        </div>

        {/* Basis visual */}
        <div className="h-1 bg-[var(--background)] rounded-full overflow-hidden relative">
          <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
          <div
            className="absolute inset-y-0 rounded-full transition-all duration-500"
            style={{
              left: basisPct >= 0 ? '50%' : undefined,
              right: basisPct < 0 ? '50%' : undefined,
              width: `${Math.min(Math.abs(basisPct) * 100, 50)}%`,
              backgroundColor: basisPct >= 0 ? 'var(--bull)' : 'var(--bear)',
            }}
          />
        </div>

        {isBasisAnomaly && (
          <div className="mt-1.5 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
            <span className="text-[9px] text-[var(--warning)] font-semibold">
              {basisPct > 0 ? 'Premium' : 'Discount'} Anomaly
            </span>
          </div>
        )}
      </div>

      {/* Pressure Summary */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider w-16">Pressure</span>
        <div className="flex-1 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pressureScore}%`,
              backgroundColor: pressureScore > 60 ? 'var(--bear)' : pressureScore > 30 ? 'var(--warning)' : 'var(--bull)',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-[var(--text-secondary)] w-8 text-right">
          {Math.round(pressureScore)}
        </span>
      </div>
    </div>
  );
}
