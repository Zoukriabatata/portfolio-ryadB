'use client';

import { useRef } from 'react';
import { SimulationIcon } from '@/components/ui/Icons';
import type { TimeFilter } from '@/types/news';
import { useNewsSettingsStore, type NewsTimezone } from '@/stores/useNewsSettingsStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦',
  CHF: '🇨🇭', NZD: '🇳🇿', CNY: '🇨🇳',
};

const TZ_OPTIONS: { value: NewsTimezone; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'ET',    label: 'ET' },
  { value: 'UTC',   label: 'UTC' },
];

const TIME_OPTIONS: { value: TimeFilter; label: string; short: string }[] = [
  { value: 'today',    label: 'Today',    short: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow', short: 'Tmrw'  },
  { value: 'week',     label: 'This Week', short: 'Week' },
  { value: 'all',      label: 'All',      short: 'All'  },
];

const CURRENCIES = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];

const IMPACT_OPTIONS = [
  { value: 'All',    dot: null },
  { value: 'High',   dot: '#ef4444' },
  { value: 'Medium', dot: '#f59e0b' },
  { value: 'Low',    dot: '#eab308' },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface CalendarFiltersProps {
  time: TimeFilter;
  currency: string;
  impact: string;
  simulationMode: boolean;
  searchQuery: string;
  onTimeChange: (v: TimeFilter) => void;
  onCurrencyChange: (v: string) => void;
  onImpactChange: (v: string) => void;
  onSimulationToggle: () => void;
  onSearchChange: (v: string) => void;
  onSearchClear: () => void;
}

export function CalendarFilters({
  time,
  currency,
  impact,
  simulationMode,
  searchQuery,
  onTimeChange,
  onCurrencyChange,
  onImpactChange,
  onSimulationToggle,
  onSearchChange,
  onSearchClear,
}: CalendarFiltersProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const timezone = useNewsSettingsStore(s => s.timezone);
  const setTimezone = useNewsSettingsStore(s => s.setTimezone);
  const watchlistMode = useNewsSettingsStore(s => s.watchlistMode);
  const toggleWatchlistMode = useNewsSettingsStore(s => s.toggleWatchlistMode);
  const watchlistCount = useNewsSettingsStore(s => s.watchlist.length);

  return (
    <div
      className="flex-shrink-0 border-b border-[var(--border)]"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      {/* ── Row 1: Search + Period + Simulation ─────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">

        {/* Search */}
        <div
          className="flex items-center gap-1.5 flex-1 max-w-[220px] px-2.5 h-7 rounded-md"
          style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
          onClick={() => searchRef.current?.focus()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--text-dimmed)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search events…"
            className="flex-1 bg-transparent text-[11px] focus:outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />

        {/* Period tabs */}
        <div
          className="flex items-center rounded-md overflow-hidden flex-shrink-0"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}
        >
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onTimeChange(opt.value)}
              className="px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: time === opt.value ? 'var(--primary)' : 'transparent',
                color: time === opt.value ? '#fff' : 'var(--text-muted)',
              }}
            >
              {opt.short}
            </button>
          ))}
        </div>

        {/* Timezone selector */}
        <div
          className="flex items-center rounded-md overflow-hidden flex-shrink-0"
          style={{ border: '1px solid var(--border)', backgroundColor: 'var(--background)' }}
        >
          {TZ_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimezone(opt.value)}
              className="px-2 py-1 text-[10px] font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: timezone === opt.value ? 'var(--surface-elevated)' : 'transparent',
                color: timezone === opt.value ? 'var(--text-primary)' : 'var(--text-dimmed)',
              }}
              title={`Display times in ${opt.label}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Watchlist toggle */}
        {watchlistCount > 0 && (
          <button
            onClick={toggleWatchlistMode}
            className="flex items-center gap-1 px-2 h-7 rounded-md text-[10px] font-medium transition-all flex-shrink-0"
            style={{
              backgroundColor: watchlistMode ? 'var(--warning-bg)' : 'var(--background)',
              color: watchlistMode ? 'var(--warning)' : 'var(--text-dimmed)',
              border: `1px solid ${watchlistMode ? 'var(--warning)' : 'var(--border)'}`,
            }}
            title="Show starred events only"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill={watchlistMode ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            {watchlistCount}
          </button>
        )}

        {/* Simulation toggle */}
        <button
          onClick={onSimulationToggle}
          className="ml-auto flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-medium transition-all flex-shrink-0"
          style={{
            backgroundColor: simulationMode ? 'var(--primary)' : 'var(--background)',
            color: simulationMode ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${simulationMode ? 'var(--primary)' : 'var(--border)'}`,
          }}
          title="Toggle simulation mode"
        >
          <SimulationIcon size={12} color="currentColor" />
          <span className="hidden sm:block">Simulate</span>
          {/* Mini toggle pill */}
          <div
            className="relative h-3.5 w-6 rounded-full transition-colors flex-shrink-0"
            style={{ backgroundColor: simulationMode ? 'rgba(255,255,255,0.3)' : 'var(--border)' }}
          >
            <div
              className="absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all"
              style={{ left: simulationMode ? 11 : 2 }}
            />
          </div>
        </button>
      </div>

      {/* ── Row 2: Currency + Impact ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>

        {/* Currency */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {CURRENCIES.map(c => {
            const active = currency === c;
            return (
              <button
                key={c}
                onClick={() => onCurrencyChange(c)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? 'var(--primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--primary)' : 'transparent'}`,
                }}
              >
                {c !== 'All' && <span className="text-[11px]">{CURRENCY_FLAGS[c]}</span>}
                {c}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 flex-shrink-0 mx-1" style={{ backgroundColor: 'var(--border)' }} />

        {/* Impact */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {IMPACT_OPTIONS.map(opt => {
            const active = impact === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onImpactChange(opt.value)}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? 'var(--surface-elevated)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--border-light)' : 'transparent'}`,
                }}
              >
                {opt.dot && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.dot }} />
                )}
                {opt.value}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
