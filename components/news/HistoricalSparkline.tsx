import type { HistoricalPoint } from '@/lib/news/generateHistory';

const DEV_COLOR: Record<string, string> = {
  beat: 'var(--bull)',
  miss: 'var(--bear)',
  inline: 'var(--text-muted)',
};

export function HistoricalSparkline({ data }: { data: HistoricalPoint[] }) {
  if (data.length === 0) return null;

  const actuals = data.map(d => d.actual);
  const forecasts = data.map(d => d.forecast);
  const allVals = [...actuals, ...forecasts];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const W = 240;
  const H = 52;
  const GAP = 4;
  const barW = (W - GAP * (data.length - 1)) / data.length;

  function yOf(v: number) {
    return H - ((v - min) / range) * (H - 6) - 2;
  }

  return (
    <div>
      <svg width={W} height={H} style={{ overflow: 'visible', display: 'block' }}>
        {data.map((d, i) => {
          const x = i * (barW + GAP);
          const barH = Math.max(2, ((d.actual - min) / range) * (H - 6) + 2);
          const barY = H - barH;
          const fY = yOf(d.forecast);
          const color = DEV_COLOR[d.deviation];
          return (
            <g key={i}>
              <rect
                x={x} y={barY} width={barW} height={barH}
                fill={color} opacity={0.65} rx={1.5}
              />
              {/* Forecast tick */}
              <line
                x1={x} x2={x + barW}
                y1={fY} y2={fY}
                stroke="var(--text-dimmed)"
                strokeWidth={1}
                strokeDasharray="2,1"
              />
            </g>
          );
        })}
      </svg>

      {/* Period labels + actual values */}
      <div
        className="flex mt-1"
        style={{ width: W, gap: GAP }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            className="flex flex-col items-center"
            style={{ width: barW, flexShrink: 0 }}
          >
            <div
              className="text-[8px] font-bold font-mono tabular-nums leading-none"
              style={{ color: DEV_COLOR[d.deviation] }}
            >
              {d.actualStr}
            </div>
            <div className="text-[7px] font-mono leading-none mt-0.5" style={{ color: 'var(--text-dimmed)' }}>
              {d.period}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'var(--bull)', opacity: 0.65 }} />
          <span className="text-[8px] text-[var(--text-dimmed)]">Beat</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: 'var(--bear)', opacity: 0.65 }} />
          <span className="text-[8px] text-[var(--text-dimmed)]">Miss</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-5 h-px" style={{ borderTop: '1px dashed var(--text-dimmed)' }} />
          <span className="text-[8px] text-[var(--text-dimmed)]">Fcst</span>
        </div>
      </div>
    </div>
  );
}
