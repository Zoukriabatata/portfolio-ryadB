/**
 * GEX HISTORY BUFFER
 *
 * Circular buffer storing GEX snapshots for sparklines,
 * statistical context (mean, stdDev, percentile), and regime detection.
 *
 * Capacity: 30 snapshots (1 every 5 min = 2.5h of history)
 */

import type { MultiGreekSummary, GEXSnapshot, MultiGreekData } from '@/types/options';

const MAX_SNAPSHOTS = 30;

export interface HistoryStats {
  mean: number;
  stdDev: number;
  percentile: number; // 0-100
  zScore: number;
  trend: 'up' | 'down' | 'flat';
  changePercent: number; // vs previous snapshot
}

export class GEXHistoryBuffer {
  private snapshots: GEXSnapshot[] = [];

  /** Add a new snapshot */
  push(snapshot: GEXSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  /** Get all snapshots (oldest first) */
  getAll(): GEXSnapshot[] {
    return this.snapshots;
  }

  /** Get the latest snapshot */
  getLatest(): GEXSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /** Get sparkline data (array of values) for a given metric */
  getSparkline(metric: keyof MultiGreekSummary): number[] {
    return this.snapshots.map(s => {
      const val = s.summary[metric];
      return typeof val === 'number' ? val : 0;
    });
  }

  /** Get spot price history */
  getSpotHistory(): number[] {
    return this.snapshots.map(s => s.spotPrice);
  }

  /** Calculate stats for a given metric */
  getStats(metric: keyof MultiGreekSummary): HistoryStats {
    const values = this.getSparkline(metric);

    if (values.length === 0) {
      return { mean: 0, stdDev: 0, percentile: 50, zScore: 0, trend: 'flat', changePercent: 0 };
    }

    const current = values[values.length - 1];

    // Mean
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // Standard deviation
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Z-Score
    const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;

    // Percentile
    const sorted = [...values].sort((a, b) => a - b);
    const idx = sorted.findIndex(v => v >= current);
    const percentile = (idx >= 0 ? idx : sorted.length) / sorted.length * 100;

    // Trend (compare last 3 values)
    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (values.length >= 3) {
      const recent = values.slice(-3);
      const diff = recent[2] - recent[0];
      const threshold = stdDev > 0 ? stdDev * 0.2 : Math.abs(mean) * 0.01;
      if (diff > threshold) trend = 'up';
      else if (diff < -threshold) trend = 'down';
    }

    // Change vs previous
    let changePercent = 0;
    if (values.length >= 2) {
      const prev = values[values.length - 2];
      if (prev !== 0) {
        changePercent = ((current - prev) / Math.abs(prev)) * 100;
      }
    }

    return { mean, stdDev, percentile, zScore, trend, changePercent };
  }

  /** Detect regime change (positive ↔ negative) */
  detectRegimeChange(): { changed: boolean; from?: string; to?: string } {
    if (this.snapshots.length < 2) return { changed: false };

    const prev = this.snapshots[this.snapshots.length - 2].summary.regime;
    const curr = this.snapshots[this.snapshots.length - 1].summary.regime;

    if (prev !== curr) {
      return { changed: true, from: prev, to: curr };
    }
    return { changed: false };
  }

  /** Get the number of stored snapshots */
  get length(): number {
    return this.snapshots.length;
  }

  /** Clear all history */
  clear(): void {
    this.snapshots = [];
  }
}

// Singleton instance shared across the app
let _instance: GEXHistoryBuffer | null = null;

export function getGEXHistory(): GEXHistoryBuffer {
  if (!_instance) {
    _instance = new GEXHistoryBuffer();
  }
  return _instance;
}
