// Fetch historical trades from Bybit and process into footprint data
import { throttledFetch } from '@/lib/api/throttledFetch';

interface BybitTrade {
  execId: string;
  symbol: string;
  price: string;
  size: string;
  side: 'Buy' | 'Sell';
  time: string;
  isBlockTrade: boolean;
}

interface Trade {
  id: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

interface HistoricalDataResult {
  trades: Trade[];
  oldestTime: number;
  newestTime: number;
}

const BYBIT_TRADES_LIMIT = 1000;

/**
 * Fetch historical trades from Bybit
 * @param symbol - Trading pair (e.g., 'BTCUSDT')
 * @param hoursBack - How many hours of history to fetch
 * @param category - 'linear' for perpetual futures
 */
export async function fetchHistoricalTrades(
  symbol: string,
  hoursBack: number = 24,
  category: string = 'linear'
): Promise<HistoricalDataResult> {
  const allTrades: Trade[] = [];
  const endTime = Date.now();
  const startTime = endTime - hoursBack * 60 * 60 * 1000;

  let cursor: string | undefined;
  let fetchedOldestTime = endTime;
  let iterations = 0;
  const maxIterations = 100; // Safety limit

  while (fetchedOldestTime > startTime && iterations < maxIterations) {
    iterations++;

    try {
      const params = new URLSearchParams({
        category,
        symbol,
        limit: BYBIT_TRADES_LIMIT.toString(),
      });

      if (cursor) {
        params.set('cursor', cursor);
      }

      const response = await throttledFetch(`/api/bybit/v5/market/recent-trade?${params}`);
      const data = await response.json();

      if (data.retCode !== 0 || !data.result?.list?.length) {
        break;
      }

      const trades: BybitTrade[] = data.result.list;

      // Convert to our format
      const converted = trades.map((t): Trade => ({
        id: t.execId,
        price: parseFloat(t.price),
        quantity: parseFloat(t.size),
        time: parseInt(t.time),
        isBuyerMaker: t.side === 'Sell', // Sell = taker sold = buyer was maker
      }));

      allTrades.push(...converted);

      // Update oldest time
      let oldestInBatch = converted[0].time;
      for (let i = 1; i < converted.length; i++) {
        if (converted[i].time < oldestInBatch) oldestInBatch = converted[i].time;
      }
      fetchedOldestTime = oldestInBatch;

      // Get cursor for next batch
      cursor = data.result.nextPageCursor;

      if (!cursor) {
        break;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch {
      break;
    }
  }

  // Sort by time ascending
  allTrades.sort((a, b) => a.time - b.time);

  return {
    trades: allTrades,
    oldestTime: allTrades.length > 0 ? allTrades[0].time : endTime,
    newestTime: allTrades.length > 0 ? allTrades[allTrades.length - 1].time : endTime,
  };
}

/**
 * Fetch historical klines (candles) from Bybit
 * Useful for getting OHLC data structure
 */
export async function fetchHistoricalKlines(
  symbol: string,
  interval: string = '1', // 1 minute
  hoursBack: number = 24,
  category: string = 'linear'
): Promise<Array<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>> {
  const endTime = Date.now();
  const startTime = endTime - hoursBack * 60 * 60 * 1000;

  try {
    const params = new URLSearchParams({
      category,
      symbol,
      interval,
      start: startTime.toString(),
      end: endTime.toString(),
      limit: '1000',
    });

    const response = await throttledFetch(`/api/bybit/v5/market/kline?${params}`);
    const data = await response.json();

    if (data.retCode !== 0 || !data.result?.list?.length) {
      return [];
    }

    // Bybit returns newest first, reverse for chronological order
    const klines = data.result.list.reverse().map((k: string[]) => ({
      time: Math.floor(parseInt(k[0]) / 1000), // Convert ms to seconds
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    return klines;

  } catch {
    return [];
  }
}
