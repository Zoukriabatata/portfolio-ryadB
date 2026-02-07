'use client';

import { HTMLAttributes } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'premium';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]',
  error: 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]',
  info: 'bg-[var(--info-bg)] text-[var(--info)] border-[var(--info)]',
  neutral: 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border)]',
  premium: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-400 border-amber-500/40',
};

export default function Badge({ variant = 'neutral', dot = false, children, className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5
        text-xs font-medium rounded-full border border-opacity-20
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full bg-current`} />
      )}
      {children}
    </span>
  );
}
