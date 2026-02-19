'use client';

import { DAY_LABELS, formatCurrency } from '@/lib/journal/chartUtils';

interface PnlByDayChartProps {
  data: { day: number; pnl: number; count: number }[];
}

export default function PnlByDayChart({ data }: PnlByDayChartProps) {
  if (data.length === 0) return null;

  const maxAbsPnl = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  const svgHeight = 160;
  const barWidth = 36;
  const gap = 8;
  const svgWidth = 7 * (barWidth + gap) + 40;
  const midY = svgHeight / 2;
  const maxBarH = midY - 20;

  // Fill in missing days
  const dayData = Array.from({ length: 7 }, (_, day) => {
    const found = data.find(d => d.day === day);
    return found || { day, pnl: 0, count: 0 };
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">P&L by Day of Week</p>
      <svg width={svgWidth} height={svgHeight} className="w-full">
        {/* Zero line */}
        <line x1="0" y1={midY} x2={svgWidth} y2={midY} stroke="rgba(128,128,128,0.2)" strokeWidth="1" />

        {dayData.map((d, i) => {
          const barH = (Math.abs(d.pnl) / maxAbsPnl) * maxBarH;
          const x = 20 + i * (barWidth + gap);
          const y = d.pnl >= 0 ? midY - barH : midY;
          const color = d.pnl >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';

          return (
            <g key={d.day}>
              <rect
                x={x} y={y}
                width={barWidth} height={Math.max(barH, 1)}
                rx="4" fill={color} opacity="0.7"
                className="transition-opacity hover:opacity-100"
              >
                <title>{`${DAY_LABELS[d.day]} — ${formatCurrency(d.pnl)} (${d.count} trades)`}</title>
              </rect>
              <text
                x={x + barWidth / 2} y={svgHeight - 4}
                textAnchor="middle" fontSize="10"
                fill="var(--text-dimmed)"
              >
                {DAY_LABELS[d.day]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
