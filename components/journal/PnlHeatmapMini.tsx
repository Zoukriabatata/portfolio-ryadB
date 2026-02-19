'use client';

import { getColorForPnl } from '@/lib/journal/chartUtils';

interface PnlHeatmapMiniProps {
  data: { date: string; cumulativePnl: number }[];
}

export default function PnlHeatmapMini({ data }: PnlHeatmapMiniProps) {
  if (data.length === 0) return null;

  // Group cumulative P&L into daily P&L
  const dailyPnl = new Map<string, number>();
  let prevPnl = 0;
  for (const d of data) {
    const existing = dailyPnl.get(d.date) || 0;
    const dailyChange = d.cumulativePnl - prevPnl;
    dailyPnl.set(d.date, existing + dailyChange);
    prevPnl = d.cumulativePnl;
  }

  const values = Array.from(dailyPnl.values());
  const maxAbsPnl = Math.max(...values.map(v => Math.abs(v)), 1);

  // Get recent 90 days grid
  const days = Array.from(dailyPnl.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-91);

  const cellSize = 12;
  const gap = 2;
  const cols = 13;
  const rows = 7;
  const svgWidth = cols * (cellSize + gap) + gap;
  const svgHeight = rows * (cellSize + gap) + gap + 16;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">P&L Heatmap (90d)</p>
      <svg width={svgWidth} height={svgHeight} className="mx-auto">
        {/* Day labels */}
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <text key={i} x={-2} y={i * (cellSize + gap) + cellSize / 2 + gap + 4} fontSize="8" fill="var(--text-dimmed)" textAnchor="end">
            {i % 2 === 1 ? d : ''}
          </text>
        ))}

        {days.map((entry, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          const x = gap + col * (cellSize + gap);
          const y = gap + row * (cellSize + gap);
          const pnl = entry[1];
          const color = getColorForPnl(pnl, maxAbsPnl);

          return (
            <rect
              key={entry[0]}
              x={x} y={y}
              width={cellSize} height={cellSize}
              rx="2" fill={color}
              className="transition-opacity hover:opacity-100"
              opacity="0.85"
            >
              <title>{`${entry[0]}: $${pnl.toFixed(0)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
