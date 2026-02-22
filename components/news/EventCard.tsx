'use client';

import { useEffect, useState } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import type { EconomicEvent } from '@/types/news';
import { MarketImpactPanel } from './MarketImpactPanel';
import { EventDetailPanel } from './EventDetailPanel';
import { SimulationPanel } from './SimulationPanel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '\u{1F1FA}\u{1F1F8}', EUR: '\u{1F1EA}\u{1F1FA}', GBP: '\u{1F1EC}\u{1F1E7}',
  JPY: '\u{1F1EF}\u{1F1F5}', AUD: '\u{1F1E6}\u{1F1FA}', CAD: '\u{1F1E8}\u{1F1E6}',
  CHF: '\u{1F1E8}\u{1F1ED}', NZD: '\u{1F1F3}\u{1F1FF}', CNY: '\u{1F1E8}\u{1F1F3}',
};

const IMPACT_COLORS = { high: 'bg-[var(--bear)]', medium: 'bg-[var(--warning)]', low: 'bg-[var(--warning-light,#eab308)]' };
const IMPACT_BADGE = {
  high: 'bg-[var(--bear-bg)] text-[var(--bear)]',
  medium: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  low: 'bg-[var(--warning-bg)] text-[var(--warning-light,#eab308)]',
};

const DEVIATION_STYLES = {
  beat: { text: 'text-[var(--bull)]', bg: 'bg-[var(--bull-bg)]', label: 'Beat' },
  miss: { text: 'text-[var(--bear)]', bg: 'bg-[var(--bear-bg)]', label: 'Miss' },
  inline: { text: 'text-[var(--text-secondary)]', bg: 'bg-[var(--surface-elevated)]', label: 'Inline' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(timeStr: string) {
  return new Date(timeStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function isEventPast(timeStr: string) {
  return new Date(timeStr) < new Date();
}

function isEventSoon(timeStr: string) {
  const diff = new Date(timeStr).getTime() - Date.now();
  return diff > 0 && diff < 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DataPill({ label, value, className }: { label: string; value?: string; className: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono ${className}`}>
      <span className="text-[var(--text-dimmed)] text-[10px] uppercase tracking-wider font-sans">{label}</span>
      <span className="font-semibold">{value || '-'}</span>
    </div>
  );
}

function CountdownBadge({ targetTime }: { targetTime: string }) {
  const [remaining, setRemaining] = useState('');
  const isActive = usePageActive();

  useEffect(() => {
    if (!isActive) return;
    const update = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      if (diff <= 0) { setRemaining('NOW'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime, isActive]);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-[var(--warning)] bg-[var(--warning-bg)] animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
      {remaining}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expand chevron
// ---------------------------------------------------------------------------

function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className={`transition-transform duration-200 text-[var(--text-dimmed)] ${expanded ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

export function EventCard({
  event,
  index,
  simulationMode,
}: {
  event: EconomicEvent;
  index: number;
  simulationMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPast = isEventPast(event.time);
  const isSoon = isEventSoon(event.time);
  const isHigh = event.impact === 'high';
  const isFuture = !isPast;
  const stagger = Math.min(index + 1, 10);

  const actualColor = event.deviation === 'beat'
    ? 'text-[var(--bull)] bg-[var(--bull-bg)]'
    : event.deviation === 'miss'
      ? 'text-[var(--bear)] bg-[var(--bear-bg)]'
      : event.actual
        ? 'text-[var(--text-primary)] bg-[var(--surface-elevated)]'
        : 'text-[var(--text-dimmed)] bg-[var(--surface-elevated)]';

  return (
    <div
      className={`
        glass rounded-xl border-l-4 p-4 transition-all duration-200
        ${isHigh ? 'border-l-[var(--bear)]' : event.impact === 'medium' ? 'border-l-[var(--warning)]' : 'border-l-[var(--warning-light,#eab308)]'}
        animate-slideUp stagger-${stagger}
        ${isPast && !expanded ? 'opacity-50 hover:opacity-75' : isPast && expanded ? 'opacity-80' : 'card-hover'}
        ${isSoon ? 'ring-1 ring-[var(--warning)]/30 shadow-lg shadow-[var(--warning)]/10' : ''}
        ${isHigh && !isPast ? 'bg-gradient-to-r from-[var(--bear-bg)] to-transparent' : ''}
        ${expanded ? 'ring-1 ring-[var(--primary)]/20' : ''}
      `}
    >
      {/* Header — clickable */}
      <div
        className="flex items-center justify-between mb-3 gap-2 flex-wrap cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono font-semibold ${isSoon ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]'}`}>
            {formatTime(event.time)}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-xs">
            <span>{CURRENCY_FLAGS[event.currency] || '\u{1F3F3}\u{FE0F}'}</span>
            <span className="font-medium text-[var(--text-primary)]">{event.currency}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isSoon && <CountdownBadge targetTime={event.time} />}
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${IMPACT_BADGE[event.impact]} ${isHigh && !isPast ? 'animate-pulse' : ''}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${IMPACT_COLORS[event.impact]}`} />
            {event.impact}
          </span>
          <ExpandChevron expanded={expanded} />
        </div>
      </div>

      {/* Event name — clickable */}
      <h3
        className={`font-semibold mb-3 cursor-pointer ${isHigh ? 'text-base text-[var(--text-primary)]' : 'text-sm text-[var(--text-secondary)]'}`}
        onClick={() => setExpanded(!expanded)}
      >
        {event.event}
      </h3>

      {/* Data pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <DataPill label="Act" value={event.actual} className={actualColor} />
        <DataPill label="Fcst" value={event.forecast} className="text-[var(--text-secondary)] bg-[var(--surface-elevated)]" />
        <DataPill label="Prev" value={event.previous} className="text-[var(--text-muted)] bg-[var(--surface-elevated)]" />

        {simulationMode && event.deviation && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${DEVIATION_STYLES[event.deviation].bg} ${DEVIATION_STYLES[event.deviation].text}`}>
            {DEVIATION_STYLES[event.deviation].label}
          </span>
        )}
      </div>

      {/* Market Impact (simulation mode, past events) */}
      {simulationMode && event.marketImpact && (
        <MarketImpactPanel impact={event.marketImpact} />
      )}

      {/* Expanded: Event Detail Panel */}
      {expanded && (
        <EventDetailPanel event={event} />
      )}

      {/* Expanded + Simulation: Interactive Simulation for future events */}
      {expanded && simulationMode && isFuture && (
        <SimulationPanel event={event} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline wrapper — dot + card
// ---------------------------------------------------------------------------

export function TimelineEvent({
  event,
  index,
  simulationMode,
}: {
  event: EconomicEvent;
  index: number;
  simulationMode: boolean;
}) {
  const isPast = isEventPast(event.time);
  const isSoon = isEventSoon(event.time);
  const isHigh = event.impact === 'high';

  return (
    <div className="relative">
      {/* Timeline dot — larger for high impact */}
      <div className={`absolute -left-[27px] top-5 rounded-full border-2 transition-all duration-200 ${
        isHigh ? 'w-3 h-3 -left-[28px]' : 'w-2.5 h-2.5'
      } ${
        isSoon
          ? 'bg-[var(--warning)] border-[var(--warning)] shadow-md shadow-[var(--warning)]/50 animate-pulse'
          : isPast
            ? 'bg-[var(--surface-elevated)] border-[var(--border)]'
            : `${IMPACT_COLORS[event.impact]} border-[var(--surface)]`
      }`} />
      <EventCard event={event} index={index} simulationMode={simulationMode} />
    </div>
  );
}
