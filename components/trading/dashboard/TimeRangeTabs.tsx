'use client';

export type TimeRange = 'today' | 'week' | 'month' | 'all';

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week',  label: '7D'    },
  { value: 'month', label: '30D'   },
  { value: 'all',   label: 'All'   },
];

interface TimeRangeTabsProps {
  value:    TimeRange;
  onChange: (v: TimeRange) => void;
}

export default function TimeRangeTabs({ value, onChange }: TimeRangeTabsProps) {
  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5"
      style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
    >
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
          style={{
            background: value === opt.value ? 'var(--surface)' : 'transparent',
            color:      value === opt.value ? 'var(--text-primary)' : 'var(--text-muted)',
            boxShadow:  value === opt.value ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
