'use client';

import { useId } from 'react';

/**
 * Custom SVG Icons for SENZOUKRIA
 * Scientific/Trading aesthetic
 */

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

// ============ NAVIGATION ICONS ============

export function LiveIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4" fill={color} className="animate-pulse" />
      <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="2" strokeOpacity="0.5" />
      <circle cx="12" cy="12" r="11" stroke={color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}

export function FootprintIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Candle bars */}
      <rect x="3" y="8" width="4" height="10" rx="1" fill={color} fillOpacity="0.3" />
      <rect x="3" y="4" width="4" height="16" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="10" y="6" width="4" height="8" rx="1" fill={color} fillOpacity="0.6" />
      <rect x="10" y="2" width="4" height="16" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="17" y="10" width="4" height="6" rx="1" fill={color} fillOpacity="0.3" />
      <rect x="17" y="6" width="4" height="14" rx="1" stroke={color} strokeWidth="1.5" />
      {/* Volume dots */}
      <circle cx="5" cy="21" r="1.5" fill={color} fillOpacity="0.5" />
      <circle cx="12" cy="21" r="2" fill={color} />
      <circle cx="19" cy="21" r="1" fill={color} fillOpacity="0.3" />
    </svg>
  );
}

export function GexIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Greek gamma symbol stylized */}
      <path
        d="M6 4L12 20M12 20L18 4M12 20V12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Energy waves */}
      <path
        d="M3 12C5 10 7 14 9 12"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />
      <path
        d="M15 12C17 10 19 14 21 12"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function VolatilityIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Volatility smile curve */}
      <path
        d="M3 16C6 20 10 8 12 12C14 16 18 4 21 8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sigma symbol */}
      <path
        d="M4 4H10L6 10L10 16H4"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NewsIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Document */}
      <rect x="4" y="2" width="16" height="20" rx="2" stroke={color} strokeWidth="1.5" />
      {/* Lines */}
      <line x1="8" y1="7" x2="16" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="16" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="15" x2="12" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Alert dot */}
      <circle cx="18" cy="6" r="3" fill="#ef4444" />
    </svg>
  );
}

export function HeatmapIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Staircase liquidity heatmap - ascending bid/ask walls */}
      {/* Horizontal liquidity bars at different price levels */}
      <rect x="3" y="3" width="8" height="2.5" rx="0.5" fill={color} fillOpacity="0.2" />
      <rect x="3" y="6.5" width="14" height="2.5" rx="0.5" fill={color} fillOpacity="0.35" />
      <rect x="3" y="10" width="18" height="2.5" rx="0.5" fill={color} fillOpacity="0.7" />
      <rect x="3" y="13.5" width="12" height="2.5" rx="0.5" fill={color} fillOpacity="0.5" />
      <rect x="3" y="17" width="6" height="2.5" rx="0.5" fill={color} fillOpacity="0.15" />
      {/* Price line */}
      <line x1="11" y1="2" x2="11" y2="21" stroke={color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
      {/* Current price dot */}
      <circle cx="11" cy="11.25" r="1.5" fill={color} fillOpacity="0.9" />
    </svg>
  );
}

// ============ TOOL ICONS - SENZOUKRIA Scientific/Dr. Stone Style ============
// Clean, precise, scientific aesthetic with measurement/lab equipment inspiration

export function CursorIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 3L5 17L9 13L13 20L15 19L11 12L16 11L5 3Z"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CrosshairIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="7" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" />
      <line x1="12" y1="2" x2="12" y2="7" stroke={color} strokeWidth="1.5" />
      <line x1="12" y1="17" x2="12" y2="22" stroke={color} strokeWidth="1.5" />
      <line x1="2" y1="12" x2="7" y2="12" stroke={color} strokeWidth="1.5" />
      <line x1="17" y1="12" x2="22" y2="12" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill={color} fillOpacity="0.7" />
    </svg>
  );
}

export function TrendlineIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="4" y1="18" x2="20" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy="18" r="2.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <circle cx="20" cy="6" r="2.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function HLineIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="8" x2="3" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="21" y1="8" x2="21" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function RectangleIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="6" width="16" height="12" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1.5" rx="1" />
      <circle cx="4" cy="6" r="2" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
      <circle cx="20" cy="6" r="2" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
      <circle cx="4" cy="18" r="2" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
      <circle cx="20" cy="18" r="2" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function FibonacciIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  const gradId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2b93b" stopOpacity="0.5" />
          <stop offset="50%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e2b93b" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      {/* Fibonacci retracement levels */}
      <rect x="3" y="3" width="18" height="18" rx="1" fill={`url(#${gradId})`} fillOpacity="0.08" />
      <line x1="4" y1="4" x2="20" y2="4" stroke={color} strokeWidth="1" strokeOpacity="0.25" />
      <line x1="4" y1="7.5" x2="20" y2="7.5" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="4" y1="10" x2="20" y2="10" stroke="#e2b93b" strokeWidth="1.5" strokeOpacity="0.8" />
      <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.5" />
      <line x1="4" y1="14" x2="20" y2="14" stroke="#e2b93b" strokeWidth="1.5" strokeOpacity="0.8" />
      <line x1="4" y1="16.5" x2="20" y2="16.5" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="4" y1="20" x2="20" y2="20" stroke={color} strokeWidth="1" strokeOpacity="0.25" />
      {/* Golden ratio marker */}
      <circle cx="4" cy="12" r="1.5" fill="#e2b93b" fillOpacity="0.6" />
      <circle cx="20" cy="12" r="1.5" fill="#e2b93b" fillOpacity="0.6" />
    </svg>
  );
}

export function TextIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 6V4H20V6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="20" x2="16" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrushIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M18 4L8 14L10 16L20 6L18 4Z"
        fill={color}
        fillOpacity="0.3"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 14C8 14 4 16 4 19C4 21 6 22 8 20C10 18 8 14 8 14Z"
        fill={color}
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function IndicatorIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Chart line */}
      <path
        d="M3 18L7 14L11 16L15 10L21 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Moving average */}
      <path
        d="M3 14L9 12L15 14L21 10"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.5"
        strokeLinecap="round"
        strokeDasharray="3 2"
      />
      {/* Dots */}
      <circle cx="7" cy="14" r="2" fill={color} />
      <circle cx="15" cy="10" r="2" fill={color} />
    </svg>
  );
}

export function SettingsIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Clean sliders icon - professional settings style */}
      <line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Slider handles */}
      <circle cx="8" cy="6" r="2" fill={color} />
      <circle cx="14" cy="12" r="2" fill={color} />
      <circle cx="10" cy="18" r="2" fill={color} />
    </svg>
  );
}

export function TrashIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 6H20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 2H14" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M6 6L7 20H17L18 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="10" y1="10" x2="10" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="10" x2="14" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MoreIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="6" cy="12" r="2" fill={color} />
      <circle cx="12" cy="12" r="2" fill={color} />
      <circle cx="18" cy="12" r="2" fill={color} />
    </svg>
  );
}

export function MagnetIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 2v6a6 6 0 0 0 12 0V2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 2H4v4h2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 2h2v4h-2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="4" y1="6" x2="6" y2="6" stroke={color} strokeWidth="2" />
      <line x1="18" y1="6" x2="20" y2="6" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// Additional drawing tool icons
export function RayIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="4" y1="16" x2="22" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy="16" r="2.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <path d="M18 4L22 6L18 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function VLineIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="12" y1="2" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="6" x2="16" y2="6" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
      <line x1="8" y1="18" x2="16" y2="18" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
    </svg>
  );
}

export function ChannelIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 18L20 10L20 4L4 12Z" fill={color} fillOpacity="0.08" />
      <line x1="4" y1="18" x2="20" y2="10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="15" x2="20" y2="7" stroke={color} strokeWidth="1" strokeOpacity="0.35" strokeDasharray="3 3" />
      <circle cx="4" cy="18" r="2" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <circle cx="4" cy="12" r="2" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function ArrowIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <line x1="5" y1="19" x2="19" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 5H19V12" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HighlighterIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="6" y="10" width="12" height="6" rx="1" fill={color} fillOpacity="0.4" />
      <path d="M4 20L8 14H16L20 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 10V6L12 4L16 6V10" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MeasureIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="8" width="18" height="8" rx="1" stroke={color} strokeWidth="1.5" />
      <line x1="6" y1="8" x2="6" y2="12" stroke={color} strokeWidth="1" />
      <line x1="10" y1="8" x2="10" y2="14" stroke={color} strokeWidth="1" />
      <line x1="14" y1="8" x2="14" y2="12" stroke={color} strokeWidth="1" />
      <line x1="18" y1="8" x2="18" y2="14" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function LongPositionIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="8" fill="#22c55e" fillOpacity="0.1" />
      <rect x="4" y="16" width="16" height="4" fill="#ef4444" fillOpacity="0.1" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="#22c55e" strokeWidth="2" />
      <path d="M12 4L8 9H10V12H14V9H16L12 4Z" fill="#22c55e" fillOpacity="0.8" />
      <line x1="6" y1="6" x2="18" y2="6" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" />
      <line x1="6" y1="18" x2="18" y2="18" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
    </svg>
  );
}

export function ShortPositionIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="4" fill="#22c55e" fillOpacity="0.1" />
      <rect x="4" y="12" width="16" height="8" fill="#ef4444" fillOpacity="0.1" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="#ef4444" strokeWidth="2" />
      <path d="M12 20L8 15H10V12H14V15H16L12 20Z" fill="#ef4444" fillOpacity="0.8" />
      <line x1="6" y1="6" x2="18" y2="6" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" />
      <line x1="6" y1="18" x2="18" y2="18" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
    </svg>
  );
}

export function SimulationIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2" fill={color} />
      <circle cx="15" cy="9" r="2" fill={color} />
      <path d="M8 15C8 15 10 17 12 17C14 17 16 15 16 15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.5" />
      <line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="1.5" />
      <line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.5" fill={color} />
      <circle cx="12" cy="14" r="1.5" fill={color} />
      <circle cx="16" cy="14" r="1.5" fill={color} fillOpacity="0.5" />
      <circle cx="8" cy="18" r="1.5" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

export function RefreshIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 12C4 7.58 7.58 4 12 4C15.37 4 18.26 6.11 19.42 9"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 12C20 16.42 16.42 20 12 20C8.63 20 5.74 17.89 4.58 15"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M16 9H20V5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 15H4V19" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GammaIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Greek gamma symbol stylized */}
      <path
        d="M6 4L12 20M12 20L18 4"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function ChartSmileIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Volatility smile curve */}
      <path
        d="M4 14C6 18 9 10 12 12C15 14 18 6 20 10"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Axis */}
      <line x1="4" y1="20" x2="20" y2="20" stroke={color} strokeWidth="1" strokeOpacity="0.3" />
      <line x1="4" y1="4" x2="4" y2="20" stroke={color} strokeWidth="1" strokeOpacity="0.3" />
      {/* Data points */}
      <circle cx="4" cy="14" r="1.5" fill={color} />
      <circle cx="12" cy="12" r="1.5" fill={color} />
      <circle cx="20" cy="10" r="1.5" fill={color} />
    </svg>
  );
}

export function SaveIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 3H16L21 8V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V5C3 3.9 3.9 3 5 3Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 3V8H15V3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7" y="13" width="10" height="6" rx="1" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function LayoutIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Clean layout/grid icon - professional style */}
      <rect x="3" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ============ STATUS ICONS ============

export function ConnectedIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4" fill="#22c55e" className="animate-pulse" />
      <circle cx="12" cy="12" r="8" stroke="#22c55e" strokeWidth="2" strokeOpacity="0.3" />
    </svg>
  );
}

export function DisconnectedIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="4" fill="#71717a" />
      <circle cx="12" cy="12" r="8" stroke="#71717a" strokeWidth="2" strokeOpacity="0.3" />
    </svg>
  );
}

// ============ ASSET CATEGORY ICONS ============

export function CryptoIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" />
      <path
        d="M12 6V8M12 16V18M8 9H14C15.1 9 16 9.9 16 11C16 12.1 15.1 13 14 13H10C8.9 13 8 13.9 8 15C8 16.1 8.9 17 10 17H16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StocksIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="10" width="4" height="10" rx="1" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
      <rect x="10" y="6" width="4" height="14" rx="1" fill={color} fillOpacity="0.5" stroke={color} strokeWidth="1.5" />
      <rect x="17" y="3" width="4" height="17" rx="1" fill={color} fillOpacity="0.7" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function FuturesIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 18L12 6L20 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="14" x2="17" y2="14" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
      <circle cx="12" cy="6" r="2" fill={color} />
    </svg>
  );
}

export function ForexIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="12" r="6" stroke={color} strokeWidth="1.5" />
      <circle cx="16" cy="12" r="6" stroke={color} strokeWidth="1.5" />
      <path d="M12 8V16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IndicesIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3 18L8 13L12 16L21 7"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 7H21V11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OptionsIcon({ size = 16, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
      <path d="M12 3V12L18 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" fill={color} fillOpacity="0.3" />
    </svg>
  );
}

// ============ DATA FEED ICON ============

export function DataFeedIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Database */}
      <ellipse cx="12" cy="6" rx="8" ry="3" stroke={color} strokeWidth="1.5" />
      <path d="M4 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke={color} strokeWidth="1.5" />
      <path d="M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" stroke={color} strokeWidth="1.5" />
      <path d="M4 14v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" stroke={color} strokeWidth="1.5" />
      {/* Signal indicator */}
      <circle cx="18" cy="4" r="2.5" fill="#22c55e" stroke={color} strokeWidth="0.5" />
      <path d="M17 4l1 1 2-2" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============ BOUTIQUE ICONS - DR. STONE / SCIENTIFIC STYLE ============

export function BoutiqueIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Treasure chest base */}
      <path
        d="M3 10V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V10"
        fill={`url(#${id}-bg)`}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Chest lid */}
      <path
        d="M2 10L4 6C4.5 5 5.5 4 7 4H17C18.5 4 19.5 5 20 6L22 10H2Z"
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Lock/clasp */}
      <rect x="10" y="8" width="4" height="5" rx="1" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="1" />
      <circle cx="12" cy="11" r="1" fill={color} />
      {/* Shine */}
      <path d="M5 10L5 14" stroke={`url(#${id}-shine)`} strokeWidth="2" strokeLinecap="round" />
      {/* Sparkles */}
      <path d="M7 2L7.5 3.5L9 4L7.5 4.5L7 6L6.5 4.5L5 4L6.5 3.5L7 2Z" fill="#fbbf24" />
      <path d="M17 1L17.3 2L18.5 2.3L17.3 2.6L17 3.5L16.7 2.6L15.5 2.3L16.7 2L17 1Z" fill="#fbbf24" fillOpacity="0.7" />
      {/* Scientific formula hint */}
      <text x="15" y="18" fontSize="4" fill={color} fillOpacity="0.4" fontFamily="monospace">Au</text>
    </svg>
  );
}

export function ThemeIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-rainbow`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="25%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="75%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* Monitor/Screen frame */}
      <rect x="2" y="3" width="20" height="14" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.05" />
      {/* Screen content - gradient bars */}
      <rect x="4" y="5" width="4" height="10" rx="0.5" fill="#ef4444" fillOpacity="0.8" />
      <rect x="8.5" y="5" width="4" height="10" rx="0.5" fill="#22c55e" fillOpacity="0.8" />
      <rect x="13" y="5" width="4" height="10" rx="0.5" fill="#3b82f6" fillOpacity="0.8" />
      <rect x="17.5" y="5" width="2.5" height="10" rx="0.5" fill="#a855f7" fillOpacity="0.8" />
      {/* Stand */}
      <path d="M8 17V20H16V17" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="21" x2="18" y2="21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Brush tool */}
      <path d="M19 1L21 3L18 10L16 8L19 1Z" fill={`url(#${id}-rainbow)`} stroke={color} strokeWidth="0.5" />
      <circle cx="17" cy="9" r="1.5" fill={color} />
    </svg>
  );
}

export function BadgeIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {/* Medal circle */}
      <circle cx="12" cy="10" r="8" fill={`url(#${id}-gold)`} stroke="#ca8a04" strokeWidth="1" />
      {/* Inner ring */}
      <circle cx="12" cy="10" r="6" stroke="#fef3c7" strokeWidth="1" fill="none" />
      {/* Star emblem */}
      <path
        d="M12 5L13.2 8.2L16.5 8.5L14 10.5L14.8 14L12 12L9.2 14L10 10.5L7.5 8.5L10.8 8.2L12 5Z"
        fill="#fef3c7"
      />
      {/* Ribbons */}
      <path d="M7 16L5 22L8 19L9 22L10 17" fill={`url(#${id}-ribbon)`} />
      <path d="M17 16L19 22L16 19L15 22L14 17" fill={`url(#${id}-ribbon)`} />
      {/* Shine */}
      <ellipse cx="9" cy="7" rx="2" ry="1.5" fill="white" fillOpacity="0.4" transform="rotate(-30 9 7)" />
    </svg>
  );
}

export function EffectIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-aurora`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="33%" stopColor="#22c55e" />
          <stop offset="66%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>
      {/* Aurora waves background */}
      <path d="M2 20Q6 14 10 16Q14 18 18 12Q20 10 22 11V22H2Z" fill={`url(#${id}-aurora)`} fillOpacity="0.3" filter={`url(#${id}-blur)`} />
      <path d="M2 18Q5 12 9 14Q13 16 17 10Q20 7 22 8V22H2Z" fill={`url(#${id}-aurora)`} fillOpacity="0.5" />
      {/* Main sparkle */}
      <path d="M12 2L13.5 7L18 8.5L13.5 10L12 15L10.5 10L6 8.5L10.5 7L12 2Z" fill="#fbbf24" stroke="#fde047" strokeWidth="0.5" />
      {/* Secondary sparkles */}
      <path d="M5 4L5.5 5.5L7 6L5.5 6.5L5 8L4.5 6.5L3 6L4.5 5.5L5 4Z" fill={color} fillOpacity="0.7" />
      <path d="M19 5L19.5 6.5L21 7L19.5 7.5L19 9L18.5 7.5L17 7L18.5 6.5L19 5Z" fill={color} fillOpacity="0.7" />
      <path d="M8 13L8.3 14L9.5 14.3L8.3 14.6L8 15.5L7.7 14.6L6.5 14.3L7.7 14L8 13Z" fill="#fff" fillOpacity="0.8" />
      <path d="M16 15L16.3 16L17.5 16.3L16.3 16.6L16 17.5L15.7 16.6L14.5 16.3L15.7 16L16 15Z" fill="#fff" fillOpacity="0.8" />
      {/* Particle dots */}
      <circle cx="4" cy="15" r="0.5" fill="#22c55e" />
      <circle cx="20" cy="13" r="0.5" fill="#a855f7" />
      <circle cx="14" cy="19" r="0.5" fill="#06b6d4" />
    </svg>
  );
}

export function JournalIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Book cover */}
      <rect x="3" y="2" width="18" height="20" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.06" />
      {/* Spine */}
      <line x1="7" y1="2" x2="7" y2="22" stroke={color} strokeWidth="1.5" />
      {/* Lines */}
      <line x1="10" y1="7" x2="18" y2="7" stroke={color} strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
      <line x1="10" y1="10" x2="17" y2="10" stroke={color} strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
      <line x1="10" y1="13" x2="16" y2="13" stroke={color} strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
      {/* P&L chart */}
      <path d="M10 17L13 15L15 16.5L18 14" stroke="#7ed321" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bookmark */}
      <path d="M16 2V6L17.5 4.8L19 6V2" fill="#e04040" />
    </svg>
  );
}

export function BacktestIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Chart area */}
      <rect x="1" y="5" width="16" height="17" rx="2" stroke={color} strokeWidth="1.2" strokeOpacity="0.4" />
      {/* Candles */}
      <line x1="5" y1="9" x2="5" y2="17" stroke="#e04040" strokeWidth="0.8" />
      <rect x="4" y="11" width="2" height="3.5" rx="0.3" fill="#e04040" />
      <line x1="9" y1="8" x2="9" y2="16" stroke="#7ed321" strokeWidth="0.8" />
      <rect x="8" y="9" width="2" height="4" rx="0.3" fill="#7ed321" />
      <line x1="13" y1="10" x2="13" y2="18" stroke="#7ed321" strokeWidth="0.8" />
      <rect x="12" y="11" width="2" height="3" rx="0.3" fill="#7ed321" />
      {/* Replay circle */}
      <circle cx="19" cy="7" r="4.5" stroke={color} strokeWidth="1.5" />
      {/* Rewind arrow */}
      <path d="M21 5C20 4.2 18.7 3.8 17.5 4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M17.5 2.5V4.5H19.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Play triangle */}
      <polygon points="18,5.5 21,7 18,8.5" fill={color} />
    </svg>
  );
}

// ============ FEATURE ICON ============
export function FeatureIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Gear/settings base */}
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
      <path
        d="M12 1V4M12 20V23M23 12H20M4 12H1M20.5 3.5L18 6M6 18L3.5 20.5M20.5 20.5L18 18M6 6L3.5 3.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Inner plus */}
      <path d="M12 9V15M9 12H15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Lightning bolt for power-up */}
      <path d="M19 8L17 12H20L18 16" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReplayIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Circular arrow (replay symbol) */}
      <path d="M3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12C21 16.97 16.97 21 12 21C9.53 21 7.32 19.95 5.76 18.24" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {/* Arrow head */}
      <path d="M3 16L5.76 18.24L8 16" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Play triangle in center */}
      <polygon points="10,8 16,12 10,16" fill={color} opacity="0.8" />
    </svg>
  );
}

// ============ BOUTIQUE TAB ICONS ============

// Shop/Store icon - treasure bag with sparkles
export function ShopTabIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="shopBag" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Bag */}
      <path d="M6 8L4 20C4 21 5 22 6 22H18C19 22 20 21 20 20L18 8H6Z" fill="url(#shopBag)" fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      {/* Bag top */}
      <path d="M6 8C6 8 8 6 12 6C16 6 18 8 18 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Handles */}
      <path d="M9 6V4C9 2.9 10.3 2 12 2C13.7 2 15 2.9 15 4V6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Sparkles */}
      <path d="M3 4L3.5 5.5L5 6L3.5 6.5L3 8L2.5 6.5L1 6L2.5 5.5L3 4Z" fill="#fbbf24" />
      <path d="M21 3L21.3 4L22.5 4.3L21.3 4.6L21 5.5L20.7 4.6L19.5 4.3L20.7 4L21 3Z" fill="#fbbf24" />
      {/* Price tag */}
      <circle cx="12" cy="14" r="3" stroke={color} strokeWidth="1" fill="none" />
      <text x="12" y="15.5" fontSize="4" fill={color} textAnchor="middle" fontWeight="bold">S</text>
    </svg>
  );
}

// Tasks/Missions icon - scroll with checkmarks
export function TasksTabIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="taskScroll" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* Scroll paper */}
      <path d="M6 3C4.9 3 4 3.9 4 5V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V5C20 3.9 19.1 3 18 3H6Z" fill="url(#taskScroll)" stroke={color} strokeWidth="1.5" />
      {/* Scroll rolls */}
      <ellipse cx="6" cy="5" rx="2" ry="2" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
      <ellipse cx="18" cy="5" rx="2" ry="2" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
      {/* Checkmarks */}
      <path d="M7 10L9 12L13 8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15L9 17L13 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.4" />
      {/* Reward star */}
      <path d="M17 12L17.5 13.5L19 14L17.5 14.5L17 16L16.5 14.5L15 14L16.5 13.5L17 12Z" fill="#fbbf24" />
    </svg>
  );
}

// Coins/Buy icon - stack of coins with plus
export function CoinsTabIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="coinStack" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      {/* Coin stack */}
      <ellipse cx="10" cy="18" rx="7" ry="3" fill="url(#coinStack)" fillOpacity="0.3" stroke={color} strokeWidth="1" />
      <ellipse cx="10" cy="15" rx="7" ry="3" fill="url(#coinStack)" fillOpacity="0.5" stroke={color} strokeWidth="1" />
      <ellipse cx="10" cy="12" rx="7" ry="3" fill="url(#coinStack)" stroke={color} strokeWidth="1.5" />
      {/* S on top coin */}
      <text x="10" y="13.5" fontSize="5" fill="#ecfccb" textAnchor="middle" fontWeight="bold">S</text>
      {/* Plus sign */}
      <circle cx="19" cy="6" r="4" fill="#22c55e" stroke="#fff" strokeWidth="1" />
      <path d="M19 4V8M17 6H21" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Inventory icon - backpack/chest with items
export function InventoryTabIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="invChest" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* Chest body */}
      <path d="M3 10V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V10" fill="url(#invChest)" stroke={color} strokeWidth="1.5" />
      {/* Chest lid */}
      <path d="M2 10L3 6C3.3 5 4.2 4 5.5 4H18.5C19.8 4 20.7 5 21 6L22 10H2Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" />
      {/* Lock */}
      <rect x="10" y="8" width="4" height="4" rx="1" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="1" />
      {/* Items peeking out */}
      <circle cx="7" cy="15" r="2" fill="#fbbf24" stroke={color} strokeWidth="0.5" />
      <rect x="11" y="14" width="3" height="4" rx="0.5" fill="#3b82f6" stroke={color} strokeWidth="0.5" />
      <path d="M16 13L18 16L16 19L14 16L16 13Z" fill="#ef4444" stroke={color} strokeWidth="0.5" />
    </svg>
  );
}

// ============ NEW ITEM CATEGORY ICONS ============

// Wallpaper icon - image with landscape
export function WallpaperIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="wallpaperSky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="wallpaperGround" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      {/* Frame */}
      <rect x="2" y="3" width="20" height="18" rx="2" stroke={color} strokeWidth="1.5" fill="#0a0a0a" />
      {/* Sky */}
      <rect x="4" y="5" width="16" height="8" fill="url(#wallpaperSky)" />
      {/* Sun */}
      <circle cx="16" cy="8" r="2" fill="#fbbf24" />
      {/* Mountains */}
      <path d="M4 13L8 8L12 12L16 7L20 13H4Z" fill="#6b7280" />
      {/* Ground */}
      <rect x="4" y="13" width="16" height="6" fill="url(#wallpaperGround)" />
      {/* Trees */}
      <path d="M6 13L7 10L8 13H6Z" fill="#166534" />
      <path d="M10 13L11.5 9L13 13H10Z" fill="#166534" />
    </svg>
  );
}

// Interface skin icon - UI layout
export function InterfaceIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="uiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {/* Main window */}
      <rect x="2" y="2" width="20" height="20" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.05" />
      {/* Header bar */}
      <rect x="2" y="2" width="20" height="4" rx="2" fill="url(#uiGrad)" />
      {/* Window controls */}
      <circle cx="5" cy="4" r="1" fill="#ef4444" />
      <circle cx="8" cy="4" r="1" fill="#fbbf24" />
      <circle cx="11" cy="4" r="1" fill="#22c55e" />
      {/* Sidebar */}
      <rect x="3" y="7" width="4" height="13" rx="1" fill={color} fillOpacity="0.2" />
      {/* Content blocks */}
      <rect x="8" y="7" width="13" height="5" rx="1" fill={color} fillOpacity="0.15" />
      <rect x="8" y="13" width="6" height="7" rx="1" fill={color} fillOpacity="0.15" />
      <rect x="15" y="13" width="6" height="7" rx="1" fill={color} fillOpacity="0.15" />
      {/* Chart inside */}
      <path d="M9 10L11 8L13 9L15 7L17 8L19 6" stroke="#22c55e" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// Naruto-style headband badge
export function HeadbandBadgeIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="headbandMetal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a1a1aa" />
          <stop offset="50%" stopColor="#71717a" />
          <stop offset="100%" stopColor="#52525b" />
        </linearGradient>
        <linearGradient id="headbandCloth" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      {/* Cloth band */}
      <path d="M1 10C1 10 3 8 6 8H18C21 8 23 10 23 10V14C23 14 21 16 18 16H6C3 16 1 14 1 14V10Z" fill="url(#headbandCloth)" />
      {/* Cloth tails */}
      <path d="M1 12L-1 18L2 16L1 12Z" fill="#1d4ed8" />
      <path d="M23 12L25 18L22 16L23 12Z" fill="#1d4ed8" />
      {/* Metal plate */}
      <rect x="5" y="9" width="14" height="6" rx="1" fill="url(#headbandMetal)" stroke="#3f3f46" strokeWidth="0.5" />
      {/* Village symbol - stylized S for Senzoukria */}
      <path d="M9 11C9 11 10 10 12 10C14 10 15 11 15 12C15 13 13 13.5 12 13.5C11 13.5 9 14 9 14" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Scratch marks for "rogue trader" */}
      <line x1="7" y1="10" x2="8" y2="14" stroke="#ef4444" strokeWidth="0.5" strokeOpacity="0.5" />
      {/* Shine */}
      <ellipse cx="8" cy="10.5" rx="1.5" ry="0.5" fill="white" fillOpacity="0.3" />
    </svg>
  );
}

// Homepage background icon
export function HomeBgIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="homeBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* House frame */}
      <path d="M3 10L12 3L21 10V20C21 21 20 22 19 22H5C4 22 3 21 3 20V10Z" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1.5" />
      {/* Roof */}
      <path d="M1 10L12 2L23 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Window with gradient bg */}
      <rect x="7" y="11" width="10" height="7" rx="1" fill="url(#homeBgGrad)" stroke={color} strokeWidth="1" />
      {/* Play button for video/gif */}
      <circle cx="12" cy="14.5" r="2.5" fill="white" fillOpacity="0.3" />
      <path d="M11 13L14 14.5L11 16V13Z" fill="white" />
      {/* Image icon hint */}
      <circle cx="9" cy="13" r="0.8" fill="white" fillOpacity="0.6" />
      <path d="M8 16L10 14L11 15" stroke="white" strokeWidth="0.5" strokeOpacity="0.6" />
    </svg>
  );
}

// GIF/Animation icon
export function GifIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="gifGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      {/* Frame */}
      <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.05" />
      {/* GIF text */}
      <rect x="6" y="8" width="12" height="8" rx="1" fill="url(#gifGrad)" />
      <text x="12" y="14" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold" fontFamily="system-ui">GIF</text>
      {/* Animation indicators */}
      <circle cx="5" cy="7" r="1" fill="#22c55e">
        <animate attributeName="opacity" values="1;0.3;1" dur="0.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="19" cy="7" r="1" fill="#22c55e">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="0.5s" repeatCount="indefinite" />
      </circle>
      {/* Film strip holes */}
      <rect x="3" y="5" width="2" height="1" rx="0.5" fill={color} fillOpacity="0.3" />
      <rect x="3" y="18" width="2" height="1" rx="0.5" fill={color} fillOpacity="0.3" />
      <rect x="19" y="5" width="2" height="1" rx="0.5" fill={color} fillOpacity="0.3" />
      <rect x="19" y="18" width="2" height="1" rx="0.5" fill={color} fillOpacity="0.3" />
    </svg>
  );
}

// ============ ENHANCED TOOL ICONS ============

export function TrendlinePro({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="trendGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Line with gradient */}
      <line x1="3" y1="19" x2="21" y2="5" stroke="url(#trendGrad)" strokeWidth="2.5" strokeLinecap="round" />
      {/* Start anchor */}
      <circle cx="3" cy="19" r="3" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="3" cy="19" r="1" fill={color} />
      {/* End anchor */}
      <circle cx="21" cy="5" r="3" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="21" cy="5" r="1" fill={color} />
      {/* Extension hint */}
      <line x1="21" y1="5" x2="24" y2="2" stroke={color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}

export function HorizontalLinePro({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Main line */}
      <line x1="1" y1="12" x2="23" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Price tag left */}
      <rect x="2" y="8" width="6" height="8" rx="1" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" />
      <line x1="4" y1="10" x2="6" y2="10" stroke={color} strokeWidth="1" />
      <line x1="4" y1="12" x2="6" y2="12" stroke={color} strokeWidth="1" />
      <line x1="4" y1="14" x2="5" y2="14" stroke={color} strokeWidth="1" />
      {/* Extend arrows */}
      <path d="M20 10L22 12L20 14" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RectanglePro({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="rectFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Rectangle with fill */}
      <rect x="4" y="6" width="16" height="12" rx="1" fill="url(#rectFill)" stroke={color} strokeWidth="1.5" />
      {/* Corner handles */}
      <circle cx="4" cy="6" r="2.5" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      <circle cx="20" cy="6" r="2.5" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      <circle cx="4" cy="18" r="2.5" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      <circle cx="20" cy="18" r="2.5" fill="#1a1a1a" stroke={color} strokeWidth="1.5" />
      {/* Center handle */}
      <circle cx="12" cy="12" r="1.5" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

export function FibonacciPro({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <defs>
        <linearGradient id="fibFill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.2" />
          <stop offset="50%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect x="2" y="2" width="20" height="20" rx="1" fill="url(#fibFill)" />
      {/* Fibonacci levels */}
      <line x1="3" y1="3" x2="21" y2="3" stroke={color} strokeWidth="1" strokeOpacity="0.3" />
      <line x1="3" y1="6" x2="21" y2="6" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="3" y1="12" x2="21" y2="12" stroke={color} strokeWidth="2" />
      <line x1="3" y1="15" x2="21" y2="15" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="3" y1="18" x2="21" y2="18" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.5" />
      <line x1="3" y1="21" x2="21" y2="21" stroke={color} strokeWidth="1" strokeOpacity="0.3" />
      {/* Level labels hint */}
      <text x="22" y="12.5" fontSize="4" fill={color} fillOpacity="0.5">0.5</text>
      <text x="22" y="9.5" fontSize="4" fill="#fbbf24" fillOpacity="0.5">0.618</text>
    </svg>
  );
}

// ============ MISSION ICONS - SENZOUKRIA STYLE ============

// Trader Actif - Live trading screen with pulse
export function MissionTraderIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-screen`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`${id}-pulse`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
          <stop offset="50%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Monitor frame */}
      <rect x="4" y="6" width="40" height="30" rx="3" fill={`url(#${id}-screen)`} stroke="#22c55e" strokeWidth="2" />
      {/* Screen inner */}
      <rect x="7" y="9" width="34" height="24" rx="1" fill="#050505" />
      {/* Grid lines */}
      <line x1="7" y1="15" x2="41" y2="15" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="7" y1="21" x2="41" y2="21" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="7" y1="27" x2="41" y2="27" stroke="#22c55e" strokeWidth="0.5" strokeOpacity="0.2" />
      {/* Candlesticks */}
      <rect x="11" y="16" width="3" height="8" fill="#22c55e" />
      <line x1="12.5" y1="13" x2="12.5" y2="27" stroke="#22c55e" strokeWidth="1" />
      <rect x="17" y="19" width="3" height="5" fill="#ef4444" />
      <line x1="18.5" y1="17" x2="18.5" y2="26" stroke="#ef4444" strokeWidth="1" />
      <rect x="23" y="14" width="3" height="9" fill="#22c55e" />
      <line x1="24.5" y1="11" x2="24.5" y2="25" stroke="#22c55e" strokeWidth="1" />
      <rect x="29" y="12" width="3" height="7" fill="#22c55e" />
      <line x1="30.5" y1="10" x2="30.5" y2="22" stroke="#22c55e" strokeWidth="1" />
      <rect x="35" y="15" width="3" height="4" fill="#ef4444" />
      <line x1="36.5" y1="13" x2="36.5" y2="21" stroke="#ef4444" strokeWidth="1" />
      {/* Live pulse indicator */}
      <circle cx="39" cy="11" r="2" fill="#ef4444" filter={`url(#${id}-glow)`}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
      </circle>
      <text x="33" y="12" fontSize="4" fill="#ef4444" fontWeight="bold">LIVE</text>
      {/* Monitor stand */}
      <path d="M20 36V40H28V36" stroke="#22c55e" strokeWidth="2" fill="none" />
      <line x1="16" y1="42" x2="32" y2="42" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      {/* Activity waves */}
      <path d="M2 21L6 21" stroke={`url(#${id}-pulse)`} strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M42 21L46 21" stroke={`url(#${id}-pulse)`} strokeWidth="2" strokeLinecap="round">
        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" begin="1s" />
      </path>
    </svg>
  );
}

// Maître Footprint - Orderflow/footprint visualization
export function MissionFootprintIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-buy`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <linearGradient id={`${id}-sell`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <filter id={`${id}-shadow`}>
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#22c55e" floodOpacity="0.3" />
        </filter>
      </defs>
      {/* Background grid */}
      <rect x="4" y="4" width="40" height="40" rx="4" fill="#0a0a0a" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.3" />
      {/* Footprint cells - Row 1 */}
      <rect x="7" y="7" width="16" height="8" rx="1" fill={`url(#${id}-buy)`} fillOpacity="0.8" />
      <text x="15" y="13" fontSize="5" fill="#050505" textAnchor="middle" fontWeight="bold">1.2K</text>
      <rect x="25" y="7" width="16" height="8" rx="1" fill={`url(#${id}-sell)`} fillOpacity="0.5" />
      <text x="33" y="13" fontSize="5" fill="#fff" textAnchor="middle" fontWeight="bold">450</text>
      {/* Footprint cells - Row 2 */}
      <rect x="7" y="17" width="16" height="8" rx="1" fill={`url(#${id}-buy)`} fillOpacity="0.6" />
      <text x="15" y="23" fontSize="5" fill="#050505" textAnchor="middle" fontWeight="bold">890</text>
      <rect x="25" y="17" width="16" height="8" rx="1" fill={`url(#${id}-sell)`} fillOpacity="0.9" />
      <text x="33" y="23" fontSize="5" fill="#fff" textAnchor="middle" fontWeight="bold">2.1K</text>
      {/* Footprint cells - Row 3 */}
      <rect x="7" y="27" width="16" height="8" rx="1" fill={`url(#${id}-buy)`} fillOpacity="0.4" />
      <text x="15" y="33" fontSize="5" fill="#fff" textAnchor="middle" fontWeight="bold">320</text>
      <rect x="25" y="27" width="16" height="8" rx="1" fill={`url(#${id}-sell)`} fillOpacity="0.7" />
      <text x="33" y="33" fontSize="5" fill="#fff" textAnchor="middle" fontWeight="bold">1.5K</text>
      {/* POC indicator */}
      <path d="M3 21L7 21" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      <path d="M41 21L45 21" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
      {/* Delta indicator */}
      <rect x="7" y="37" width="34" height="6" rx="1" fill="#050505" stroke="#22c55e" strokeWidth="0.5" />
      <rect x="7" y="37" width="22" height="6" rx="1" fill={`url(#${id}-buy)`} fillOpacity="0.6" />
      <text x="24" y="42" fontSize="4" fill="#fff" textAnchor="middle" fontWeight="bold">Δ +1.2K</text>
      {/* Master crown */}
      <path d="M20 1L22 4L24 1L26 4L28 1L26 6H22L20 1Z" fill="#fbbf24" filter={`url(#${id}-shadow)`} />
    </svg>
  );
}

// Artiste du Trading - Drawing tools/pen artistic
export function MissionArtistIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-canvas`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1a2e" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={`${id}-pencil`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      {/* Canvas/Chart background */}
      <rect x="4" y="8" width="32" height="32" rx="2" fill={`url(#${id}-canvas)`} stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.5" />
      {/* Grid */}
      <line x1="4" y1="18" x2="36" y2="18" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="4" y1="28" x2="36" y2="28" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="14" y1="8" x2="14" y2="40" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="26" y1="8" x2="26" y2="40" stroke="#3b82f6" strokeWidth="0.5" strokeOpacity="0.2" />
      {/* Drawn trendline */}
      <line x1="8" y1="34" x2="32" y2="14" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="34" r="3" fill="#22c55e" fillOpacity="0.3" stroke="#22c55e" strokeWidth="1" />
      <circle cx="32" cy="14" r="3" fill="#22c55e" fillOpacity="0.3" stroke="#22c55e" strokeWidth="1" />
      {/* Drawn horizontal line */}
      <line x1="6" y1="24" x2="34" y2="24" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 2" />
      {/* Fibonacci arc hint */}
      <path d="M10 36 Q20 20 30 36" stroke="#a855f7" strokeWidth="1.5" fill="none" strokeOpacity="0.6" />
      {/* Artist pencil */}
      <g transform="translate(28, 2) rotate(45)">
        <rect x="0" y="0" width="6" height="24" rx="1" fill={`url(#${id}-pencil)`} />
        <path d="M0 24L3 30L6 24Z" fill="#fde047" />
        <rect x="0" y="0" width="6" height="4" rx="1" fill="#ec4899" />
        <rect x="1" y="5" width="4" height="2" fill="#fbbf24" fillOpacity="0.5" />
      </g>
      {/* Sparkles for creativity */}
      <path d="M42 30L43 32L45 33L43 34L42 36L41 34L39 33L41 32L42 30Z" fill="#fbbf24">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
      </path>
      <path d="M6 5L6.5 6.5L8 7L6.5 7.5L6 9L5.5 7.5L4 7L5.5 6.5L6 5Z" fill="#22c55e">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

// Explorateur - Timeframe/zoom/discovery
export function MissionExplorerIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-lens`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#0891b2" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={`${id}-frame`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Magnifying glass */}
      <circle cx="20" cy="20" r="14" fill={`url(#${id}-lens)`} stroke={`url(#${id}-frame)`} strokeWidth="3" filter={`url(#${id}-glow)`} />
      <circle cx="20" cy="20" r="10" stroke="#06b6d4" strokeWidth="1" strokeOpacity="0.3" fill="none" />
      {/* Handle */}
      <line x1="31" y1="31" x2="44" y2="44" stroke={`url(#${id}-frame)`} strokeWidth="5" strokeLinecap="round" />
      <line x1="31" y1="31" x2="44" y2="44" stroke="#0e7490" strokeWidth="3" strokeLinecap="round" />
      {/* Timeframe inside lens */}
      <text x="20" y="17" fontSize="6" fill="#22d3ee" textAnchor="middle" fontWeight="bold">1H</text>
      <text x="14" y="23" fontSize="4" fill="#06b6d4" textAnchor="middle">4H</text>
      <text x="26" y="23" fontSize="4" fill="#06b6d4" textAnchor="middle">1D</text>
      <text x="20" y="28" fontSize="3" fill="#06b6d4" textAnchor="middle" fillOpacity="0.6">1W</text>
      {/* Chart mini preview */}
      <path d="M11 22L14 20L17 21L20 18L23 19L26 17L29 20" stroke="#22c55e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Discovery sparkles */}
      <path d="M38 8L39 10L41 11L39 12L38 14L37 12L35 11L37 10L38 8Z" fill="#fbbf24">
        <animate attributeName="opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite" />
      </path>
      <path d="M8 38L8.5 39.5L10 40L8.5 40.5L8 42L7.5 40.5L6 40L7.5 39.5L8 38Z" fill="#22d3ee">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite" />
      </path>
      {/* Compass direction hints */}
      <path d="M20 8L21 10L20 9L19 10L20 8Z" fill="#06b6d4" fillOpacity="0.5" />
    </svg>
  );
}

// Veilleur de Marché - Market surveillance eye
export function MissionWatcherIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-iris`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={`${id}-outer`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`}>
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#a855f7" floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Glow background */}
      <circle cx="24" cy="24" r="22" fill={`url(#${id}-glow)`} />
      {/* Eye shape */}
      <path d="M4 24C4 24 12 10 24 10C36 10 44 24 44 24C44 24 36 38 24 38C12 38 4 24 4 24Z"
            fill="#0a0a0a" stroke={`url(#${id}-outer)`} strokeWidth="2" filter={`url(#${id}-shadow)`} />
      {/* Iris */}
      <circle cx="24" cy="24" r="10" fill={`url(#${id}-iris)`} />
      <circle cx="24" cy="24" r="7" stroke="#c4b5fd" strokeWidth="1" fill="none" strokeOpacity="0.5" />
      {/* Pupil */}
      <circle cx="24" cy="24" r="4" fill="#0a0a0a" />
      {/* Light reflection */}
      <circle cx="27" cy="21" r="2" fill="#fff" fillOpacity="0.8" />
      <circle cx="21" cy="27" r="1" fill="#fff" fillOpacity="0.4" />
      {/* Data streams (market data) */}
      <g opacity="0.7">
        <path d="M8 24L10 22L12 24L14 20" stroke="#22c55e" strokeWidth="1" fill="none" strokeLinecap="round">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M34 24L36 26L38 23L40 25" stroke="#ef4444" strokeWidth="1" fill="none" strokeLinecap="round">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" begin="0.5s" />
        </path>
      </g>
      {/* Scanning effect */}
      <line x1="24" y1="10" x2="24" y2="14" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5">
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
      </line>
      <line x1="24" y1="34" x2="24" y2="38" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5">
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" begin="1.5s" />
      </line>
      {/* Symbol indicators */}
      <text x="10" y="8" fontSize="4" fill="#22c55e" fontFamily="monospace">BTC</text>
      <text x="34" y="8" fontSize="4" fill="#fbbf24" fontFamily="monospace">ETH</text>
      <text x="10" y="44" fontSize="4" fill="#ef4444" fontFamily="monospace">SOL</text>
      <text x="34" y="44" fontSize="4" fill="#06b6d4" fontFamily="monospace">SPY</text>
    </svg>
  );
}

// Fidélité - Loyalty trophy/crown
export function MissionLoyaltyIcon({ size = 32, className = '' }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="30%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#fbbf24" floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Trophy cup */}
      <path d="M14 10H34V18C34 26 30 32 24 32C18 32 14 26 14 18V10Z"
            fill={`url(#${id}-gold)`} filter={`url(#${id}-glow)`} />
      {/* Trophy rim */}
      <rect x="12" y="8" width="24" height="4" rx="2" fill={`url(#${id}-gold)`} />
      {/* Handles */}
      <path d="M14 14H10C8 14 6 16 6 18C6 22 8 24 12 24H14" stroke={`url(#${id}-gold)`} strokeWidth="3" fill="none" />
      <path d="M34 14H38C40 14 42 16 42 18C42 22 40 24 36 24H34" stroke={`url(#${id}-gold)`} strokeWidth="3" fill="none" />
      {/* Shine effect */}
      <ellipse cx="19" cy="16" rx="4" ry="6" fill={`url(#${id}-shine)`} />
      {/* Base/pedestal */}
      <rect x="18" y="32" width="12" height="4" fill={`url(#${id}-gold)`} />
      <rect x="16" y="36" width="16" height="3" rx="1" fill={`url(#${id}-gold)`} />
      <rect x="14" y="39" width="20" height="4" rx="1" fill={`url(#${id}-gold)`} />
      {/* 7 day streak indicator - stars */}
      <g transform="translate(24, 20)">
        <path d="M0 -6L1.5 -2L6 -2L2.5 1L4 5L0 2L-4 5L-2.5 1L-6 -2L-1.5 -2L0 -6Z" fill="#fff" fillOpacity="0.9" />
      </g>
      {/* Day indicators around trophy */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <circle
          key={i}
          cx={8 + i * 5}
          cy="46"
          r="2"
          fill={i < 7 ? '#22c55e' : '#374151'}
          stroke={i < 7 ? '#4ade80' : '#52525b'}
          strokeWidth="0.5"
        />
      ))}
      {/* Crown on top */}
      <path d="M18 6L20 8L22 4L24 8L26 4L28 8L30 6L29 10H19L18 6Z" fill="#fbbf24" />
      {/* Sparkles */}
      <path d="M6 8L7 10L9 11L7 12L6 14L5 12L3 11L5 10L6 8Z" fill="#fde047">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
      </path>
      <path d="M42 8L43 10L45 11L43 12L42 14L41 12L39 11L41 10L42 8Z" fill="#fde047">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

// ============ BROKER ICONS ============

export function RithmicIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* "R" letterform - bold, angular, tech feel */}
      <rect x="3" y="2" width="18" height="20" rx="3" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      <path d="M8 18V6H13C14.5 6 16 7 16 9C16 11 14.5 12 13 12H10" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12L16 18" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />
      {/* Speed lines */}
      <line x1="5" y1="10" x2="7" y2="10" stroke={color} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="4" y1="14" x2="7" y2="14" stroke={color} strokeWidth="0.8" strokeOpacity="0.3" />
    </svg>
  );
}

export function InteractiveBrokersIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* IB monogram */}
      <rect x="2" y="2" width="20" height="20" rx="4" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      {/* I */}
      <rect x="6" y="6" width="3" height="12" rx="0.5" fill="#dc2626" />
      {/* B */}
      <path d="M12 6H15.5C16.9 6 18 7 18 8.5C18 9.5 17.5 10.2 16.5 10.5C17.5 10.8 18 11.5 18 12.5C18 14.2 16.8 15 15.5 15H12C11.5 15 11 14.5 11 14V7C11 6.4 11.5 6 12 6Z" fill="#dc2626" />
      {/* B cutouts */}
      <rect x="13" y="7.5" width="2.5" height="2" rx="0.8" fill="var(--background, #060a08)" />
      <rect x="13" y="11.5" width="2.5" height="2" rx="0.8" fill="var(--background, #060a08)" />
      {/* Bottom bar */}
      <rect x="6" y="17" width="12" height="1.5" rx="0.5" fill="#dc2626" fillOpacity="0.5" />
    </svg>
  );
}

export function TradovateIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Hexagonal frame */}
      <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      {/* T letterform */}
      <line x1="7" y1="8" x2="17" y2="8" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="8" x2="12" y2="18" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
      {/* Arrow up accent */}
      <path d="M16 14L18 12L16 10" stroke="#6366f1" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function CQGIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Circle frame */}
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      {/* Chart bars - data visualization */}
      <rect x="6" y="13" width="2" height="5" rx="0.5" fill="#f59e0b" />
      <rect x="9" y="10" width="2" height="8" rx="0.5" fill="#f59e0b" />
      <rect x="12" y="7" width="2" height="11" rx="0.5" fill="#f59e0b" />
      <rect x="15" y="11" width="2" height="7" rx="0.5" fill="#f59e0b" />
      {/* Crosshair accent */}
      <circle cx="12" cy="12" r="3" stroke="#f59e0b" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 2" />
    </svg>
  );
}

export function NinjaTraderIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Shield shape */}
      <path d="M12 2L20 6V13C20 17.4 16.4 21 12 22C7.6 21 4 17.4 4 13V6L12 2Z" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" fill={color} fillOpacity="0.04" />
      {/* N letterform */}
      <path d="M8 17V8L16 17V8" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BinanceIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Diamond center */}
      <rect x="10" y="10" width="4" height="4" rx="0.5" transform="rotate(45 12 12)" fill="#f0b90b" />
      {/* Top diamond */}
      <rect x="10" y="4" width="4" height="4" rx="0.5" transform="rotate(45 12 6)" fill="#f0b90b" />
      {/* Bottom diamond */}
      <rect x="10" y="16" width="4" height="4" rx="0.5" transform="rotate(45 12 18)" fill="#f0b90b" />
      {/* Left diamond */}
      <rect x="4" y="10" width="4" height="4" rx="0.5" transform="rotate(45 6 12)" fill="#f0b90b" />
      {/* Right diamond */}
      <rect x="16" y="10" width="4" height="4" rx="0.5" transform="rotate(45 18 12)" fill="#f0b90b" />
    </svg>
  );
}

export function BybitIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Rounded square */}
      <rect x="2" y="2" width="20" height="20" rx="5" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      {/* B stylized - two stacked parallelograms */}
      <path d="M7 6H14L12 11H7V6Z" fill="#f7a600" />
      <path d="M7 13H12L14 18H7V13Z" fill="#f7a600" />
      {/* Accent line */}
      <line x1="15" y1="8" x2="17" y2="8" stroke="#f7a600" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="15" y1="16" x2="17" y2="16" stroke="#f7a600" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  );
}

export function DeribitIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* D shape */}
      <path d="M6 4H14C18.4 4 22 7.6 22 12C22 16.4 18.4 20 14 20H6V4Z" stroke="#22d3ee" strokeWidth="2" fill="#22d3ee" fillOpacity="0.1" />
      {/* Inner arc */}
      <path d="M10 8H13C15.2 8 17 9.8 17 12C17 14.2 15.2 16 13 16H10V8Z" fill="#22d3ee" fillOpacity="0.3" />
      {/* Vertical bar */}
      <line x1="6" y1="3" x2="6" y2="21" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DxFeedIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      <text x="5" y="17" fill="#ff6f00" fontSize="12" fontWeight="bold" fontFamily="monospace">dX</text>
    </svg>
  );
}

export function AMPIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="4" stroke={color} strokeWidth="1.2" strokeOpacity="0.3" />
      <path d="M6 17L10 7L14 17" stroke="#00897b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7.5" y1="14" x2="12.5" y2="14" stroke="#00897b" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 7V17M16 7L19 11M16 7L13 11" stroke="#00897b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Account page icons
export function UserIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21C4 17 7.6 14 12 14C16.4 14 20 17 20 21" />
    </svg>
  );
}

export function ShieldIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2L20 6V12C20 17 16.4 21 12 22C7.6 21 4 17 4 12V6L12 2Z" />
      <path d="M9 12L11 14L15 10" />
    </svg>
  );
}

export function LinkIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className={className}>
      <path d="M10 14L14 10" />
      <path d="M15 9L17 7C18.7 5.3 18.7 2.7 17 1C15.3 -0.7 12.7 -0.7 11 1L9 3" />
      <path d="M9 15L7 17C5.3 18.7 5.3 21.3 7 23C8.7 24.7 11.3 24.7 13 23L15 21" />
    </svg>
  );
}

export function SlidersIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className={className}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="var(--background, #060a08)" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="var(--background, #060a08)" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="7" cy="18" r="2" fill="var(--background, #060a08)" />
    </svg>
  );
}

export function BellIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className={className}>
      <path d="M18 8C18 4.7 15.3 2 12 2C8.7 2 6 4.7 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" />
      <path d="M13.7 21C13.5 21.4 13 21.7 12.5 21.9C11.5 22.2 10.5 21.8 10.1 21" />
    </svg>
  );
}

export function DatabaseIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" className={className}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5V19C4 20.7 7.6 22 12 22C16.4 22 20 20.7 20 19V5" />
      <path d="M4 12C4 13.7 7.6 15 12 15C16.4 15 20 13.7 20 12" />
    </svg>
  );
}

export function KeyIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="8" cy="15" r="5" />
      <path d="M12 11L21 2" />
      <path d="M18 2H21V5" />
      <path d="M16 7L18 5" />
    </svg>
  );
}

export function GlobeIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12H22" />
      <path d="M12 2C14.5 4.7 16 8.2 16 12C16 15.8 14.5 19.3 12 22C9.5 19.3 8 15.8 8 12C8 8.2 9.5 4.7 12 2Z" />
    </svg>
  );
}

export function PaletteIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" className={className}>
      <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C12.8 22 13.5 21.3 13.5 20.5C13.5 20.1 13.4 19.8 13.1 19.5C12.9 19.2 12.8 18.9 12.8 18.5C12.8 17.7 13.4 17 14.3 17H16C19.3 17 22 14.3 22 11C22 6 17.5 2 12 2Z" />
      <circle cx="7.5" cy="11.5" r="1.5" fill="#e04040" />
      <circle cx="10" cy="7.5" r="1.5" fill="#f59e0b" />
      <circle cx="15" cy="7.5" r="1.5" fill="#7ed321" />
      <circle cx="17.5" cy="11.5" r="1.5" fill="#22d3ee" />
    </svg>
  );
}

export function LogOutIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5C4.4 21 4 20.6 4 20V4C4 3.4 4.4 3 5 3H9" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ============ SOCIAL MEDIA ICONS ============

export function TikTokIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.32-1.1 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.04-.1z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 20, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function BiasIcon({ size = 18, className = '', color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      {/* Crosshair target */}
      <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
      <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill={color} />
      {/* Directional arrows */}
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Bias indicator */}
      <path d="M17 7l-3 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}
