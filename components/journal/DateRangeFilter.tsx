'use client';

import { useJournalStore } from '@/stores/useJournalStore';
import Segment from '@/components/ui/Segment';

export default function DateRangeFilter() {
  const { dashboardDateRange, setDashboardDateRange } = useJournalStore();

  const presets = [
    { label: 'All Time', from: null, to: null },
    { label: '7D', from: daysAgo(7), to: null },
    { label: '30D', from: daysAgo(30), to: null },
    { label: '90D', from: daysAgo(90), to: null },
    { label: 'YTD', from: `${new Date().getFullYear()}-01-01`, to: null },
  ];

  const isActive = (p: typeof presets[0]) =>
    dashboardDateRange.from === p.from && dashboardDateRange.to === p.to;

  // Active preset id for the segmented control (label is the stable id).
  // Falls back to '' (no segment highlighted) when a manual date range is set.
  const activePreset = presets.find(isActive)?.label ?? '';

  const inputStyle = 'px-2.5 py-1 rounded-lg text-xs bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors';

  return (
    <div className="flex items-center gap-2">
      <Segment
        options={presets.map((p) => ({ id: p.label, label: p.label }))}
        value={activePreset}
        onChange={(label) => {
          const p = presets.find((x) => x.label === label);
          if (p) setDashboardDateRange({ from: p.from, to: p.to });
        }}
        size="sm"
      />

      <div className="w-px h-4 bg-[var(--border)] mx-1" />

      <input
        type="date"
        value={dashboardDateRange.from || ''}
        onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, from: e.target.value || null })}
        className={inputStyle}
      />
      <span className="text-[var(--text-dimmed)] text-xs">to</span>
      <input
        type="date"
        value={dashboardDateRange.to || ''}
        onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, to: e.target.value || null })}
        className={inputStyle}
      />
    </div>
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
