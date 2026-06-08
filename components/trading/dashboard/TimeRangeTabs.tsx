'use client';

import Segment from '@/components/ui/Segment';

export type TimeRange = 'today' | 'week' | 'month' | 'all';

const OPTIONS: { id: TimeRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: '7D'    },
  { id: 'month', label: '30D'   },
  { id: 'all',   label: 'All'   },
];

interface TimeRangeTabsProps {
  value:    TimeRange;
  onChange: (v: TimeRange) => void;
}

export default function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  return <Segment options={OPTIONS} value={value} onChange={onChange} size="sm" />;
}
