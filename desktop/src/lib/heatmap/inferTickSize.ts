/**
 * Infer the price tick size from a set of order-book level prices by taking the
 * smallest positive gap between adjacent (sorted, de-duplicated) prices.
 *
 * Robust to missing levels (holes in the ladder): the true tick is the minimum
 * gap, and a full L2 book of depth ~10+ almost always contains at least one
 * pair of adjacent on-grid levels. Returns null if it can't be determined
 * (fewer than 2 distinct prices).
 *
 * Float-safe: gaps are rounded to 1e-9 before taking the min so FP noise
 * (e.g. 0.30000000000000004) doesn't produce a spurious tiny tick.
 */
export function inferTickSize(prices: readonly number[]): number | null {
  const distinct = Array.from(
    new Set(prices.filter((p) => Number.isFinite(p))),
  ).sort((a, b) => a - b);
  if (distinct.length < 2) return null;

  let min = Infinity;
  for (let i = 1; i < distinct.length; i++) {
    const gap = Math.round((distinct[i] - distinct[i - 1]) * 1e9) / 1e9;
    if (gap > 0 && gap < min) min = gap;
  }
  return Number.isFinite(min) ? min : null;
}
