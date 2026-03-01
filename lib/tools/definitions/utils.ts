/**
 * SHARED GEOMETRY UTILITIES
 *
 * Helper functions used across multiple tool definitions.
 */

/**
 * Distance from a point to a line segment.
 * Clamps the projection to [0,1] so it measures segment distance, not infinite line.
 */
export function pointToLineDistance(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(px - projX, py - projY);
}

/**
 * Check if a point is near another point within a given radius.
 */
export function isNearPoint(
  px: number, py: number,
  tx: number, ty: number,
  radius: number
): boolean {
  return Math.hypot(px - tx, py - ty) <= radius;
}

/**
 * Check if a point is inside an axis-aligned rectangle.
 */
export function isInsideRect(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

/** Handle hit area radius in pixels */
export const HANDLE_HIT_SIZE = 12;

/** Handle visual size in pixels */
export const HANDLE_SIZE = 7;
