'use client';

import { useEffect, useState } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import type { EconomicEvent } from '@/types/news';
import { MarketImpactPanel } from './MarketImpactPanel';
import { EventDetailPanel } from './EventDetailPanel';
import { SimulationPanel } from './SimulationPanel';
import { useNewsSettingsStore } from '@/stores/useNewsSettingsStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦',
  CHF: '🇨🇭', NZD: '🇳🇿', CNY: '🇨🇳',
};

const IMPACT_CONFIG = {
  high:   { count: 3, color: 'var(--bear)',    bg: 'var(--bear-bg)',    label: 'HIGH' },
  medium: { count: 2, color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'MED'  },
  low:    { count: 1, color: 'var(--accent)',   bg: 'var(--surface-elevated)', label: 'LOW' },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string, tz: 'local' | 'ET' | 'UTC' = 'local') {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (tz === 'UTC') opts.timeZone = 'UTC';
  else if (tz === 'ET') opts.timeZone = 'America/New_York';
  return new Date(t).toLocaleTimeString('en-US', opts);
}
function isPast(t: string) { return new Date(t) < new Date(); }
function isSoon(t: string) {
  const d = new Date(t).getTime() - Date.now();
  return d > 0 && d < 60 * 60 * 1000;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** 3 dots indicator: filled = impact level, empty = grey */
function ImpactDots({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const { count, color } = IMPACT_CONFIG[impact];
  return (
    <div className="flex gap-0.5 items-center flex-shrink-0">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: 5, height: 5,
            backgroundColor: i < count ? color : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}

/** One data value: label + formatted value */
function DataCell({
  label,
  value,
  deviation,
  projected,
}: {
  label: string;
  value?: string;
  deviation?: 'beat' | 'miss' | 'inline';
  projected?: boolean;
}) {
  const color = projected
    ? 'var(--warning)'
    : deviation === 'beat'
      ? 'var(--bull)'
      : deviation === 'miss'
        ? 'var(--bear)'
        : value
          ? 'var(--text-primary)'
          : 'var(--text-dimmed)';

  return (
    <div className="text-center" style={{ minWidth: 44 }}>
      <div className="text-[8px] font-semibold uppercase tracking-wider leading-none mb-0.5" style={{ color: projected ? 'var(--warning)' : 'var(--text-dimmed)' }}>
        {projected ? 'PROJ' : label}
      </div>
      <div
        className="text-[11px] font-mono font-bold tabular-nums leading-none"
        style={{ color, fontStyle: projected ? 'italic' : 'normal', opacity: projected ? 0.85 : 1 }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

/** Deviation badge: BEAT / MISS / INLINE */
function DeviationBadge({ deviation }: { deviation: 'beat' | 'miss' | 'inline' }) {
  const config = {
    beat:   { label: '↑ BEAT', color: 'var(--bull)',    bg: 'var(--bull-bg)'    },
    miss:   { label: '↓ MISS', color: 'var(--bear)',    bg: 'var(--bear-bg)'   },
    inline: { label: '= INLINE', color: 'var(--text-muted)', bg: 'var(--surface-elevated)' },
  }[deviation];
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide flex-shrink-0"
      style={{ color: config.color, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}

/** Live countdown for events within 1 hour */
function Countdown({ targetTime }: { targetTime: string }) {
  const [text, setText] = useState('');
  const active = usePageActive();

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      if (diff <= 0) { setText('NOW'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setText(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime, active]);

  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold animate-pulse flex-shrink-0" style={{ color: 'var(--warning)', backgroundColor: 'var(--warning-bg)' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--warning)' }} />
      {text}
    </span>
  );
}

/** Expand chevron */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className="transition-transform duration-200 flex-shrink-0"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        color: 'var(--text-dimmed)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── Main EventCard ───────────────────────────────────────────────────────────

export function EventCard({
  event,
  simulationMode,
}: {
  event: EconomicEvent;
  simulationMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const past = isPast(event.time);
  const soon = isSoon(event.time);
  const future = !past;
  const { color, bg } = IMPACT_CONFIG[event.impact];

  const timezone = useNewsSettingsStore(s => s.timezone);
  const toggleStar = useNewsSettingsStore(s => s.toggleStar);
  const isStarred = useNewsSettingsStore(s => s.watchlist.includes(event.event));

  // Border color: left accent
  const borderColor = soon
    ? 'var(--warning)'
    : event.impact === 'high' && future
      ? 'var(--bear)'
      : past
        ? 'var(--border)'
        : 'var(--border-light)';

  return (
    <div
      className="rounded-lg overflow-hidden transition-all duration-150"
      style={{
        borderTop: `1px solid ${expanded ? 'var(--primary)' : borderColor}`,
        borderRight: `1px solid ${expanded ? 'var(--primary)' : borderColor}`,
        borderBottom: `1px solid ${expanded ? 'var(--primary)' : borderColor}`,
        borderLeft: `3px solid ${borderColor}`,
        backgroundColor: past && !expanded ? 'transparent' : 'var(--surface)',
        opacity: past && !expanded ? 0.65 : 1,
        boxShadow: soon ? `0 0 12px rgba(var(--warning-rgb, 245,158,11),0.12)` : undefined,
      }}
    >
      {/* ── Main row (always visible, clickable) ──────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Time */}
        <span
          className="text-[11px] font-mono font-semibold tabular-nums flex-shrink-0 w-11 text-right"
          style={{ color: soon ? 'var(--warning)' : past ? 'var(--text-dimmed)' : 'var(--text-primary)' }}
        >
          {formatTime(event.time, timezone)}
        </span>

        {/* Currency flag + code */}
        <div className="flex items-center gap-1 flex-shrink-0 w-16">
          <span className="text-sm leading-none">{CURRENCY_FLAGS[event.currency] ?? '🏳️'}</span>
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>
            {event.currency}
          </span>
        </div>

        {/* Impact dots */}
        <ImpactDots impact={event.impact} />

        {/* Event name */}
        <span
          className="flex-1 text-[12px] font-medium truncate min-w-0"
          style={{ color: past ? 'var(--text-muted)' : 'var(--text-primary)' }}
        >
          {event.event}
        </span>

        {/* Data cells: ACT / FCST / PREV */}
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          <DataCell
            label="ACT"
            value={event.actual ?? (simulationMode && event.projectedActual ? `~${event.projectedActual}` : undefined)}
            deviation={event.actual ? event.deviation : undefined}
            projected={!event.actual && simulationMode && !!event.projectedActual}
          />
          <DataCell label="FCST" value={event.forecast} />
          <DataCell label="PREV" value={event.previous} />
        </div>

        {/* Deviation badge (only when actual exists) */}
        {event.deviation && event.actual && (
          <div className="hidden md:block">
            <DeviationBadge deviation={event.deviation} />
          </div>
        )}

        {/* Countdown for soon events */}
        {soon && <Countdown targetTime={event.time} />}

        {/* High-impact upcoming pulse */}
        {!past && event.impact === 'high' && !soon && (
          <span
            className="hidden sm:flex w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: 'var(--bear)' }}
          />
        )}

        {/* Star / watchlist */}
        <button
          onClick={e => { e.stopPropagation(); toggleStar(event.event); }}
          className="flex-shrink-0 transition-colors"
          style={{ color: isStarred ? 'var(--warning)' : 'var(--border)' }}
          title={isStarred ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        {/* Expand chevron */}
        <Chevron open={expanded} />
      </div>

      {/* ── Mobile: data row (only visible on small screens) ─────────────── */}
      <div
        className="sm:hidden flex items-center gap-3 px-3 pb-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 ml-auto">
          <DataCell
            label="ACT"
            value={event.actual ?? (simulationMode && event.projectedActual ? `~${event.projectedActual}` : undefined)}
            deviation={event.actual ? event.deviation : undefined}
            projected={!event.actual && simulationMode && !!event.projectedActual}
          />
          <DataCell label="FCST" value={event.forecast} />
          <DataCell label="PREV" value={event.previous} />
          {event.deviation && event.actual && <DeviationBadge deviation={event.deviation} />}
        </div>
      </div>

      {/* ── Expanded content ──────────────────────────────────────────────── */}
      {expanded && (
        <div
          className="px-3 pb-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          {/* Simulation market impact (past events) */}
          {simulationMode && event.marketImpact && (
            <MarketImpactPanel impact={event.marketImpact} />
          )}

          {/* Event detail panel */}
          <EventDetailPanel event={event} />

          {/* Interactive simulation (future events in sim mode) */}
          {simulationMode && future && (
            <SimulationPanel event={event} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── TimelineEvent wrapper ────────────────────────────────────────────────────

export function TimelineEvent({
  event,
  simulationMode,
}: {
  event: EconomicEvent;
  index: number;
  simulationMode: boolean;
}) {
  return <EventCard event={event} simulationMode={simulationMode} />;
}
