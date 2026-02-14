'use client';

import { useMemo } from 'react';
import type { BiasType, DirectionBias } from '@/lib/analysis/institutionalBias';

interface BiasGaugeProps {
  biasScore: number;     // -100 to +100
  bias: BiasType;
  direction: DirectionBias;
  strength: number;      // 0-100
}

export function BiasGauge({ biasScore, bias, direction, strength }: BiasGaugeProps) {
  const cx = 200;
  const cy = 100;
  const radius = 80;
  const strokeWidth = 12;

  // Map biasScore: -100 (continuation) → left, +100 (counter-trend) → right
  const normalized = (biasScore + 100) / 200; // 0 to 1
  const needleAngle = Math.PI - normalized * Math.PI;

  const arcPath = useMemo(() => {
    const x1 = cx + radius * Math.cos(Math.PI);
    const y1 = cy - radius * Math.sin(Math.PI);
    const x2 = cx + radius * Math.cos(0);
    const y2 = cy - radius * Math.sin(0);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }, []);

  const needleLen = radius - 12;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  const biasColor = bias === 'counter-trend' ? '#22c55e'
    : bias === 'continuation' ? '#f97316' : '#6b7280';

  const directionColor = direction === 'long' ? '#22c55e'
    : direction === 'short' ? '#ef4444' : '#6b7280';

  const biasLabel = bias === 'counter-trend' ? 'COUNTER-TREND'
    : bias === 'continuation' ? 'CONTINUATION' : 'NEUTRAL';

  const directionLabel = direction === 'long' ? 'LONG BIAS'
    : direction === 'short' ? 'SHORT BIAS' : 'NO DIRECTION';

  return (
    <div className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <svg width={400} height={140} viewBox="0 0 400 140">
        <defs>
          <linearGradient id="biasGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="20%" stopColor="#ef4444" />
            <stop offset="40%" stopColor="#eab308" />
            <stop offset="50%" stopColor="#6b7280" />
            <stop offset="60%" stopColor="#84cc16" />
            <stop offset="80%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="biasNeedleGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path d={arcPath} fill="none" stroke="#1a1a1a" strokeWidth={strokeWidth + 3} strokeLinecap="round" />

        {/* Colored arc */}
        <path d={arcPath} fill="none" stroke="url(#biasGaugeGrad)" strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.85} />

        {/* Tick marks */}
        {[-100, -75, -50, -25, 0, 25, 50, 75, 100].map(val => {
          const n = (val + 100) / 200;
          const angle = Math.PI - n * Math.PI;
          const innerR = radius - strokeWidth / 2 - 5;
          const outerR = radius + strokeWidth / 2 + 5;
          const isMajor = val === 0 || Math.abs(val) === 100;
          return (
            <line
              key={val}
              x1={cx + innerR * Math.cos(angle)}
              y1={cy - innerR * Math.sin(angle)}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy - outerR * Math.sin(angle)}
              stroke={isMajor ? '#555' : '#333'}
              strokeWidth={isMajor ? 1.5 : 0.8}
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={needleX} y2={needleY}
          stroke={biasColor}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#biasNeedleGlow)"
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={6} fill={biasColor} />
        <circle cx={cx} cy={cy} r={3} fill="#0a0a0a" />

        {/* Score text */}
        <text x={cx} y={cy - 20} textAnchor="middle" fill={biasColor} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {biasScore > 0 ? '+' : ''}{biasScore.toFixed(0)}
        </text>

        {/* Side labels */}
        <text x={cx - radius - 16} y={cy + 18} textAnchor="middle" fill="#f97316" fontSize="8" fontWeight="600">
          CONTINUATION
        </text>
        <text x={cx + radius + 16} y={cy + 18} textAnchor="middle" fill="#22c55e" fontSize="8" fontWeight="600">
          COUNTER-TREND
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill="#555" fontSize="7">
          NEUTRAL
        </text>
      </svg>

      {/* Bias info */}
      <div className="flex items-center gap-3 -mt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: biasColor }} />
          <span className="text-xs font-bold" style={{ color: biasColor }}>
            {biasLabel}
          </span>
        </div>

        <div className="w-px h-3 bg-[var(--border)]" />

        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: directionColor }} />
          <span className="text-[11px] font-medium" style={{ color: directionColor }}>
            {directionLabel}
          </span>
        </div>

        <div className="w-px h-3 bg-[var(--border)]" />

        <span className="text-[10px] text-[var(--text-muted)]">
          Strength: {strength.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
