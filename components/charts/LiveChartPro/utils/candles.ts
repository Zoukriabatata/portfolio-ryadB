import type { LiveCandle } from '@/lib/live/HierarchicalAggregator';

/**
 * Fetch real 1s klines from Binance and aggregate into 15s or 30s candles.
 * Returns genuine OHLCV data — no interpolation or synthetic subdivision.
 */
export async function fetchRealSubCandles(
  symbol: string,
  targetTf: number,
  totalCandles: number = 300,
  signal?: AbortSignal,
): Promise<LiveCandle[]> {
  const totalSeconds = totalCandles * targetTf;
  const batchSize = 1000;
  const batches = Math.ceil(totalSeconds / batchSize);

  const endMs = Date.now();
  const startMs = endMs - totalSeconds * 1000;

  // Fetch all 1s kline batches in parallel
  const promises: Promise<(string | number)[][]>[] = [];

  for (let i = 0; i < batches; i++) {
    const batchStartMs = startMs + i * batchSize * 1000;
    const batchEndMs = Math.min(batchStartMs + batchSize * 1000 - 1, endMs);

    const url = `/api/binance/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1s&startTime=${batchStartMs}&endTime=${batchEndMs}&limit=${batchSize}`;

    promises.push(
      fetch(url, { headers: { 'x-market': 'spot' }, signal })
        .then(res => res.json())
        .then(data => (Array.isArray(data) ? data : []))
    );
  }

  // Use allSettled for resilience — partial data is better than none
  const results = await Promise.allSettled(promises);
  const allRaw = results
    .filter((r): r is PromiseFulfilledResult<(string | number)[][]> => r.status === 'fulfilled')
    .flatMap(r => r.value);

  if (allRaw.length === 0) return [];

  // Parse 1s klines into LiveCandle
  const oneSecondCandles: LiveCandle[] = allRaw.map((k) => {
    const vol = parseFloat(k[5] as string);
    const buyVol = parseFloat(k[9] as string);
    return {
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: vol,
      buyVolume: buyVol,
      sellVolume: vol - buyVol,
      trades: Number(k[8]),
    };
  });

  oneSecondCandles.sort((a, b) => a.time - b.time);

  // Aggregate into target timeframe buckets
  return aggregateCandles(oneSecondCandles, targetTf);
}

/**
 * Aggregate an array of smaller candles into larger candles of targetTf seconds.
 * Uses floor-aligned time slots (e.g. 15s slots: :00, :15, :30, :45).
 */
function aggregateCandles(candles: LiveCandle[], targetTf: number): LiveCandle[] {
  const buckets = new Map<number, LiveCandle[]>();

  for (const c of candles) {
    const slotTime = Math.floor(c.time / targetTf) * targetTf;
    let bucket = buckets.get(slotTime);
    if (!bucket) {
      bucket = [];
      buckets.set(slotTime, bucket);
    }
    bucket.push(c);
  }

  const sortedSlots = Array.from(buckets.keys()).sort((a, b) => a - b);
  const result: LiveCandle[] = [];

  for (const slotTime of sortedSlots) {
    const bucket = buckets.get(slotTime)!;

    let high = bucket[0].high;
    let low = bucket[0].low;
    let volume = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let trades = 0;

    for (const c of bucket) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
      buyVolume += c.buyVolume;
      sellVolume += c.sellVolume;
      trades += c.trades;
    }

    result.push({
      time: slotTime,
      open: bucket[0].open,
      high,
      low,
      close: bucket[bucket.length - 1].close,
      volume,
      buyVolume,
      sellVolume,
      trades,
    });
  }

  return result;
}
