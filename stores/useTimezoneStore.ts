/**
 * TIMEZONE STORE
 *
 * Gère le fuseau horaire pour l'affichage du chart
 * Les données sont TOUJOURS stockées en UTC
 * Le timezone n'affecte que le RENDU
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Available timezones
export const TIMEZONES = {
  UTC: { id: 'UTC', label: 'UTC', offset: 0 },
  LOCAL: { id: 'LOCAL', label: 'Local', offset: null }, // null = use browser
  NEW_YORK: { id: 'America/New_York', label: 'New York', offset: -5 },
  LONDON: { id: 'Europe/London', label: 'London', offset: 0 },
  PARIS: { id: 'Europe/Paris', label: 'Paris', offset: 1 },
  TOKYO: { id: 'Asia/Tokyo', label: 'Tokyo', offset: 9 },
  SINGAPORE: { id: 'Asia/Singapore', label: 'Singapore', offset: 8 },
  SYDNEY: { id: 'Australia/Sydney', label: 'Sydney', offset: 11 },
} as const;

export type TimezoneId = keyof typeof TIMEZONES;

export interface TimezoneState {
  timezone: TimezoneId;
  setTimezone: (tz: TimezoneId) => void;

  // Helper to format a UTC timestamp in the selected timezone
  formatTime: (utcTimestamp: number, format?: 'time' | 'datetime' | 'full') => string;
  formatTimeShort: (utcTimestamp: number) => string;

  // Get timezone label for display
  getTimezoneLabel: () => string;
}

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set, get) => ({
      timezone: 'UTC',

      setTimezone: (tz) => set({ timezone: tz }),

      formatTime: (utcTimestamp: number, format = 'time') => {
        const { timezone } = get();
        const date = new Date(utcTimestamp * 1000);

        const options: Intl.DateTimeFormatOptions = {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        };

        if (format === 'datetime' || format === 'full') {
          options.day = '2-digit';
          options.month = '2-digit';
        }

        if (format === 'full') {
          options.year = 'numeric';
        }

        // Handle timezone
        if (timezone === 'LOCAL') {
          // Use browser's local timezone
          return date.toLocaleTimeString(undefined, options);
        } else if (timezone === 'UTC') {
          options.timeZone = 'UTC';
          return date.toLocaleTimeString('en-GB', options);
        } else {
          options.timeZone = TIMEZONES[timezone].id;
          return date.toLocaleTimeString('en-GB', options);
        }
      },

      formatTimeShort: (utcTimestamp: number) => {
        const { timezone } = get();
        const date = new Date(utcTimestamp * 1000);

        const options: Intl.DateTimeFormatOptions = {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        };

        if (timezone === 'LOCAL') {
          return date.toLocaleTimeString(undefined, options);
        } else if (timezone === 'UTC') {
          options.timeZone = 'UTC';
          return date.toLocaleTimeString('en-GB', options);
        } else {
          options.timeZone = TIMEZONES[timezone].id;
          return date.toLocaleTimeString('en-GB', options);
        }
      },

      getTimezoneLabel: () => {
        const { timezone } = get();
        return TIMEZONES[timezone].label;
      },
    }),
    {
      name: 'chart-timezone',
      skipHydration: true,
      partialize: (state) => ({ timezone: state.timezone }),
    }
  )
);

/**
 * Format a date for display with full context
 */
export function formatDateForTimezone(
  utcTimestamp: number,
  timezoneId: TimezoneId
): { date: string; time: string; full: string } {
  const date = new Date(utcTimestamp * 1000);

  const tzOption = timezoneId === 'LOCAL'
    ? undefined
    : timezoneId === 'UTC'
      ? 'UTC'
      : TIMEZONES[timezoneId].id;

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tzOption,
  };

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    timeZone: tzOption,
  };

  const fullOptions: Intl.DateTimeFormatOptions = {
    ...dateOptions,
    ...timeOptions,
  };

  return {
    time: date.toLocaleTimeString('en-GB', timeOptions),
    date: date.toLocaleDateString('en-GB', dateOptions),
    full: date.toLocaleString('en-GB', fullOptions),
  };
}
