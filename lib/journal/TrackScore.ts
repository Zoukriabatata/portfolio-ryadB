/**
 * Track Score — Composite performance score 0-100
 *
 * Weighted metrics:
 *  - Win Rate           25%
 *  - Profit Factor      20%
 *  - Avg Risk:Reward    15%
 *  - Max Drawdown       15%
 *  - Consistency        10%
 *  - Position Mgmt      10%
 *  - Discipline         5%
 */

import type { JournalAnalytics, JournalEntry } from '@/types/journal';

export interface TrackScoreBreakdown {
  total: number;          // 0-100
  winRate: number;        // 0-25
  profitFactor: number;   // 0-20
  avgRR: number;          // 0-15
  maxDrawdown: number;    // 0-15
  consistency: number;    // 0-10
  management: number;     // 0-10
  discipline: number;     // 0-5
  label: string;          // "Excellent" | "Good" | "Average" | "Needs Work"
  color: string;          // Hex color for display
}

/**
 * Compute the Track Score from analytics data + raw journal entries.
 */
export function computeTrackScore(
  analytics: JournalAnalytics,
  entries: JournalEntry[],
): TrackScoreBreakdown {
  const m = analytics.metrics;
  const closedEntries = entries.filter((e) => e.pnl !== null);
  const totalTrades = closedEntries.length;

  if (totalTrades < 3) {
    return {
      total: 0, winRate: 0, profitFactor: 0, avgRR: 0,
      maxDrawdown: 0, consistency: 0, management: 0, discipline: 0,
      label: 'Not enough data', color: '#6b7280',
    };
  }

  // --- Win Rate (0-25) ---
  // 50% = 12.5, 60% = 18.75, 70%+ = ~25
  const winRateRaw = closedEntries.filter((e) => (e.pnl ?? 0) > 0).length / totalTrades;
  const winRateScore = Math.min(25, (winRateRaw / 0.7) * 25);

  // --- Profit Factor (0-20) ---
  // 1.0 = 0, 1.5 = 10, 2.0 = 15, 3.0+ = 20
  const pfClamped = Math.min(m.profitFactor, 5);
  const pfScore = pfClamped <= 1 ? 0 : Math.min(20, ((pfClamped - 1) / 2) * 20);

  // --- Average Risk:Reward (0-15) ---
  // 1:1 = 7.5, 2:1 = 12.5, 3:1+ = 15
  const rrClamped = Math.min(m.avgRR, 4);
  const rrScore = Math.min(15, (rrClamped / 3) * 15);

  // --- Max Drawdown (0-15) ---
  // Lower is better: 0% = 15, 5% = 12, 10% = 9, 20%+ = ~3
  const ddPct = Math.abs(m.maxDrawdownPct);
  const ddScore = Math.max(0, 15 * (1 - ddPct / 25));

  // --- Consistency (0-10) ---
  // Measure daily PnL variance. Less variance = more consistent.
  const dailyPnls = analytics.equityCurve.map((d, i, arr) =>
    i === 0 ? d.cumulativePnl : d.cumulativePnl - arr[i - 1].cumulativePnl
  );
  let consistencyScore = 5; // Default if not enough data
  if (dailyPnls.length >= 3) {
    const mean = dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length;
    const variance = dailyPnls.reduce((a, v) => a + (v - mean) ** 2, 0) / dailyPnls.length;
    const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 10;
    // CV < 1 = very consistent (10), CV > 5 = very inconsistent (0)
    consistencyScore = Math.max(0, Math.min(10, 10 * (1 - cv / 5)));
  }

  // --- Position Management (0-10) ---
  // Based on avg win vs avg loss ratio (management quality)
  // Good: cut losses short, let winners run → avgWin >> avgLoss
  const avgWin = Math.abs(m.avgWin);
  const avgLoss = Math.abs(m.avgLoss);
  let mgmtScore = 5;
  if (avgLoss > 0) {
    const mgmtRatio = avgWin / avgLoss;
    mgmtScore = Math.min(10, (mgmtRatio / 2.5) * 10);
  }

  // --- Discipline (0-5) ---
  // Trades with rating + notes filled = disciplined journaling
  const documented = closedEntries.filter(
    (e) => (e.rating && e.rating > 0) || (e.notes && e.notes.length > 10)
  ).length;
  const docRatio = documented / totalTrades;
  const disciplineScore = Math.min(5, docRatio * 5);

  const total = Math.round(
    winRateScore + pfScore + rrScore + ddScore +
    consistencyScore + mgmtScore + disciplineScore
  );

  let label: string;
  let color: string;
  if (total >= 80) { label = 'Excellent'; color = '#22c55e'; }
  else if (total >= 60) { label = 'Good'; color = '#3b82f6'; }
  else if (total >= 40) { label = 'Average'; color = '#f59e0b'; }
  else { label = 'Needs Work'; color = '#ef4444'; }

  return {
    total,
    winRate: Math.round(winRateScore * 10) / 10,
    profitFactor: Math.round(pfScore * 10) / 10,
    avgRR: Math.round(rrScore * 10) / 10,
    maxDrawdown: Math.round(ddScore * 10) / 10,
    consistency: Math.round(consistencyScore * 10) / 10,
    management: Math.round(mgmtScore * 10) / 10,
    discipline: Math.round(disciplineScore * 10) / 10,
    label,
    color,
  };
}
