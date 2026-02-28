'use client';

/**
 * COMPOSITE MARKET PRESSURE SCORE — Circular gauge 0-100
 *
 * Synthesizes all futures signals into a single directional score
 * with direction (bullish/bearish/neutral) and confidence level.
 */

import type { CompositeResult } from '@/lib/calculations/futures/compositeScore';

interface CompositeScoreProps {
  result: CompositeResult;
}

const DIRECTION_COLORS = {
  bullish: '#22c55e',
  bearish: '#ef4444',
  neutral: '#6b7280',
};

export default function CompositeScore({ result }: CompositeScoreProps) {
  const { score, direction, confidence, components, alert } = result;
  const dirColor = DIRECTION_COLORS[direction];

  // Arc parameters for circular gauge
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 38;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const progress = score / 100;

  // Arc from -135° to +135° (270° total sweep)
  const startAngle = -225;
  const sweepAngle = 270;
  const currentAngle = startAngle + sweepAngle * progress;

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const sweep = end - start;
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const bgArc = describeArc(startAngle, startAngle + sweepAngle);
  const fgArc = describeArc(startAngle, currentAngle);

  // Color gradient based on score
  const scoreColor = score > 65 ? '#22c55e'
    : score > 55 ? '#86efac'
    : score > 45 ? '#6b7280'
    : score > 35 ? '#fca5a5'
    : '#ef4444';

  return (
    <div className="space-y-2">
      {/* Gauge */}
      <div
        className="relative flex flex-col items-center rounded-lg p-3 transition-shadow duration-700"
        style={{
          backgroundColor: alert ? `${dirColor}08` : 'transparent',
          boxShadow: alert ? `0 0 20px ${dirColor}15, inset 0 0 15px ${dirColor}05` : 'none',
        }}
      >
        <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.75}`}>
          {/* Background arc */}
          <path
            d={bgArc}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Foreground arc */}
          <path
            d={fgArc}
            fill="none"
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Score text */}
          <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central"
            fill={scoreColor} fontSize="22" fontWeight="700" fontFamily="monospace">
            {score}
          </text>
          {/* Direction label */}
          <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="central"
            fill={dirColor} fontSize="8" fontWeight="600" letterSpacing="0.5"
            style={{ textTransform: 'uppercase' }}>
            {direction.toUpperCase()}
          </text>
        </svg>

        {/* Confidence */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider">Confidence</span>
          <div className="w-16 h-1 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${confidence}%`,
                backgroundColor: confidence > 60 ? dirColor : 'var(--text-muted)',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">{confidence}%</span>
        </div>
      </div>

      {/* Component breakdown */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5 space-y-1.5">
        <p className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider mb-1">Signal Breakdown</p>

        <SignalBar label="Delta OI" value={components.deltaOI} weight="25%" />
        <SignalBar label="Funding" value={components.funding} weight="20%" />
        <SignalBar label="L/S Imb." value={components.lsImbalance} weight="20%" />
        <SignalBar label="Liq." value={components.liquidations} weight="20%" />

        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[9px] text-[var(--text-dimmed)] w-12 flex-shrink-0">Vol</span>
          <div className="flex-1 h-1 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--text-muted)]"
              style={{ width: `${components.volatility}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-[var(--text-dimmed)] w-8 text-right">15%</span>
        </div>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg animate-pulse"
          style={{ backgroundColor: `${dirColor}15`, border: `1px solid ${dirColor}30` }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={dirColor} strokeWidth="2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-[10px] font-semibold uppercase" style={{ color: dirColor }}>
            Extreme {direction} Conditions
          </span>
        </div>
      )}
    </div>
  );
}

function SignalBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const isPositive = value >= 0;
  const barWidth = Math.min(Math.abs(value), 100);
  const color = isPositive ? 'var(--bull)' : 'var(--bear)';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-[var(--text-dimmed)] w-12 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-[var(--background)] rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-300"
          style={{
            left: isPositive ? '50%' : undefined,
            right: !isPositive ? '50%' : undefined,
            width: `${barWidth / 2}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-[9px] font-mono text-[var(--text-dimmed)] w-8 text-right">{weight}</span>
    </div>
  );
}
