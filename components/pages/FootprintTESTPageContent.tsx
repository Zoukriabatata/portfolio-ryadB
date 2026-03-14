'use client';

import dynamic from 'next/dynamic';
import { useTradingStore } from '@/stores/useTradingStore';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ChartPageShell from '@/components/layouts/ChartPageShell';

const DeepChart = dynamic(
  () => import('@/components/charts/DeepChart'),
  { ssr: false, loading: () => <div className="h-full w-full" style={{ background: '#06080f' }} /> }
);

export default function FootprintTESTPageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore();
  const sym = 'mnq'; // demo symbol — MNQ (Micro E-mini NASDAQ)

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
    >
      <ChartErrorBoundary fallbackTitle="DeepChart Error">
        <div className="h-full">
          <DeepChart symbol={sym} onSymbolChange={setTradingSymbol} />
        </div>
      </ChartErrorBoundary>
    </ChartPageShell>
  );
}
