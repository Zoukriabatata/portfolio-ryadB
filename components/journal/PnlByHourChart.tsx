'use client';

import { formatCurrency } from '@/lib/journal/chartUtils';

interface PnlByHourChartProps {
  data: { hour: number; pnl: number; count: number; winRate: number }[];
}

export default function PnlByHourChart({ data }: PnlByHourChartProps) {
  if (data.length === 0) return null;

  const maxAbsPnl = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  const svgHeight = 160;
  const barWidth = 20;
  const gap = 4;
  const svgWidth = Math.max(data.length * (barWidth + gap) + 40, 200);
  const midY = svgHeight / 2;
  const maxBarH = midY - 20;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3">P&L by Hour</p>
      <div className="overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="w-full">
          {/* Zero line */}
          <line x1="0" y1={midY} x2={svgWidth} y2={midY} stroke="rgba(128,128,128,0.2)" strokeWidth="1" />

          {data.map((d, i) => {
            const barH = (Math.abs(d.pnl) / maxAbsPnl) * maxBarH;
            const x = 20 + i * (barWidth + gap);
            const y = d.pnl >= 0 ? midY - barH : midY;
            const color = d.pnl >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';

            return (
              <g key={d.hour}>
                <rect
                  x={x} y={y}
                  width={barWidth} height={Math.max(barH, 1)}
                  rx="3" fill={color} opacity="0.7"
                  className="transition-opacity hover:opacity-100"
                >
                  <title>{`${d.hour}:00 — ${formatCurrency(d.pnl)} (${d.count} trades, ${d.winRate}% WR)`}</title>
                </rect>
                <text
                  x={x + barWidth / 2} y={svgHeight - 4}
                  textAnchor="middle" fontSize="9"
                  fill="var(--text-dimmed)"
                >
                  {d.hour}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
