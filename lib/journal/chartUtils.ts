/**
 * Chart utility helpers for Canvas 2D and SVG charts
 */

export function scaleLinear(
  domain: [number, number],
  range: [number, number]
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const ratio = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value: number) => r0 + (value - d0) * ratio;
}

export function getColorForPnl(pnl: number, maxAbsPnl: number): string {
  if (maxAbsPnl === 0) return 'rgba(128, 128, 128, 0.3)';
  const intensity = Math.min(Math.abs(pnl) / maxAbsPnl, 1);
  const alpha = 0.2 + intensity * 0.6;
  return pnl >= 0
    ? `rgba(34, 197, 94, ${alpha})`
    : `rgba(239, 68, 68, ${alpha})`;
}

export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  yTicks: number[],
  scaleY: (v: number) => number,
  gridColor: string = 'rgba(128, 128, 128, 0.1)'
) {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  for (const tick of yTicks) {
    const y = Math.round(scaleY(tick)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

export function generateYTicks(min: number, max: number, count: number = 5): number[] {
  if (min === max) return [min];
  const range = max - min;
  const step = niceStep(range / (count - 1));
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(Math.abs(raw) || 1));
  const frac = raw / Math.pow(10, exp);
  let nice: number;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}
