function SkeletonCard() {
  return (
    <div className="glass rounded-xl border-l-4 border-l-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-5 rounded skeleton" />
          <div className="w-20 h-6 rounded-full skeleton" />
        </div>
        <div className="w-16 h-5 rounded-full skeleton" />
      </div>
      <div className="w-48 h-5 rounded skeleton mb-3" />
      <div className="flex gap-2">
        <div className="w-20 h-7 rounded-lg skeleton" />
        <div className="w-20 h-7 rounded-lg skeleton" />
        <div className="w-20 h-7 rounded-lg skeleton" />
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fadeIn">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-3 h-3 rounded-full skeleton" />
        <div className="w-40 h-5 rounded skeleton" />
      </div>
      <div className="pl-8 space-y-3">
        {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}
