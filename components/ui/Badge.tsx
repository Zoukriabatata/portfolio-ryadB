'use client';

import { HTMLAttributes } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'premium';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  animated?: boolean;
  icon?: React.ReactNode;
  count?: number;
  onClose?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]',
  error: 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]',
  info: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info)]',
  neutral: 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border)]',
  premium: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-400 border-amber-500/40',
};

const pulseColors: Record<BadgeVariant, string> = {
  success: 'rgba(34, 197, 94, 0.4)',
  warning: 'rgba(245, 158, 11, 0.4)',
  error: 'rgba(239, 68, 68, 0.4)',
  info: 'rgba(59, 130, 246, 0.4)',
  neutral: 'rgba(148, 163, 184, 0.3)',
  premium: 'rgba(245, 158, 11, 0.4)',
};

export default function Badge({
  variant = 'neutral',
  dot = false,
  animated = false,
  icon,
  count,
  onClose,
  children,
  className = '',
  ...props
}: BadgeProps) {
  const displayText = count !== undefined
    ? count > 99 ? '99+' : String(count)
    : children;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5
        text-xs font-medium rounded-full border border-opacity-20
        transition-all duration-200
        ${animated ? 'badge-pulse badge-bounce' : ''}
        ${onClose ? 'pr-1.5' : ''}
        ${variantStyles[variant]}
        ${className}
      `}
      style={animated ? { '--badge-color': pulseColors[variant] } as React.CSSProperties : undefined}
      {...props}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current ${animated ? 'animate-pulse' : ''}`} />
      )}
      {icon && (
        <span className="flex-shrink-0 [&>svg]:w-3 [&>svg]:h-3">{icon}</span>
      )}
      {displayText}
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-current/10 transition-colors"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
}
