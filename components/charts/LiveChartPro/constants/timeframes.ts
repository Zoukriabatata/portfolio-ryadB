import type { TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';

export const TF_GROUPS = {
  seconds: [15, 30] as TimeframeSeconds[],
  minutes: [60, 180, 300, 900, 1800] as TimeframeSeconds[],
  hours: [3600, 14400] as TimeframeSeconds[],
  days: [86400] as TimeframeSeconds[],
};

export const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
};
