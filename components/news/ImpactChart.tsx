import type { ImpactDataPoint, DeviationType } from '@/types/news';

const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const PADDING = { top: 20, right: 20, bottom: 30, left: 45 };

const COLORS: Record<DeviationType, { line: string; fill: string; volume: string }> = {
  beat: { line: 'var(--bull)', fill: 'var(--bull-bg)', volume: 'var(--bull)' },
  miss: { line: 'var(--bear)', fill: 'var(--bear-bg)', volume: 'var(--bear)' },
  inline: { line: 'var(--text-muted)', fill: 'var(--surface-elevated)', volume: 'var(--text-dimmed)' },
};

const TIME_LABELS = [
  { min: -30, label: '-30m' },
  { min: 0, label: 'Release' },
  { min: 30, label: '+30m' },
  { min: 60, label: '+1h' },
  { min: 120, label: '+2h' },
];

export function ImpactChart({
  data,
  deviation,
}: {
  data: ImpactDataPoint[];
  deviation: DeviationType;
}) {
  if (data.length === 0) return null;

  const colors = COLORS[deviation];

  // Compute scales
  const minT = data[0].minutesFromRelease;
  const maxT = data[data.length - 1].minutesFromRelease;
  const tRange = maxT - minT || 1;

  const prices = data.map(d => d.priceChange);
  const maxPrice = Math.max(...prices.map(Math.abs), 0.1);
  const priceRange = maxPrice * 2;

  const volumes = data.map(d => d.volumeSpike);
  const maxVolume = Math.max(...volumes, 1);

  const plotW = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const toX = (t: number) => PADDING.left + ((t - minT) / tRange) * plotW;
  const toY = (p: number) => PADDING.top + plotH / 2 - (p / maxPrice) * (plotH / 2);
  const volH = (v: number) => Math.max(2, (v / maxVolume) * 20);

  // Build price line path
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(d.minutesFromRelease).toFixed(1)},${toY(d.priceChange).toFixed(1)}`)
    .join(' ');

  // Build area fill path
  const zeroY = toY(0);
  const areaPath = linePath
    + ` L${toX(data[data.length - 1].minutesFromRelease).toFixed(1)},${zeroY}`
    + ` L${toX(data[0].minutesFromRelease).toFixed(1)},${zeroY} Z`;

  // Release line X
  const releaseX = toX(0);

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-auto"
        style={{ maxHeight: '200px' }}
      >
        {/* Grid lines */}
        <line
          x1={PADDING.left} y1={zeroY} x2={CHART_WIDTH - PADDING.right} y2={zeroY}
          stroke="var(--border)" strokeWidth="1" opacity="0.5"
        />

        {/* Volume bars */}
        {data.map((d, i) => (
          <rect
            key={`v-${i}`}
            x={toX(d.minutesFromRelease) - 1.5}
            y={CHART_HEIGHT - PADDING.bottom - volH(d.volumeSpike)}
            width={3}
            height={volH(d.volumeSpike)}
            fill={colors.volume}
            opacity={0.25}
            rx={1}
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={colors.fill} opacity="0.3" />

        {/* Price line */}
        <path d={linePath} fill="none" stroke={colors.line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Release vertical line */}
        <line
          x1={releaseX} y1={PADDING.top} x2={releaseX} y2={CHART_HEIGHT - PADDING.bottom}
          stroke="var(--warning)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"
        />

        {/* Time labels */}
        {TIME_LABELS.map(({ min, label }) => {
          if (min < minT || min > maxT) return null;
          const x = toX(min);
          return (
            <text
              key={min}
              x={x}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              fill="var(--text-dimmed)"
              fontSize="9"
              fontFamily="inherit"
            >
              {label}
            </text>
          );
        })}

        {/* Y-axis labels */}
        <text x={PADDING.left - 8} y={toY(maxPrice) + 3} textAnchor="end" fill="var(--text-dimmed)" fontSize="9" fontFamily="inherit">
          +{maxPrice.toFixed(1)}%
        </text>
        <text x={PADDING.left - 8} y={zeroY + 3} textAnchor="end" fill="var(--text-dimmed)" fontSize="9" fontFamily="inherit">
          0%
        </text>
        <text x={PADDING.left - 8} y={toY(-maxPrice) + 3} textAnchor="end" fill="var(--text-dimmed)" fontSize="9" fontFamily="inherit">
          -{maxPrice.toFixed(1)}%
        </text>

        {/* Current value dot */}
        {data.length > 0 && (() => {
          const last = data[data.length - 1];
          const cx = toX(last.minutesFromRelease);
          const cy = toY(last.priceChange);
          return (
            <>
              <circle cx={cx} cy={cy} r="4" fill={colors.line} />
              <circle cx={cx} cy={cy} r="7" fill={colors.line} opacity="0.2" />
            </>
          );
        })()}
      </svg>
    </div>
  );
}
