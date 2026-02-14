'use client';

import { useMemo } from 'react';
import type { HistoryStats } from '@/lib/calculations/gexHistory';

interface GEXMetricCardProps {
  label: string;
  value: number;
  format?: 'gex' | 'price' | 'percent' | 'number' | 'ratio';
  sparkline?: number[];
  stats?: HistoryStats;
  color?: string;
  icon?: string;
  subtitle?: string;
  pulsing?: boolean;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'gex': {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
      return value.toFixed(1);
    }
    case 'price':
      return `$${value.toFixed(2)}`;
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    default:
      return value.toFixed(2);
  }
}

function Sparkline({ data, color, width = 80, height = 24 }: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    });

    return `M${points.join('L')}`;
  }, [data, width, height]);

  const fillPath = useMemo(() => {
    if (data.length < 2) return '';
    return `${path}L${width},${height}L0,${height}Z`;
  }, [path, width, height]);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#spark-${color.replace('#', '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Current value dot */}
      {data.length > 0 && (() => {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        const lastY = height - ((data[data.length - 1] - min) / range) * height;
        return (
          <circle cx={width} cy={lastY} r="2" fill={color}>
            <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
          </circle>
        );
      })()}
    </svg>
  );
}

function TrendArrow({ trend, changePercent, color }: {
  trend: 'up' | 'down' | 'flat';
  changePercent: number;
  color: string;
}) {
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '―';
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280';

  return (
    <span className="flex items-center gap-0.5 text-[9px] font-medium" style={{ color: trendColor }}>
      <span>{arrow}</span>
      <span>{Math.abs(changePercent).toFixed(1)}%</span>
    </span>
  );
}

export function GEXMetricCard({
  label,
  value,
  format = 'gex',
  sparkline,
  stats,
  color = '#22c55e',
  icon,
  subtitle,
  pulsing = false,
}: GEXMetricCardProps) {
  const isPositive = value >= 0;
  const valueColor = format === 'gex' || format === 'number'
    ? (isPositive ? '#22c55e' : '#ef4444')
    : color;

  // Z-score badge
  const zBadge = stats && Math.abs(stats.zScore) >= 1.5
    ? `${stats.zScore > 0 ? '+' : ''}${stats.zScore.toFixed(1)}σ`
    : null;

  return (
    <div
      className="relative rounded-xl p-3 border backdrop-blur-sm overflow-hidden
        transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default group"
      style={{
        background: `linear-gradient(135deg, ${color}10, transparent)`,
        borderColor: `${color}25`,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute top-0 right-0 w-14 h-14 rounded-full blur-2xl opacity-15 group-hover:opacity-25 transition-opacity"
        style={{ backgroundColor: color }}
      />

      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-xs opacity-70">{icon}</span>}
          <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
            {label}
          </span>
          {pulsing && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: color }}
            />
          )}
        </div>
        {stats && <TrendArrow trend={stats.trend} changePercent={stats.changePercent} color={color} />}
      </div>

      {/* Value */}
      <div className="flex items-end justify-between">
        <div>
          <p
            className="text-lg font-mono font-bold leading-tight"
            style={{ color: valueColor }}
          >
            {formatValue(value, format)}
          </p>
          {subtitle && (
            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
          )}
          {zBadge && (
            <span
              className="inline-block mt-0.5 px-1 py-0 rounded text-[8px] font-mono font-bold"
              style={{
                backgroundColor: `${color}20`,
                color: color,
              }}
            >
              {zBadge}
            </span>
          )}
        </div>

        {/* Sparkline */}
        {sparkline && sparkline.length >= 2 && (
          <div className="opacity-60 group-hover:opacity-100 transition-opacity">
            <Sparkline data={sparkline} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}
