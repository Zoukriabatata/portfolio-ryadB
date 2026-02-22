'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export default function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseClass = `
    animate-shimmer rounded-[var(--radius-md,8px)]
    bg-[var(--surface-elevated)]
  `;

  const variantClass = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: '',
  }[variant];

  const style: React.CSSProperties = {
    width: width ?? '100%',
    height: height ?? (variant === 'text' ? '1rem' : variant === 'circular' ? width ?? '2.5rem' : '2.5rem'),
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} ${variantClass}`}
            style={{
              ...style,
              width: i === lines - 1 ? '75%' : style.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} ${variantClass} ${className}`}
      style={style}
    />
  );
}

// ─── Chart Skeleton ─────────────────────────────────────────
// Mimics a candlestick chart layout with fake candles + axis

export function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col h-full ${className}`} style={{ backgroundColor: 'var(--surface)' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <Skeleton width={80} height={14} />
        <Skeleton width={50} height={14} />
        <Skeleton width={50} height={14} />
        <div className="flex-1" />
        <Skeleton width={60} height={14} />
      </div>

      {/* Chart area */}
      <div className="flex-1 flex items-end gap-[3px] px-6 py-4 overflow-hidden">
        {/* Fake candlesticks */}
        {Array.from({ length: 40 }).map((_, i) => {
          const h = 20 + Math.abs(Math.sin(i * 0.7)) * 60;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0">
              <div
                className="w-[2px] animate-shimmer rounded-full"
                style={{
                  height: h * 0.3,
                  backgroundColor: 'var(--surface-elevated)',
                  animationDelay: `${i * 40}ms`,
                }}
              />
              <div
                className="w-full animate-shimmer rounded-sm"
                style={{
                  height: h,
                  backgroundColor: 'var(--surface-elevated)',
                  animationDelay: `${i * 40}ms`,
                  maxWidth: 8,
                }}
              />
              <div
                className="w-[2px] animate-shimmer rounded-full"
                style={{
                  height: h * 0.2,
                  backgroundColor: 'var(--surface-elevated)',
                  animationDelay: `${i * 40}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Volume area */}
      <div className="flex items-end gap-[3px] px-6 pb-3 h-[60px]">
        {Array.from({ length: 40 }).map((_, i) => {
          const h = 8 + Math.abs(Math.cos(i * 0.5)) * 35;
          return (
            <div
              key={i}
              className="flex-1 animate-shimmer rounded-t-sm"
              style={{
                height: h,
                backgroundColor: 'var(--surface-elevated)',
                animationDelay: `${i * 40}ms`,
                maxWidth: 8,
              }}
            />
          );
        })}
      </div>

      {/* Time axis */}
      <div className="flex justify-between px-6 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={40} height={10} />
        ))}
      </div>
    </div>
  );
}

// ─── Metrics Skeleton ───────────────────────────────────────
// Grid of metric cards with label + value placeholders

export function MetricsSkeleton({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg p-3 space-y-2"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <Skeleton width="60%" height={10} />
          <Skeleton width="80%" height={20} />
          <Skeleton width="40%" height={10} />
        </div>
      ))}
    </div>
  );
}

// ─── Table Skeleton ─────────────────────────────────────────
// Mimics a data table with header + rows

export function TableSkeleton({ rows = 8, cols = 5, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`rounded-lg overflow-hidden ${className}`} style={{ border: '1px solid var(--border)' }}>
      {/* Header */}
      <div
        className="flex gap-4 px-4 py-2.5"
        style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${60 + Math.random() * 40}%`} height={10} className="flex-1" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex gap-4 px-4 py-2"
          style={{
            borderBottom: row < rows - 1 ? '1px solid var(--border)' : undefined,
            animationDelay: `${row * 60}ms`,
          }}
        >
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} width="100%" height={12} className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────
// Reusable empty/error state with icon, title, description

interface EmptyStateProps {
  icon?: 'chart' | 'data' | 'search' | 'error' | 'connection';
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const EMPTY_ICONS: Record<string, React.ReactNode> = {
  chart: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 4 4-6" />
    </svg>
  ),
  data: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  search: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  error: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  connection: (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
      <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0122.56 9" />
      <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
      <path d="M8.53 16.11a6 6 0 016.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
};

export function EmptyState({ icon = 'data', title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center animate-fadeIn ${className}`}>
      <div className="mb-4 opacity-30" style={{ color: 'var(--text-dimmed)' }}>
        {EMPTY_ICONS[icon]}
      </div>
      <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-xs max-w-[280px]" style={{ color: 'var(--text-dimmed)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Widget Skeleton ────────────────────────────────────────
// Small skeleton for sidebar widgets (delta, tape, etc.)

export function WidgetSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg p-3 space-y-3 ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton width={80} height={12} />
        <Skeleton width={24} height={12} />
      </div>
      {/* Value */}
      <Skeleton width="60%" height={24} />
      {/* Mini bars */}
      <div className="flex gap-1 items-end h-8">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-shimmer rounded-t-sm"
            style={{
              height: 8 + Math.abs(Math.sin(i * 0.8)) * 20,
              backgroundColor: 'var(--surface-elevated)',
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
