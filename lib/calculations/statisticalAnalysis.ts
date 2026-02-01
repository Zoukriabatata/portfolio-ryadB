// Statistical Analysis Utilities

export interface VolumeStatistics {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
}

/**
 * Calculate mean, standard deviation, and other statistics for a set of values
 */
export function calculateStatistics(values: number[]): VolumeStatistics {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev, min, max, median };
}

/**
 * Calculate volume statistics from orderbook
 */
export function calculateOrderbookStatistics(
  bids: Map<number, number>,
  asks: Map<number, number>
): VolumeStatistics {
  const allVolumes = [...bids.values(), ...asks.values()];
  return calculateStatistics(allVolumes);
}

/**
 * Check if a value is an outlier (beyond specified standard deviations)
 */
export function isOutlier(
  value: number,
  mean: number,
  stdDev: number,
  threshold: number = 3.0
): boolean {
  if (stdDev === 0) return false;
  return Math.abs(value - mean) > threshold * stdDev;
}

/**
 * Calculate how many standard deviations a value is from the mean
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Detect outliers in a dataset and return their indices and z-scores
 */
export function detectOutliers(
  values: number[],
  threshold: number = 3.0
): Array<{ index: number; value: number; zScore: number }> {
  const stats = calculateStatistics(values);
  const outliers: Array<{ index: number; value: number; zScore: number }> = [];

  values.forEach((value, index) => {
    const zScore = calculateZScore(value, stats.mean, stats.stdDev);
    if (Math.abs(zScore) >= threshold) {
      outliers.push({ index, value, zScore });
    }
  });

  return outliers;
}

/**
 * Calculate exponential moving average (for velocity calculations)
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];

  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values[0];

  values.forEach((value, i) => {
    if (i === 0) {
      ema = value;
    } else {
      ema = value * k + ema * (1 - k);
    }
    result.push(ema);
  });

  return result;
}

/**
 * Calculate simple moving average
 */
export function calculateSMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];

  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }

  return result;
}

/**
 * Calculate rate of change between two values over time
 */
export function calculateRateOfChange(
  oldValue: number,
  newValue: number,
  timeElapsedMs: number
): number {
  if (timeElapsedMs === 0) return 0;
  return (newValue - oldValue) / (timeElapsedMs / 1000);
}
