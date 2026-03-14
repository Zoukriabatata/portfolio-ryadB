'use client';

import dynamic from 'next/dynamic';
import { useTradingStore } from '@/stores/useTradingStore';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ChartPageShell from '@/components/layouts/ChartPageShell';

const DeepChart = dynamic(
  () => import('@/components/charts/DeepChart'),
  { ssr: false, loading: () => <div className="h-full w-full bg-[#0a0a0f]" /> }
);

// Symbol → tickSize lookup (mirrors FootprintChartPro SYMBOL_LIST)
const TICK_SIZES: Record<string, number> = {
  btcusdt: 10, ethusdt: 1, solusdt: 0.1, bnbusdt: 1,
  xrpusdt: 0.001, adausdt: 0.001, dogeusdt: 0.0001,
  avaxusdt: 0.1, linkusdt: 0.01, arbusdt: 0.001,
  opusdt: 0.01, pepeusdt: 0.0000001,
};

export default function FootprintTESTPageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore();
  const sym = tradingSymbol?.toLowerCase() ?? 'btcusdt';
  const tickSize = TICK_SIZES[sym] ?? 0.1;

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
    >
      <ChartErrorBoundary fallbackTitle="DeepChart Error">
        <div className="h-full">
          <DeepChart
            symbol={sym}
            tickSize={tickSize}
            onSymbolChange={setTradingSymbol}
          />
        </div>
      </ChartErrorBoundary>
    </ChartPageShell>
  );
}
