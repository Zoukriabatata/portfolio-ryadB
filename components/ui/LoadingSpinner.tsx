'use client';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

export default function LoadingSpinner({
  size = 'md',
  message,
  className = '',
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-label={message || 'Loading'}>
      <div
        className={`${sizeClasses[size]} border-[var(--primary)] border-t-transparent rounded-full animate-spin`}
      />
      {message && <span className="text-[var(--text-muted)] text-sm">{message}</span>}
    </div>
  );
}
