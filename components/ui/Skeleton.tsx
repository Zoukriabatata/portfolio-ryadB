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
