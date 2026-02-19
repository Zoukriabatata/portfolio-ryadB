import type { MarketImpact } from '@/types/news';

const SENTIMENT_COLORS = {
  bullish: 'text-[var(--bull)]',
  bearish: 'text-[var(--bear)]',
  neutral: 'text-[var(--text-muted)]',
};

export function MarketImpactPanel({ impact }: { impact: MarketImpact }) {
  const isPositive = impact.priceChange.startsWith('+');
  const barWidth = Math.min(Math.abs(parseFloat(impact.priceChange)) * 20, 100);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]">
      <div className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-wider mb-2 font-semibold">
        Market Impact (BTC)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex flex-col items-center p-2 rounded-lg bg-[var(--surface-elevated)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-0.5">Price</span>
          <span className={`text-sm font-bold font-mono ${isPositive ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
            {impact.priceChange}
          </span>
          <div className="w-full h-1 rounded-full bg-[var(--surface)] mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full animate-bar-grow ${isPositive ? 'bg-[var(--bull)]' : 'bg-[var(--bear)]'}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center p-2 rounded-lg bg-[var(--surface-elevated)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-0.5">Volume</span>
          <span className="text-sm font-bold font-mono text-[var(--accent)]">
            {impact.volumeMultiplier}x
          </span>
          <div className="flex gap-0.5 mt-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={`w-1.5 rounded-sm ${i <= Math.round(impact.volumeMultiplier) ? 'bg-[var(--accent)]' : 'bg-[var(--surface)]'}`}
                style={{ height: `${4 + i * 2}px` }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center p-2 rounded-lg bg-[var(--surface-elevated)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-0.5">IV</span>
          <span className="text-sm font-bold font-mono text-[var(--primary)]">
            {impact.volatilityChange}
          </span>
        </div>

        <div className="flex flex-col items-center p-2 rounded-lg bg-[var(--surface-elevated)]">
          <span className="text-[10px] text-[var(--text-dimmed)] mb-0.5">Sentiment</span>
          <span className={`text-sm font-bold capitalize ${SENTIMENT_COLORS[impact.sentiment]}`}>
            {impact.sentiment}
          </span>
        </div>
      </div>
    </div>
  );
}
