const AGG_SEQUENCE = [1, 2, 5, 10, 25, 50] as const;
export type AggregationStep = (typeof AGG_SEQUENCE)[number];

export const DEFAULT_SMART_SCALE_MIN_ROW_PX = 8;

/**
 * Returns the smallest aggregation factor N from [1, 2, 5, 10, 25, 50]
 * such that `rowHeight * N >= minRowPx`. Falls back to 50 if none qualifies.
 *
 * Used by the renderer to merge N adjacent price levels into one visual row
 * when the user zooms out (keeping rows readable at MIN_ROW_PX height).
 */
export function getEffectiveAggregation(
  rowHeight: number,
  minRowPx: number = DEFAULT_SMART_SCALE_MIN_ROW_PX,
): AggregationStep {
  for (const n of AGG_SEQUENCE) {
    if (rowHeight * n >= minRowPx) return n;
  }
  return AGG_SEQUENCE[AGG_SEQUENCE.length - 1];
}
