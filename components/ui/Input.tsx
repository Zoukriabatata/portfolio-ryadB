'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helper, error, iconLeft, iconRight, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const errorId = error && inputId ? `${inputId}-error` : undefined;
    const helperId = helper && !error && inputId ? `${inputId}-helper` : undefined;
    const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </label>
        )}
        <div className="relative">
          {iconLeft && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">
              {iconLeft}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`
              w-full px-3 py-2 text-sm
              bg-[var(--surface)] text-[var(--text-primary)]
              border rounded-[var(--radius-md,8px)]
              placeholder:text-[var(--text-dimmed)]
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]
              ${iconLeft ? 'pl-10' : ''}
              ${iconRight ? 'pr-10' : ''}
              ${error
                ? 'border-[var(--error)] focus:ring-[var(--error)]/30 focus:border-[var(--error)]'
                : 'border-[var(--border)] hover:border-[var(--border-light)]'
              }
              ${className}
            `}
            {...props}
          />
          {iconRight && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true">
              {iconRight}
            </span>
          )}
        </div>
        {error && <p id={errorId} className="text-xs text-[var(--error)]" role="alert">{error}</p>}
        {helper && !error && <p id={helperId} className="text-xs text-[var(--text-muted)]">{helper}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
