'use client';

import dynamic from 'next/dynamic';
import { useTradingStore } from '@/stores/useTradingStore';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import ChartPageShell from '@/components/layouts/ChartPageShell';

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export default function FootprintTESTPageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore();

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
    >
      <ChartErrorBoundary fallbackTitle="FootprintTEST Error">
        <div className="h-full">
          <FootprintChartPro className="h-full" onSymbolChange={setTradingSymbol} />
        </div>
      </ChartErrorBoundary>
    </ChartPageShell>
  );
}
