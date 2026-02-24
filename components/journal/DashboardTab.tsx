'use client';

import { useJournalAnalytics } from '@/hooks/useJournalAnalytics';
import { useJournal } from '@/hooks/useJournal';
import DateRangeFilter from './DateRangeFilter';
import MetricsGrid from './MetricsGrid';
import TrackScoreCard from './TrackScoreCard';
import EquityCurveChart from './EquityCurveChart';
import DrawdownChart from './DrawdownChart';
import PnlHeatmapMini from './PnlHeatmapMini';
import PnlByHourChart from './PnlByHourChart';
import PnlByDayChart from './PnlByDayChart';
import PerformanceBySymbol from './PerformanceBySymbol';
import PerformanceBySetup from './PerformanceBySetup';
import EmotionCorrelation from './EmotionCorrelation';
import StreakAnalysis from './StreakAnalysis';

export default function DashboardTab() {
  const { analytics, loading } = useJournalAnalytics();
  const { entries, loading: entriesLoading } = useJournal();

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Date Range Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Performance Overview</h2>
        <DateRangeFilter />
      </div>

      {/* Key Metrics + Track Score */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <MetricsGrid
            metrics={analytics.metrics}
            streaks={analytics.streaks}
            loading={loading}
          />
        </div>
        <TrackScoreCard
          analytics={analytics}
          entries={entries}
          loading={loading || entriesLoading}
        />
      </div>

      {/* Charts - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <EquityCurveChart data={analytics.equityCurve} />
        </div>
        <div>
          <PnlHeatmapMini data={analytics.equityCurve} />
        </div>
      </div>

      {/* Drawdown */}
      <DrawdownChart data={analytics.drawdown} />

      {/* Charts - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PnlByHourChart data={analytics.byHour} />
        <PnlByDayChart data={analytics.byDayOfWeek} />
      </div>

      {/* Performance breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PerformanceBySymbol data={analytics.bySymbol} />
        <PerformanceBySetup data={analytics.bySetup} />
      </div>

      {/* Emotion & Streaks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EmotionCorrelation data={analytics.byEmotion} />
        <StreakAnalysis streaks={analytics.streaks} />
      </div>
    </div>
  );
}
