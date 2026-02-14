'use client';

import { useMemo } from 'react';

interface GEXIntensityGaugeProps {
  value: number;        // Net GEX value
  intensity: number;    // 0-100 percentile
  regime: 'positive' | 'negative';
  size?: number;        // Diameter in px
}

export function GEXIntensityGauge({
  value,
  intensity,
  regime,
  size = 160,
}: GEXIntensityGaugeProps) {
  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = size * 0.38;
  const strokeWidth = size * 0.08;

  // Angle range: -180deg (left) to 0deg (right)
  // Map intensity 0-100 to angle
  const startAngle = Math.PI; // 180 degrees (left)
  const endAngle = 0; // 0 degrees (right)
  const needleAngle = startAngle - (intensity / 100) * Math.PI;

  // Arc path for background
  const arcPath = useMemo(() => {
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy - radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy - radius * Math.sin(endAngle);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  }, [cx, cy, radius]);

  // Needle endpoint
  const needleLen = radius - 8;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  // Format value
  const formattedValue = useMemo(() => {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(0);
  }, [value]);

  const regimeColor = regime === 'positive' ? '#22c55e' : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <defs>
          {/* Arc gradient: red → yellow → green */}
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="needleGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background track */}
        <path
          d={arcPath}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={strokeWidth + 2}
          strokeLinecap="round"
        />

        {/* Colored arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.8}
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map(pct => {
          const angle = startAngle - (pct / 100) * Math.PI;
          const innerR = radius - strokeWidth / 2 - 4;
          const outerR = radius + strokeWidth / 2 + 4;
          return (
            <line
              key={pct}
              x1={cx + innerR * Math.cos(angle)}
              y1={cy - innerR * Math.sin(angle)}
              x2={cx + outerR * Math.cos(angle)}
              y2={cy - outerR * Math.sin(angle)}
              stroke="#444"
              strokeWidth={1}
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={regimeColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          filter="url(#needleGlow)"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`${180 - 0} ${cx} ${cy}`}
            to={`${180 - (intensity / 100) * 180} ${cx} ${cy}`}
            dur="0.8s"
            fill="freeze"
            begin="0s"
          />
        </line>

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={5} fill={regimeColor} />
        <circle cx={cx} cy={cy} r={3} fill="#0a0a0a" />

        {/* Value text */}
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fill={regimeColor}
          fontSize={size * 0.12}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {formattedValue}
        </text>

        {/* Labels */}
        <text
          x={cx - radius - 4}
          y={cy + 14}
          textAnchor="middle"
          fill="#666"
          fontSize="8"
        >
          NEG
        </text>
        <text
          x={cx + radius + 4}
          y={cy + 14}
          textAnchor="middle"
          fill="#666"
          fontSize="8"
        >
          POS
        </text>
      </svg>

      {/* Percentile label */}
      <div className="flex items-center gap-1.5 -mt-1">
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: regimeColor }}
        />
        <span className="text-[10px] font-medium" style={{ color: regimeColor }}>
          {regime === 'positive' ? 'Positive' : 'Negative'} Gamma
        </span>
        <span className="text-[9px] text-[var(--text-muted)]">
          P{intensity.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
