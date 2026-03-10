'use client';

import type { EconomicEvent } from '@/types/news';

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦',
  CHF: '🇨🇭', NZD: '🇳🇿', CNY: '🇨🇳',
};

const DEVIATION_CONFIG = {
  beat:   { label: '↑', color: 'var(--bull)',    bg: 'var(--bull-bg)'    },
  miss:   { label: '↓', color: 'var(--bear)',    bg: 'var(--bear-bg)'   },
  inline: { label: '=', color: 'var(--text-muted)', bg: 'var(--surface-elevated)' },
} as const;

interface SurpriseTapeProps {
  events: EconomicEvent[];
}

export function SurpriseTape({ events }: SurpriseTapeProps) {
  const now = Date.now();
  const released = events.filter(e => e.actual && new Date(e.time).getTime() < now);

  if (released.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 border-b border-[var(--border)] relative"
      style={{ height: 26, backgroundColor: 'var(--background)', overflow: 'hidden' }}
    >
      {/* Label */}
      <div
        className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-2 text-[9px] font-bold uppercase tracking-widest"
        style={{
          color: 'var(--text-dimmed)',
          backgroundColor: 'var(--background)',
          borderRight: '1px solid var(--border)',
        }}
      >
        Releases
      </div>

      {/* Scrollable tape */}
      <div
        className="absolute inset-0 overflow-x-auto"
        style={{ scrollbarWidth: 'none', left: 72 }}
      >
        <div className="flex items-center gap-4 h-full px-3" style={{ width: 'max-content' }}>
          {released.map(e => {
            const dev = e.deviation ? DEVIATION_CONFIG[e.deviation] : null;
            return (
              <div key={e.id} className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] leading-none">{CURRENCY_FLAGS[e.currency] ?? ''}</span>
                <span
                  className="text-[10px] font-medium max-w-[100px] truncate"
                  style={{ color: 'var(--text-muted)' }}
                  title={e.event}
                >
                  {e.event}
                </span>
                <span
                  className="text-[10px] font-bold font-mono tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {e.actual}
                </span>
                {dev && (
                  <span
                    className="text-[9px] font-bold px-1 py-px rounded"
                    style={{ color: dev.color, backgroundColor: dev.bg }}
                  >
                    {dev.label}
                  </span>
                )}
                <span style={{ color: 'var(--border)', fontSize: 10 }}>·</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fade-out gradient on right */}
      <div
        className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, var(--background))' }}
      />
    </div>
  );
}
