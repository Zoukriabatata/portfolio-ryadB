'use client';

interface ChartSkeletonProps {
  className?: string;
}

export default function ChartSkeleton({ className = '' }: ChartSkeletonProps) {
  return (
    <div className={`w-full h-full flex flex-col ${className}`} style={{ backgroundColor: 'var(--background)' }}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="w-24 h-6 rounded skeleton-shimmer" />
        <div className="w-16 h-5 rounded skeleton-shimmer" />
        <div className="flex-1" />
        <div className="w-12 h-5 rounded skeleton-shimmer" />
        <div className="w-12 h-5 rounded skeleton-shimmer" />
      </div>

      {/* Chart area skeleton */}
      <div className="flex-1 relative p-4">
        {/* Y-axis labels */}
        <div className="absolute right-4 top-0 bottom-0 flex flex-col justify-between py-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-16 h-4 rounded skeleton-shimmer" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>

        {/* Candle sticks placeholder */}
        <div className="flex items-end justify-around h-full gap-1 pr-20">
          {[...Array(30)].map((_, i) => {
            const height = Math.random() * 60 + 20;
            return (
              <div
                key={i}
                className="flex-1 rounded-t skeleton-shimmer"
                style={{
                  height: `${height}%`,
                  animationDelay: `${i * 30}ms`,
                  minWidth: '2px',
                  maxWidth: '12px',
                }}
              />
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-4 right-20 flex justify-between">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-12 h-4 rounded skeleton-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>

      {/* Footer skeleton */}
      <div className="flex items-center gap-3 px-3 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="w-20 h-4 rounded skeleton-shimmer" />
        <div className="w-16 h-4 rounded skeleton-shimmer" />
        <div className="flex-1" />
        <div className="w-8 h-4 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}
