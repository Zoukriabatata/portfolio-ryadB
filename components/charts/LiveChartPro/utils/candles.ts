import type { LiveCandle } from '@/lib/live/HierarchicalAggregator';

export function subdivideCandles(m1Candles: LiveCandle[], targetTf: number): LiveCandle[] {
  const result: LiveCandle[] = [];
  const subdivisions = 60 / targetTf;

  for (const m1 of m1Candles) {
    const priceStep = (m1.close - m1.open) / subdivisions;
    const volumeStep = m1.volume / subdivisions;

    for (let i = 0; i < subdivisions; i++) {
      const subOpen = m1.open + priceStep * i;
      const subClose = m1.open + priceStep * (i + 1);
      const variation = (Math.random() - 0.5) * Math.abs(m1.high - m1.low) * 0.1;

      result.push({
        time: m1.time + (i * targetTf),
        open: subOpen,
        high: Math.max(subOpen, subClose) + Math.abs(variation),
        low: Math.min(subOpen, subClose) - Math.abs(variation),
        close: subClose,
        volume: volumeStep,
        buyVolume: 0,
        sellVolume: 0,
        trades: Math.floor(m1.trades / subdivisions),
      });
    }
  }

  return result;
}
