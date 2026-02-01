'use client';

import dynamic from 'next/dynamic';

/**
 * DASHBOARD PAGE - Footprint Pro
 *
 * Professional footprint chart with:
 * - Real trade-by-trade aggregation
 * - Bid x Ask clusters
 * - Imbalance detection
 * - Delta profile
 * - Drawing tools
 */

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500">Loading Footprint Pro...</span>
        </div>
      </div>
    ),
  }
);

export default function DashboardPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <FootprintChartPro className="h-full w-full" />
    </div>
  );
}
