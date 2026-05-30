/**
 * Catmull-Rom spline drawing helper — extracted from web `lib/indicators/VwapTwap.ts`.
 *
 * Used by the ported FootprintCanvasRenderer to draw smoothed VWAP/TWAP lines
 * and band envelopes.
 */

export function catmullRomSpline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  tension: number = 0.4
): void {
  if (points.length < 2) return;

  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (tension * (p2.x - p0.x)) / 6;
    const cp1y = p1.y + (tension * (p2.y - p0.y)) / 6;
    const cp2x = p2.x - (tension * (p3.x - p1.x)) / 6;
    const cp2y = p2.y - (tension * (p3.y - p1.y)) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}
